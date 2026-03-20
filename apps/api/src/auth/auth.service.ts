import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { AuthUser, ROLES, Role } from './auth.types';
import { runSql } from './db.util';
import { validatePasswordPolicy } from './password-policy';

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
  phone_number?: string | null;
  email?: string | null;
  password_hash: string;
};

type PasswordResetTokenRow = {
  user_id: string;
  expires_at: string;
  consumed_at?: string | null;
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
  allergies?: string;
};

type RegisterYoungsterWithParentInput = {
  registrantType: 'YOUNGSTER' | 'PARENT' | 'TEACHER';
  teacherName?: string;
  teacherPhone?: string;
  students: Array<{
    youngsterFirstName: string;
    youngsterDateOfBirth: string;
    youngsterSchoolId: string;
    youngsterGrade: string;
    youngsterPhone: string;
    youngsterEmail: string;
    youngsterAllergies: string;
  }>;
  parentFirstName: string;
  parentLastName?: string;
  parentMobileNumber: string;
  parentEmail: string;
  parentAddress?: string;
  parentAllergies?: string;
  password: string;
};

type RegistrationSchoolRow = {
  id: string;
  name: string;
  city: string | null;
};

type SeedStudentSpec = {
  username: string;
  firstName: string;
  familyGroup: string;
  schoolIndex: number;
  dateOfBirth: string;
  grade: string;
  allergies: string;
  registrantType: 'PARENT' | 'YOUNGSTER' | 'TEACHER';
  teacherName?: string;
  teacherPhone?: string;
};

type SeedFamilySpec = {
  familyGroup: string;
  parentUsername: string;
  parentFirstName: string;
  parentAddress: string;
  parentAllergies: string;
  students: SeedStudentSpec[];
};

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'teameditor123';
const KITCHEN_USERNAME = 'kitchen';
const KITCHEN_PASSWORD = 'teameditor123';
const DELIVERY_USERNAME = 'delivery';
const DELIVERY_PASSWORD = 'teameditor123';
const PARENT_USERNAME = 'parent';
const PARENT_PASSWORD = 'Teameditor@123';
const YOUNGSTER_USERNAME = 'youngster';
const YOUNGSTER_PASSWORD = 'Teameditor@123';
const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

@Injectable()
export class AuthService {
  private parentDietaryRestrictionsReady = false;
  private childRegistrationSourceColumnsReady = false;
  private passwordResetTableReady = false;
  private adminVisiblePasswordsReady = false;
  private systemUsersReady = false;

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

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
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

  private normalizePhone(raw?: string | null) {
    return String(raw || '').trim();
  }

  private phoneCompareKey(raw?: string | null) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits || String(raw || '').trim().toLowerCase();
  }

  private buildGeneratedPassword(phoneLike: string) {
    const raw = (phoneLike || '').trim();
    if (raw.length >= 6) return raw;
    return `${raw}123456`.slice(0, 6);
  }

  private generateRegistrationPassword() {
    const seed = randomUUID().replace(/-/g, '');
    return `St#${seed.slice(0, 10)}`;
  }

  private normalizeAllergies(allergiesRaw?: string) {
    const cleaned = (allergiesRaw || '').trim().replace(/\s+/g, ' ');
    const fallback = 'No Allergies';
    if (!cleaned) return fallback;
    if (cleaned.length > 50) {
      throw new BadRequestException('Allergies must be 50 characters or less');
    }
    return cleaned;
  }

  private async ensureAdminVisiblePasswordsTable() {
    if (this.adminVisiblePasswordsReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS admin_visible_passwords (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password_plaintext text NOT NULL,
        source text NOT NULL DEFAULT 'REGISTRATION',
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    this.adminVisiblePasswordsReady = true;
  }

  private async setAdminVisiblePassword(userId: string, password: string, source: 'REGISTRATION' | 'RESET' | 'MANUAL_CREATE') {
    await this.ensureAdminVisiblePasswordsTable();
    await runSql(
      `INSERT INTO admin_visible_passwords (user_id, password_plaintext, source, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE
       SET password_plaintext = EXCLUDED.password_plaintext,
           source = EXCLUDED.source,
           updated_at = now();`,
      [userId, password, source],
    );
  }

  private async ensureParentDietaryRestrictionsTable() {
    if (this.parentDietaryRestrictionsReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS parent_dietary_restrictions (
        parent_id uuid PRIMARY KEY REFERENCES parents(id) ON DELETE CASCADE,
        restriction_label text NOT NULL DEFAULT 'ALLERGIES',
        restriction_details text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL
      );
    `);
    this.parentDietaryRestrictionsReady = true;
  }

  private async ensureChildRegistrationSourceColumns() {
    if (this.childRegistrationSourceColumnsReady) return;
    await runSql(`
      ALTER TABLE children
      ADD COLUMN IF NOT EXISTS registration_actor_type varchar(20) NOT NULL DEFAULT 'PARENT',
      ADD COLUMN IF NOT EXISTS registration_actor_teacher_name varchar(50),
      ADD COLUMN IF NOT EXISTS registration_actor_teacher_phone varchar(30);
    `);
    this.childRegistrationSourceColumnsReady = true;
  }

  private async upsertParentAllergies(parentId: string, allergies: string) {
    await this.ensureParentDietaryRestrictionsTable();
    await runSql(
      `INSERT INTO parent_dietary_restrictions (parent_id, restriction_label, restriction_details, is_active, deleted_at)
       VALUES ($1, 'ALLERGIES', $2, true, NULL)
       ON CONFLICT (parent_id)
       DO UPDATE SET restriction_label = 'ALLERGIES',
                     restriction_details = EXCLUDED.restriction_details,
                     is_active = true,
                     deleted_at = NULL,
                     updated_at = now();`,
      [parentId, allergies],
    );
  }

  private async ensureSystemUsers() {
    if (this.systemUsersReady) return;
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
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             phone_number = EXCLUDED.phone_number,
             email = EXCLUDED.email,
             is_active = true,
             deleted_at = NULL,
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

    await this.ensureSeededFamiliesAndStudents();
    this.systemUsersReady = true;
  }

  private buildSeedAliasEmail(baseEmail: string, tag: string) {
    const trimmed = (baseEmail || '').trim().toLowerCase();
    const [localRaw, domainRaw] = trimmed.includes('@') ? trimmed.split('@') : [trimmed, 'example.com'];
    const local = this.sanitizeUsernamePart(localRaw || 'seed');
    const domain = (domainRaw || 'example.com').trim().toLowerCase();
    const aliasTag = this.sanitizeUsernamePart(tag).replace(/_/g, '-');
    return `${local}+${aliasTag}@${domain}`;
  }

  private async ensureSeedSchools(requiredCount: number) {
    const existingOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, name
         FROM schools
         WHERE is_active = true
           AND deleted_at IS NULL
         ORDER BY name ASC
       ) t;`,
    );
    const schools = this.parseJsonLines<{ id: string; name: string }>(existingOut);
    for (let index = schools.length; index < requiredCount; index += 1) {
      const schoolNumber = index + 1;
      const schoolName = `Seed School ${String(schoolNumber).padStart(2, '0')}`;
      let schoolId = await runSql(
        `INSERT INTO schools (name, address, city, contact_phone, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT DO NOTHING
         RETURNING id;`,
        [
          schoolName,
          `Seed Address ${schoolNumber}`,
          'Makassar',
          `+620000000${String(schoolNumber).padStart(2, '0')}`,
        ],
      );
      if (!schoolId) {
        schoolId = await runSql(
          `SELECT id
           FROM schools
           WHERE lower(name) = lower($1)
           LIMIT 1;`,
          [schoolName],
        );
      }
      schools.push({ id: schoolId, name: schoolName });
    }
    return schools;
  }

  private async retireLegacyFamilyStudentSeedUsers() {
    const legacyOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, username, role::text AS role
         FROM users
         WHERE username IN ($1, $2)
       ) t;`,
      [PARENT_USERNAME, YOUNGSTER_USERNAME],
    );
    const legacyUsers = this.parseJsonLines<{ id: string; username: string; role: string }>(legacyOut);
    const parentIds: string[] = [];
    const childIds: string[] = [];

    for (const user of legacyUsers) {
      if (user.role === 'PARENT') {
        const parentId = await runSql(`SELECT id FROM parents WHERE user_id = $1 LIMIT 1;`, [user.id]);
        if (parentId) parentIds.push(parentId);
      }
      if (user.role === 'CHILD') {
        const childId = await runSql(`SELECT id FROM children WHERE user_id = $1 LIMIT 1;`, [user.id]);
        if (childId) childIds.push(childId);
      }
    }

    if (parentIds.length > 0) {
      const ph = parentIds.map((_, i) => `$${i + 1}`).join(', ');
      await runSql(`DELETE FROM parent_children WHERE parent_id IN (${ph});`, parentIds);
      await runSql(`UPDATE parents SET deleted_at = now(), updated_at = now() WHERE id IN (${ph});`, parentIds);
    }
    if (childIds.length > 0) {
      const ph = childIds.map((_, i) => `$${i + 1}`).join(', ');
      await runSql(`DELETE FROM parent_children WHERE child_id IN (${ph});`, childIds);
      await runSql(
        `UPDATE children
         SET is_active = false,
             deleted_at = now(),
             updated_at = now()
         WHERE id IN (${ph});`,
        childIds,
      );
    }
    if (legacyUsers.length > 0) {
      const userIds = legacyUsers.map((row) => row.id);
      const ph = userIds.map((_, i) => `$${i + 1}`).join(', ');
      await runSql(
        `UPDATE users
         SET is_active = false,
             deleted_at = now(),
             updated_at = now()
         WHERE id IN (${ph});`,
        userIds,
      );
    }
  }

  private async ensureSeededFamiliesAndStudents() {
    await this.ensureChildRegistrationSourceColumns();
    await this.ensureParentDietaryRestrictionsTable();
    await this.ensureAdminVisiblePasswordsTable();
    await this.retireLegacyFamilyStudentSeedUsers();

    const schools = await this.ensureSeedSchools(7);
    const parentPhone = '+628172345678';
    const studentPhone = '+628171234567';
    const teacherPhone = '+628173456789';
    const emailBase = 'azlan@net1io.com';
    const families: SeedFamilySpec[] = [
      {
        familyGroup: 'family01',
        parentUsername: 'family01_parent01',
        parentFirstName: 'parent01',
        parentAddress: 'Family 01 Address',
        parentAllergies: 'No Allergies',
        students: [
          {
            username: 'family01_student01a',
            firstName: 'student01a',
            familyGroup: 'family01',
            schoolIndex: 0,
            dateOfBirth: '2016-02-14',
            grade: '4',
            allergies: 'Peanut Allergy',
            registrantType: 'PARENT',
          },
        ],
      },
      {
        familyGroup: 'family02',
        parentUsername: 'family02_parent02',
        parentFirstName: 'parent02',
        parentAddress: 'Family 02 Address',
        parentAllergies: 'No Allergies',
        students: [
          {
            username: 'family02_student02a',
            firstName: 'student02a',
            familyGroup: 'family02',
            schoolIndex: 1,
            dateOfBirth: '2015-04-09',
            grade: '5',
            allergies: 'No Allergies',
            registrantType: 'PARENT',
          },
          {
            username: 'family02_student02b',
            firstName: 'student02b',
            familyGroup: 'family02',
            schoolIndex: 2,
            dateOfBirth: '2014-06-21',
            grade: '6',
            allergies: 'Shellfish Allergy',
            registrantType: 'PARENT',
          },
        ],
      },
      {
        familyGroup: 'family03',
        parentUsername: 'family03_parent03',
        parentFirstName: 'parent03',
        parentAddress: 'Family 03 Address',
        parentAllergies: 'No Allergies',
        students: [
          {
            username: 'family03_student03a',
            firstName: 'student03a',
            familyGroup: 'family03',
            schoolIndex: 3,
            dateOfBirth: '2013-08-11',
            grade: '7',
            allergies: 'No Allergies',
            registrantType: 'YOUNGSTER',
          },
        ],
      },
      {
        familyGroup: 'family04',
        parentUsername: 'family04_parent04',
        parentFirstName: 'parent04',
        parentAddress: 'Family 04 Address',
        parentAllergies: 'No Allergies',
        students: [
          {
            username: 'family04_student04a',
            firstName: 'student04a',
            familyGroup: 'family04',
            schoolIndex: 4,
            dateOfBirth: '2012-10-03',
            grade: '8',
            allergies: 'Dairy Allergy',
            registrantType: 'TEACHER',
            teacherName: 'teacher04',
            teacherPhone,
          },
        ],
      },
      {
        familyGroup: 'family05',
        parentUsername: 'family05_parent05',
        parentFirstName: 'parent05',
        parentAddress: 'Family 05 Address',
        parentAllergies: 'No Allergies',
        students: [
          {
            username: 'family05_student05a',
            firstName: 'student05a',
            familyGroup: 'family05',
            schoolIndex: 5,
            dateOfBirth: '2011-12-18',
            grade: '9',
            allergies: 'Egg Allergy',
            registrantType: 'YOUNGSTER',
          },
          {
            username: 'family05_student05b',
            firstName: 'student05b',
            familyGroup: 'family05',
            schoolIndex: 6,
            dateOfBirth: '2014-01-26',
            grade: '6',
            allergies: 'No Allergies',
            registrantType: 'YOUNGSTER',
          },
        ],
      },
    ];

    for (const family of families) {
      const parentEmail = this.buildSeedAliasEmail(emailBase, `${family.familyGroup}-parent`);
      const parentPasswordHash = this.hashPassword('Teameditor@123');
      const createdParentUserId = await runSql(
        `INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email, is_active, deleted_at)
         VALUES ('PARENT', $1, $2, $3, $4, $5, $6, true, NULL)
         ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             phone_number = EXCLUDED.phone_number,
             email = EXCLUDED.email,
             is_active = true,
             deleted_at = NULL,
             updated_at = now()
         RETURNING id;`,
        [family.parentUsername, parentPasswordHash, family.parentFirstName, family.familyGroup, parentPhone, parentEmail],
      );
      const parentUserId = createdParentUserId || await runSql(
        `SELECT id
         FROM users
         WHERE username = $1
         LIMIT 1;`,
        [family.parentUsername],
      );
      await runSql(
        `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
         VALUES ($1, false, false, true)
         ON CONFLICT (user_id) DO NOTHING;`,
        [parentUserId],
      );
      await this.setAdminVisiblePassword(parentUserId, 'Teameditor@123', 'REGISTRATION');

      const createdParentId = await runSql(
        `INSERT INTO parents (user_id, address, deleted_at)
         VALUES ($1, $2, NULL)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING id;`,
        [parentUserId, family.parentAddress],
      );
      const parentId = createdParentId || await runSql(
        `SELECT id
         FROM parents
         WHERE user_id = $1
         LIMIT 1;`,
        [parentUserId],
      );
      if (createdParentId) {
        await this.upsertParentAllergies(parentId, family.parentAllergies);
      }

      for (const student of family.students) {
        const schoolId = schools[student.schoolIndex]?.id;
        if (!schoolId) {
          throw new BadRequestException(`Seed school missing for ${student.username}`);
        }
        const studentEmail = this.buildSeedAliasEmail(emailBase, `${student.username}`);
        const studentPasswordHash = this.hashPassword('Teameditor@123');
        const createdStudentUserId = await runSql(
          `INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email, is_active, deleted_at)
           VALUES ('CHILD', $1, $2, $3, $4, $5, $6, true, NULL)
           ON CONFLICT (username) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               first_name = EXCLUDED.first_name,
               last_name = EXCLUDED.last_name,
               phone_number = EXCLUDED.phone_number,
               email = EXCLUDED.email,
               is_active = true,
               deleted_at = NULL,
               updated_at = now()
           RETURNING id;`,
          [student.username, studentPasswordHash, student.firstName, student.familyGroup, studentPhone, studentEmail],
        );
        const studentUserId = createdStudentUserId || await runSql(
          `SELECT id
           FROM users
           WHERE username = $1
           LIMIT 1;`,
          [student.username],
        );
        await runSql(
          `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
           VALUES ($1, false, false, true)
           ON CONFLICT (user_id) DO NOTHING;`,
          [studentUserId],
        );
        await this.setAdminVisiblePassword(studentUserId, 'Teameditor@123', 'REGISTRATION');

        const existingChildId = await runSql(`SELECT id FROM children WHERE user_id = $1 LIMIT 1;`, [studentUserId]);
        const childId = existingChildId || await runSql(
          `INSERT INTO children (
             user_id,
             school_id,
             date_of_birth,
             gender,
             school_grade,
             photo_url,
             registration_actor_type,
             registration_actor_teacher_name,
             registration_actor_teacher_phone,
             is_active,
             deleted_at
           )
           VALUES ($1, $2, $3::date, 'UNDISCLOSED'::gender_type, $4, NULL, $5, $6, $7, true, NULL)
           RETURNING id;`,
          [
            studentUserId,
            schoolId,
            student.dateOfBirth,
            student.grade,
            student.registrantType,
            student.registrantType === 'TEACHER' ? (student.teacherName || 'teacher') : null,
            student.registrantType === 'TEACHER' ? (student.teacherPhone || teacherPhone) : null,
          ],
        );
        await runSql(
          `INSERT INTO child_dietary_restrictions (child_id, restriction_label, restriction_details, is_active)
           VALUES ($1, 'ALLERGIES', $2, true)
           ON CONFLICT (child_id, restriction_label) DO NOTHING;`,
          [childId, this.normalizeAllergies(student.allergies)],
        );
        await runSql(
          `INSERT INTO parent_children (parent_id, child_id)
           VALUES ($1, $2)
           ON CONFLICT (parent_id, child_id) DO NOTHING;`,
          [parentId, childId],
        );
      }
    }
  }

  private async ensurePasswordResetTable() {
    if (this.passwordResetTableReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz NULL,
        requested_ip text NULL,
        requested_user_agent text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_auth_password_reset_tokens_user_id ON auth_password_reset_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_password_reset_tokens_expires_at ON auth_password_reset_tokens(expires_at);
    `);
    this.passwordResetTableReady = true;
  }

  private async findUserByUsername(username: string) {
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, username, role::text, first_name, last_name, password_hash
               , phone_number, email
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
         WHERE LOWER(email) = $1
           AND is_active = true
           AND deleted_at IS NULL
         LIMIT 1
       ) t;`,
      [normalizedEmail],
    );
    if (!out) return null;
    return this.parseJsonLine<DbUserRow>(out);
  }

  private async findUserByPhone(phoneNumber: string) {
    const normalized = this.phoneCompareKey(phoneNumber);
    if (!normalized) return null;
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, username, role::text, first_name, last_name, password_hash, phone_number, email
         FROM users
         WHERE is_active = true
           AND deleted_at IS NULL
           AND regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g') = $1
         LIMIT 1
       ) t;`,
      [normalized],
    );
    if (!out) return null;
    return this.parseJsonLine<DbUserRow>(out);
  }

  private normalizeRegistrationRole(role: string): Role {
    const normalized = this.normalizeRole(role);
    if (!['PARENT', 'YOUNGSTER', 'DELIVERY'].includes(normalized)) {
      throw new BadRequestException('Registration only allowed for Parent, Youngster, and Delivery');
    }
    return normalized;
  }

  private normalizeGoogleRole(role: string): Role {
    const normalized = this.normalizeRole(role);
    if (normalized !== 'PARENT' && normalized !== 'YOUNGSTER') {
      throw new BadRequestException('Google login is only for Parent and Youngster');
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
      phoneNumber: row.phone_number || null,
      email: row.email || null,
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
    const allergies = this.normalizeAllergies(input.allergies);

    if (!username || !firstName || !lastName || !phoneNumber || !password || !email) {
      throw new BadRequestException('Required fields are missing');
    }
    if (username.length < 3) {
      throw new BadRequestException('Username too short');
    }
    validatePasswordPolicy(password, 'password');
    if (role === 'PARENT' && !address) {
      throw new BadRequestException('Address is required for parent registration');
    }
    if (role === 'PARENT' && !String(input.allergies || '').trim()) {
      throw new BadRequestException('Allergies is required for parent registration');
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
      const parentId = await runSql(
        `INSERT INTO parents (user_id, address)
         VALUES ($1, $2)
         RETURNING id;`,
        [created.id, address],
      );
      await this.upsertParentAllergies(parentId, allergies);
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
    const registrantType = (input.registrantType || '').trim().toUpperCase();
    const teacherName = (input.teacherName || '').trim();
    const teacherPhone = (input.teacherPhone || '').trim();
    const students = Array.isArray(input.students) ? input.students : [];
    const parentFirstName = (input.parentFirstName || '').trim();
    const parentLastNameInput = (input.parentLastName || '').trim();
    const parentMobileNumber = this.normalizePhone(input.parentMobileNumber);
    const parentEmail = (input.parentEmail || '').trim().toLowerCase();
    const parentAddress = (input.parentAddress || '').trim();
    const parentAllergies = this.normalizeAllergies(input.parentAllergies);
    const password = String(input.password || '').trim();

    if (
      !registrantType ||
      !parentFirstName ||
      !parentLastNameInput ||
      !parentMobileNumber ||
      !parentEmail ||
      !password
    ) {
      throw new BadRequestException('Missing required youngster/parent fields');
    }
    if (students.length < 1 || students.length > 5) {
      throw new BadRequestException('Please register between 1 and 5 students.');
    }
    if (!['YOUNGSTER', 'PARENT', 'TEACHER'].includes(registrantType)) {
      throw new BadRequestException('registrantType must be YOUNGSTER, PARENT, or TEACHER');
    }
    if (registrantType === 'TEACHER') {
      if (!teacherName) throw new BadRequestException('Teacher name is required when registrantType is TEACHER');
      if (teacherName.length > 50) throw new BadRequestException('Teacher name must be max 50 characters');
      if (!teacherPhone) throw new BadRequestException('Teacher phone is required when registrantType is TEACHER');
    }
    if (registrantType !== 'TEACHER' && teacherName) {
      throw new BadRequestException('Teacher name is only allowed when registrantType is TEACHER');
    }
    if (registrantType !== 'TEACHER' && teacherPhone) {
      throw new BadRequestException('Teacher phone is only allowed when registrantType is TEACHER');
    }
    if (!parentEmail.includes('@')) {
      throw new BadRequestException('Invalid parent email');
    }
    validatePasswordPolicy(password, 'password');

    const parentLastName = parentLastNameInput;
    await this.ensureChildRegistrationSourceColumns();
    const seenEmails = new Set<string>([parentEmail]);
    const seenPhones = new Set<string>([this.phoneCompareKey(parentMobileNumber)]);
    for (let index = 0; index < students.length; index += 1) {
      const student = students[index];
      const youngsterFirstName = String(student?.youngsterFirstName || '').trim();
      const youngsterDateOfBirth = String(student?.youngsterDateOfBirth || '').trim();
      const youngsterSchoolId = String(student?.youngsterSchoolId || '').trim();
      const youngsterGrade = String(student?.youngsterGrade || '').trim();
      const youngsterPhone = this.normalizePhone(student?.youngsterPhone);
      const youngsterEmail = String(student?.youngsterEmail || '').trim().toLowerCase();
      if (!youngsterFirstName || !youngsterDateOfBirth || !youngsterSchoolId || !youngsterGrade || !youngsterPhone || !youngsterEmail) {
        throw new BadRequestException(`Student ${index + 1} is missing required information.`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(youngsterDateOfBirth)) {
        throw new BadRequestException(`Student ${index + 1} date of birth must be YYYY-MM-DD.`);
      }
      if (!youngsterEmail.includes('@')) {
        throw new BadRequestException(`Student ${index + 1} email must be valid.`);
      }
      if (youngsterEmail === parentEmail) {
        throw new BadRequestException(`Student ${index + 1} email cannot be the same as parent email.`);
      }
      const youngsterPhoneKey = this.phoneCompareKey(youngsterPhone);
      if (youngsterPhoneKey === this.phoneCompareKey(parentMobileNumber)) {
        throw new BadRequestException(`Student ${index + 1} phone number cannot be the same as parent phone number.`);
      }
      if (seenEmails.has(youngsterEmail)) {
        throw new BadRequestException(`Student ${index + 1} email must be unique.`);
      }
      if (seenPhones.has(youngsterPhoneKey)) {
        throw new BadRequestException(`Student ${index + 1} phone number must be unique.`);
      }
      seenEmails.add(youngsterEmail);
      seenPhones.add(youngsterPhoneKey);

      const youngsterAllergies = this.normalizeAllergies(student?.youngsterAllergies);
      if (!youngsterAllergies) {
        throw new BadRequestException(`Student ${index + 1} allergies are required.`);
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
        throw new BadRequestException(`Student ${index + 1} school not found or inactive.`);
      }

      const duplicateOut = await runSql(
        `
        SELECT EXISTS (
          SELECT 1
          FROM children c
          JOIN users cu ON cu.id = c.user_id
          JOIN parent_children pc ON pc.child_id = c.id
          JOIN parents p ON p.id = pc.parent_id
          JOIN users pu ON pu.id = p.user_id
          WHERE c.deleted_at IS NULL
            AND p.deleted_at IS NULL
            AND cu.deleted_at IS NULL
            AND pu.deleted_at IS NULL
            AND c.school_id = $1
            AND LOWER(TRIM(cu.first_name)) = LOWER(TRIM($2))
            AND LOWER(TRIM(cu.last_name)) = LOWER(TRIM($3))
            AND LOWER(TRIM(pu.first_name)) = LOWER(TRIM($4))
            AND LOWER(TRIM(pu.last_name)) = LOWER(TRIM($5))
            AND COALESCE(c.registration_actor_type::text, '') = $6
        );
        `,
        [youngsterSchoolId, youngsterFirstName, parentLastName, parentFirstName, parentLastName, registrantType],
      );
      if (duplicateOut === 't') {
        throw new BadRequestException(`Student ${index + 1} is already registered for this family. Please contact Admin.`);
      }

      if (await this.findUserByEmail(youngsterEmail)) {
        throw new BadRequestException(`Student ${index + 1} email already exists.`);
      }
      if (await this.findUserByPhone(youngsterPhone)) {
        throw new BadRequestException(`Student ${index + 1} phone number already exists.`);
      }
    }

    if (await this.findUserByEmail(parentEmail)) {
      throw new BadRequestException('Parent email already exists. Please contact Admin to update that family.');
    }
    if (await this.findUserByPhone(parentMobileNumber)) {
      throw new BadRequestException('Parent phone number already exists. Please contact Admin to update that family.');
    }

    const parentUsernameBase = this.sanitizeUsernamePart(`${parentLastName}_${parentFirstName}`);
    const parentUsername = await runSql(`SELECT generate_unique_username($1);`, [parentUsernameBase]);
    const parentGeneratedPassword = password;
    const parentPasswordHash = this.hashPassword(parentGeneratedPassword);
    let parentOut = '';
    try {
      parentOut = await runSql(
        `WITH inserted AS (
           INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
           VALUES ('PARENT', $1, $2, $3, $4, $5, $6)
           RETURNING id, username
         )
         SELECT row_to_json(inserted)::text
         FROM inserted;`,
        [parentUsername, parentPasswordHash, parentFirstName, parentLastName, parentMobileNumber, parentEmail],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (message.includes('users_email_ci_uq') || (message.includes('duplicate key') && message.includes('email'))) {
        throw new BadRequestException('Parent email already exists.');
      }
      if (message.includes('users_username_key') || (message.includes('duplicate key') && message.includes('username'))) {
        throw new BadRequestException('Parent username already exists. Please retry registration.');
      }
      throw err;
    }
    const parentCreated = this.parseJsonLine<{ id: string; username: string }>(parentOut);
    const parentUserId = parentCreated.id;

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
    await this.setAdminVisiblePassword(parentUserId, parentGeneratedPassword, 'REGISTRATION');

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
    await this.upsertParentAllergies(parentId, parentAllergies);
    const createdStudents: Array<{
      userId: string;
      childId: string;
      username: string;
      generatedPassword: string;
      firstName: string;
      lastName: string;
      mobileNumber: string;
      email: string | null;
      schoolId: string;
    }> = [];
    const youngsterGender = 'UNDISCLOSED';
    for (const student of students) {
      const youngsterFirstName = String(student.youngsterFirstName || '').trim();
      const youngsterDateOfBirth = String(student.youngsterDateOfBirth || '').trim();
      const youngsterSchoolId = String(student.youngsterSchoolId || '').trim();
      const youngsterGrade = String(student.youngsterGrade || '').trim();
      const youngsterPhone = this.normalizePhone(student.youngsterPhone);
      const youngsterEmail = String(student.youngsterEmail || '').trim().toLowerCase();
      const youngsterAllergies = this.normalizeAllergies(student.youngsterAllergies);
      const youngsterLastName = parentLastName;
      const youngsterUsernameBase = this.sanitizeUsernamePart(`${youngsterLastName}_${youngsterFirstName}`);
      const youngsterUsername = await runSql(`SELECT generate_unique_username($1);`, [youngsterUsernameBase]);
      const youngsterGeneratedPassword = this.generateRegistrationPassword();
      const youngsterPasswordHash = this.hashPassword(youngsterGeneratedPassword);
      let youngsterOut = '';
      try {
        youngsterOut = await runSql(
          `WITH inserted AS (
             INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
             VALUES ('CHILD', $1, $2, $3, $4, $5, $6)
             RETURNING id, username, first_name, last_name
           )
           SELECT row_to_json(inserted)::text
           FROM inserted;`,
          [youngsterUsername, youngsterPasswordHash, youngsterFirstName, youngsterLastName, youngsterPhone, youngsterEmail],
        );
      } catch (err) {
        const message = err instanceof Error ? err.message.toLowerCase() : '';
        if (message.includes('users_email_ci_uq') || (message.includes('duplicate key') && message.includes('email'))) {
          throw new BadRequestException(`Student email already exists for ${youngsterFirstName}.`);
        }
        if (message.includes('users_username_key') || (message.includes('duplicate key') && message.includes('username'))) {
          throw new BadRequestException(`Student username already exists for ${youngsterFirstName}. Please retry registration.`);
        }
        throw err;
      }
      const youngsterCreated = this.parseJsonLine<{ id: string; username: string; first_name: string; last_name: string }>(youngsterOut);

      await runSql(
        `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
         VALUES ($1, false, false, true)
         ON CONFLICT (user_id) DO NOTHING;`,
        [youngsterCreated.id],
      );
      await this.setAdminVisiblePassword(youngsterCreated.id, youngsterGeneratedPassword, 'REGISTRATION');

      const youngsterChildOut = await runSql(
        `WITH inserted AS (
           INSERT INTO children (
             user_id,
             school_id,
             date_of_birth,
             gender,
             school_grade,
             photo_url,
             registration_actor_type,
             registration_actor_teacher_name,
             registration_actor_teacher_phone
           )
           VALUES ($1, $2, $3::date, $4::gender_type, $5, NULL, $6, $7, $8)
           RETURNING id
         )
         SELECT row_to_json(inserted)::text
         FROM inserted;`,
        [
          youngsterCreated.id,
          youngsterSchoolId,
          youngsterDateOfBirth,
          youngsterGender,
          youngsterGrade,
          registrantType,
          registrantType === 'TEACHER' ? teacherName : null,
          registrantType === 'TEACHER' ? teacherPhone : null,
        ],
      );
      const youngsterChild = this.parseJsonLine<{ id: string }>(youngsterChildOut);
      await runSql(
        `INSERT INTO child_dietary_restrictions (child_id, restriction_label, restriction_details, is_active)
         VALUES ($1, 'ALLERGIES', $2, true)
         ON CONFLICT (child_id, restriction_label)
         DO UPDATE SET restriction_details = EXCLUDED.restriction_details,
                       is_active = true,
                       deleted_at = NULL,
                       updated_at = now();`,
        [youngsterChild.id, youngsterAllergies],
      );

      await runSql(
        `INSERT INTO parent_children (parent_id, child_id)
         VALUES ($1, $2)
         ON CONFLICT (parent_id, child_id) DO NOTHING;`,
        [parentId, youngsterChild.id],
      );

      createdStudents.push({
        userId: youngsterCreated.id,
        childId: youngsterChild.id,
        username: youngsterCreated.username,
        generatedPassword: youngsterGeneratedPassword,
        firstName: youngsterFirstName,
        lastName: youngsterLastName,
        mobileNumber: youngsterPhone,
        email: youngsterEmail || null,
        schoolId: youngsterSchoolId,
      });
    }

    return {
      parent: {
        userId: parentUserId,
        username: parentUsername,
        generatedPassword: parentGeneratedPassword,
        firstName: parentFirstName,
        lastName: parentLastName,
        mobileNumber: parentMobileNumber,
        email: parentEmail,
        existed: false,
      },
      students: createdStudents,
      link: { parentId, childIds: createdStudents.map((student) => student.childId) },
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
    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Invalid password input');
    }
    validatePasswordPolicy(newPassword, 'newPassword');
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
    await runSql(
      `UPDATE auth_refresh_sessions
       SET revoked_at = now()
       WHERE user_id = $1
         AND revoked_at IS NULL;`,
      [userRow.id],
    );
    return { ok: true };
  }

  async requestPasswordReset(identifierRaw: string, requestedIp?: string, requestedUserAgent?: string | string[]) {
    const identifier = String(identifierRaw || '').trim().toLowerCase();
    if (!identifier) throw new BadRequestException('identifier is required');
    await this.ensurePasswordResetTable();

    let userRow = await this.findUserByUsername(identifier);
    if (!userRow && identifier.includes('@')) {
      userRow = await this.findUserByEmail(identifier);
    }

    if (userRow) {
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = this.hashResetToken(rawToken);
      const requestedUserAgentText = Array.isArray(requestedUserAgent)
        ? requestedUserAgent.join('; ')
        : (requestedUserAgent || '');

      await runSql(
        `UPDATE auth_password_reset_tokens
         SET consumed_at = now()
         WHERE user_id = $1
           AND consumed_at IS NULL;`,
        [userRow.id],
      );

      await runSql(
        `INSERT INTO auth_password_reset_tokens (user_id, token_hash, expires_at, requested_ip, requested_user_agent)
         VALUES ($1, $2, now() + interval '15 minutes', $3, $4);`,
        [userRow.id, tokenHash, requestedIp || null, requestedUserAgentText || null],
      );

      const exposeToken =
        process.env.AUTH_EXPOSE_RESET_TOKEN === 'true' || process.env.NODE_ENV !== 'production';
      if (exposeToken) {
        return {
          ok: true,
          resetToken: rawToken,
          expiresInSeconds: 15 * 60,
        };
      }
    }

    return { ok: true };
  }

  async resetPasswordWithToken(tokenRaw: string, newPasswordRaw: string) {
    const token = String(tokenRaw || '').trim();
    const newPassword = String(newPasswordRaw || '');
    if (!token) throw new BadRequestException('token is required');
    validatePasswordPolicy(newPassword, 'newPassword');
    await this.ensurePasswordResetTable();

    const tokenHash = this.hashResetToken(token);
    const tokenOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT user_id, expires_at::text, consumed_at::text
         FROM auth_password_reset_tokens
         WHERE token_hash = $1
         LIMIT 1
       ) t;`,
      [tokenHash],
    );
    if (!tokenOut) throw new UnauthorizedException('Invalid or expired reset token');
    const resetToken = this.parseJsonLine<PasswordResetTokenRow>(tokenOut);
    if (resetToken.consumed_at) throw new UnauthorizedException('Reset token already used');
    if (new Date(resetToken.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = this.hashPassword(newPassword);
    await runSql(
      `UPDATE users
       SET password_hash = $1, updated_at = now()
       WHERE id = $2;`,
      [passwordHash, resetToken.user_id],
    );
    await runSql(
      `UPDATE auth_password_reset_tokens
       SET consumed_at = now()
       WHERE token_hash = $1;`,
      [tokenHash],
    );
    await runSql(
      `UPDATE auth_refresh_sessions
       SET revoked_at = now()
       WHERE user_id = $1
         AND revoked_at IS NULL;`,
      [resetToken.user_id],
    );
    return { ok: true };
  }
}
