import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID } from 'crypto';
import { AuthUser, ROLES, Role } from './auth.types';

type RefreshPayload = {
  sub: string;
  role: Role;
  jti: string;
  type: 'refresh';
};

type AccessPayload = {
  sub: string;
  role: Role;
  type: 'access';
};

const DEV_USERNAME = 'teameditor';
const DEV_PASSWORD = 'admin123';
const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

@Injectable()
export class AuthService {
  private readonly refreshSessions = new Map<string, AuthUser>();
  private readonly usernameRegistry = new Set<string>([
    'teameditor',
    'wijaya_parent',
    'wijaya_parent-1',
    'wijaya_arya',
  ]);
  private readonly onboardingState = new Map<string, boolean>();

  private normalizeRole(role: string): Role {
    const normalized = role?.toUpperCase() as Role;
    if (!ROLES.includes(normalized)) {
      throw new UnauthorizedException('Invalid role');
    }
    return normalized;
  }

  private buildUser(username: string, role: Role): AuthUser {
    return {
      username,
      displayName: username === DEV_USERNAME ? 'Team Editor' : username,
      role,
    };
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
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token');
    }
    const [header, body, sig] = parts;
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (expected !== sig) {
      throw new UnauthorizedException('Invalid token signature');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp?: number };
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }
    return payload as T;
  }

  private signTokens(user: AuthUser) {
    const accessPayload: AccessPayload = {
      sub: user.username,
      role: user.role,
      type: 'access',
    };
    const accessToken = this.signRaw(accessPayload, this.accessSecret, ACCESS_TTL);

    const jti = randomUUID();
    const refreshPayload: RefreshPayload = {
      sub: user.username,
      role: user.role,
      jti,
      type: 'refresh',
    };
    const refreshToken = this.signRaw(refreshPayload, this.refreshSecret, REFRESH_TTL);
    this.refreshSessions.set(jti, user);

    return { accessToken, refreshToken };
  }

  private verifyAccessToken(accessToken: string): AccessPayload {
    try {
      const payload = this.verifyRaw<AccessPayload>(accessToken, this.accessSecret);
      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid access token type');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private verifyRefreshToken(refreshToken: string): RefreshPayload {
    try {
      const payload = this.verifyRaw<RefreshPayload>(refreshToken, this.refreshSecret);
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token type');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  login(username: string, password: string, role: string) {
    if (username !== DEV_USERNAME || password !== DEV_PASSWORD) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const normalizedRole = this.normalizeRole(role);
    const user = this.buildUser(DEV_USERNAME, normalizedRole);
    const tokens = this.signTokens(user);

    return {
      ...tokens,
      user,
    };
  }

  loginWithGoogleDev(googleEmail: string, role: string) {
    if (!googleEmail?.includes('@')) {
      throw new UnauthorizedException('Invalid Google account');
    }
    const normalizedRole = this.normalizeRole(role);
    const user = this.buildUser(DEV_USERNAME, normalizedRole);
    const tokens = this.signTokens(user);
    return {
      ...tokens,
      user,
      provider: 'google-dev',
    };
  }

  me(accessToken: string) {
    const payload = this.verifyAccessToken(accessToken);
    return this.buildUser(payload.sub, payload.role);
  }

  refresh(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);
    const user = this.refreshSessions.get(payload.jti);
    if (!user) throw new UnauthorizedException('Refresh token revoked');
    this.refreshSessions.delete(payload.jti);
    const tokens = this.signTokens(user);
    return tokens;
  }

  logout(refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = this.verifyRefreshToken(refreshToken);
        this.refreshSessions.delete(payload.jti);
      } catch {
        // ignore invalid token for logout
      }
    }
    return { ok: true };
  }

  generateUsername(base: string) {
    const safeBase = (base || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .trim();
    if (!safeBase) {
      throw new UnauthorizedException('Invalid base username');
    }
    if (!this.usernameRegistry.has(safeBase)) {
      this.usernameRegistry.add(safeBase);
      return { username: safeBase };
    }
    let suffix = 1;
    while (this.usernameRegistry.has(`${safeBase}-${suffix}`)) {
      suffix += 1;
    }
    const username = `${safeBase}-${suffix}`;
    this.usernameRegistry.add(username);
    return { username };
  }

  getOnboardingState(accessToken: string) {
    const payload = this.verifyAccessToken(accessToken);
    const key = `${payload.sub}:${payload.role}`;
    return {
      completed: this.onboardingState.get(key) ?? false,
    };
  }

  setOnboardingState(accessToken: string, completed: boolean) {
    const payload = this.verifyAccessToken(accessToken);
    const key = `${payload.sub}:${payload.role}`;
    this.onboardingState.set(key, completed);
    return { completed };
  }

  assertRole(accessToken: string, allowedRoles: Role[]) {
    const payload = this.verifyAccessToken(accessToken);
    if (!allowedRoles.includes(payload.role)) {
      throw new UnauthorizedException('Role not allowed');
    }
    return this.buildUser(payload.sub, payload.role);
  }
}
