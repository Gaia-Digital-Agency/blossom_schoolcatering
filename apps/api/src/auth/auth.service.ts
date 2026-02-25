import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { AuthUser, ROLES, Role } from './auth.types';
import { runSql, sqlLiteral } from './db.util';

type RefreshPayload = {
  sub: string;
  uid: string;
  role: Role;
  jti: string;
  type: 'refresh';
};

type AccessPayload = {
  sub: string;
  uid: string;
  role: Role;
  type: 'access';
};

type DbUserRow = {
  id: string;
  username: string;
  role: string;
  first_name: string;
  last_name: string;
  password_hash: string;
};

const DEV_USERNAME = 'teameditor';
const DEV_PASSWORD = 'admin123';
const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

@Injectable()
export class AuthService {
  private normalizeRole(role: string): Role {
    const normalized = role?.toUpperCase() as Role;
    if (!ROLES.includes(normalized)) {
      throw new UnauthorizedException('Invalid role');
    }
    return normalized;
  }

  private dbRoleFromApp(role: Role) {
    return role === 'YOUNGSTER' ? 'CHILD' : role;
  }

  private appRoleFromDb(role: string): Role {
    if (role === 'CHILD') return 'YOUNGSTER';
    return (role as Role) || 'PARENT';
  }

  private get accessSecret() {
    return process.env.AUTH_JWT_SECRET ?? 'dev-access-secret';
  }

  private get refreshSecret() {
    return process.env.AUTH_JWT_REFRESH_SECRET ?? 'dev-refresh-secret';
  }

  private getExpirySeconds(raw: string) {
    const match = /^(\d+)([smhd])$/.exec(raw);
    if (!match) return 900;
    const value = Number(match[1]);
    const unit = match[2];
    if (unit === 's') return value;
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 3600;
    return value * 86400;
  }

  private base64Url(value: string) {
    return Buffer.from(value).toString('base64url');
  }

  private signRaw(payload: Record<string, unknown>, secret: string, expiresIn: string) {
    const header = this.base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const exp = Math.floor(Date.now() / 1000) + this.getExpirySeconds(expiresIn);
    const body = this.base64Url(JSON.stringify({ ...payload, exp }));
    const data = `${header}.${body}`;
    const sig = createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${sig}`;
  }

  private verifyRaw<T extends Record<string, unknown>>(token: string, secret: string): T {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid token');
    const [header, body, sig] = parts;
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (expected !== sig) throw new UnauthorizedException('Invalid token signature');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp?: number };
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }
    return payload as T;
  }

  private hashPassword(raw: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(raw, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
  }

  private verifyPassword(raw: string, storedHash: string) {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, salt, hash] = parts;
    const derived = scryptSync(raw, salt, 64).toString('hex');
    return timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
  }

  private parseJsonLine<T>(line: string): T {
    if (!line) throw new UnauthorizedException('No result');
    return JSON.parse(line) as T;
  }

  private async ensureDevUser() {
    const hashed = this.hashPassword(DEV_PASSWORD);
    const sql = `
      INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
      VALUES ('ADMIN', 'teameditor', ${sqlLiteral(hashed)}, 'Team', 'Editor', '0000000000', 'teameditor@gaiada.com')
      ON CONFLICT (username) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          updated_at = now()
      RETURNING row_to_json(users)::text;
    `;
    const userRow = this.parseJsonLine<DbUserRow>(await runSql(sql));
    await runSql(`
      INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
      VALUES (${sqlLiteral(userRow.id)}, false, false, true)
      ON CONFLICT (user_id) DO NOTHING;
    `);
    return userRow;
  }

  private async findUserByUsername(username: string) {
    const sql = `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, username, role::text, first_name, last_name, password_hash
        FROM users
        WHERE username = ${sqlLiteral(username)}
          AND is_active = true
        LIMIT 1
      ) t;
    `;
    const out = await runSql(sql);
    if (!out) return null;
    return this.parseJsonLine<DbUserRow>(out);
  }

  private buildUser(row: DbUserRow, role: Role): AuthUser {
    return {
      username: row.username,
      displayName: `${row.first_name} ${row.last_name}`.trim(),
      role,
    };
  }

  private async signTokens(user: AuthUser, userId: string) {
    const accessPayload: AccessPayload = {
      sub: user.username,
      uid: userId,
      role: user.role,
      type: 'access',
    };
    const accessToken = this.signRaw(accessPayload, this.accessSecret, ACCESS_TTL);

    const jti = randomUUID();
    const refreshPayload: RefreshPayload = {
      sub: user.username,
      uid: userId,
      role: user.role,
      jti,
      type: 'refresh',
    };
    const refreshToken = this.signRaw(refreshPayload, this.refreshSecret, REFRESH_TTL);
    await runSql(`
      INSERT INTO auth_refresh_sessions (jti, user_id, app_role, expires_at)
      VALUES (${sqlLiteral(jti)}, ${sqlLiteral(userId)}, ${sqlLiteral(user.role)}, now() + interval '7 day');
    `);
    return { accessToken, refreshToken };
  }

  verifyAccessToken(accessToken: string): AccessPayload {
    try {
      const payload = this.verifyRaw<AccessPayload>(accessToken, this.accessSecret);
      if (payload.type !== 'access') throw new UnauthorizedException('Invalid access token type');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private verifyRefreshToken(refreshToken: string): RefreshPayload {
    try {
      const payload = this.verifyRaw<RefreshPayload>(refreshToken, this.refreshSecret);
      if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid refresh token type');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async login(username: string, password: string, role: string) {
    await this.ensureDevUser();
    const userRow = await this.findUserByUsername(username);
    if (!userRow || !this.verifyPassword(password, userRow.password_hash)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const normalizedRole = this.normalizeRole(role);
    const user = this.buildUser(userRow, normalizedRole);
    const tokens = await this.signTokens(user, userRow.id);
    return { ...tokens, user };
  }

  async loginWithGoogleVerified(idToken: string, role: string) {
    const normalizedRole = this.normalizeRole(role);
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!res.ok) {
      throw new UnauthorizedException('Google token verification failed');
    }
    const payload = (await res.json()) as { email?: string; aud?: string; email_verified?: string };
    if (!payload.email || payload.email_verified !== 'true') {
      throw new UnauthorizedException('Invalid Google identity');
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && payload.aud !== clientId) {
      throw new UnauthorizedException('Google audience mismatch');
    }

    await this.ensureDevUser();
    const userRow = await this.findUserByUsername(DEV_USERNAME);
    if (!userRow) throw new UnauthorizedException('Dev user not found');
    const user = this.buildUser(userRow, normalizedRole);
    const tokens = await this.signTokens(user, userRow.id);

    await runSql(`
      INSERT INTO user_identities (user_id, provider, provider_user_id, provider_email)
      VALUES (${sqlLiteral(userRow.id)}, 'GOOGLE', ${sqlLiteral(payload.email)}, ${sqlLiteral(payload.email)})
      ON CONFLICT (provider, provider_user_id) DO NOTHING;
    `);

    return { ...tokens, user, provider: 'google' };
  }

  async loginWithGoogleDev(googleEmail: string, role: string) {
    if (!googleEmail?.includes('@')) {
      throw new UnauthorizedException('Invalid Google account');
    }
    const normalizedRole = this.normalizeRole(role);
    await this.ensureDevUser();
    const userRow = await this.findUserByUsername(DEV_USERNAME);
    if (!userRow) throw new UnauthorizedException('Dev user not found');
    const user = this.buildUser(userRow, normalizedRole);
    const tokens = await this.signTokens(user, userRow.id);
    return { ...tokens, user, provider: 'google-dev' };
  }

  async me(accessToken: string) {
    const payload = this.verifyAccessToken(accessToken);
    const userRow = await this.findUserByUsername(payload.sub);
    if (!userRow) throw new UnauthorizedException('User not found');
    return this.buildUser(userRow, payload.role);
  }

  async refresh(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);
    const active = await runSql(`
      SELECT EXISTS (
        SELECT 1
        FROM auth_refresh_sessions
        WHERE jti = ${sqlLiteral(payload.jti)}
          AND user_id = ${sqlLiteral(payload.uid)}
          AND revoked_at IS NULL
          AND expires_at > now()
      );
    `);
    if (active !== 't') throw new UnauthorizedException('Refresh token revoked');

    await runSql(`
      UPDATE auth_refresh_sessions
      SET revoked_at = now()
      WHERE jti = ${sqlLiteral(payload.jti)};
    `);

    const userRow = await this.findUserByUsername(payload.sub);
    if (!userRow) throw new UnauthorizedException('User not found');
    const user = this.buildUser(userRow, payload.role);
    return this.signTokens(user, userRow.id);
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { ok: true };
    try {
      const payload = this.verifyRefreshToken(refreshToken);
      await runSql(`
        UPDATE auth_refresh_sessions
        SET revoked_at = now()
        WHERE jti = ${sqlLiteral(payload.jti)};
      `);
    } catch {
      // ignore invalid token for logout
    }
    return { ok: true };
  }

  async generateUsername(base: string) {
    const safeBase = (base || '').toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
    if (!safeBase) throw new UnauthorizedException('Invalid base username');
    const out = await runSql(
      `SELECT generate_unique_username(${sqlLiteral(safeBase)});`,
    );
    return { username: out };
  }

  async getOnboardingState(accessToken: string) {
    const payload = this.verifyAccessToken(accessToken);
    const out = await runSql(`
      SELECT onboarding_completed
      FROM user_preferences up
      JOIN users u ON u.id = up.user_id
      WHERE u.username = ${sqlLiteral(payload.sub)}
      LIMIT 1;
    `);
    return { completed: out === 't' };
  }

  async setOnboardingState(accessToken: string, completed: boolean) {
    const payload = this.verifyAccessToken(accessToken);
    await runSql(`
      INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
      SELECT id, ${completed ? 'true' : 'false'}, false, true
      FROM users
      WHERE username = ${sqlLiteral(payload.sub)}
      ON CONFLICT (user_id) DO UPDATE
      SET onboarding_completed = EXCLUDED.onboarding_completed,
          updated_at = now();
    `);
    return { completed };
  }

  async assertRole(accessToken: string, allowedRoles: Role[]) {
    const payload = this.verifyAccessToken(accessToken);
    if (!allowedRoles.includes(payload.role)) {
      throw new UnauthorizedException('Role not allowed');
    }
    const userRow = await this.findUserByUsername(payload.sub);
    if (!userRow) throw new UnauthorizedException('User not found');
    return this.buildUser(userRow, payload.role);
  }
}
