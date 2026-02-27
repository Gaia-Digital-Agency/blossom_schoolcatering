import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { AuthUser, ROLES, Role } from './auth.types';
import { runSql } from './db.util';

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

type GoogleTokenInfo = {
  sub?: string;
  email?: string;
  email_verified?: string;
  aud?: string;
  given_name?: string;
  family_name?: string;
};

type RegisterInput = {
  role: Role;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  address?: string;
};

type RegisterYoungsterWithParentInput = {
  youngsterFirstName: string;
  youngsterLastName: string;
  youngsterGender: string;
  youngsterDateOfBirth: string;
  youngsterSchoolId: string;
  youngsterGrade: string;
  youngsterPhone: string;
  youngsterEmail?: string;
  parentFirstName: string;
  parentLastName?: string;
  parentMobileNumber: string;
  parentEmail: string;
  parentAddress?: string;
};

type RegistrationSchoolRow = {
  id: string;
  name: string;
  city: string | null;
};

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const KITCHEN_USERNAME = 'kitchen';
const KITCHEN_PASSWORD = 'kitchen123';
const DELIVERY_USERNAME = 'delivery';
const DELIVERY_PASSWORD = 'delivery123';
const PARENT_USERNAME = 'parent';
const PARENT_PASSWORD = 'parent123';
const YOUNGSTER_USERNAME = 'youngster';
const YOUNGSTER_PASSWORD = 'youngster123';
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

  private parseJsonLines<T>(lines: string): T[] {
    if (!lines) return [];
    return lines
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }

  private sanitizeUsernamePart(raw: string) {
    return (raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 100) || `user_${Date.now()}`;
  }

  private buildGeneratedPassword(phoneLike: string) {
    const digits = (phoneLike || '').replace(/\D/g, '');
    if (digits.length >= 6) return digits;
    return `${digits}123456`.slice(0, 6);
  }

  private async ensureSystemUsers() {
    const specs = [
      {
        role: 'ADMIN',
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
        firstName: 'Admin',
        lastName: 'User',
        phoneNumber: '0000000001',
        email: 'admin@gaiada.com',
      },
      {
        role: 'KITCHEN',
        username: KITCHEN_USERNAME,
        password: KITCHEN_PASSWORD,
        firstName: 'Kitchen',
        lastName: 'User',
        phoneNumber: '0000000002',
        email: 'kitchen@gaiada.com',
      },
      {
        role: 'DELIVERY',
        username: DELIVERY_USERNAME,
        password: DELIVERY_PASSWORD,
        firstName: 'Delivery',
        lastName: 'User',
        phoneNumber: '0000000003',
        email: 'delivery@gaiada.com',
      },
      {
        role: 'PARENT',
        username: PARENT_USERNAME,
        password: PARENT_PASSWORD,
        firstName: 'Parent',
        lastName: 'User',
        phoneNumber: '0000000004',
        email: 'parent@gaiada.com',
      },
      {
        role: 'CHILD',
        username: YOUNGSTER_USERNAME,
        password: YOUNGSTER_PASSWORD,
        firstName: 'Youngster',
        lastName: 'User',
        phoneNumber: '0000000005',
        email: 'youngster@gaiada.com',
      },
    ] as const;

    for (const spec of specs) {
      const hashed = this.hashPassword(spec.password);
      const userId = await runSql(
        `INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             updated_at = now()
         RETURNING id;`,
        [spec.role, spec.username, hashed, spec.firstName, spec.lastName, spec.phoneNumber, spec.email],
      );
      await runSql(
        `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
         VALUES ($1, false, false, true)
         ON CONFLICT (user_id) DO NOTHING;`,
        [userId],
      );
    }

    await runSql(`
      UPDATE users
      SET is_active = false,
          updated_at = now()
      WHERE username = 'teameditor';
    `);
  }

  private async findUserByUsername(username: string) {
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, username, role::text, first_name, last_name, password_hash
         FROM users
         WHERE username = $1
           AND is_active = true
         LIMIT 1
       ) t;`,
      [username],
    );
    if (!out) return null;
    return this.parseJsonLine<DbUserRow>(out);
  }

  private async findUserByEmail(email: string) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, username, role::text, first_name, last_name, password_hash
         FROM users
         WHERE email = $1
           AND is_active = true
         LIMIT 1
       ) t;`,
      [normalizedEmail],
    );
    if (!out) return null;
    return this.parseJsonLine<DbUserRow>(out);
  }

  private normalizeRegistrationRole(role: string): Role {
    const normalized = this.normalizeRole(role);
    if (!['PARENT', 'YOUNGSTER', 'DELIVERY'].includes(normalized)) {
      throw new BadRequestException('Registration only allowed for Parent, Youngsters, and Delivery');
    }
    return normalized;
  }

  private normalizeGoogleRole(role: string): Role {
    const normalized = this.normalizeRole(role);
    if (normalized !== 'PARENT' && normalized !== 'YOUNGSTER') {
      throw new BadRequestException('Google login is only for Parent and Youngsters');
    }
    return normalized;
  }

  private async findUserByIdentity(providerUserId: string) {
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT u.id, u.username, u.role::text, u.first_name, u.last_name, u.password_hash
         FROM user_identities ui
         JOIN users u ON u.id = ui.user_id
         WHERE ui.provider = 'GOOGLE'
           AND ui.provider_user_id = $1
           AND u.is_active = true
         LIMIT 1
       ) t;`,
      [providerUserId],
    );
    if (!out) return null;
    return this.parseJsonLine<DbUserRow>(out);
  }

  private async createGoogleUser(role: Role, payload: GoogleTokenInfo) {
    const email = (payload.email || '').toLowerCase();
    const firstName = (payload.given_name || 'Google').trim();
    const lastName = (payload.family_name || 'User').trim();
    const phoneNumber = '0000009999';
    const randomPassword = this.hashPassword(randomUUID());
    const usernameBase = (email.split('@')[0] || `google_${Date.now()}`).replace(/[^a-z0-9_]/g, '');
    const username = await runSql(
      `SELECT generate_unique_username($1);`,
      [usernameBase.toLowerCase()],
    );
    const dbRole = this.dbRoleFromApp(role);
    const out = await runSql(
      `WITH inserted AS (
         INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, username, role::text, first_name, last_name, password_hash
       )
       SELECT row_to_json(inserted)::text FROM inserted;`,
      [dbRole, username, randomPassword, firstName, lastName, phoneNumber, email],
    );
    if (!out) throw new UnauthorizedException('Failed to create Google user');
    const userRow = this.parseJsonLine<DbUserRow>(out);
    await runSql(
      `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
       VALUES ($1, false, false, true)
       ON CONFLICT (user_id) DO NOTHING;`,
      [userRow.id],
    );
    if (role === 'PARENT') {
      await runSql(
        `INSERT INTO parents (user_id, address)
         VALUES ($1, 'Google signup address pending')
         ON CONFLICT (user_id) DO NOTHING;`,
        [userRow.id],
      );
    }
    return userRow;
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
    await runSql(
      `INSERT INTO auth_refresh_sessions (jti, user_id, app_role, expires_at)
       VALUES ($1, $2, $3, now() + interval '7 day');`,
      [jti, userId, user.role],
    );
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

  async login(username: string, password: string, role?: string) {
    await this.ensureSystemUsers();
    const userRow = await this.findUserByUsername(username);
    if (!userRow || !this.verifyPassword(password, userRow.password_hash)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const actualRole = this.appRoleFromDb(userRow.role);
    const normalizedRole = role ? this.normalizeRole(role) : actualRole;
    if (role && actualRole !== normalizedRole) {
      throw new UnauthorizedException('Role mismatch');
    }
    const user = this.buildUser(userRow, normalizedRole);
    const tokens = await this.signTokens(user, userRow.id);
    return { ...tokens, user };
  }

  async register(input: RegisterInput) {
    const role = this.normalizeRegistrationRole(input.role);
    const username = (input.username || '').trim().toLowerCase();
    const firstName = (input.firstName || '').trim();
    const lastName = (input.lastName || '').trim();
    const phoneNumber = (input.phoneNumber || '').trim();
    const password = input.password || '';
    const email = (input.email || '').trim().toLowerCase();
    const address = (input.address || '').trim();

    if (!username || !firstName || !lastName || !phoneNumber || !password || !email) {
      throw new BadRequestException('Required fields are missing');
    }
    if (username.length < 3 || password.length < 6) {
      throw new BadRequestException('Username or password too short');
    }
    if (role === 'PARENT' && !address) {
      throw new BadRequestException('Address is required for parent registration');
    }

    const existing = await this.findUserByUsername(username);
    if (existing) {
      throw new BadRequestException('Username already exists');
    }

    const hashed = this.hashPassword(password);
    const dbRole = this.dbRoleFromApp(role);
    let created: DbUserRow | null = null;
    try {
      const out = await runSql(
        `WITH inserted AS (
           INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, username, role::text, first_name, last_name, password_hash
         )
         SELECT row_to_json(inserted)::text FROM inserted;`,
        [dbRole, username, hashed, firstName, lastName, phoneNumber, email || null],
      );
      if (!out) {
        throw new BadRequestException('Failed to create user');
      }
      created = this.parseJsonLine<DbUserRow>(out);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('duplicate key')) {
        throw new BadRequestException('Username or email already exists');
      }
      throw err;
    }

    await runSql(
      `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
       VALUES ($1, false, false, true)
       ON CONFLICT (user_id) DO NOTHING;`,
      [created.id],
    );

    if (role === 'PARENT') {
      await runSql(
        `INSERT INTO parents (user_id, address) VALUES ($1, $2);`,
        [created.id, address],
      );
    }

    const user = this.buildUser(created, role);
    const tokens = await this.signTokens(user, created.id);
    return { ...tokens, user };
  }

  async getRegistrationSchools() {
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, name, city
         FROM schools
         WHERE is_active = true
           AND deleted_at IS NULL
         ORDER BY name
       ) t;`,
    );
    const rows = this.parseJsonLines<RegistrationSchoolRow>(out);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city || null,
    }));
  }

  async registerYoungsterWithParent(input: RegisterYoungsterWithParentInput) {
    const youngsterFirstName = (input.youngsterFirstName || '').trim();
    const youngsterLastNameRaw = (input.youngsterLastName || '').trim();
    const youngsterGender = (input.youngsterGender || '').trim().toUpperCase();
    const youngsterDateOfBirth = (input.youngsterDateOfBirth || '').trim();
    const youngsterSchoolId = (input.youngsterSchoolId || '').trim();
    const youngsterGrade = (input.youngsterGrade || '').trim();
    const youngsterPhone = (input.youngsterPhone || '').trim();
    const youngsterEmail = (input.youngsterEmail || '').trim().toLowerCase();
    const parentFirstName = (input.parentFirstName || '').trim();
    const parentLastNameInput = (input.parentLastName || '').trim();
    const parentMobileNumber = (input.parentMobileNumber || '').trim();
    const parentEmail = (input.parentEmail || '').trim().toLowerCase();
    const parentAddress = (input.parentAddress || '').trim();

    if (
      !youngsterFirstName ||
      !youngsterLastNameRaw ||
      !youngsterGender ||
      !youngsterDateOfBirth ||
      !youngsterSchoolId ||
      !youngsterGrade ||
      !youngsterPhone ||
      !parentFirstName ||
      !parentLastNameInput ||
      !parentMobileNumber ||
      !parentEmail
    ) {
      throw new BadRequestException('Missing required youngster/parent fields');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(youngsterDateOfBirth)) {
      throw new BadRequestException('Youngster date of birth must be YYYY-MM-DD');
    }
    if (!['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'].includes(youngsterGender)) {
      throw new BadRequestException('Invalid youngster gender');
    }
    if (!parentEmail.includes('@')) {
      throw new BadRequestException('Invalid parent email');
    }
    if (youngsterEmail && !youngsterEmail.includes('@')) {
      throw new BadRequestException('Invalid youngster email');
    }

    const schoolExists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM schools
         WHERE id = $1
           AND is_active = true
           AND deleted_at IS NULL
       );`,
      [youngsterSchoolId],
    );
    if (schoolExists !== 't') {
      throw new BadRequestException('School not found or inactive');
    }

    const youngsterLastName = youngsterLastNameRaw;
    const parentLastName = parentLastNameInput;
    if (parentLastName.toLowerCase() !== youngsterLastName.toLowerCase()) {
      throw new BadRequestException('Parent last name must match youngster last name');
    }

    const existingParentByEmail = await this.findUserByEmail(parentEmail);
    let parentUserId = '';
    let parentUsername = '';
    let parentGeneratedPassword = '';
    let parentWasExisting = false;

    if (existingParentByEmail) {
      if (this.appRoleFromDb(existingParentByEmail.role) !== 'PARENT') {
        throw new BadRequestException('Parent email is already used by another role');
      }
      parentWasExisting = true;
      parentUserId = existingParentByEmail.id;
      parentUsername = existingParentByEmail.username;
      const parentProfileExists = await runSql(
        `SELECT EXISTS (
           SELECT 1 FROM parents
           WHERE user_id = $1
             AND deleted_at IS NULL
         );`,
        [parentUserId],
      );
      if (parentProfileExists !== 't') {
        await runSql(
          `INSERT INTO parents (user_id, address)
           VALUES ($1, $2);`,
          [parentUserId, parentAddress || 'Address pending from youngster registration'],
        );
      }
    } else {
      const parentUsernameBase = this.sanitizeUsernamePart(`${parentFirstName}_${parentLastName}`);
      parentUsername = await runSql(`SELECT generate_unique_username($1);`, [parentUsernameBase]);
      parentGeneratedPassword = this.buildGeneratedPassword(parentMobileNumber);
      const parentPasswordHash = this.hashPassword(parentGeneratedPassword);
      const parentOut = await runSql(
        `WITH inserted AS (
           INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
           VALUES ('PARENT', $1, $2, $3, $4, $5, $6)
           RETURNING id, username
         )
         SELECT row_to_json(inserted)::text
         FROM inserted;`,
        [parentUsername, parentPasswordHash, parentFirstName, parentLastName, parentMobileNumber, parentEmail],
      );
      const parentCreated = this.parseJsonLine<{ id: string; username: string }>(parentOut);
      parentUserId = parentCreated.id;

      await runSql(
        `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
         VALUES ($1, false, false, true)
         ON CONFLICT (user_id) DO NOTHING;`,
        [parentUserId],
      );
      await runSql(
        `INSERT INTO parents (user_id, address)
         VALUES ($1, $2);`,
        [parentUserId, parentAddress || 'Address pending from youngster registration'],
      );
    }

    if (youngsterEmail) {
      const existingYoungsterEmail = await this.findUserByEmail(youngsterEmail);
      if (existingYoungsterEmail) {
        throw new BadRequestException('Youngster email already exists');
      }
    }

    const parentId = await runSql(
      `SELECT id
       FROM parents
       WHERE user_id = $1
         AND deleted_at IS NULL
       LIMIT 1;`,
      [parentUserId],
    );
    if (!parentId) {
      throw new BadRequestException('Failed to resolve parent profile');
    }

    const youngsterUsernameBase = this.sanitizeUsernamePart(`${youngsterLastName}_${youngsterFirstName}`);
    const youngsterUsername = await runSql(`SELECT generate_unique_username($1);`, [youngsterUsernameBase]);
    const youngsterGeneratedPassword = this.buildGeneratedPassword(youngsterPhone);
    const youngsterPasswordHash = this.hashPassword(youngsterGeneratedPassword);
    const youngsterOut = await runSql(
      `WITH inserted AS (
         INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
         VALUES ('CHILD', $1, $2, $3, $4, $5, $6)
         RETURNING id, username, first_name, last_name
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [youngsterUsername, youngsterPasswordHash, youngsterFirstName, youngsterLastName, youngsterPhone, youngsterEmail || null],
    );
    const youngsterCreated = this.parseJsonLine<{ id: string; username: string; first_name: string; last_name: string }>(youngsterOut);

    await runSql(
      `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
       VALUES ($1, false, false, true)
       ON CONFLICT (user_id) DO NOTHING;`,
      [youngsterCreated.id],
    );

    const youngsterChildOut = await runSql(
      `WITH inserted AS (
         INSERT INTO children (user_id, school_id, date_of_birth, gender, school_grade, photo_url)
         VALUES ($1, $2, $3::date, $4::gender_type, $5, NULL)
         RETURNING id
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [youngsterCreated.id, youngsterSchoolId, youngsterDateOfBirth, youngsterGender, youngsterGrade],
    );
    const youngsterChild = this.parseJsonLine<{ id: string }>(youngsterChildOut);

    await runSql(
      `INSERT INTO parent_children (parent_id, child_id)
       VALUES ($1, $2)
       ON CONFLICT (parent_id, child_id) DO NOTHING;`,
      [parentId, youngsterChild.id],
    );

    return {
      parent: {
        userId: parentUserId,
        username: parentUsername,
        generatedPassword: parentGeneratedPassword || null,
        firstName: parentFirstName,
        lastName: parentLastName,
        mobileNumber: parentMobileNumber,
        email: parentEmail,
        existed: parentWasExisting,
      },
      youngster: {
        userId: youngsterCreated.id,
        childId: youngsterChild.id,
        username: youngsterCreated.username,
        generatedPassword: youngsterGeneratedPassword,
        firstName: youngsterFirstName,
        lastName: youngsterLastName,
        mobileNumber: youngsterPhone,
        email: youngsterEmail || null,
      },
      link: {
        parentId,
        childId: youngsterChild.id,
      },
    };
  }

  async loginWithGoogleVerified(idToken: string, role: string) {
    const normalizedRole = this.normalizeGoogleRole(role);
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!res.ok) {
      throw new UnauthorizedException('Google token verification failed');
    }
    const payload = (await res.json()) as GoogleTokenInfo;
    if (!payload.sub || !payload.email || payload.email_verified !== 'true') {
      throw new UnauthorizedException('Invalid Google identity');
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && payload.aud !== clientId) {
      throw new UnauthorizedException('Google audience mismatch');
    }

    await this.ensureSystemUsers();
    let userRow = await this.findUserByIdentity(payload.sub);
    if (userRow) {
      const existingRole = this.appRoleFromDb(userRow.role);
      if (existingRole !== normalizedRole) {
        throw new UnauthorizedException('Role mismatch for Google account');
      }
    } else {
      const emailUser = await this.findUserByEmail(payload.email);
      if (emailUser) {
        const emailUserRole = this.appRoleFromDb(emailUser.role);
        if (emailUserRole !== normalizedRole) {
          throw new UnauthorizedException('Role mismatch for Google account');
        }
        userRow = emailUser;
      } else {
        userRow = await this.createGoogleUser(normalizedRole, payload);
      }
      await runSql(
        `INSERT INTO user_identities (user_id, provider, provider_user_id, provider_email)
         VALUES ($1, 'GOOGLE', $2, $3)
         ON CONFLICT (provider, provider_user_id)
         DO UPDATE SET provider_email = EXCLUDED.provider_email;`,
        [userRow.id, payload.sub, payload.email],
      );
    }
    const user = this.buildUser(userRow, normalizedRole);
    const tokens = await this.signTokens(user, userRow.id);

    return { ...tokens, user, provider: 'google' };
  }

  async loginWithGoogleDev(googleEmail: string, role: string) {
    if (!googleEmail?.includes('@')) {
      throw new UnauthorizedException('Invalid Google account');
    }
    const normalizedRole = this.normalizeRole(role);
    await this.ensureSystemUsers();
    const userRow = await this.findUserByUsername(PARENT_USERNAME);
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
    const active = await runSql(
      `SELECT EXISTS (
         SELECT 1
         FROM auth_refresh_sessions
         WHERE jti = $1
           AND user_id = $2
           AND revoked_at IS NULL
           AND expires_at > now()
       );`,
      [payload.jti, payload.uid],
    );
    if (active !== 't') throw new UnauthorizedException('Refresh token revoked');

    await runSql(
      `UPDATE auth_refresh_sessions SET revoked_at = now() WHERE jti = $1;`,
      [payload.jti],
    );

    const userRow = await this.findUserByUsername(payload.sub);
    if (!userRow) throw new UnauthorizedException('User not found');
    const user = this.buildUser(userRow, payload.role);
    return this.signTokens(user, userRow.id);
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { ok: true };
    try {
      const payload = this.verifyRefreshToken(refreshToken);
      await runSql(
        `UPDATE auth_refresh_sessions SET revoked_at = now() WHERE jti = $1;`,
        [payload.jti],
      );
    } catch {
      // ignore invalid token for logout
    }
    return { ok: true };
  }

  async generateUsername(base: string) {
    const safeBase = (base || '').toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
    if (!safeBase) throw new UnauthorizedException('Invalid base username');
    const out = await runSql(`SELECT generate_unique_username($1);`, [safeBase]);
    return { username: out };
  }

  async getOnboardingState(accessToken: string) {
    const payload = this.verifyAccessToken(accessToken);
    const out = await runSql(
      `SELECT onboarding_completed
       FROM user_preferences up
       JOIN users u ON u.id = up.user_id
       WHERE u.username = $1
       LIMIT 1;`,
      [payload.sub],
    );
    return { completed: out === 't' };
  }

  async setOnboardingState(accessToken: string, completed: boolean) {
    const payload = this.verifyAccessToken(accessToken);
    await runSql(
      `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
       SELECT id, $1, false, true
       FROM users
       WHERE username = $2
       ON CONFLICT (user_id) DO UPDATE
       SET onboarding_completed = EXCLUDED.onboarding_completed,
           updated_at = now();`,
      [completed, payload.sub],
    );
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

  async changePassword(accessToken: string, currentPassword: string, newPassword: string) {
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      throw new BadRequestException('Invalid password input');
    }
    const payload = this.verifyAccessToken(accessToken);
    const userRow = await this.findUserByUsername(payload.sub);
    if (!userRow) throw new UnauthorizedException('User not found');
    if (!this.verifyPassword(currentPassword, userRow.password_hash)) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const nextHash = this.hashPassword(newPassword);
    await runSql(
      `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2;`,
      [nextHash, userRow.id],
    );
    return { ok: true };
  }
}
