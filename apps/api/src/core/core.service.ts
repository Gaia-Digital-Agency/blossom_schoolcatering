import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { readFile } from 'fs/promises';
import { createSign, randomUUID, scryptSync } from 'crypto';
import { runSql } from '../auth/db.util';
import { AccessUser, CartItemInput, SessionType } from './core.types';

type DbUserRow = {
  id: string;
  username: string;
  role: string;
  first_name: string;
  last_name: string;
};

type ChildRow = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  school_id: string;
  school_name: string;
  school_grade: string;
  date_of_birth: string;
  gender: string;
  dietary_allergies?: string;
};

type CartRow = {
  id: string;
  child_id: string;
  created_by_user_id: string;
  session: SessionType;
  service_date: string;
  status: 'OPEN' | 'SUBMITTED' | 'EXPIRED';
  expires_at: string;
};

const SESSIONS: SessionType[] = ['LUNCH', 'SNACK', 'BREAKFAST'];

@Injectable()
export class CoreService {
  private menuItemExtendedColumnsReady = false;
  private deliverySchoolAssignmentsReady = false;
  private sessionSettingsReady = false;

  private parseJsonLine<T>(line: string): T {
    if (!line) throw new BadRequestException('No data');
    return JSON.parse(line) as T;
  }

  private parseJsonLines<T>(raw: string): T[] {
    if (!raw) return [];
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }

  private toBase64Url(value: string | Buffer) {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private normalizeGcsFolder(value?: string) {
    return (value || '')
      .trim()
      .replace(/^\/+|\/+$/g, '');
  }

  private getGcsBucket() {
    const bucket = (process.env.GCS_BUCKET || '').trim();
    if (!bucket) throw new BadRequestException('GCS_BUCKET is required for file uploads');
    return bucket;
  }

  private getGcsRootFolder() {
    return this.normalizeGcsFolder(process.env.GCS_FOLDER || '');
  }

  private getGcsCategoryFolder(kind: 'menu-images' | 'receipts' | 'payment-proofs') {
    const root = this.getGcsRootFolder();
    if (kind === 'menu-images') {
      const envFolder = this.normalizeGcsFolder(process.env.GCS_MENU_IMAGES_FOLDER);
      if (envFolder) return envFolder;
    }
    if (kind === 'receipts') {
      const envFolder = this.normalizeGcsFolder(process.env.GCS_RECEIPTS_FOLDER);
      if (envFolder) return envFolder;
    }
    if (kind === 'payment-proofs') {
      const envFolder = this.normalizeGcsFolder(process.env.GCS_PAYMENT_PROOFS_FOLDER);
      if (envFolder) return envFolder;
    }
    return root ? `${root}/${kind}` : kind;
  }

  private buildStoragePublicUrl(objectName: string) {
    const cdnBase = (process.env.CDN_BASE_URL || '').trim().replace(/\/+$/, '');
    const normalizedObject = objectName.replace(/^\/+/, '');
    if (cdnBase) return `${cdnBase}/${normalizedObject}`;
    return `https://storage.googleapis.com/${this.getGcsBucket()}/${normalizedObject}`;
  }

  private async getGoogleServiceAccount() {
    const envEmail = (process.env.GOOGLE_CLIENT_EMAIL || '').trim();
    const envKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
    if (envEmail && envKey) return { clientEmail: envEmail, privateKey: envKey };

    const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
    if (!credPath) {
      throw new BadRequestException(
        'Google credentials missing. Set GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS.',
      );
    }
    const raw = await readFile(credPath, 'utf8');
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    const clientEmail = (parsed.client_email || '').trim();
    const privateKey = (parsed.private_key || '').trim();
    if (!clientEmail || !privateKey) {
      throw new BadRequestException('Invalid GOOGLE_APPLICATION_CREDENTIALS file for service account');
    }
    return { clientEmail, privateKey };
  }

  private async getGoogleAccessToken(scopes: string[]) {
    const { clientEmail, privateKey } = await this.getGoogleServiceAccount();
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const header = this.toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = this.toBase64Url(
      JSON.stringify({
        iss: clientEmail,
        scope: scopes.join(' '),
        aud: 'https://oauth2.googleapis.com/token',
        exp,
        iat,
      }),
    );
    const unsigned = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const signature = signer.sign(privateKey).toString('base64url');
    const assertion = `${unsigned}.${signature}`;

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(`Failed Google token exchange: ${text || res.statusText}`);
    }
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new BadRequestException('Google token response missing access_token');
    return json.access_token;
  }

  private async uploadToGcs(params: {
    objectName: string;
    contentType: string;
    data: Buffer;
    cacheControl?: string;
  }) {
    const bucket = this.getGcsBucket();
    const accessToken = await this.getGoogleAccessToken(['https://www.googleapis.com/auth/devstorage.read_write']);
    const objectName = params.objectName.replace(/^\/+/, '');
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
      bucket,
    )}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': params.contentType,
        'Content-Length': String(params.data.length),
        'Cache-Control': params.cacheControl || 'public, max-age=300',
      },
      body: new Uint8Array(params.data),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(`Failed upload to GCS: ${text || res.statusText}`);
    }
    return { objectName, publicUrl: this.buildStoragePublicUrl(objectName) };
  }

  private parseDataUrl(input: string): { contentType: string; data: Buffer } {
    const match = input.match(/^data:([a-zA-Z0-9/+.-]+);base64,([\s\S]+)$/);
    if (!match) throw new BadRequestException('Invalid data URL payload');
    const contentType = match[1]?.trim() || 'application/octet-stream';
    const b64 = (match[2] || '').trim();
    if (!b64) throw new BadRequestException('Empty data URL payload');
    const data = Buffer.from(b64, 'base64');
    return { contentType, data };
  }

  private getFileExtFromContentType(contentType: string) {
    const normalized = contentType.toLowerCase();
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('pdf')) return 'pdf';
    return 'bin';
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file';
  }

  private async resolveMenuImageUrl(imageUrl: string, menuItemName: string) {
    const trimmed = (imageUrl || '').trim();
    if (!trimmed) throw new BadRequestException('imageUrl is required');
    if (trimmed.startsWith('data:')) {
      const parsed = this.parseDataUrl(trimmed);
      if (!parsed.contentType.startsWith('image/')) {
        throw new BadRequestException('Menu image must be an image');
      }
      if (parsed.contentType.toLowerCase() !== 'image/webp') {
        throw new BadRequestException('Menu image upload must be WebP');
      }
      if (parsed.data.length > 5 * 1024 * 1024) {
        throw new BadRequestException('Menu image exceeds size limit (5MB)');
      }
      const ext = this.getFileExtFromContentType(parsed.contentType);
      const objectName = `${this.getGcsCategoryFolder('menu-images')}/${this.slugify(menuItemName)}-${Date.now()}.${ext}`;
      const uploaded = await this.uploadToGcs({
        objectName,
        contentType: parsed.contentType,
        data: parsed.data,
        cacheControl: 'public, max-age=86400',
      });
      return uploaded.publicUrl;
    }
    if (/^https?:\/\//i.test(trimmed) && !/\.webp(\?|#|$)/i.test(trimmed)) {
      throw new BadRequestException('Menu image URL must be WebP');
    }
    return trimmed;
  }

  private escapePdfText(text: string) {
    return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  private buildSimplePdf(lines: string[]) {
    const safeLines = lines.map((line) => this.escapePdfText(line.slice(0, 180)));
    const streamText = [
      'BT',
      '/F1 12 Tf',
      '50 792 Td',
      ...safeLines.map((line, idx) => (idx === 0 ? `(${line}) Tj` : `0 -16 Td (${line}) Tj`)),
      'ET',
    ].join('\n');
    const streamLen = Buffer.byteLength(streamText, 'utf8');

    const objects = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
      '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      `5 0 obj << /Length ${streamLen} >> stream\n${streamText}\nendstream endobj`,
    ];

    const chunks: string[] = ['%PDF-1.4\n'];
    const offsets: number[] = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(chunks.join(''), 'utf8'));
      chunks.push(`${obj}\n`);
    }
    const xrefOffset = Buffer.byteLength(chunks.join(''), 'utf8');
    chunks.push(`xref\n0 ${objects.length + 1}\n`);
    chunks.push('0000000000 65535 f \n');
    for (let i = 1; i <= objects.length; i += 1) {
      chunks.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }
    chunks.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`);
    chunks.push(`startxref\n${xrefOffset}\n%%EOF`);
    return Buffer.from(chunks.join(''), 'utf8');
  }

  private normalizeSession(session?: string): SessionType {
    const normalized = (session || '').toUpperCase();
    if (!SESSIONS.includes(normalized as SessionType)) {
      throw new BadRequestException('Invalid session');
    }
    return normalized as SessionType;
  }

  private validateServiceDate(serviceDate?: string) {
    if (!serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      throw new BadRequestException('service_date must be YYYY-MM-DD');
    }
    return serviceDate;
  }

  private isAfterOrAtMakassarCutoff(serviceDate: string) {
    const cutoffUtc = new Date(`${serviceDate}T00:00:00.000Z`).getTime();
    return Date.now() >= cutoffUtc;
  }

  private hashPassword(raw: string) {
    const salt = randomUUID().replace(/-/g, '');
    const derived = scryptSync(raw, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
  }

  private sanitizeUsernamePart(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'user';
  }

  private async getParentIdByUserId(userId: string) {
    const out = await runSql(
      `SELECT id
       FROM parents
       WHERE user_id = $1
         AND deleted_at IS NULL
       LIMIT 1;`,
      [userId],
    );
    return out || null;
  }

  private async syncParentChildrenByLastName(parentId: string) {
    const normalizedLastName = await runSql(
      `SELECT trim(lower(u.last_name))
       FROM parents p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1
         AND p.deleted_at IS NULL
         AND u.deleted_at IS NULL
       LIMIT 1;`,
      [parentId],
    );
    if (!normalizedLastName) return 0;

    const linkedCount = Number(await runSql(
      `WITH target_children AS (
         SELECT c.id
         FROM children c
         JOIN users u ON u.id = c.user_id
         WHERE c.deleted_at IS NULL
           AND c.is_active = true
           AND u.deleted_at IS NULL
           AND u.is_active = true
           AND trim(lower(u.last_name)) = $1
       ),
       inserted AS (
         INSERT INTO parent_children (parent_id, child_id)
         SELECT $2, tc.id
         FROM target_children tc
         ON CONFLICT (parent_id, child_id) DO NOTHING
         RETURNING 1
       )
       SELECT count(*)::int FROM inserted;`,
      [normalizedLastName, parentId],
    ) || 0);
    return linkedCount;
  }

  private async getChildIdByUserId(userId: string) {
    const out = await runSql(
      `SELECT id
       FROM children
       WHERE user_id = $1
         AND is_active = true
         AND deleted_at IS NULL
       LIMIT 1;`,
      [userId],
    );
    return out || null;
  }

  private async ensureParentOwnsChild(parentId: string, childId: string) {
    const allowed = await runSql(
      `SELECT EXISTS (
         SELECT 1
         FROM parent_children
         WHERE parent_id = $1
           AND child_id = $2
       );`,
      [parentId, childId],
    );
    if (allowed !== 't') {
      throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    }
  }

  private assertValidUuid(value: string | undefined, label: string) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!value || !UUID_RE.test(value)) {
      throw new BadRequestException(`Invalid ${label}: must be a valid UUID`);
    }
  }

  private async ensureCartIsOpenAndOwned(cartId: string, actor: AccessUser): Promise<CartRow> {
    this.assertValidUuid(cartId, 'cartId');
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, child_id, created_by_user_id, session::text AS session, service_date::text AS service_date,
                status::text AS status, expires_at::text AS expires_at
         FROM order_carts
         WHERE id = $1
         LIMIT 1
       ) t;`,
      [cartId],
    );
    if (!out) throw new NotFoundException('Cart not found');
    const cart = this.parseJsonLine<CartRow>(out);

    if (actor.role === 'YOUNGSTER') {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId || childId !== cart.child_id) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, cart.child_id);
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    if (cart.status !== 'OPEN') {
      throw new BadRequestException(cart.status === 'EXPIRED' ? 'CART_EXPIRED' : 'CART_ALREADY_SUBMITTED');
    }
    if (new Date(cart.expires_at).getTime() <= Date.now()) {
      await runSql(
        `UPDATE order_carts
         SET status = 'EXPIRED', updated_at = now()
         WHERE id = $1
           AND status = 'OPEN';`,
        [cart.id],
      );
      throw new BadRequestException('CART_EXPIRED');
    }
    return cart;
  }

  private async validateOrderDayRules(serviceDate: string) {
    const weekday = await runSql(`SELECT extract(isodow FROM $1::date)::int;`, [serviceDate]);
    if (!weekday || Number(weekday) > 5) {
      throw new BadRequestException('ORDER_WEEKEND_SERVICE_BLOCKED');
    }

    const blocked = await runSql(
      `SELECT EXISTS (
         SELECT 1
         FROM blackout_days
         WHERE blackout_date = $1::date
           AND type IN ('ORDER_BLOCK', 'BOTH')
       );`,
      [serviceDate],
    );
    if (blocked === 't') {
      throw new BadRequestException('ORDER_BLACKOUT_BLOCKED');
    }
  }

  private async ensureMenuItemExtendedColumns() {
    if (this.menuItemExtendedColumnsReady) return;
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS cutlery_required boolean NOT NULL DEFAULT false;
    `);
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS packing_requirement text;
    `);
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS calories_kcal integer;
    `);
    this.menuItemExtendedColumnsReady = true;
  }

  private async ensureDeliverySchoolAssignmentsTable() {
    if (this.deliverySchoolAssignmentsReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS delivery_school_assignments (
        delivery_user_id uuid NOT NULL REFERENCES users(id),
        school_id uuid NOT NULL REFERENCES schools(id),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (delivery_user_id, school_id)
      );
    `);
    await runSql(`
      CREATE INDEX IF NOT EXISTS idx_delivery_school_assignments_school
      ON delivery_school_assignments(school_id, is_active);
    `);
    this.deliverySchoolAssignmentsReady = true;
  }

  private async ensureSessionSettingsTable() {
    if (this.sessionSettingsReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS session_settings (
        session session_type PRIMARY KEY,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    for (const session of SESSIONS) {
      await runSql(
        `INSERT INTO session_settings (session, is_active)
         VALUES ($1::session_type, true)
         ON CONFLICT (session) DO NOTHING;`,
        [session],
      );
    }
    this.sessionSettingsReady = true;
  }

  private async isSessionActive(session: SessionType) {
    await this.ensureSessionSettingsTable();
    const out = await runSql(
      `SELECT is_active::text
       FROM session_settings
       WHERE session = $1::session_type
       LIMIT 1;`,
      [session],
    );
    if (!out) return true;
    return out === 'true' || out === 't';
  }

  private async assertSessionActiveForOrdering(session: SessionType) {
    const active = await this.isSessionActive(session);
    if (!active) throw new BadRequestException('ORDER_SESSION_DISABLED');
  }

  private sanitizePackingRequirement(value?: string) {
    return (value || '').trim().slice(0, 200);
  }

  private normalizeAllergies(allergiesRaw?: string) {
    const cleaned = (allergiesRaw || '').trim().replace(/\s+/g, ' ');
    const fallback = 'No Allergies';
    if (!cleaned) return fallback;
    const words = cleaned.split(' ').filter(Boolean);
    if (words.length >= 10) {
      throw new BadRequestException('Allergies must be less than 10 words');
    }
    return cleaned;
  }

  private async ensureMenuForDateSession(serviceDate: string, session: SessionType) {
    const existing = await runSql(
      `SELECT id
       FROM menus
       WHERE service_date = $1::date
         AND session = $2::session_type
       LIMIT 1;`,
      [serviceDate, session],
    );
    if (existing) return existing;

    return runSql(
      `INSERT INTO menus (session, service_date, is_published)
       VALUES ($1::session_type, $2::date, true)
       RETURNING id;`,
      [session, serviceDate],
    );
  }

  async getSchools(active = true) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, name, city, address, is_active
        FROM schools
        WHERE deleted_at IS NULL
          AND is_active = ${active ? 'true' : 'false'}
        ORDER BY name ASC
      ) t;
    `);
    return this.parseJsonLines<{ id: string; name: string; city: string | null; address: string | null; is_active: boolean }>(out);
  }

  async updateSchoolActive(actor: AccessUser, schoolId: string, isActive?: boolean) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const id = (schoolId || '').trim();
    if (!id) throw new BadRequestException('schoolId is required');
    if (typeof isActive !== 'boolean') throw new BadRequestException('isActive must be boolean');

    const out = await runSql(
      `WITH updated AS (
         UPDATE schools
         SET is_active = $1,
             updated_at = now()
         WHERE id = $2
           AND deleted_at IS NULL
         RETURNING id, name, city, address, is_active
       )
       SELECT row_to_json(updated)::text
       FROM updated;`,
      [isActive, id],
    );
    if (!out) throw new NotFoundException('School not found');
    return this.parseJsonLine(out);
  }

  async getSessionSettings() {
    await this.ensureSessionSettingsTable();
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT session::text AS session, is_active
        FROM session_settings
        ORDER BY session ASC
      ) t;
    `);
    return this.parseJsonLines<{ session: SessionType; is_active: boolean }>(out);
  }

  async updateSessionSetting(actor: AccessUser, sessionRaw: string, isActive?: boolean) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    if (typeof isActive !== 'boolean') throw new BadRequestException('isActive must be boolean');
    const session = this.normalizeSession(sessionRaw);
    if (session === 'LUNCH' && !isActive) {
      throw new BadRequestException('LUNCH session must remain active');
    }
    await this.ensureSessionSettingsTable();
    const out = await runSql(
      `WITH updated AS (
         UPDATE session_settings
         SET is_active = $1,
             updated_at = now()
         WHERE session = $2::session_type
         RETURNING session::text AS session, is_active
       )
       SELECT row_to_json(updated)::text
       FROM updated;`,
      [isActive, session],
    );
    if (!out) throw new NotFoundException('Session setting not found');
    return this.parseJsonLine<{ session: SessionType; is_active: boolean }>(out);
  }

  async registerYoungster(
    actor: AccessUser,
    input: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      email?: string;
      dateOfBirth?: string;
      gender?: string;
      schoolId?: string;
      schoolGrade?: string;
      parentId?: string;
      allergies?: string;
    },
  ) {
    if (!['PARENT', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }

    const firstName = (input.firstName || '').trim();
    const lastName = (input.lastName || '').trim();
    const phoneNumber = (input.phoneNumber || '').trim();
    const email = (input.email || '').trim().toLowerCase();
    const dateOfBirth = (input.dateOfBirth || '').trim();
    const gender = (input.gender || '').trim().toUpperCase();
    const schoolId = (input.schoolId || '').trim();
    const schoolGrade = (input.schoolGrade || '').trim();
    const allergies = this.normalizeAllergies(input.allergies);

    if (!firstName || !lastName || !phoneNumber || !dateOfBirth || !schoolId || !schoolGrade) {
      throw new BadRequestException('Missing required youngster fields');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      throw new BadRequestException('dateOfBirth must be YYYY-MM-DD');
    }
    if (!['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'].includes(gender)) {
      throw new BadRequestException('Invalid gender');
    }

    const schoolExists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM schools
         WHERE id = $1
           AND is_active = true
           AND deleted_at IS NULL
       );`,
      [schoolId],
    );
    if (schoolExists !== 't') {
      throw new BadRequestException('School not found or inactive');
    }

    let parentId: string | null = null;
    if (actor.role === 'PARENT') {
      parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
    } else if (input.parentId) {
      const exists = await runSql(
        `SELECT EXISTS (
           SELECT 1
           FROM parents
           WHERE id = $1
             AND deleted_at IS NULL
         );`,
        [input.parentId],
      );
      if (exists !== 't') throw new BadRequestException('Invalid parentId');
      parentId = input.parentId;
    }

    const usernameBase = this.sanitizeUsernamePart(`${lastName}_${firstName}`);
    const username = await runSql(`SELECT generate_unique_username($1);`, [usernameBase]);
    const passwordSeed = phoneNumber.replace(/\D/g, '') || randomUUID().slice(0, 10);
    const passwordHash = this.hashPassword(passwordSeed);

    const createdOut = await runSql(
      `WITH inserted AS (
         INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
         VALUES ('CHILD', $1, $2, $3, $4, $5, $6)
         RETURNING id, username, role::text, first_name, last_name
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [username, passwordHash, firstName, lastName, phoneNumber, email || null],
    );
    const created = this.parseJsonLine<DbUserRow>(createdOut);

    await runSql(
      `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
       VALUES ($1, false, false, true)
       ON CONFLICT (user_id) DO NOTHING;`,
      [created.id],
    );

    const childOut = await runSql(
      `WITH inserted AS (
         INSERT INTO children (user_id, school_id, date_of_birth, gender, school_grade, photo_url)
         VALUES ($1, $2, $3::date, $4::gender_type, $5, NULL)
         RETURNING id, user_id
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [created.id, schoolId, dateOfBirth, gender, schoolGrade],
    );
    const child = this.parseJsonLine<{ id: string; user_id: string }>(childOut);

    await runSql(
      `INSERT INTO child_dietary_restrictions (child_id, restriction_label, restriction_details, is_active)
       VALUES ($1, 'ALLERGIES', $2, true)
       ON CONFLICT DO NOTHING;`,
      [child.id, allergies],
    );

    if (parentId) {
      await runSql(
        `INSERT INTO parent_children (parent_id, child_id)
         VALUES ($1, $2)
         ON CONFLICT (parent_id, child_id) DO NOTHING;`,
        [parentId, child.id],
      );
    }

    return {
      childId: child.id,
      userId: created.id,
      username: created.username,
      generatedPassword: passwordSeed,
      linkedParentId: parentId,
    };
  }

  async getAdminParents() {
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT p.id,
               p.user_id,
               u.username,
               u.first_name,
               u.last_name,
               u.email,
               count(DISTINCT pc.child_id)::int AS linked_children_count,
               COALESCE(
                 json_agg(
                   DISTINCT jsonb_build_object(
                     'id', c.id,
                     'name', (uc.first_name || ' ' || uc.last_name),
                     'school_name', s.name
                   )
                 ) FILTER (WHERE c.id IS NOT NULL),
                 '[]'::json
               ) AS youngsters,
               COALESCE(
                 array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL),
                 '{}'::text[]
               ) AS schools
        FROM parents p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN parent_children pc ON pc.parent_id = p.id
        LEFT JOIN children c ON c.id = pc.child_id AND c.deleted_at IS NULL
        LEFT JOIN users uc ON uc.id = c.user_id
        LEFT JOIN schools s ON s.id = c.school_id
        WHERE p.deleted_at IS NULL
          AND u.is_active = true
        GROUP BY p.id, p.user_id, u.username, u.first_name, u.last_name, u.email
        ORDER BY u.first_name, u.last_name
      ) t;
    `);
    return this.parseJsonLines(out);
  }

  async getAdminChildren() {
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id,
               c.user_id,
               u.username,
               u.first_name,
               u.last_name,
               u.phone_number,
               u.email,
               c.date_of_birth::text AS date_of_birth,
               c.gender::text AS gender,
               c.school_id,
               c.school_grade,
               s.name AS school_name,
               COALESCE((
                 SELECT cdr.restriction_details
                 FROM child_dietary_restrictions cdr
                 WHERE cdr.child_id = c.id
                   AND cdr.is_active = true
                   AND cdr.deleted_at IS NULL
                   AND upper(cdr.restriction_label) = 'ALLERGIES'
                 ORDER BY cdr.updated_at DESC NULLS LAST, cdr.created_at DESC
                 LIMIT 1
               ), '') AS dietary_allergies,
               coalesce(array_agg(pc.parent_id) FILTER (WHERE pc.parent_id IS NOT NULL), '{}') AS parent_ids
        FROM children c
        JOIN users u ON u.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN parent_children pc ON pc.child_id = c.id
        WHERE c.is_active = true
          AND c.deleted_at IS NULL
          AND u.is_active = true
        GROUP BY c.id, c.user_id, u.username, u.first_name, u.last_name, u.phone_number, u.email, c.date_of_birth, c.gender, c.school_id, c.school_grade, s.name
        ORDER BY u.first_name, u.last_name
      ) t;
    `);
    return this.parseJsonLines(out);
  }

  async getAdminDashboard(dateRaw?: string) {
    const date = dateRaw ? this.validateServiceDate(dateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const yesterday = await runSql(`SELECT ($1::date - INTERVAL '1 day')::date::text;`, [date]);
    const tomorrow = await runSql(`SELECT ($1::date + INTERVAL '1 day')::date::text;`, [date]);
    const pastWeekStart = await runSql(`SELECT ($1::date - INTERVAL '6 day')::date::text;`, [date]);
    const pastMonthStart = await runSql(`SELECT ($1::date - INTERVAL '29 day')::date::text;`, [date]);

    const parentsCount = Number(await runSql(`
      SELECT count(*)::int
      FROM parents p
      JOIN users u ON u.id = p.user_id
      WHERE p.deleted_at IS NULL
        AND u.is_active = true;
    `) || 0);

    const youngstersCount = Number(await runSql(`
      SELECT count(*)::int
      FROM children c
      JOIN users u ON u.id = c.user_id
      WHERE c.is_active = true
        AND c.deleted_at IS NULL
        AND u.is_active = true;
    `) || 0);

    const schoolsCount = Number(await runSql(`
      SELECT count(*)::int
      FROM schools
      WHERE is_active = true
        AND deleted_at IS NULL;
    `) || 0);

    const deliveryPersonnelCount = Number(await runSql(`
      SELECT count(*)::int
      FROM users
      WHERE role = 'DELIVERY'
        AND is_active = true
        AND deleted_at IS NULL;
    `) || 0);

    const getOrdersAndDishes = async (from: string, to: string) => {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(DISTINCT o.id)::int AS total_orders,
                 COALESCE(SUM(oi.quantity), 0)::int AS total_dishes
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.service_date BETWEEN $1::date AND $2::date
            AND o.deleted_at IS NULL
            AND o.status <> 'CANCELLED'
        ) t;
      `,
        [from, to],
      );
      const row = this.parseJsonLine<{ total_orders: number; total_dishes: number }>(out || '{"total_orders":0,"total_dishes":0}');
      return { totalOrders: Number(row.total_orders || 0), totalDishes: Number(row.total_dishes || 0) };
    };

    const todayDelivery = await getOrdersAndDishes(date, date);
    const yesterdayDelivery = await getOrdersAndDishes(yesterday, yesterday);
    const tomorrowDelivery = await getOrdersAndDishes(tomorrow, tomorrow);
    const pastWeekDelivery = await getOrdersAndDishes(pastWeekStart, date);
    const pastMonthDelivery = await getOrdersAndDishes(pastMonthStart, date);

    const todayOrdersCount = todayDelivery.totalOrders;
    const todayTotalDishes = todayDelivery.totalDishes;

    const totalSales = Number(await runSql(`
      SELECT coalesce(sum(total_price), 0)::numeric
      FROM orders
      WHERE deleted_at IS NULL
        AND status <> 'CANCELLED';
    `) || 0);

    const yesterdayFailedOrUncheckedDelivery = Number(await runSql(
      `SELECT count(*)::int
       FROM orders
       WHERE service_date = $1::date
         AND deleted_at IS NULL
         AND status <> 'CANCELLED'
         AND delivery_status <> 'DELIVERED';`,
      [yesterday],
    ) || 0);

    const failedDeliveryByPersonOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT COALESCE(da.delivery_user_id::text, 'UNASSIGNED') AS delivery_user_id,
               COALESCE((u.first_name || ' ' || u.last_name), 'Unassigned') AS delivery_person_name,
               COUNT(DISTINCT o.id)::int AS orders_count
        FROM orders o
        LEFT JOIN delivery_assignments da ON da.order_id = o.id
        LEFT JOIN users u ON u.id = da.delivery_user_id
        WHERE o.service_date = $1::date
          AND o.deleted_at IS NULL
          AND o.status <> 'CANCELLED'
          AND (
            o.delivery_status <> 'DELIVERED'
            OR da.confirmed_at IS NULL
          )
        GROUP BY da.delivery_user_id, u.first_name, u.last_name
        ORDER BY orders_count DESC, delivery_person_name ASC
      ) t;
    `,
      [yesterday],
    );
    const failedDeliveryByPerson = this.parseJsonLines<{
      delivery_user_id: string;
      delivery_person_name: string;
      orders_count: number;
    }>(failedDeliveryByPersonOut);

    const menuTotalsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT COUNT(*)::int AS dishes_total_created,
               COUNT(*) FILTER (WHERE is_available = true)::int AS dishes_total_active
        FROM menu_items
        WHERE deleted_at IS NULL
      ) t;
    `,
    );
    const menuTotals = this.parseJsonLine<{ dishes_total_created: number; dishes_total_active: number }>(
      menuTotalsOut || '{"dishes_total_created":0,"dishes_total_active":0}',
    );

    const nextBlackoutDayOut = await runSql(
      `
      SELECT blackout_date::text
      FROM blackout_days
      WHERE blackout_date >= $1::date
      ORDER BY blackout_date ASC
      LIMIT 1;
    `,
      [date],
    );
    const nextBlackoutDay = (nextBlackoutDayOut || '').trim() || null;

    const getKitchenUnfulfilled = async (from: string, to: string) => {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(DISTINCT o.id)::int AS orders_not_fulfilled,
                 COALESCE(SUM(oi.quantity), 0)::int AS dishes_not_fulfilled
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.service_date BETWEEN $1::date AND $2::date
            AND o.deleted_at IS NULL
            AND o.status = 'PLACED'
        ) t;
      `,
        [from, to],
      );
      const row = this.parseJsonLine<{ orders_not_fulfilled: number; dishes_not_fulfilled: number }>(
        out || '{"orders_not_fulfilled":0,"dishes_not_fulfilled":0}',
      );
      return {
        ordersNotFulfilled: Number(row.orders_not_fulfilled || 0),
        dishesNotFulfilled: Number(row.dishes_not_fulfilled || 0),
      };
    };
    const kitchenYesterday = await getKitchenUnfulfilled(yesterday, yesterday);
    const kitchenPastWeek = await getKitchenUnfulfilled(pastWeekStart, date);

    const getBillingPeriodMetrics = async (from: string, to: string) => {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(br.id)::int AS total_number_billing,
                 COALESCE(SUM(o.total_price), 0)::numeric AS total_value_billing,
                 COUNT(br.id) FILTER (
                   WHERE br.status = 'UNPAID'
                     AND COALESCE(NULLIF(TRIM(br.proof_image_url), ''), '') = ''
                 )::int AS total_number_unpaid_no_proof,
                 COALESCE(SUM(o.total_price) FILTER (
                   WHERE br.status = 'UNPAID'
                     AND COALESCE(NULLIF(TRIM(br.proof_image_url), ''), '') = ''
                 ), 0)::numeric AS total_value_unpaid_no_proof
          FROM billing_records br
          JOIN orders o ON o.id = br.order_id
          WHERE o.service_date BETWEEN $1::date AND $2::date
            AND o.deleted_at IS NULL
            AND o.status <> 'CANCELLED'
        ) t;
      `,
        [from, to],
      );
      const row = this.parseJsonLine<{
        total_number_billing: number;
        total_value_billing: string | number;
        total_number_unpaid_no_proof: number;
        total_value_unpaid_no_proof: string | number;
      }>(
        out ||
          '{"total_number_billing":0,"total_value_billing":0,"total_number_unpaid_no_proof":0,"total_value_unpaid_no_proof":0}',
      );
      return {
        totalNumberBilling: Number(row.total_number_billing || 0),
        totalValueBilling: Number(row.total_value_billing || 0),
        totalNumberUnpaidNoProof: Number(row.total_number_unpaid_no_proof || 0),
        totalValueUnpaidNoProof: Number(row.total_value_unpaid_no_proof || 0),
      };
    };
    const billingYesterday = await getBillingPeriodMetrics(yesterday, yesterday);
    const billingPastWeek = await getBillingPeriodMetrics(pastWeekStart, date);
    const billingPastMonth = await getBillingPeriodMetrics(pastMonthStart, date);

    const pendingBillingCount = Number(await runSql(`
      SELECT count(*)::int
      FROM billing_records
      WHERE status IN ('UNPAID', 'PENDING_VERIFICATION');
    `) || 0);

    const birthdaysOut = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id AS child_id,
               (u.first_name || ' ' || u.last_name) AS child_name,
               c.date_of_birth::text AS date_of_birth
        FROM children c
        JOIN users u ON u.id = c.user_id
        WHERE c.is_active = true
          AND c.deleted_at IS NULL
      ) t;
    `);
    const today = new Date(date);
    const birthdayToday = this.parseJsonLines<{ child_id: string; child_name: string; date_of_birth: string }>(birthdaysOut)
      .map((row) => {
        const dob = new Date(row.date_of_birth);
        const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        return { ...row, days_until: daysUntil };
      })
      .filter((row) => row.days_until === 0)
      .sort((a, b) => a.days_until - b.days_until)
      .slice(0, 30);

    return {
      date,
      parentsCount,
      youngstersCount,
      schoolsCount,
      deliveryPersonnelCount,
      todayOrdersCount,
      todayTotalDishes,
      totalSales,
      yesterdayFailedOrUncheckedDelivery,
      failedDeliveryByPerson,
      menu: {
        dishesTotalCreated: Number(menuTotals.dishes_total_created || 0),
        dishesTotalActive: Number(menuTotals.dishes_total_active || 0),
      },
      delivery: {
        today: todayDelivery,
        yesterday: yesterdayDelivery,
        tomorrow: tomorrowDelivery,
        pastWeek: pastWeekDelivery,
        pastMonth: pastMonthDelivery,
      },
      kitchen: {
        nextBlackoutDay,
        yesterday: kitchenYesterday,
        pastWeek: kitchenPastWeek,
      },
      billing: {
        yesterday: billingYesterday,
        pastWeek: billingPastWeek,
        pastMonth: billingPastMonth,
      },
      pendingBillingCount,
      birthdayHighlights: birthdayToday,
    };
  }

  async getBlackoutDays(query: { fromDate?: string; toDate?: string }) {
    const params: string[] = [];
    const conditions: string[] = [];
    if (query.fromDate) {
      params.push(this.validateServiceDate(query.fromDate));
      conditions.push(`b.blackout_date >= $${params.length}::date`);
    }
    if (query.toDate) {
      params.push(this.validateServiceDate(query.toDate));
      conditions.push(`b.blackout_date <= $${params.length}::date`);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT b.id,
               b.blackout_date::text AS blackout_date,
               b.type::text AS type,
               b.reason,
               b.created_at::text AS created_at,
               u.username AS created_by_username
        FROM blackout_days b
        JOIN users u ON u.id = b.created_by
        ${whereSql}
        ORDER BY b.blackout_date DESC, b.created_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines(out);
  }

  async createBlackoutDay(actor: AccessUser, input: { blackoutDate?: string; type?: string; reason?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const blackoutDate = this.validateServiceDate(input.blackoutDate);
    const type = (input.type || '').toUpperCase();
    const reason = (input.reason || '').trim().slice(0, 500);
    if (!['ORDER_BLOCK', 'SERVICE_BLOCK', 'BOTH'].includes(type)) {
      throw new BadRequestException('Invalid blackout type');
    }

    const out = await runSql(
      `WITH upserted AS (
         INSERT INTO blackout_days (blackout_date, type, reason, created_by)
         VALUES ($1::date, $2::blackout_type, $3, $4)
         ON CONFLICT (blackout_date)
         DO UPDATE SET type = EXCLUDED.type, reason = EXCLUDED.reason, updated_at = now()
         RETURNING id, blackout_date::text AS blackout_date, type::text AS type, reason
       )
       SELECT row_to_json(upserted)::text
       FROM upserted;`,
      [blackoutDate, type, reason || null, actor.uid],
    );
    return this.parseJsonLine(out);
  }

  async deleteBlackoutDay(actor: AccessUser, id: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const out = await runSql(
      `DELETE FROM blackout_days
       WHERE id = $1
       RETURNING id;`,
      [id],
    );
    if (!out) throw new NotFoundException('Blackout day not found');
    return { ok: true };
  }

  async getParentChildrenPages(actor: AccessUser) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    await this.syncParentChildrenByLastName(parentId);

    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id, c.user_id, u.first_name, u.last_name, c.school_id, s.name AS school_name,
               c.school_grade, c.date_of_birth::text AS date_of_birth, c.gender::text AS gender,
               COALESCE((
                 SELECT cdr.restriction_details
                 FROM child_dietary_restrictions cdr
                 WHERE cdr.child_id = c.id
                   AND cdr.is_active = true
                   AND cdr.deleted_at IS NULL
                   AND upper(cdr.restriction_label) = 'ALLERGIES'
                 ORDER BY cdr.updated_at DESC NULLS LAST, cdr.created_at DESC
                 LIMIT 1
               ), 'No Allergies') AS dietary_allergies
        FROM parent_children pc
        JOIN children c ON c.id = pc.child_id
        JOIN users u ON u.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        WHERE pc.parent_id = $1
          AND c.is_active = true
          AND c.deleted_at IS NULL
        ORDER BY u.first_name, u.last_name
      ) t;
    `,
      [parentId],
    );

    return {
      parentId,
      children: this.parseJsonLines<ChildRow>(out),
    };
  }

  async linkParentChild(actor: AccessUser, parentId: string, childId: string) {
    if (!['PARENT', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    if (actor.role === 'PARENT') {
      const myParentId = await this.getParentIdByUserId(actor.uid);
      if (!myParentId || myParentId !== parentId) {
        throw new ForbiddenException('Cannot link youngster to another parent account');
      }
    }

    const parentExists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM parents
         WHERE id = $1
           AND deleted_at IS NULL
       );`,
      [parentId],
    );
    if (parentExists !== 't') throw new NotFoundException('Parent not found');

    const childExists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM children
         WHERE id = $1
           AND is_active = true
           AND deleted_at IS NULL
       );`,
      [childId],
    );
    if (childExists !== 't') throw new NotFoundException('Youngster not found');

    await runSql(
      `INSERT INTO parent_children (parent_id, child_id)
       VALUES ($1, $2)
       ON CONFLICT (parent_id, child_id) DO NOTHING;`,
      [parentId, childId],
    );

    return { ok: true };
  }

  async getMenus(actor: AccessUser, query: {
    serviceDate?: string;
    session?: string;
    search?: string;
    priceMin?: string;
    priceMax?: string;
    allergenExclude?: string;
    favouritesOnly?: string;
  }) {
    await this.ensureMenuItemExtendedColumns();
    if (!['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    const serviceDate = this.validateServiceDate(query.serviceDate);
    const session = query.session ? this.normalizeSession(query.session) : null;
    const search = (query.search || '').trim().toLowerCase();
    const priceMin = query.priceMin ? Number(query.priceMin) : null;
    const priceMax = query.priceMax ? Number(query.priceMax) : null;
    const favouritesOnly = String(query.favouritesOnly || '').toLowerCase() === 'true';
    const allergenExcludeIds = (query.allergenExclude || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    const filters: string[] = [];
    const params: unknown[] = [serviceDate];
    if (['PARENT', 'YOUNGSTER'].includes(actor.role)) {
      await this.ensureSessionSettingsTable();
      if (session) {
        const active = await this.isSessionActive(session);
        if (!active) {
          return { serviceDate, session, items: [] };
        }
      } else {
        filters.push(`EXISTS (
          SELECT 1
          FROM session_settings ss
          WHERE ss.session = m.session
            AND ss.is_active = true
        )`);
      }
    }
    if (session) {
      params.push(session);
      filters.push(`m.session = $${params.length}::session_type`);
    }
    if (search) {
      params.push(`%${search}%`, `%${search}%`);
      filters.push(`(lower(mi.name) LIKE $${params.length - 1} OR lower(mi.description) LIKE $${params.length})`);
    }
    if (priceMin !== null && Number.isFinite(priceMin)) {
      params.push(Number(priceMin.toFixed(2)));
      filters.push(`mi.price >= $${params.length}`);
    }
    if (priceMax !== null && Number.isFinite(priceMax)) {
      params.push(Number(priceMax.toFixed(2)));
      filters.push(`mi.price <= $${params.length}`);
    }
    if (favouritesOnly) {
      params.push(actor.uid);
      filters.push(`EXISTS (
        SELECT 1
        FROM favourite_meal_items fmi
        JOIN favourite_meals fm ON fm.id = fmi.favourite_meal_id
        WHERE fmi.menu_item_id = mi.id
          AND fm.created_by_user_id = $${params.length}
          AND fm.is_active = true
          AND fm.deleted_at IS NULL
      )`);
    }
    if (allergenExcludeIds.length > 0) {
      const ph = allergenExcludeIds.map(() => {
        params.push('');
        return `$${params.length}`;
      });
      for (let i = 0; i < allergenExcludeIds.length; i += 1) params[params.length - allergenExcludeIds.length + i] = allergenExcludeIds[i];
      filters.push(`NOT EXISTS (
        SELECT 1
        FROM menu_item_ingredients mii2
        WHERE mii2.menu_item_id = mi.id
          AND mii2.ingredient_id IN (${ph.join(', ')})
      )`);
    }
    const filterSql = filters.length ? `AND ${filters.join('\n          AND ')}` : '';

    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               m.session::text AS session,
               mi.name,
               mi.description,
               mi.nutrition_facts_text,
               mi.calories_kcal,
               mi.price,
               mi.image_url,
               mi.cutlery_required,
               mi.packing_requirement,
               mi.display_order,
               COALESCE(array_agg(DISTINCT i.name) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredients,
               COALESCE(bool_or(i.allergen_flag), false) AS has_allergen
        FROM menus m
        JOIN menu_items mi ON mi.menu_id = m.id
        LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
        LEFT JOIN ingredients i ON i.id = mii.ingredient_id AND i.deleted_at IS NULL
        WHERE m.service_date = $1::date
          AND m.is_published = true
          AND m.deleted_at IS NULL
          AND mi.is_available = true
          AND mi.deleted_at IS NULL
          ${filterSql}
        GROUP BY mi.id, m.session
        ORDER BY m.session ASC, mi.display_order ASC, mi.name ASC
      ) t;
    `,
      params,
    );

    return {
      serviceDate,
      session: session || 'ALL',
      items: this.parseJsonLines(out),
    };
  }

  async getAdminIngredients() {
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, name, allergen_flag, is_active
        FROM ingredients
        WHERE deleted_at IS NULL
        ORDER BY name ASC
      ) t;
    `);
    return this.parseJsonLines(out);
  }

  async getAdminMenus(query: { serviceDate?: string; session?: string }) {
    await this.ensureMenuItemExtendedColumns();
    const serviceDate = this.validateServiceDate(query.serviceDate);
    const session = this.normalizeSession(query.session);
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               mi.menu_id,
               mi.name,
               mi.description,
               mi.nutrition_facts_text,
               mi.calories_kcal,
               mi.price,
               mi.image_url,
               mi.is_available,
               mi.cutlery_required,
               mi.packing_requirement,
               mi.display_order,
               COALESCE(array_agg(DISTINCT i.id::text) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredient_ids,
               COALESCE(array_agg(DISTINCT i.name) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredients
        FROM menus m
        JOIN menu_items mi ON mi.menu_id = m.id
        LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
        LEFT JOIN ingredients i ON i.id = mii.ingredient_id AND i.deleted_at IS NULL
        WHERE m.service_date = $1::date
          AND m.session = $2::session_type
          AND m.deleted_at IS NULL
          AND mi.deleted_at IS NULL
        GROUP BY mi.id
        ORDER BY mi.display_order ASC, mi.name ASC
      ) t;
    `,
      [serviceDate, session],
    );
    return {
      serviceDate,
      session,
      items: this.parseJsonLines(out),
    };
  }

  async createAdminMenuItem(input: {
    serviceDate?: string;
    session?: string;
    name?: string;
    description?: string;
    nutritionFactsText?: string;
    caloriesKcal?: number;
    price?: number;
    imageUrl?: string;
    ingredientIds?: string[];
    isAvailable?: boolean;
    displayOrder?: number;
    cutleryRequired?: boolean;
    packingRequirement?: string;
  }) {
    await this.ensureMenuItemExtendedColumns();
    const serviceDate = this.validateServiceDate(input.serviceDate);
    const session = this.normalizeSession(input.session);
    const name = (input.name || '').trim();
    const description = (input.description || '').trim();
    const nutritionFactsText = (input.nutritionFactsText || '').trim();
    const caloriesKcal = input.caloriesKcal === undefined || input.caloriesKcal === null ? null : Number(input.caloriesKcal);
    const price = Number(input.price || 0);
    const rawImageUrl = (input.imageUrl || '').trim();
    const ingredientIds = Array.isArray(input.ingredientIds) ? input.ingredientIds.filter(Boolean) : [];
    const isAvailable = input.isAvailable !== false;
    const displayOrder = Number.isInteger(input.displayOrder) ? Number(input.displayOrder) : 0;
    const cutleryRequired = Boolean(input.cutleryRequired);
    const packingRequirement = this.sanitizePackingRequirement(input.packingRequirement);

    if (!name || !description || !nutritionFactsText || !rawImageUrl) {
      throw new BadRequestException('Missing required menu item fields');
    }
    if (price < 0) {
      throw new BadRequestException('Invalid price');
    }
    if (caloriesKcal !== null && (!Number.isInteger(caloriesKcal) || caloriesKcal < 0)) {
      throw new BadRequestException('Invalid caloriesKcal');
    }
    if (ingredientIds.length > 20) {
      throw new BadRequestException('Maximum 20 ingredients per dish');
    }
    const imageUrl = await this.resolveMenuImageUrl(rawImageUrl, name);

    const menuId = await this.ensureMenuForDateSession(serviceDate, session);
    const itemOut = await runSql(
      `WITH inserted AS (
         INSERT INTO menu_items (
           menu_id, name, description, nutrition_facts_text, calories_kcal, price, image_url, is_available, display_order, cutlery_required, packing_requirement
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
         )
         RETURNING id, name
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [
        menuId,
        name,
        description,
        nutritionFactsText,
        caloriesKcal,
        Number(price.toFixed(2)),
        imageUrl,
        isAvailable,
        displayOrder,
        cutleryRequired,
        packingRequirement || null,
      ],
    );
    const item = this.parseJsonLine<{ id: string; name: string }>(itemOut);

    for (const ingredientId of ingredientIds) {
      await runSql(
        `INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
         VALUES ($1, $2)
         ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;`,
        [item.id, ingredientId],
      );
    }

    return { ok: true, itemId: item.id, itemName: item.name };
  }

  async updateAdminMenuItem(
    itemId: string,
    input: {
      serviceDate?: string;
      session?: string;
      name?: string;
      description?: string;
      nutritionFactsText?: string;
      caloriesKcal?: number;
      price?: number;
      imageUrl?: string;
      ingredientIds?: string[];
      isAvailable?: boolean;
      displayOrder?: number;
      cutleryRequired?: boolean;
      packingRequirement?: string;
    },
  ) {
    await this.ensureMenuItemExtendedColumns();
    const currentOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               m.service_date::text AS service_date,
               m.session::text AS session,
               mi.name,
               mi.description,
               mi.nutrition_facts_text,
               mi.calories_kcal,
               mi.price,
               mi.image_url,
               mi.is_available,
               mi.display_order,
               mi.cutlery_required,
               mi.packing_requirement,
               COALESCE(array_agg(DISTINCT i.id::text) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredient_ids
        FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
        LEFT JOIN ingredients i ON i.id = mii.ingredient_id AND i.deleted_at IS NULL
        WHERE mi.id = $1
          AND mi.deleted_at IS NULL
        GROUP BY mi.id, m.service_date, m.session
        LIMIT 1
      ) t;
    `,
      [itemId],
    );
    if (!currentOut) throw new NotFoundException('Menu item not found');
    const current = this.parseJsonLine<{
      id: string;
      service_date: string;
      session: SessionType;
      name: string;
      description: string;
      nutrition_facts_text?: string | null;
      calories_kcal?: number | null;
      price: string | number;
      image_url?: string | null;
      is_available: boolean;
      display_order: number;
      cutlery_required: boolean;
      packing_requirement?: string | null;
      ingredient_ids: string[];
    }>(currentOut);

    const serviceDate = input.serviceDate ? this.validateServiceDate(input.serviceDate) : current.service_date;
    const session = input.session ? this.normalizeSession(input.session) : current.session;
    const name = input.name !== undefined ? input.name.trim() : current.name;
    const description = input.description !== undefined ? input.description.trim() : current.description;
    const nutritionFactsText = input.nutritionFactsText !== undefined
      ? input.nutritionFactsText.trim() || 'TBA'
      : (String(current.nutrition_facts_text || '').trim() || 'TBA');
    const caloriesKcal = input.caloriesKcal === undefined
      ? (current.calories_kcal ?? null)
      : (input.caloriesKcal === null ? null : Number(input.caloriesKcal));
    const price = input.price === undefined ? Number(current.price || 0) : Number(input.price || 0);
    const rawImageUrl = input.imageUrl !== undefined
      ? input.imageUrl.trim()
      : String(current.image_url || '').trim();
    const ingredientIds = Array.isArray(input.ingredientIds)
      ? input.ingredientIds.filter(Boolean)
      : Array.isArray(current.ingredient_ids) ? current.ingredient_ids : [];
    const isAvailable = input.isAvailable === undefined ? Boolean(current.is_available) : Boolean(input.isAvailable);
    const displayOrder = Number.isInteger(input.displayOrder) ? Number(input.displayOrder) : Number(current.display_order || 0);
    const cutleryRequired = input.cutleryRequired === undefined ? Boolean(current.cutlery_required) : Boolean(input.cutleryRequired);
    const packingRequirement = this.sanitizePackingRequirement(
      input.packingRequirement === undefined ? (current.packing_requirement || '') : input.packingRequirement,
    );

    if (!name || !description || !nutritionFactsText) {
      throw new BadRequestException('Missing required menu item fields');
    }
    if (price < 0 || Number.isNaN(price)) {
      throw new BadRequestException('Invalid price');
    }
    if (caloriesKcal !== null && (!Number.isInteger(caloriesKcal) || caloriesKcal < 0)) {
      throw new BadRequestException('Invalid caloriesKcal');
    }
    if (ingredientIds.length > 20) {
      throw new BadRequestException('Maximum 20 ingredients per dish');
    }
    const imageUrl = input.imageUrl !== undefined
      ? await this.resolveMenuImageUrl(rawImageUrl, name)
      : (rawImageUrl || '/schoolcatering/assets/hero-meal.jpg');

    const menuId = await this.ensureMenuForDateSession(serviceDate, session);
    await runSql(
      `UPDATE menu_items
       SET menu_id = $1,
           name = $2,
           description = $3,
           nutrition_facts_text = $4,
           calories_kcal = $5,
           price = $6,
           image_url = $7,
           is_available = $8,
           display_order = $9,
           cutlery_required = $10,
           packing_requirement = $11,
           updated_at = now()
       WHERE id = $12
         AND deleted_at IS NULL;`,
      [
        menuId,
        name,
        description,
        nutritionFactsText,
        caloriesKcal,
        Number(price.toFixed(2)),
        imageUrl,
        isAvailable,
        displayOrder,
        cutleryRequired,
        packingRequirement || null,
        itemId,
      ],
    );

    await runSql(`DELETE FROM menu_item_ingredients WHERE menu_item_id = $1;`, [itemId]);
    for (const ingredientId of ingredientIds) {
      await runSql(
        `INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
         VALUES ($1, $2)
         ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;`,
        [itemId, ingredientId],
      );
    }
    return { ok: true };
  }

  async seedAdminMenuSample(serviceDateRaw?: string) {
    await this.ensureMenuItemExtendedColumns();
    const serviceDate = this.validateServiceDate(serviceDateRaw);
    const samples = [
      {
        session: 'LUNCH' as SessionType,
        name: 'Sample Grilled Chicken Bowl',
        description: 'Grilled chicken, steamed rice, carrot and broccoli.',
        nutritionFactsText: 'Approx 510 kcal | Protein 34g | Carbs 54g | Fat 12g',
        caloriesKcal: 510,
        price: 45000,
        imageUrl: '/schoolcatering/assets/hero-meal.jpg',
        cutleryRequired: true,
        packingRequirement: 'Lunch box sealed + spoon + tissue',
      },
      {
        session: 'SNACK' as SessionType,
        name: 'Sample Fruit Yogurt Cup',
        description: 'Low sugar yogurt with mixed fruit topping.',
        nutritionFactsText: 'Approx 230 kcal | Protein 8g | Carbs 28g | Fat 7g',
        caloriesKcal: 230,
        price: 25000,
        imageUrl: '/schoolcatering/assets/hero-meal.jpg',
        cutleryRequired: true,
        packingRequirement: 'Cup with spoon',
      },
      {
        session: 'BREAKFAST' as SessionType,
        name: 'Sample Egg Fried Rice',
        description: 'Egg fried rice with vegetables.',
        nutritionFactsText: 'Approx 390 kcal | Protein 12g | Carbs 58g | Fat 10g',
        caloriesKcal: 390,
        price: 32000,
        imageUrl: '/schoolcatering/assets/hero-meal.jpg',
        cutleryRequired: true,
        packingRequirement: 'Warm pack + spoon',
      },
    ];

    const ingredientOut = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, lower(name) AS name
        FROM ingredients
        WHERE deleted_at IS NULL
      ) t;
    `);
    const ingredients = this.parseJsonLines<{ id: string; name: string }>(ingredientOut);
    const byName = new Map(ingredients.map((x) => [x.name, x.id]));

    const createdIds: string[] = [];
    for (const sample of samples) {
      const menuId = await this.ensureMenuForDateSession(serviceDate, sample.session);
      const existing = await runSql(
        `SELECT id
         FROM menu_items
         WHERE menu_id = $1
           AND lower(name) = $2
           AND deleted_at IS NULL
         LIMIT 1;`,
        [menuId, sample.name.toLowerCase()],
      );
      let itemId = existing;
      if (!itemId) {
        itemId = await runSql(
          `INSERT INTO menu_items (
             menu_id, name, description, nutrition_facts_text, calories_kcal, price, image_url, is_available, display_order, cutlery_required, packing_requirement
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, 1, $8, $9)
           RETURNING id;`,
          [
            menuId,
            sample.name,
            sample.description,
            sample.nutritionFactsText,
            sample.caloriesKcal,
            Number(sample.price.toFixed(2)),
            sample.imageUrl,
            sample.cutleryRequired,
            sample.packingRequirement,
          ],
        );
      }
      createdIds.push(itemId);
      await runSql(`DELETE FROM menu_item_ingredients WHERE menu_item_id = $1;`, [itemId]);
      const names = sample.session === 'SNACK' ? ['milk', 'tomato'] : ['chicken', 'rice', 'egg'];
      for (const nm of names) {
        const ingredientId = byName.get(nm);
        if (!ingredientId) continue;
        await runSql(
          `INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
           VALUES ($1, $2)
           ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;`,
          [itemId, ingredientId],
        );
      }
      await runSql(
        `UPDATE menus
         SET is_published = true, updated_at = now()
         WHERE id = $1;`,
        [menuId],
      );
    }
    return { ok: true, serviceDate, createdItemIds: createdIds };
  }

  async getYoungsterMe(actor: AccessUser) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id, c.user_id, u.first_name, u.last_name, c.school_id, s.name AS school_name,
               c.school_grade, c.date_of_birth::text AS date_of_birth, c.gender::text AS gender,
               COALESCE((
                 SELECT cdr.restriction_details
                 FROM child_dietary_restrictions cdr
                 WHERE cdr.child_id = c.id
                   AND cdr.is_active = true
                   AND cdr.deleted_at IS NULL
                   AND upper(cdr.restriction_label) = 'ALLERGIES'
                 ORDER BY cdr.updated_at DESC NULLS LAST, cdr.created_at DESC
                 LIMIT 1
               ), 'No Allergies') AS dietary_allergies
        FROM children c
        JOIN users u ON u.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        WHERE c.user_id = $1
          AND c.is_active = true
          AND c.deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [actor.uid],
    );
    if (!out) throw new NotFoundException('Youngster profile not found');
    return this.parseJsonLine<ChildRow>(out);
  }

  async createCart(actor: AccessUser, input: { childId?: string; serviceDate?: string; session?: string }) {
    if (!['PARENT', 'YOUNGSTER', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    const serviceDate = this.validateServiceDate(input.serviceDate);
    const session = this.normalizeSession(input.session);
    const childId = (input.childId || '').trim();
    if (!childId) throw new BadRequestException('youngsterId is required');

    await this.validateOrderDayRules(serviceDate);
    await this.assertSessionActiveForOrdering(session);

    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    }
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      await this.ensureParentOwnsChild(parentId, childId);
    }

    const existingOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, child_id, created_by_user_id, session::text AS session, service_date::text AS service_date,
                status::text AS status, expires_at::text AS expires_at
         FROM order_carts
         WHERE child_id = $1
           AND session = $2::session_type
           AND service_date = $3::date
           AND status = 'OPEN'
         LIMIT 1
       ) t;`,
      [childId, session, serviceDate],
    );
    if (existingOut) {
      return this.parseJsonLine<CartRow>(existingOut);
    }

    const expiresAtUtc = `${serviceDate}T00:00:00.000Z`;
    const createdOut = await runSql(
      `WITH inserted AS (
         INSERT INTO order_carts (child_id, created_by_user_id, session, service_date, status, expires_at)
         VALUES ($1, $2, $3::session_type, $4::date, 'OPEN', $5::timestamptz)
         RETURNING id, child_id, created_by_user_id, session::text AS session, service_date::text AS service_date,
                   status::text AS status, expires_at::text AS expires_at
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [childId, actor.uid, session, serviceDate, expiresAtUtc],
    );
    return this.parseJsonLine<CartRow>(createdOut);
  }

  async getCarts(actor: AccessUser, query: { childId?: string; serviceDate?: string; session?: string }) {
    if (!['PARENT', 'YOUNGSTER', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.childId) {
      params.push(query.childId);
      conditions.push(`oc.child_id = $${params.length}`);
    }
    if (query.serviceDate) {
      params.push(this.validateServiceDate(query.serviceDate));
      conditions.push(`oc.service_date = $${params.length}::date`);
    }
    if (query.session) {
      params.push(this.normalizeSession(query.session));
      conditions.push(`oc.session = $${params.length}::session_type`);
    }

    if (actor.role === 'YOUNGSTER') {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId) return [];
      params.push(childId);
      conditions.push(`oc.child_id = $${params.length}`);
    }

    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) return [];
      params.push(parentId);
      conditions.push(`EXISTS (SELECT 1 FROM parent_children pc WHERE pc.parent_id = $${params.length} AND pc.child_id = oc.child_id)`);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oc.id, oc.child_id, oc.session::text AS session, oc.service_date::text AS service_date,
               oc.status::text AS status, oc.expires_at::text AS expires_at
        FROM order_carts oc
        ${whereSql}
        ORDER BY oc.created_at DESC
        LIMIT 100
      ) t;
    `,
      params,
    );
    return this.parseJsonLines(out);
  }

  async getCartById(actor: AccessUser, cartId: string) {
    const cart = await this.ensureCartIsOpenAndOwned(cartId, actor).catch(async (err) => {
      if (err instanceof BadRequestException && ['CART_EXPIRED', 'CART_ALREADY_SUBMITTED'].includes(String(err.message))) {
        // continue and return snapshot for non-open carts too
      } else {
        throw err;
      }
      const out = await runSql(
        `SELECT row_to_json(t)::text
         FROM (
           SELECT id, child_id, created_by_user_id, session::text AS session, service_date::text AS service_date,
                  status::text AS status, expires_at::text AS expires_at
           FROM order_carts
           WHERE id = $1
           LIMIT 1
         ) t;`,
        [cartId],
      );
      if (!out) throw new NotFoundException('Cart not found');
      return this.parseJsonLine<CartRow>(out);
    });

    const itemsOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT ci.id, ci.menu_item_id, ci.quantity, mi.name, mi.price
         FROM cart_items ci
         JOIN menu_items mi ON mi.id = ci.menu_item_id
         WHERE ci.cart_id = $1
         ORDER BY ci.created_at ASC
       ) t;`,
      [cartId],
    );

    return {
      ...cart,
      items: this.parseJsonLines(itemsOut),
    };
  }

  async replaceCartItems(actor: AccessUser, cartId: string, items: CartItemInput[]) {
    const cart = await this.ensureCartIsOpenAndOwned(cartId, actor);
    if (!Array.isArray(items)) throw new BadRequestException('items must be an array');
    if (items.length > 5) throw new BadRequestException('CART_ITEM_LIMIT_EXCEEDED');

    const normalized = items.map((item) => ({
      menuItemId: (item.menuItemId || '').trim(),
      quantity: Number(item.quantity || 0),
    }));

    for (const item of normalized) {
      if (!item.menuItemId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('Invalid cart item');
      }
    }

    const ids = [...new Set(normalized.map((item) => item.menuItemId))];
    if (ids.length !== normalized.length) throw new BadRequestException('Duplicate menu items are not allowed');

    if (ids.length > 0) {
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      const validCount = await runSql(
        `SELECT count(*)::int
         FROM menu_items mi
         JOIN menus m ON m.id = mi.menu_id
         WHERE mi.id IN (${placeholders})
           AND mi.is_available = true
           AND mi.deleted_at IS NULL
           AND m.is_published = true
           AND m.deleted_at IS NULL
           AND m.service_date = $${ids.length + 1}::date
           AND m.session = $${ids.length + 2}::session_type;`,
        [...ids, cart.service_date, cart.session],
      );
      if (Number(validCount || 0) !== ids.length) {
        throw new BadRequestException('CART_MENU_ITEM_UNAVAILABLE');
      }
    }

    await runSql(`DELETE FROM cart_items WHERE cart_id = $1;`, [cartId]);

    for (const item of normalized) {
      await runSql(
        `INSERT INTO cart_items (cart_id, menu_item_id, quantity)
         VALUES ($1, $2, $3);`,
        [cartId, item.menuItemId, item.quantity],
      );
    }

    return this.getCartById(actor, cartId);
  }

  async discardCart(actor: AccessUser, cartId: string) {
    const cart = await this.ensureCartIsOpenAndOwned(cartId, actor);
    await runSql(
      `UPDATE order_carts
       SET status = 'EXPIRED', updated_at = now()
       WHERE id = $1
         AND status = 'OPEN';`,
      [cart.id],
    );
    await runSql(`DELETE FROM cart_items WHERE cart_id = $1;`, [cart.id]);
    return { ok: true };
  }

  async submitCart(actor: AccessUser, cartId: string) {
    if (!['PARENT', 'YOUNGSTER', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }

    const cart = await this.ensureCartIsOpenAndOwned(cartId, actor);

    const itemsOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT ci.menu_item_id, ci.quantity, mi.name, mi.price
         FROM cart_items ci
         JOIN menu_items mi ON mi.id = ci.menu_item_id
         WHERE ci.cart_id = $1
         ORDER BY ci.created_at ASC
       ) t;`,
      [cartId],
    );
    const items = this.parseJsonLines<{ menu_item_id: string; quantity: number; name: string; price: string }>(itemsOut);
    if (items.length === 0) throw new BadRequestException('Cart is empty');
    if (items.length > 5) throw new BadRequestException('ORDER_ITEM_LIMIT_EXCEEDED');

    await this.validateOrderDayRules(cart.service_date);
    await this.assertSessionActiveForOrdering(cart.session);

    const dietaryOut = await runSql(
      `SELECT coalesce(string_agg(cdr.restriction_label || ': ' || coalesce(cdr.restriction_details, ''), '; '), '')
       FROM child_dietary_restrictions cdr
       WHERE cdr.child_id = $1
         AND cdr.is_active = true
         AND cdr.deleted_at IS NULL;`,
      [cart.child_id],
    );
    const dietarySnapshot = dietaryOut || '';

    const totalPrice = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);

    let orderOut: string;
    try {
      orderOut = await runSql(
        `WITH inserted AS (
           INSERT INTO orders (cart_id, child_id, placed_by_user_id, session, service_date, status, total_price, dietary_snapshot)
           VALUES ($1, $2, $3, $4::session_type, $5::date, 'PLACED', $6, $7)
           RETURNING id, order_number::text, child_id, session::text AS session, service_date::text AS service_date,
                     status::text AS status, total_price, dietary_snapshot, placed_at::text AS placed_at
         )
         SELECT row_to_json(inserted)::text
         FROM inserted;`,
        [
          cart.id,
          cart.child_id,
          actor.uid,
          cart.session,
          cart.service_date,
          Number(totalPrice.toFixed(2)),
          dietarySnapshot || null,
        ],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('orders_child_session_date_active_uq') || msg.includes('23505')) {
        throw new ConflictException('ORDER_ALREADY_EXISTS_FOR_DATE');
      }
      throw err;
    }
    const order = this.parseJsonLine<{
      id: string;
      order_number: string;
      child_id: string;
      session: string;
      service_date: string;
      status: string;
      total_price: string | number;
      dietary_snapshot?: string | null;
      placed_at: string;
    }>(orderOut);

    for (const item of items) {
      await runSql(
        `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, price_snapshot, quantity)
         VALUES ($1, $2, $3, $4, $5);`,
        [order.id, item.menu_item_id, item.name, Number(Number(item.price).toFixed(2)), Number(item.quantity)],
      );
    }

    let billingParentId: string | null = null;
    if (actor.role === 'PARENT') {
      billingParentId = await this.getParentIdByUserId(actor.uid);
    } else {
      const parentOut = await runSql(
        `SELECT pc.parent_id
         FROM parent_children pc
         WHERE pc.child_id = $1
         ORDER BY pc.created_at ASC
         LIMIT 1;`,
        [cart.child_id],
      );
      billingParentId = parentOut || null;
    }

    if (!billingParentId) {
      throw new BadRequestException('No linked parent for billing');
    }

    await runSql(
      `INSERT INTO billing_records (order_id, parent_id, status, delivery_status)
       VALUES ($1, $2, 'UNPAID', 'PENDING');`,
      [order.id, billingParentId],
    );

    await runSql(
      `INSERT INTO order_mutations (order_id, action, actor_user_id, before_json, after_json)
       VALUES ($1, 'ORDER_PLACED', $2, NULL, $3::jsonb);`,
      [order.id, actor.uid, JSON.stringify({ cartId: cart.id, totalItems: items.length, totalPrice })],
    );

    await runSql(
      `UPDATE order_carts
       SET status = 'SUBMITTED', updated_at = now()
       WHERE id = $1;`,
      [cart.id],
    );

    return {
      ...order,
      total_price: Number(order.total_price),
      items,
      billingParentId,
    };
  }

  async getOrderDetail(actor: AccessUser, orderId: string) {
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id,
               o.order_number::text AS order_number,
               o.child_id,
               o.session::text AS session,
               o.service_date::text AS service_date,
               o.status::text AS status,
               o.total_price,
               o.dietary_snapshot,
               o.placed_at::text AS placed_at,
               (u.first_name || ' ' || u.last_name) AS child_name
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        WHERE o.id = $1
          AND o.deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [orderId],
    );
    if (!out) throw new NotFoundException('Order not found');
    const order = this.parseJsonLine<{
      id: string;
      order_number: string;
      child_id: string;
      session: SessionType;
      service_date: string;
      status: string;
      total_price: string | number;
      dietary_snapshot?: string | null;
      placed_at: string;
      child_name: string;
    }>(out);

    if (actor.role === 'YOUNGSTER') {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId || childId !== order.child_id) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, order.child_id);
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    const itemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.menu_item_id, oi.item_name_snapshot, oi.price_snapshot, oi.quantity
        FROM order_items oi
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC
      ) t;
    `,
      [order.id],
    );
    const items = this.parseJsonLines(itemsOut);

    return {
      ...order,
      total_price: Number(order.total_price),
      can_edit: order.status === 'PLACED' && !this.isAfterOrAtMakassarCutoff(order.service_date),
      items,
    };
  }

  async getParentConsolidatedOrders(actor: AccessUser) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');

    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id,
               o.order_number::text AS order_number,
               o.child_id,
               o.session::text AS session,
               o.service_date::text AS service_date,
               o.status::text AS status,
               o.total_price,
               o.dietary_snapshot,
               o.placed_at::text AS placed_at,
               (u.first_name || ' ' || u.last_name) AS child_name,
               br.status::text AS billing_status,
               br.delivery_status::text AS delivery_status
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        JOIN parent_children pc ON pc.child_id = c.id
        LEFT JOIN billing_records br ON br.order_id = o.id
        WHERE pc.parent_id = $1
          AND o.deleted_at IS NULL
        ORDER BY o.service_date DESC, o.created_at DESC
        LIMIT 200
      ) t;
    `,
      [parentId],
    );

    const orders = this.parseJsonLines<{
      id: string;
      order_number: string;
      child_id: string;
      session: SessionType;
      service_date: string;
      status: string;
      total_price: string | number;
      dietary_snapshot?: string | null;
      placed_at: string;
      child_name: string;
      billing_status?: string | null;
      delivery_status?: string | null;
    }>(out);

    const result: Array<Record<string, unknown>> = [];
    for (const order of orders) {
      const itemsOut = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT oi.menu_item_id, oi.item_name_snapshot, oi.price_snapshot, oi.quantity
          FROM order_items oi
          WHERE oi.order_id = $1
          ORDER BY oi.created_at ASC
        ) t;
      `,
        [order.id],
      );
      const items = this.parseJsonLines(itemsOut);
      result.push({
        ...order,
        total_price: Number(order.total_price),
        can_edit: order.status === 'PLACED' && !this.isAfterOrAtMakassarCutoff(order.service_date),
        items,
      });
    }

    return {
      parentId,
      orders: result,
    };
  }

  async getFavourites(actor: AccessUser, query: { childId?: string; session?: string }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const filters: string[] = [
      `fm.created_by_user_id = $1`,
      `fm.is_active = true`,
      `fm.deleted_at IS NULL`,
    ];
    const params: unknown[] = [actor.uid];
    if (query.childId) {
      params.push(query.childId);
      filters.push(`fm.child_id = $${params.length}`);
    }
    if (query.session) {
      params.push(this.normalizeSession(query.session));
      filters.push(`fm.session = $${params.length}::session_type`);
    }
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT fm.id, fm.label, fm.session::text AS session, fm.child_id, fm.created_at::text AS created_at,
               COALESCE(json_agg(
                 json_build_object(
                   'menu_item_id', fmi.menu_item_id,
                   'quantity', fmi.quantity,
                   'name', mi.name,
                   'price', mi.price
                 )
               ) FILTER (WHERE fmi.id IS NOT NULL), '[]'::json) AS items
        FROM favourite_meals fm
        LEFT JOIN favourite_meal_items fmi ON fmi.favourite_meal_id = fm.id
        LEFT JOIN menu_items mi ON mi.id = fmi.menu_item_id
        WHERE ${filters.join(' AND ')}
        GROUP BY fm.id
        ORDER BY fm.created_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines(out);
  }

  async createFavourite(actor: AccessUser, input: {
    childId?: string;
    label?: string;
    session?: string;
    items?: CartItemInput[];
  }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const label = (input.label || '').trim();
    const session = this.normalizeSession(input.session);
    const childId = (input.childId || '').trim() || null;
    const items = Array.isArray(input.items) ? input.items : [];
    if (!label) throw new BadRequestException('label is required');
    if (items.length === 0) throw new BadRequestException('items is required');
    if (items.length > 5) throw new BadRequestException('ORDER_ITEM_LIMIT_EXCEEDED');

    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || (childId && childId !== ownChildId)) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'PARENT' && childId) {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, childId);
    }

    const activeCount = Number(await runSql(
      `SELECT count(*)::int
       FROM favourite_meals
       WHERE created_by_user_id = $1
         AND is_active = true
         AND deleted_at IS NULL;`,
      [actor.uid],
    ) || 0);
    if (activeCount >= 20) throw new BadRequestException('FAVOURITES_LIMIT_EXCEEDED');

    const favOut = await runSql(
      `WITH inserted AS (
         INSERT INTO favourite_meals (created_by_user_id, child_id, label, session, is_active)
         VALUES ($1, $2, $3, $4::session_type, true)
         RETURNING id, label
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [actor.uid, childId || null, label, session],
    );
    const fav = this.parseJsonLine<{ id: string; label: string }>(favOut);
    for (const item of items) {
      if (!item.menuItemId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('Invalid favourite item');
      }
      await runSql(
        `INSERT INTO favourite_meal_items (favourite_meal_id, menu_item_id, quantity)
         VALUES ($1, $2, $3);`,
        [fav.id, item.menuItemId, Number(item.quantity)],
      );
    }
    return { ok: true, favouriteId: fav.id, label: fav.label };
  }

  async deleteFavourite(actor: AccessUser, favouriteId: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const favId = (favouriteId || '').trim();
    if (!favId) throw new BadRequestException('favouriteId is required');

    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, created_by_user_id, is_active, deleted_at
        FROM favourite_meals
        WHERE id = $1
        LIMIT 1
      ) t;
    `,
      [favId],
    );
    if (!out) throw new NotFoundException('Favourite not found');
    const fav = this.parseJsonLine<{ id: string; created_by_user_id: string; is_active: boolean; deleted_at?: string | null }>(out);
    if (fav.created_by_user_id !== actor.uid) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    if (fav.deleted_at) return { ok: true, alreadyDeleted: true };

    await runSql(
      `UPDATE favourite_meals
       SET is_active = false,
           deleted_at = now(),
           updated_at = now()
       WHERE id = $1;`,
      [fav.id],
    );
    return { ok: true };
  }

  async quickReorder(actor: AccessUser, input: { sourceOrderId?: string; serviceDate?: string }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const sourceOrderId = (input.sourceOrderId || '').trim();
    const serviceDate = this.validateServiceDate(input.serviceDate);
    if (!sourceOrderId) throw new BadRequestException('sourceOrderId is required');

    const srcOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, child_id, session::text AS session, status::text AS status
        FROM orders
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [sourceOrderId],
    );
    if (!srcOut) throw new NotFoundException('Source order not found');
    const source = this.parseJsonLine<{ id: string; child_id: string; session: SessionType; status: string }>(srcOut);
    if (!['PLACED', 'LOCKED'].includes(source.status)) {
      throw new BadRequestException('Only PLACED/LOCKED source orders can be reordered');
    }

    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== source.child_id) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, source.child_id);
    }

    const cart = await this.createCart(actor, {
      childId: source.child_id,
      serviceDate,
      session: source.session,
    });

    const srcItemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.menu_item_id, oi.quantity
        FROM order_items oi
        WHERE oi.order_id = $1
      ) t;
    `,
      [source.id],
    );
    const srcItems = this.parseJsonLines<{ menu_item_id: string; quantity: number }>(srcItemsOut);
    const ids = [...new Set(srcItems.map((x) => x.menu_item_id))];
    const excludedItemIds: string[] = [];
    const validIds = new Set<string>();
    if (ids.length > 0) {
      const ph = ids.map((_, i) => `$${i + 1}`).join(', ');
      const validOut = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT mi.id
          FROM menu_items mi
          JOIN menus m ON m.id = mi.menu_id
          WHERE mi.id IN (${ph})
            AND mi.is_available = true
            AND mi.deleted_at IS NULL
            AND m.is_published = true
            AND m.deleted_at IS NULL
            AND m.service_date = $${ids.length + 1}::date
            AND m.session = $${ids.length + 2}::session_type
        ) t;
      `,
        [...ids, serviceDate, source.session],
      );
      for (const row of this.parseJsonLines<{ id: string }>(validOut)) validIds.add(row.id);
      for (const id of ids) if (!validIds.has(id)) excludedItemIds.push(id);
    }
    const accepted = srcItems
      .filter((x) => validIds.has(x.menu_item_id))
      .map((x) => ({ menuItemId: x.menu_item_id, quantity: Number(x.quantity) }));
    if (accepted.length > 0) {
      await this.replaceCartItems(actor, cart.id, accepted);
    }
    return {
      cartId: cart.id,
      serviceDate,
      session: source.session,
      excludedItemIds,
    };
  }

  async mealPlanWizard(actor: AccessUser, input: {
    childId?: string;
    sourceOrderId?: string;
    dates?: string[];
  }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const childId = (input.childId || '').trim();
    const sourceOrderId = (input.sourceOrderId || '').trim();
    const rawDates = Array.isArray(input.dates) ? input.dates : [];
    if (!childId || !sourceOrderId || rawDates.length === 0) {
      throw new BadRequestException('childId, sourceOrderId, dates are required');
    }
    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, childId);
    }

    const sourceOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, child_id, session::text AS session
        FROM orders
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [sourceOrderId],
    );
    if (!sourceOut) throw new NotFoundException('Source order not found');
    const source = this.parseJsonLine<{ id: string; child_id: string; session: SessionType }>(sourceOut);
    if (source.child_id !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');

    const srcItemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.menu_item_id, oi.quantity
        FROM order_items oi
        WHERE oi.order_id = $1
      ) t;
    `,
      [source.id],
    );
    const srcItems = this.parseJsonLines<{ menu_item_id: string; quantity: number }>(srcItemsOut);
    const itemsPayload = srcItems.map((x) => ({ menuItemId: x.menu_item_id, quantity: Number(x.quantity) }));

    const success: Array<{ date: string; orderId: string; cartId: string }> = [];
    const failures: Array<{ date: string; reason: string }> = [];
    for (const d of rawDates) {
      let date = '';
      try {
        date = this.validateServiceDate(d);
        const cart = await this.createCart(actor, { childId, serviceDate: date, session: source.session });
        await this.replaceCartItems(actor, cart.id, itemsPayload);
        const order = await this.submitCart(actor, cart.id) as { id: string };
        success.push({ date, orderId: order.id, cartId: cart.id });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Meal plan date failed';
        failures.push({ date: date || d, reason });
      }
    }
    return {
      totalDates: rawDates.length,
      successCount: success.length,
      failureCount: failures.length,
      success,
      failures,
    };
  }

  async applyFavouriteToCart(actor: AccessUser, input: { favouriteId?: string; serviceDate?: string }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const favouriteId = (input.favouriteId || '').trim();
    const serviceDate = this.validateServiceDate(input.serviceDate);
    if (!favouriteId) throw new BadRequestException('favouriteId is required');

    const favOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, child_id, session::text AS session
        FROM favourite_meals
        WHERE id = $1
          AND created_by_user_id = $2
          AND is_active = true
          AND deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [favouriteId, actor.uid],
    );
    if (!favOut) throw new NotFoundException('Favourite not found');
    const fav = this.parseJsonLine<{ id: string; child_id: string | null; session: SessionType }>(favOut);
    const childId = fav.child_id || (await this.getChildIdByUserId(actor.uid));
    if (!childId) throw new BadRequestException('Favourite is not linked to a child');
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, childId);
    } else {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    }

    const favItemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT menu_item_id, quantity
        FROM favourite_meal_items
        WHERE favourite_meal_id = $1
      ) t;
    `,
      [fav.id],
    );
    const favItems = this.parseJsonLines<{ menu_item_id: string; quantity: number }>(favItemsOut);
    const cart = await this.createCart(actor, { childId, serviceDate, session: fav.session });
    const ids = [...new Set(favItems.map((x) => x.menu_item_id))];
    const excludedItemIds: string[] = [];
    const validIds = new Set<string>();
    if (ids.length > 0) {
      const ph = ids.map((_, i) => `$${i + 1}`).join(', ');
      const validOut = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT mi.id
          FROM menu_items mi
          JOIN menus m ON m.id = mi.menu_id
          WHERE mi.id IN (${ph})
            AND mi.is_available = true
            AND mi.deleted_at IS NULL
            AND m.is_published = true
            AND m.deleted_at IS NULL
            AND m.service_date = $${ids.length + 1}::date
            AND m.session = $${ids.length + 2}::session_type
        ) t;
      `,
        [...ids, serviceDate, fav.session],
      );
      for (const row of this.parseJsonLines<{ id: string }>(validOut)) validIds.add(row.id);
      for (const id of ids) if (!validIds.has(id)) excludedItemIds.push(id);
    }
    const accepted = favItems
      .filter((x) => validIds.has(x.menu_item_id))
      .map((x) => ({ menuItemId: x.menu_item_id, quantity: Number(x.quantity) }));
    if (accepted.length > 0) {
      await this.replaceCartItems(actor, cart.id, accepted);
    }
    return { cartId: cart.id, excludedItemIds };
  }

  async getParentConsolidatedBilling(actor: AccessUser) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               o.child_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.delivered_at::text AS delivered_at,
               br.created_at::text AS created_at,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               (u.first_name || ' ' || u.last_name) AS child_name,
               dr.receipt_number,
               dr.pdf_url,
               dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE br.parent_id = $1
        ORDER BY br.created_at DESC
      ) t;
    `,
      [parentId],
    );
    return this.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async uploadBillingProof(actor: AccessUser, billingId: string, proofImageData?: string) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const proof = (proofImageData || '').trim();
    if (!proof) throw new BadRequestException('proofImageData is required');
    const exists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM billing_records
         WHERE id = $1
           AND parent_id = $2
       );`,
      [billingId, parentId],
    );
    if (exists !== 't') throw new NotFoundException('Billing record not found');
    let proofUrl = proof;
    if (proof.startsWith('data:')) {
      const parsed = this.parseDataUrl(proof);
      if (!parsed.contentType.startsWith('image/')) {
        throw new BadRequestException('Proof upload must be an image');
      }
      if (parsed.contentType.toLowerCase() !== 'image/webp') {
        throw new BadRequestException('Proof upload must be WebP');
      }
      if (parsed.data.length > 5 * 1024 * 1024) {
        throw new BadRequestException('Proof image exceeds size limit (5MB)');
      }
      const ext = this.getFileExtFromContentType(parsed.contentType);
      const objectName = `${this.getGcsCategoryFolder('payment-proofs')}/${parentId}/${billingId}-${Date.now()}.${ext}`;
      const uploaded = await this.uploadToGcs({
        objectName,
        contentType: parsed.contentType,
        data: parsed.data,
        cacheControl: 'private, max-age=0, no-cache',
      });
      proofUrl = uploaded.publicUrl;
    } else if (!/^https?:\/\//i.test(proof)) {
      throw new BadRequestException('proofImageData must be a data URL image or an http(s) URL');
    } else if (!/\.webp(\?|#|$)/i.test(proof)) {
      throw new BadRequestException('Proof image URL must be WebP');
    }

    await runSql(
      `UPDATE billing_records
       SET proof_image_url = $1,
           proof_uploaded_at = now(),
           status = 'PENDING_VERIFICATION',
           updated_at = now()
       WHERE id = $2;`,
      [proofUrl, billingId],
    );
    return { ok: true };
  }

  async getAdminBilling(status?: string) {
    const statusFilter = (status || '').toUpperCase();
    const whereStatus = ['UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'].includes(statusFilter)
      ? 'AND br.status = $1::payment_status'
      : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.created_at::text AS created_at,
               br.verified_at::text AS verified_at,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               p.id AS parent_id,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               dr.receipt_number,
               dr.pdf_url
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN parents p ON p.id = br.parent_id
        JOIN users up ON up.id = p.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE 1=1
          ${whereStatus}
        ORDER BY br.created_at DESC
      ) t;
    `,
      whereStatus ? [statusFilter] : [],
    );
    return this.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async verifyBilling(actor: AccessUser, billingId: string, decision: 'VERIFIED' | 'REJECTED') {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await runSql(
      `UPDATE billing_records
       SET status = $1::payment_status,
           verified_by = $2,
           verified_at = now(),
           updated_at = now()
       WHERE id = $3;`,
      [decision, actor.uid, billingId],
    );
    return { ok: true, status: decision };
  }

  async generateReceipt(actor: AccessUser, billingId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const billingOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.status::text AS status,
               br.parent_id,
               br.order_id,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               (uc.first_name || ' ' || uc.last_name) AS child_name
        FROM billing_records
        br
        JOIN orders o ON o.id = br.order_id
        JOIN parents p ON p.id = br.parent_id
        JOIN users up ON up.id = p.user_id
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        WHERE br.id = $1
        LIMIT 1
      ) t;
    `,
      [billingId],
    );
    if (!billingOut) throw new NotFoundException('Billing record not found');
    const billing = this.parseJsonLine<{
      id: string;
      status: string;
      parent_id: string;
      order_id: string;
      service_date: string;
      session: string;
      total_price: string | number;
      parent_name: string;
      child_name: string;
    }>(billingOut);
    if (billing.status !== 'VERIFIED') throw new BadRequestException('RECEIPT_PAYMENT_NOT_VERIFIED');

    const seq = Number(await runSql(`SELECT nextval('receipt_number_seq');`) || 0);
    const nowYear = new Date().getUTCFullYear();
    const receiptNumber = `BLC-${nowYear}-${String(seq).padStart(5, '0')}`;
    const itemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.item_name_snapshot, oi.quantity, oi.price_snapshot
        FROM order_items oi
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC
      ) t;
    `,
      [billing.order_id],
    );
    const items = this.parseJsonLines<{
      item_name_snapshot: string;
      quantity: number | string;
      price_snapshot: number | string;
    }>(itemsOut);
    const total = Number(billing.total_price || 0);
    const lineItems = items.map((it) => {
      const qty = Number(it.quantity || 0);
      const price = Number(it.price_snapshot || 0);
      return `${it.item_name_snapshot} x${qty} @ Rp ${price.toLocaleString('id-ID')} = Rp ${(qty * price).toLocaleString('id-ID')}`;
    });
    const pdf = this.buildSimplePdf([
      'Blossom School Catering - Payment Receipt',
      `Receipt Number: ${receiptNumber}`,
      `Generated At (UTC): ${new Date().toISOString()}`,
      `Billing ID: ${billing.id}`,
      `Order ID: ${billing.order_id}`,
      `Parent: ${billing.parent_name}`,
      `Youngster: ${billing.child_name}`,
      `Service Date: ${billing.service_date} (${billing.session})`,
      ...lineItems,
      `Total: Rp ${total.toLocaleString('id-ID')}`,
      `Verified By: ${actor.uid}`,
    ]);
    const receiptObjectName = `${this.getGcsCategoryFolder('receipts')}/${receiptNumber}.pdf`;
    const uploadedReceipt = await this.uploadToGcs({
      objectName: receiptObjectName,
      contentType: 'application/pdf',
      data: pdf,
      cacheControl: 'private, max-age=0, no-cache',
    });
    const pdfUrl = uploadedReceipt.publicUrl;

    await runSql(
      `INSERT INTO digital_receipts (billing_record_id, receipt_number, pdf_url, generated_at, generated_by_user_id)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (billing_record_id)
       DO UPDATE SET receipt_number = EXCLUDED.receipt_number, pdf_url = EXCLUDED.pdf_url, generated_at = now(), generated_by_user_id = EXCLUDED.generated_by_user_id;`,
      [billing.id, receiptNumber, pdfUrl, actor.uid],
    );
    return { ok: true, receiptNumber, pdfUrl };
  }

  async getBillingReceipt(actor: AccessUser, billingId: string) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id, br.parent_id, dr.receipt_number, dr.pdf_url, dr.generated_at::text AS generated_at
        FROM billing_records br
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE br.id = $1
        LIMIT 1
      ) t;
    `,
      [billingId],
    );
    if (!out) throw new NotFoundException('Billing record not found');
    const row = this.parseJsonLine<{ id: string; parent_id: string; receipt_number?: string; pdf_url?: string }>(out);
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId || parentId !== row.parent_id) throw new ForbiddenException('Role not allowed');
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }
    return row;
  }

  async getDeliveryUsers(includeInactive = false) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id,
               username,
               first_name,
               last_name,
               phone_number,
               email,
               is_active
        FROM users
        WHERE role = 'DELIVERY'
          AND deleted_at IS NULL
          ${includeInactive ? '' : 'AND is_active = true'}
        ORDER BY first_name, last_name
      ) t;
    `,
    );
    return this.parseJsonLines(out);
  }

  async getDeliverySchoolAssignments() {
    await this.ensureDeliverySchoolAssignmentsTable();
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT dsa.delivery_user_id,
               dsa.school_id,
               dsa.is_active,
               (u.first_name || ' ' || u.last_name) AS delivery_name,
               u.username AS delivery_username,
               s.name AS school_name
        FROM delivery_school_assignments dsa
        JOIN users u ON u.id = dsa.delivery_user_id
        JOIN schools s ON s.id = dsa.school_id
        WHERE u.role = 'DELIVERY'
          AND u.deleted_at IS NULL
          AND s.deleted_at IS NULL
        ORDER BY s.name ASC, delivery_name ASC
      ) t;
    `);
    return this.parseJsonLines(out);
  }

  async upsertDeliverySchoolAssignment(actor: AccessUser, input: { deliveryUserId?: string; schoolId?: string; isActive?: boolean }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.ensureDeliverySchoolAssignmentsTable();
    const deliveryUserId = (input.deliveryUserId || '').trim();
    const schoolId = (input.schoolId || '').trim();
    if (!deliveryUserId || !schoolId) throw new BadRequestException('deliveryUserId and schoolId are required');
    const isActive = input.isActive !== false;

    const deliveryExists = await runSql(
      `SELECT EXISTS (
         SELECT 1
         FROM users
         WHERE id = $1
           AND role = 'DELIVERY'
           AND is_active = true
       );`,
      [deliveryUserId],
    );
    if (deliveryExists !== 't') throw new BadRequestException('Delivery user not found or inactive');

    const schoolExists = await runSql(
      `SELECT EXISTS (
         SELECT 1
         FROM schools
         WHERE id = $1
           AND deleted_at IS NULL
       );`,
      [schoolId],
    );
    if (schoolExists !== 't') throw new BadRequestException('School not found');

    await runSql(
      `INSERT INTO delivery_school_assignments (delivery_user_id, school_id, is_active, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (delivery_user_id, school_id)
       DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = now();`,
      [deliveryUserId, schoolId, isActive],
    );
    // Keep school->delivery routing deterministic: only one active delivery user per school.
    if (isActive) {
      await runSql(
        `UPDATE delivery_school_assignments
         SET is_active = false,
             updated_at = now()
         WHERE school_id = $1
           AND delivery_user_id <> $2
           AND is_active = true;`,
        [schoolId, deliveryUserId],
      );
    }
    await this.autoAssignDeliveriesForDate(new Date().toISOString().slice(0, 10));
    return { ok: true };
  }

  private async autoAssignDeliveriesForDate(serviceDate: string) {
    await this.ensureDeliverySchoolAssignmentsTable();
    const ordersOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id AS order_id, c.school_id
        FROM orders o
        JOIN children c ON c.id = o.child_id
        WHERE o.service_date = $1::date
          AND o.status IN ('PLACED', 'LOCKED')
          AND o.delivery_status <> 'DELIVERED'
      ) t;
    `,
      [serviceDate],
    );
    const orders = this.parseJsonLines<{ order_id: string; school_id: string }>(ordersOut);
    if (orders.length === 0) return { ok: true, serviceDate, assignedCount: 0, skippedOrderIds: [] as string[] };

    const loadOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT da.delivery_user_id, COUNT(*)::int AS assigned_count
        FROM delivery_assignments da
        JOIN orders o ON o.id = da.order_id
        WHERE o.service_date = $1::date
        GROUP BY da.delivery_user_id
      ) t;
    `,
      [serviceDate],
    );
    const loads = this.parseJsonLines<{ delivery_user_id: string; assigned_count: number }>(loadOut);
    const loadMap = new Map<string, number>(loads.map((x) => [x.delivery_user_id, Number(x.assigned_count || 0)]));

    const mappingOut = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT dsa.school_id, dsa.delivery_user_id
        FROM delivery_school_assignments dsa
        JOIN users u ON u.id = dsa.delivery_user_id
        WHERE dsa.is_active = true
          AND u.role = 'DELIVERY'
          AND u.is_active = true
          AND u.deleted_at IS NULL
      ) t;
    `);
    const mappings = this.parseJsonLines<{ school_id: string; delivery_user_id: string }>(mappingOut);
    const bySchool = new Map<string, string[]>();
    for (const m of mappings) {
      const list = bySchool.get(m.school_id) || [];
      list.push(m.delivery_user_id);
      bySchool.set(m.school_id, list);
    }

    const skippedOrderIds: string[] = [];
    let assignedCount = 0;
    for (const order of orders) {
      const candidates = bySchool.get(order.school_id) || [];
      if (candidates.length === 0) {
        skippedOrderIds.push(order.order_id);
        continue;
      }
      const selected = [...candidates].sort((a, b) => (loadMap.get(a) || 0) - (loadMap.get(b) || 0))[0];
      loadMap.set(selected, (loadMap.get(selected) || 0) + 1);

      await runSql(
        `INSERT INTO delivery_assignments (order_id, delivery_user_id, assigned_at)
         VALUES ($1, $2, now())
         ON CONFLICT (order_id)
         DO UPDATE SET delivery_user_id = EXCLUDED.delivery_user_id, assigned_at = now(), updated_at = now();`,
        [order.order_id, selected],
      );
      await runSql(
        `UPDATE orders
         SET delivery_status = 'ASSIGNED', updated_at = now()
         WHERE id = $1;`,
        [order.order_id],
      );
      await runSql(
        `UPDATE billing_records
         SET delivery_status = 'ASSIGNED', updated_at = now()
         WHERE order_id = $1;`,
        [order.order_id],
      );
      assignedCount += 1;
    }

    return { ok: true, serviceDate, assignedCount, skippedOrderIds };
  }

  async autoAssignDeliveries(actor: AccessUser, dateRaw?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const serviceDate = dateRaw ? this.validateServiceDate(dateRaw) : new Date().toISOString().slice(0, 10);
    return this.autoAssignDeliveriesForDate(serviceDate);
  }

  async assignDelivery(actor: AccessUser, input: { orderIds?: string[]; deliveryUserId?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const orderIds = Array.isArray(input.orderIds) ? input.orderIds.filter(Boolean) : [];
    const deliveryUserId = (input.deliveryUserId || '').trim();
    if (!deliveryUserId || orderIds.length === 0) throw new BadRequestException('orderIds and deliveryUserId are required');
    for (const orderId of orderIds) {
      await runSql(
        `INSERT INTO delivery_assignments (order_id, delivery_user_id, assigned_at)
         VALUES ($1, $2, now())
         ON CONFLICT (order_id)
         DO UPDATE SET delivery_user_id = EXCLUDED.delivery_user_id, assigned_at = now(), updated_at = now();`,
        [orderId, deliveryUserId],
      );
      await runSql(
        `UPDATE orders
         SET delivery_status = 'ASSIGNED', updated_at = now()
         WHERE id = $1;`,
        [orderId],
      );
      await runSql(
        `UPDATE billing_records
         SET delivery_status = 'ASSIGNED', updated_at = now()
         WHERE order_id = $1;`,
        [orderId],
      );
    }
    return { ok: true, assignedCount: orderIds.length };
  }

  async getDeliveryAssignments(actor: AccessUser, dateRaw?: string) {
    if (!['DELIVERY', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const serviceDate = dateRaw ? this.validateServiceDate(dateRaw) : null;
    await this.autoAssignDeliveriesForDate(serviceDate || new Date().toISOString().slice(0, 10));
    const params: unknown[] = [];
    const roleFilter = actor.role === 'DELIVERY'
      ? (() => {
          params.push(actor.uid);
          const deliveryParamIdx = params.length;
          return `AND da.delivery_user_id = $${deliveryParamIdx}
                  AND EXISTS (
                    SELECT 1
                    FROM delivery_school_assignments dsa
                    WHERE dsa.delivery_user_id = $${deliveryParamIdx}
                      AND dsa.school_id = c.school_id
                      AND dsa.is_active = true
                  )`;
        })()
      : '';
    const dateFilter = serviceDate
      ? (() => {
          params.push(serviceDate);
          return `AND o.service_date = $${params.length}::date`;
        })()
      : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT da.id,
               da.order_id,
               da.delivery_user_id,
               da.assigned_at::text AS assigned_at,
               da.confirmed_at::text AS confirmed_at,
               da.confirmation_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.delivery_status::text AS delivery_status,
               o.total_price,
               s.name AS school_name,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               COALESCE(NULLIF(TRIM(uc.phone_number), ''), NULLIF(TRIM(up.phone_number), '')) AS youngster_mobile
        FROM delivery_assignments da
        JOIN orders o ON o.id = da.order_id
        JOIN children c ON c.id = o.child_id
        JOIN schools s ON s.id = c.school_id
        JOIN users uc ON uc.id = c.user_id
        LEFT JOIN users up ON up.id = o.placed_by_user_id
        WHERE 1=1
          ${roleFilter}
          ${dateFilter}
        ORDER BY o.service_date DESC, da.assigned_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines(out);
  }

  async confirmDelivery(actor: AccessUser, assignmentId: string, note?: string) {
    if (actor.role !== 'DELIVERY') throw new ForbiddenException('Role not allowed');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, order_id, delivery_user_id, confirmed_at
        FROM delivery_assignments
        WHERE id = $1
        LIMIT 1
      ) t;
    `,
      [assignmentId],
    );
    if (!out) throw new NotFoundException('Assignment not found');
    const assignment = this.parseJsonLine<{ id: string; order_id: string; delivery_user_id: string; confirmed_at?: string | null }>(out);
    if (assignment.delivery_user_id !== actor.uid) throw new ForbiddenException('DELIVERY_ASSIGNMENT_FORBIDDEN');
    if (assignment.confirmed_at) return { ok: true, alreadyConfirmed: true };

    await runSql(
      `UPDATE delivery_assignments
       SET confirmed_at = now(),
           confirmation_note = $1,
           updated_at = now()
       WHERE id = $2;`,
      [note ? note.trim().slice(0, 500) : null, assignment.id],
    );
    await runSql(
      `UPDATE orders
       SET delivery_status = 'DELIVERED',
           delivered_at = now(),
           delivered_by_user_id = $1,
           updated_at = now()
       WHERE id = $2;`,
      [actor.uid, assignment.order_id],
    );
    await runSql(
      `UPDATE billing_records
       SET delivery_status = 'DELIVERED',
           delivered_at = now(),
           updated_at = now()
       WHERE order_id = $1;`,
      [assignment.order_id],
    );
    return { ok: true };
  }

  async toggleDeliveryCompletion(actor: AccessUser, assignmentId: string, note?: string) {
    if (actor.role !== 'DELIVERY') throw new ForbiddenException('Role not allowed');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, order_id, delivery_user_id, confirmed_at
        FROM delivery_assignments
        WHERE id = $1
        LIMIT 1
      ) t;
    `,
      [assignmentId],
    );
    if (!out) throw new NotFoundException('Assignment not found');
    const assignment = this.parseJsonLine<{ id: string; order_id: string; delivery_user_id: string; confirmed_at?: string | null }>(out);
    if (assignment.delivery_user_id !== actor.uid) throw new ForbiddenException('DELIVERY_ASSIGNMENT_FORBIDDEN');

    if (!assignment.confirmed_at) {
      await runSql(
        `UPDATE delivery_assignments
         SET confirmed_at = now(),
             confirmation_note = $1,
             updated_at = now()
         WHERE id = $2;`,
        [note ? note.trim().slice(0, 500) : null, assignment.id],
      );
      await runSql(
        `UPDATE orders
         SET delivery_status = 'DELIVERED',
             delivered_at = now(),
             delivered_by_user_id = $1,
             updated_at = now()
         WHERE id = $2;`,
        [actor.uid, assignment.order_id],
      );
      await runSql(
        `UPDATE billing_records
         SET delivery_status = 'DELIVERED',
             delivered_at = now(),
             updated_at = now()
         WHERE order_id = $1;`,
        [assignment.order_id],
      );
      return { ok: true, completed: true };
    }

    await runSql(
      `UPDATE delivery_assignments
       SET confirmed_at = NULL,
           confirmation_note = NULL,
           updated_at = now()
       WHERE id = $1;`,
      [assignment.id],
    );
    await runSql(
      `UPDATE orders
       SET delivery_status = 'ASSIGNED',
           delivered_at = NULL,
           delivered_by_user_id = NULL,
           updated_at = now()
       WHERE id = $1;`,
      [assignment.order_id],
    );
    await runSql(
      `UPDATE billing_records
       SET delivery_status = 'ASSIGNED',
           delivered_at = NULL,
           updated_at = now()
       WHERE order_id = $1;`,
      [assignment.order_id],
    );
    return { ok: true, completed: false };
  }

  async updateOrder(
    actor: AccessUser,
    orderId: string,
    input: { serviceDate?: string; session?: string; items?: CartItemInput[] },
  ) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id, o.child_id, o.service_date::text AS service_date, o.session::text AS session,
               o.status::text AS status, o.total_price, o.dietary_snapshot
        FROM orders o
        WHERE o.id = $1
          AND o.deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [orderId],
    );
    if (!out) throw new NotFoundException('Order not found');
    const order = this.parseJsonLine<{
      id: string;
      child_id: string;
      service_date: string;
      session: SessionType;
      status: string;
      total_price: string | number;
      dietary_snapshot?: string | null;
    }>(out);

    if (actor.role === 'YOUNGSTER') {
      throw new ForbiddenException('ORDER_CHILD_UPDATE_FORBIDDEN');
    }

    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, order.child_id);
      if (this.isAfterOrAtMakassarCutoff(order.service_date)) {
        throw new BadRequestException('ORDER_CUTOFF_EXCEEDED');
      }
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    if (order.status !== 'PLACED') {
      throw new BadRequestException('Only PLACED orders can be updated');
    }

    const targetServiceDate = input.serviceDate ? this.validateServiceDate(input.serviceDate) : order.service_date;
    const targetSession = input.session ? this.normalizeSession(input.session) : order.session;
    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length === 0) throw new BadRequestException('items is required');
    if (items.length > 5) throw new BadRequestException('ORDER_ITEM_LIMIT_EXCEEDED');

    const normalized = items.map((item) => ({
      menuItemId: (item.menuItemId || '').trim(),
      quantity: Number(item.quantity || 0),
    }));
    for (const item of normalized) {
      if (!item.menuItemId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('Invalid order item');
      }
    }

    await this.validateOrderDayRules(targetServiceDate);
    await this.assertSessionActiveForOrdering(targetSession);

    const ids = [...new Set(normalized.map((item) => item.menuItemId))];
    if (ids.length !== normalized.length) {
      throw new BadRequestException('Duplicate menu items are not allowed');
    }
    const idPh = ids.map((_, i) => `$${i + 1}`).join(', ');
    const validOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id, mi.name, mi.price
        FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        WHERE mi.id IN (${idPh})
          AND mi.is_available = true
          AND mi.deleted_at IS NULL
          AND m.is_published = true
          AND m.deleted_at IS NULL
          AND m.service_date = $${ids.length + 1}::date
          AND m.session = $${ids.length + 2}::session_type
      ) t;
    `,
      [...ids, targetServiceDate, targetSession],
    );
    const validRows = this.parseJsonLines<{ id: string; name: string; price: string | number }>(validOut);
    if (validRows.length !== ids.length) {
      throw new BadRequestException('ORDER_MENU_UNAVAILABLE');
    }
    const byId = new Map(validRows.map((row) => [row.id, row]));

    const totalPrice = normalized.reduce((sum, item) => {
      const price = Number(byId.get(item.menuItemId)?.price || 0);
      return sum + price * item.quantity;
    }, 0);

    const dietaryOut = await runSql(
      `SELECT coalesce(string_agg(cdr.restriction_label || ': ' || coalesce(cdr.restriction_details, ''), '; '), '')
       FROM child_dietary_restrictions cdr
       WHERE cdr.child_id = $1
         AND cdr.is_active = true
         AND cdr.deleted_at IS NULL;`,
      [order.child_id],
    );
    const dietarySnapshot = dietaryOut || '';

    await runSql(
      `UPDATE orders
       SET service_date = $1::date,
           session = $2::session_type,
           total_price = $3,
           dietary_snapshot = $4,
           updated_at = now()
       WHERE id = $5;`,
      [targetServiceDate, targetSession, Number(totalPrice.toFixed(2)), dietarySnapshot || null, order.id],
    );

    await runSql(`DELETE FROM order_items WHERE order_id = $1;`, [order.id]);
    for (const item of normalized) {
      const row = byId.get(item.menuItemId);
      await runSql(
        `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, price_snapshot, quantity)
         VALUES ($1, $2, $3, $4, $5);`,
        [order.id, item.menuItemId, row?.name || '', Number(Number(row?.price || 0).toFixed(2)), item.quantity],
      );
    }

    await runSql(
      `INSERT INTO order_mutations (order_id, action, actor_user_id, before_json, after_json)
       VALUES ($1, 'ORDER_UPDATED', $2, $3::jsonb, $4::jsonb);`,
      [
        order.id,
        actor.uid,
        JSON.stringify({
          serviceDate: order.service_date,
          session: order.session,
          totalPrice: Number(order.total_price),
        }),
        JSON.stringify({
          serviceDate: targetServiceDate,
          session: targetSession,
          totalPrice,
          itemCount: normalized.length,
        }),
      ],
    );

    return {
      id: order.id,
      service_date: targetServiceDate,
      session: targetSession,
      total_price: totalPrice,
      items: normalized.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        item_name_snapshot: byId.get(item.menuItemId)?.name || '',
        price_snapshot: Number(byId.get(item.menuItemId)?.price || 0),
      })),
    };
  }

  async deleteOrder(actor: AccessUser, orderId: string) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id, o.child_id, o.service_date::text AS service_date, o.status::text AS status
        FROM orders o
        WHERE o.id = $1
          AND o.deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [orderId],
    );
    if (!out) throw new NotFoundException('Order not found');
    const order = this.parseJsonLine<{ id: string; child_id: string; service_date: string; status: string }>(out);

    if (actor.role === 'YOUNGSTER') {
      throw new ForbiddenException('ORDER_CHILD_UPDATE_FORBIDDEN');
    }

    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, order.child_id);
      if (this.isAfterOrAtMakassarCutoff(order.service_date)) {
        throw new BadRequestException('ORDER_CUTOFF_EXCEEDED');
      }
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    await runSql(
      `UPDATE orders
       SET status = 'CANCELLED', deleted_at = now(), updated_at = now()
       WHERE id = $1;`,
      [order.id],
    );

    await runSql(
      `INSERT INTO order_mutations (order_id, action, actor_user_id, before_json, after_json)
       VALUES ($1, 'ORDER_CANCELLED', $2, $3::jsonb, $4::jsonb);`,
      [order.id, actor.uid, JSON.stringify({ status: order.status }), JSON.stringify({ status: 'CANCELLED' })],
    );

    return { ok: true };
  }

  async getAdminRevenueDashboard(input: {
    fromDateRaw?: string;
    toDateRaw?: string;
    day?: string;
    month?: string;
    year?: string;
    schoolId?: string;
    deliveryUserId?: string;
    parentId?: string;
    session?: string;
    dish?: string;
    orderStatus?: string;
    billingStatus?: string;
  }) {
    const toDate = input.toDateRaw ? this.validateServiceDate(input.toDateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const fromDate = input.fromDateRaw ? this.validateServiceDate(input.fromDateRaw) : await runSql(`SELECT ($1::date - INTERVAL '30 day')::date::text;`, [toDate]);

    const day = (input.day || 'ALL').toUpperCase() === 'ALL' ? '' : (input.day || '').trim();
    const month = (input.month || 'ALL').toUpperCase() === 'ALL' ? '' : (input.month || '').trim();
    const year = (input.year || 'ALL').toUpperCase() === 'ALL' ? '' : (input.year || '').trim();
    const schoolId = (input.schoolId || 'ALL').toUpperCase() === 'ALL' ? '' : (input.schoolId || '').trim();
    const deliveryUserId = (input.deliveryUserId || 'ALL').toUpperCase() === 'ALL' ? '' : (input.deliveryUserId || '').trim();
    const parentId = (input.parentId || 'ALL').toUpperCase() === 'ALL' ? '' : (input.parentId || '').trim();
    const session = (input.session || 'ALL').toUpperCase() === 'ALL' ? '' : this.normalizeSession(input.session);
    const dish = (input.dish || 'ALL').toUpperCase() === 'ALL' ? '' : (input.dish || '').trim();
    const orderStatus = (input.orderStatus || 'ALL').toUpperCase() === 'ALL' ? '' : (input.orderStatus || '').trim().toUpperCase();
    const billingStatus = (input.billingStatus || 'ALL').toUpperCase() === 'ALL' ? '' : (input.billingStatus || '').trim().toUpperCase();

    const params: unknown[] = [fromDate, toDate];
    const where: string[] = [
      `o.service_date BETWEEN $1::date AND $2::date`,
      `o.deleted_at IS NULL`,
      `o.status <> 'CANCELLED'`,
    ];
    if (day) {
      params.push(Number(day));
      where.push(`EXTRACT(DAY FROM o.service_date)::int = $${params.length}`);
    }
    if (month) {
      params.push(Number(month));
      where.push(`EXTRACT(MONTH FROM o.service_date)::int = $${params.length}`);
    }
    if (year) {
      params.push(Number(year));
      where.push(`EXTRACT(YEAR FROM o.service_date)::int = $${params.length}`);
    }
    if (schoolId) {
      this.assertValidUuid(schoolId, 'schoolId');
      params.push(schoolId);
      where.push(`s.id = $${params.length}`);
    }
    if (deliveryUserId) {
      this.assertValidUuid(deliveryUserId, 'deliveryUserId');
      params.push(deliveryUserId);
      where.push(`da.delivery_user_id = $${params.length}`);
    }
    if (parentId) {
      this.assertValidUuid(parentId, 'parentId');
      params.push(parentId);
      where.push(`p.id = $${params.length}`);
    }
    if (session) {
      params.push(session);
      where.push(`o.session = $${params.length}::session_type`);
    }
    if (dish) {
      params.push(`%${dish}%`);
      where.push(`EXISTS (
        SELECT 1
        FROM order_items oi2
        WHERE oi2.order_id = o.id
          AND oi2.item_name_snapshot ILIKE $${params.length}
      )`);
    }
    if (orderStatus) {
      params.push(orderStatus);
      where.push(`o.status::text = $${params.length}`);
    }
    if (billingStatus) {
      params.push(billingStatus);
      where.push(`COALESCE(br.status::text, 'UNPAID') = $${params.length}`);
    }
    const whereSql = where.join(' AND ');

    const totalsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT COUNT(DISTINCT o.id)::int AS total_orders,
               COALESCE(SUM(o.total_price), 0)::numeric AS total_revenue
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN delivery_assignments da ON da.order_id = o.id
        LEFT JOIN parent_children pc ON pc.child_id = c.id
        LEFT JOIN parents p ON p.id = pc.parent_id
        LEFT JOIN billing_records br ON br.order_id = o.id
        WHERE ${whereSql}
      ) t;
    `,
      params,
    );
    const totals = this.parseJsonLine<{ total_orders: number; total_revenue: string | number }>(
      totalsOut || '{"total_orders":0,"total_revenue":0}',
    );

    const bySchoolOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT s.id AS school_id,
               s.name AS school_name,
               COUNT(DISTINCT o.id)::int AS orders_count,
               COALESCE(SUM(o.total_price), 0)::numeric AS total_revenue
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN delivery_assignments da ON da.order_id = o.id
        LEFT JOIN parent_children pc ON pc.child_id = c.id
        LEFT JOIN parents p ON p.id = pc.parent_id
        LEFT JOIN billing_records br ON br.order_id = o.id
        WHERE ${whereSql}
        GROUP BY s.id, s.name
        ORDER BY total_revenue DESC, school_name ASC
      ) t;
    `,
      params,
    );
    const bySessionOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.session::text AS session,
               COUNT(DISTINCT o.id)::int AS orders_count,
               COALESCE(SUM(o.total_price), 0)::numeric AS total_revenue
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN delivery_assignments da ON da.order_id = o.id
        LEFT JOIN parent_children pc ON pc.child_id = c.id
        LEFT JOIN parents p ON p.id = pc.parent_id
        LEFT JOIN billing_records br ON br.order_id = o.id
        WHERE ${whereSql}
        GROUP BY o.session
        ORDER BY o.session ASC
      ) t;
    `,
      params,
    );

    const filterSchoolsOut = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, name
        FROM schools
        WHERE deleted_at IS NULL
        ORDER BY name ASC
      ) t;
    `);
    const filterDeliveryOut = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT id AS user_id, (first_name || ' ' || last_name) AS name
        FROM users
        WHERE role = 'DELIVERY'
          AND deleted_at IS NULL
        ORDER BY first_name ASC, last_name ASC
      ) t;
    `);
    const filterParentsOut = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT p.id AS parent_id, (u.first_name || ' ' || u.last_name) AS name
        FROM parents p
        JOIN users u ON u.id = p.user_id
        WHERE p.deleted_at IS NULL
          AND u.deleted_at IS NULL
        ORDER BY u.first_name ASC, u.last_name ASC
      ) t;
    `);
    const filterDishesOut = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT DISTINCT oi.item_name_snapshot AS dish_name
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.deleted_at IS NULL
          AND o.status <> 'CANCELLED'
        ORDER BY oi.item_name_snapshot ASC
      ) t;
    `);

    return {
      fromDate,
      toDate,
      totalOrders: Number(totals.total_orders || 0),
      totalRevenue: Number(totals.total_revenue || 0),
      bySchool: this.parseJsonLines<Record<string, unknown> & { total_revenue?: number | string }>(bySchoolOut).map((r) => ({
        ...r,
        total_revenue: Number(r.total_revenue || 0),
      })),
      bySession: this.parseJsonLines<Record<string, unknown> & { total_revenue?: number | string }>(bySessionOut).map((r) => ({
        ...r,
        total_revenue: Number(r.total_revenue || 0),
      })),
      filters: {
        schools: this.parseJsonLines(filterSchoolsOut),
        deliveryUsers: this.parseJsonLines(filterDeliveryOut),
        parents: this.parseJsonLines(filterParentsOut),
        sessions: ['ALL', 'BREAKFAST', 'SNACK', 'LUNCH'],
        orderStatuses: ['ALL', 'PLACED', 'LOCKED', 'CANCELLED'],
        billingStatuses: ['ALL', 'UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'],
        dishes: this.parseJsonLines(filterDishesOut),
      },
    };
  }

  async getAdminPrintReport(dateRaw?: string) {
    const date = dateRaw ? this.validateServiceDate(dateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id AS order_id,
               o.session::text AS session,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               COALESCE((up.first_name || ' ' || up.last_name), '-') AS parent_name,
               s.name AS school_name,
               o.total_price,
               o.status::text AS order_status,
               o.delivery_status::text AS delivery_status,
               br.status::text AS billing_status
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN parent_children pc ON pc.child_id = c.id
        LEFT JOIN parents p ON p.id = pc.parent_id
        LEFT JOIN users up ON up.id = p.user_id
        LEFT JOIN billing_records br ON br.order_id = o.id
        WHERE o.service_date = $1::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        ORDER BY o.session ASC, school_name ASC, child_name ASC
      ) t;
    `,
      [date],
    );
    const rows = this.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((r) => ({
      ...r,
      total_price: Number(r.total_price || 0),
    }));
    const totals = {
      date,
      orders: rows.length,
      revenue: rows.reduce((sum, row) => sum + Number(row.total_price || 0), 0),
    };
    return { totals, rows };
  }

  async getParentSpendingDashboard(actor: AccessUser, monthRaw?: string) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : await runSql(`SELECT to_char((now() AT TIME ZONE 'Asia/Makassar')::date, 'YYYY-MM');`);
    const monthStart = `${month}-01`;
    const monthEnd = await runSql(`SELECT ($1::date + INTERVAL '1 month - 1 day')::date::text;`, [monthStart]);

    const byChildOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id AS child_id,
               (u.first_name || ' ' || u.last_name) AS child_name,
               COUNT(o.id)::int AS orders_count,
               COALESCE(SUM(o.total_price), 0)::numeric AS total_spend
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        JOIN parent_children pc ON pc.child_id = c.id
        WHERE pc.parent_id = $1
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        GROUP BY c.id, u.first_name, u.last_name
        ORDER BY total_spend DESC, child_name ASC
      ) t;
    `,
      [parentId, monthStart, monthEnd],
    );
    const totalMonthSpend = Number(await runSql(
      `
      SELECT COALESCE(SUM(o.total_price), 0)::numeric
      FROM orders o
      JOIN parent_children pc ON pc.child_id = o.child_id
      WHERE pc.parent_id = $1
        AND o.service_date BETWEEN $2::date AND $3::date
        AND o.status <> 'CANCELLED'
        AND o.deleted_at IS NULL;
    `,
      [parentId, monthStart, monthEnd],
    ) || 0);

    const birthdayOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id AS child_id,
               (u.first_name || ' ' || u.last_name) AS child_name,
               c.date_of_birth::text AS date_of_birth
        FROM children c
        JOIN users u ON u.id = c.user_id
        JOIN parent_children pc ON pc.child_id = c.id
        WHERE pc.parent_id = $1
          AND c.is_active = true
          AND c.deleted_at IS NULL
        ORDER BY u.first_name, u.last_name
      ) t;
    `,
      [parentId],
    );
    const today = new Date();
    const birthdayHighlights = this.parseJsonLines<{ child_id: string; child_name: string; date_of_birth: string }>(birthdayOut).map((row) => {
      const dob = new Date(row.date_of_birth);
      const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      return { ...row, days_until: daysUntil };
    }).filter((x) => x.days_until <= 30).sort((a, b) => a.days_until - b.days_until);

    return {
      month,
      totalMonthSpend,
      byChild: this.parseJsonLines<Record<string, unknown> & { total_spend?: string | number }>(byChildOut).map((r) => ({
        ...r,
        total_spend: Number(r.total_spend || 0),
      })),
      birthdayHighlights,
    };
  }

  async getYoungsterInsights(actor: AccessUser, dateRaw?: string) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    const childId = await this.getChildIdByUserId(actor.uid);
    if (!childId) throw new NotFoundException('Youngster profile not found');
    const refDate = dateRaw ? this.validateServiceDate(dateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const weekStart = await runSql(
      `SELECT ($1::date - ((extract(isodow FROM $1::date)::int - 1) * INTERVAL '1 day'))::date::text;`,
      [refDate],
    );
    const weekEnd = await runSql(`SELECT ($1::date + INTERVAL '6 day')::date::text;`, [weekStart]);

    const nutritionOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.service_date::text AS service_date,
               COALESCE(SUM(oi.quantity * COALESCE(mi.calories_kcal, 0)), 0)::int AS calories_total,
               COUNT(*) FILTER (WHERE mi.calories_kcal IS NULL)::int AS tba_items
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE o.child_id = $1
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        GROUP BY o.service_date
        ORDER BY o.service_date ASC
      ) t;
    `,
      [childId, weekStart, weekEnd],
    );
    const nutritionRows = this.parseJsonLines<{ service_date: string; calories_total: number; tba_items: number }>(nutritionOut);
    const byDate = new Map(nutritionRows.map((r) => [r.service_date, r]));
    const days: Array<{ service_date: string; calories_display: string; tba_items: number }> = [];
    for (let i = 0; i < 7; i += 1) {
      const d = await runSql(`SELECT ($1::date + ($2::text || ' day')::interval)::date::text;`, [weekStart, i]);
      const row = byDate.get(d);
      days.push({
        service_date: d,
        calories_display: row ? `${Number(row.calories_total || 0)} kcal` : 'TBA',
        tba_items: row ? Number(row.tba_items || 0) : 0,
      });
    }
    const weekCalories = nutritionRows.reduce((sum, r) => sum + Number(r.calories_total || 0), 0);

    const orderDatesOut = await runSql(
      `
      SELECT to_char(o.service_date, 'YYYY-MM-DD')
      FROM orders o
      WHERE o.child_id = $1
        AND o.service_date >= ($2::date - INTERVAL '70 day')
        AND o.status <> 'CANCELLED'
        AND o.deleted_at IS NULL
      GROUP BY o.service_date
      ORDER BY o.service_date ASC;
    `,
      [childId, refDate],
    );
    const orderDates = orderDatesOut ? orderDatesOut.split('\n').map((x) => x.trim()).filter(Boolean) : [];
    let maxStreak = 0;
    let currentStreak = 0;
    let prev: Date | null = null;
    for (const raw of orderDates) {
      const now = new Date(`${raw}T00:00:00.000Z`);
      if (!prev) currentStreak = 1;
      else {
        const diff = Math.round((now.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
        currentStreak = diff === 1 ? currentStreak + 1 : 1;
      }
      if (currentStreak > maxStreak) maxStreak = currentStreak;
      prev = now;
    }
    const currentMonth = refDate.slice(0, 7);
    const previousMonth = await runSql(`SELECT to_char(($1::date - INTERVAL '1 month')::date, 'YYYY-MM');`, [refDate]);
    const monthRowsOut = await runSql(
      `
      SELECT to_char(service_date, 'YYYY-MM-DD')
      FROM orders
      WHERE child_id = $1
        AND to_char(service_date, 'YYYY-MM') IN ($2, $3)
        AND status <> 'CANCELLED'
        AND deleted_at IS NULL
      GROUP BY service_date
      ORDER BY service_date ASC;
    `,
      [childId, currentMonth, previousMonth],
    );
    const monthDates = monthRowsOut ? monthRowsOut.split('\n').map((x) => x.trim()).filter(Boolean) : [];
    const isoWeek = (d: string) => {
      const dt = new Date(`${d}T00:00:00.000Z`);
      const day = dt.getUTCDay() || 7;
      dt.setUTCDate(dt.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
      return Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };
    const buildMonthStats = (month: string) => {
      const inMonth = monthDates.filter((d) => d.startsWith(month));
      const weeks = [...new Set(inMonth.map((d) => isoWeek(d)))].sort((a, b) => a - b);
      let longest = 0;
      let current = 0;
      let prevWeek: number | null = null;
      for (const wk of weeks) {
        current = prevWeek !== null && wk === prevWeek + 1 ? current + 1 : 1;
        if (current > longest) longest = current;
        prevWeek = wk;
      }
      return { orders: inMonth.length, consecutiveWeeks: longest };
    };
    const cm = buildMonthStats(currentMonth);
    const pm = buildMonthStats(previousMonth);
    const isSilver = cm.orders >= 10 && cm.consecutiveWeeks >= 2;
    const isGold = cm.orders >= 20 && cm.consecutiveWeeks >= 2;
    const prevIsSilverOrGold = (pm.orders >= 10 && pm.consecutiveWeeks >= 2) || (pm.orders >= 20 && pm.consecutiveWeeks >= 2);
    const isPlatinum = prevIsSilverOrGold && (isSilver || isGold);
    const isBronze = maxStreak >= 5;
    const badge = isPlatinum ? 'PLATINUM' : isGold ? 'GOLD' : isSilver ? 'SILVER' : isBronze ? 'BRONZE' : 'NONE';

    const me = await this.getYoungsterMe(actor);
    const dob = new Date(me.date_of_birth);
    const today = new Date(refDate);
    const next = new Date(today.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate());
    if (next < today) next.setUTCFullYear(today.getUTCFullYear() + 1);
    const birthdayDaysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    const weekOrderSummaryOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT COUNT(DISTINCT o.id)::int AS total_orders,
               COALESCE(SUM(oi.quantity), 0)::int AS total_dishes
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.child_id = $1
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
      ) t;
    `,
      [childId, weekStart, weekEnd],
    );
    const weekOrderSummary = this.parseJsonLine<{ total_orders: number; total_dishes: number }>(
      weekOrderSummaryOut || '{"total_orders":0,"total_dishes":0}',
    );

    return {
      week: {
        start: weekStart,
        end: weekEnd,
        totalCalories: weekCalories,
        totalOrders: Number(weekOrderSummary.total_orders || 0),
        totalDishes: Number(weekOrderSummary.total_dishes || 0),
        days,
      },
      badge: {
        level: badge,
        maxConsecutiveOrderDays: maxStreak,
        maxConsecutiveOrderWeeks: Math.max(Number(cm.consecutiveWeeks || 0), Number(pm.consecutiveWeeks || 0)),
        currentMonthOrders: cm.orders,
      },
      birthdayHighlight: { date_of_birth: me.date_of_birth, days_until: birthdayDaysUntil },
    };
  }

  async getKitchenDailySummary(actor: AccessUser, dateRaw?: string) {
    if (!['KITCHEN', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const serviceDate = dateRaw ? this.validateServiceDate(dateRaw) : new Date().toISOString().slice(0, 10);

    const totalsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT COUNT(*)::int AS total_orders,
               COALESCE(SUM(oi.quantity), 0)::int AS total_dishes,
               COUNT(*) FILTER (WHERE o.session = 'BREAKFAST')::int AS breakfast_orders,
               COUNT(*) FILTER (WHERE o.session = 'SNACK')::int AS snack_orders,
               COUNT(*) FILTER (WHERE o.session = 'LUNCH')::int AS lunch_orders
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.service_date = $1::date
          AND o.status IN ('PLACED', 'LOCKED')
      ) t;
    `,
      [serviceDate],
    );
    const totals = this.parseJsonLine<{
      total_orders: number;
      total_dishes: number;
      breakfast_orders: number;
      snack_orders: number;
      lunch_orders: number;
    }>(totalsOut || '{"total_orders":0,"total_dishes":0,"breakfast_orders":0,"snack_orders":0,"lunch_orders":0}');

    const ordersOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.status::text AS status,
               o.delivery_status::text AS delivery_status,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               COALESCE((up.first_name || ' ' || up.last_name), '-') AS parent_name,
               COALESCE((
                 SELECT SUM(oi2.quantity)::int
                 FROM order_items oi2
                 WHERE oi2.order_id = o.id
               ), 0) AS dish_count,
               COALESCE((
                 SELECT bool_or(i2.allergen_flag)
                 FROM order_items oi2
                 JOIN menu_item_ingredients mii2 ON mii2.menu_item_id = oi2.menu_item_id
                 JOIN ingredients i2 ON i2.id = mii2.ingredient_id AND i2.deleted_at IS NULL
                 WHERE oi2.order_id = o.id
               ), false) AS has_allergen,
               COALESCE((
                 SELECT string_agg(DISTINCT i2.name, ', ')
                 FROM order_items oi2
                 JOIN menu_item_ingredients mii2 ON mii2.menu_item_id = oi2.menu_item_id
                 JOIN ingredients i2 ON i2.id = mii2.ingredient_id AND i2.deleted_at IS NULL
                 WHERE oi2.order_id = o.id
                   AND i2.allergen_flag = true
               ), '') AS allergen_items,
               COALESCE((
                 SELECT json_agg(row_to_json(d) ORDER BY d.item_name)
                 FROM (
                   SELECT oi2.menu_item_id,
                          oi2.item_name_snapshot AS item_name,
                          SUM(oi2.quantity)::int AS quantity
                   FROM order_items oi2
                   WHERE oi2.order_id = o.id
                   GROUP BY oi2.menu_item_id, oi2.item_name_snapshot
                 ) d
               ), '[]'::json) AS dishes
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        LEFT JOIN parent_children pc ON pc.child_id = c.id
        LEFT JOIN parents p ON p.id = pc.parent_id
        LEFT JOIN users up ON up.id = p.user_id
        WHERE o.service_date = $1::date
          AND o.status IN ('PLACED', 'LOCKED')
        GROUP BY o.id, uc.first_name, uc.last_name, up.first_name, up.last_name
        ORDER BY o.session ASC, child_name ASC
      ) t;
    `,
      [serviceDate],
    );
    const orders = this.parseJsonLines<{
      id: string;
      service_date: string;
      session: string;
      status: string;
      delivery_status: string;
      child_name: string;
      parent_name: string;
      dish_count: number;
      has_allergen: boolean;
      allergen_items: string;
      dishes: Array<{ menu_item_id: string; item_name: string; quantity: number }>;
    }>(ordersOut);

    const dishSummaryOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.item_name_snapshot AS name,
               SUM(oi.quantity)::int AS quantity
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.service_date = $1::date
          AND o.status IN ('PLACED', 'LOCKED')
        GROUP BY oi.item_name_snapshot
        ORDER BY quantity DESC, name ASC
      ) t;
    `,
      [serviceDate],
    );
    const dishSummary = this.parseJsonLines<{ name: string; quantity: number }>(dishSummaryOut);

    return {
      serviceDate,
      totals: {
        totalOrders: Number(totals.total_orders || 0),
        totalDishes: Number(totals.total_dishes || 0),
        breakfastOrders: Number(totals.breakfast_orders || 0),
        snackOrders: Number(totals.snack_orders || 0),
        lunchOrders: Number(totals.lunch_orders || 0),
      },
      dishSummary,
      allergenAlerts: orders.filter((o) => o.has_allergen),
      orders,
    };
  }

  // ─── Missing CRUD: Schools ───────────────────────────────────────────────

  async createSchool(actor: AccessUser, input: { name?: string; address?: string; city?: string; contactEmail?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const name = (input.name || '').trim();
    if (!name) throw new BadRequestException('name is required');
    const address = (input.address || '').trim();
    const city = (input.city || '').trim();
    const contactEmail = (input.contactEmail || '').trim().toLowerCase();
    const out = await runSql(
      `
      WITH inserted AS (
        INSERT INTO schools (name, address, city, contact_email, is_active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING id, name, city, address, is_active
      )
      SELECT row_to_json(inserted)::text FROM inserted;
    `,
      [name, address || null, city || null, contactEmail || null],
    );
    if (!out) throw new BadRequestException('Failed to create school');
    return this.parseJsonLine(out);
  }

  async deleteSchool(actor: AccessUser, schoolId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(schoolId, 'schoolId');
    const active = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM children c
         JOIN orders o ON o.child_id = c.id
         WHERE c.school_id = $1
           AND o.status = 'PLACED'
           AND o.deleted_at IS NULL
       );`,
      [schoolId],
    );
    if (active === 't') throw new BadRequestException('Cannot delete school with active orders');
    const out = await runSql(
      `UPDATE schools SET deleted_at = now(), updated_at = now(), is_active = false
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id;`,
      [schoolId],
    );
    if (!out) throw new NotFoundException('School not found');
    return { ok: true };
  }

  // ─── Missing CRUD: Parent ────────────────────────────────────────────────

  async updateParentProfile(actor: AccessUser, targetParentId: string, input: { firstName?: string; lastName?: string; phoneNumber?: string; email?: string; address?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(targetParentId, 'parentId');
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT p.id, p.user_id FROM parents p
         WHERE p.id = $1 AND p.deleted_at IS NULL
       ) t;`,
      [targetParentId],
    );
    if (!out) throw new NotFoundException('Parent not found');
    const parent = this.parseJsonLine<{ id: string; user_id: string }>(out);
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.firstName) { params.push(input.firstName.trim()); updates.push(`first_name = $${params.length}`); }
    if (input.lastName) { params.push(input.lastName.trim()); updates.push(`last_name = $${params.length}`); }
    if (input.phoneNumber) { params.push(input.phoneNumber.trim()); updates.push(`phone_number = $${params.length}`); }
    if (input.email) { params.push(input.email.trim().toLowerCase()); updates.push(`email = $${params.length}`); }
    if (updates.length > 0) {
      updates.push('updated_at = now()');
      params.push(parent.user_id);
      await runSql(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length};`, params);
    }
    if (input.address) {
      await runSql(`UPDATE parents SET address = $1, updated_at = now() WHERE id = $2;`, [input.address.trim(), targetParentId]);
    }
    return { ok: true };
  }

  async deleteParent(actor: AccessUser, targetParentId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(targetParentId, 'parentId');
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT p.id, p.user_id FROM parents p
         WHERE p.id = $1 AND p.deleted_at IS NULL
       ) t;`,
      [targetParentId],
    );
    if (!out) throw new NotFoundException('Parent not found');
    const parent = this.parseJsonLine<{ id: string; user_id: string }>(out);
    await runSql(`UPDATE parents SET deleted_at = now(), updated_at = now() WHERE id = $1;`, [targetParentId]);
    await runSql(`UPDATE users SET is_active = false, deleted_at = now(), updated_at = now() WHERE id = $1;`, [parent.user_id]);
    return { ok: true };
  }

  // ─── Missing CRUD: Youngster ─────────────────────────────────────────────

  async updateYoungsterProfile(
    actor: AccessUser,
    youngsterId: string,
    input: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      email?: string;
      dateOfBirth?: string;
      schoolGrade?: string;
      schoolId?: string;
      gender?: string;
      parentId?: string;
      allergies?: string;
    },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(youngsterId, 'youngsterId');
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT c.id, c.user_id FROM children c
         WHERE c.id = $1 AND c.deleted_at IS NULL
       ) t;`,
      [youngsterId],
    );
    if (!out) throw new NotFoundException('Youngster not found');
    const child = this.parseJsonLine<{ id: string; user_id: string }>(out);
    const userUpdates: string[] = [];
    const userParams: unknown[] = [];
    if (input.firstName) { userParams.push(input.firstName.trim()); userUpdates.push(`first_name = $${userParams.length}`); }
    if (input.lastName) { userParams.push(input.lastName.trim()); userUpdates.push(`last_name = $${userParams.length}`); }
    if (input.phoneNumber) { userParams.push(input.phoneNumber.trim()); userUpdates.push(`phone_number = $${userParams.length}`); }
    if (input.email !== undefined) { userParams.push(input.email.trim().toLowerCase() || null); userUpdates.push(`email = $${userParams.length}`); }
    if (userUpdates.length > 0) {
      userUpdates.push('updated_at = now()');
      userParams.push(child.user_id);
      await runSql(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = $${userParams.length};`, userParams);
    }
    const childUpdates: string[] = [];
    const childParams: unknown[] = [];
    if (input.schoolGrade) { childParams.push(input.schoolGrade.trim()); childUpdates.push(`school_grade = $${childParams.length}`); }
    if (input.schoolId) { this.assertValidUuid(input.schoolId, 'schoolId'); childParams.push(input.schoolId); childUpdates.push(`school_id = $${childParams.length}`); }
    if (input.gender) { childParams.push(input.gender.toUpperCase()); childUpdates.push(`gender = $${childParams.length}::gender_type`); }
    if (input.dateOfBirth) { childParams.push(this.validateServiceDate(input.dateOfBirth)); childUpdates.push(`date_of_birth = $${childParams.length}::date`); }
    if (childUpdates.length > 0) {
      childUpdates.push('updated_at = now()');
      childParams.push(youngsterId);
      await runSql(`UPDATE children SET ${childUpdates.join(', ')} WHERE id = $${childParams.length};`, childParams);
    }
    if (input.parentId) {
      this.assertValidUuid(input.parentId, 'parentId');
      await runSql(
        `INSERT INTO parent_children (parent_id, child_id)
         VALUES ($1, $2)
         ON CONFLICT (parent_id, child_id) DO NOTHING;`,
        [input.parentId, youngsterId],
      );
    }
    if (input.allergies !== undefined) {
      const details = input.allergies.trim();
      if (!details) {
        await runSql(
          `UPDATE child_dietary_restrictions
           SET is_active = false,
               deleted_at = now(),
               updated_at = now()
           WHERE child_id = $1
             AND upper(restriction_label) = 'ALLERGIES'
             AND deleted_at IS NULL;`,
          [youngsterId],
        );
      } else {
        await runSql(
          `INSERT INTO child_dietary_restrictions (child_id, restriction_label, restriction_details, is_active)
           VALUES ($1, 'ALLERGIES', $2, true)
           ON CONFLICT (child_id, restriction_label)
           DO UPDATE SET restriction_details = EXCLUDED.restriction_details,
                         is_active = true,
                         deleted_at = NULL,
                         updated_at = now();`,
          [youngsterId, details],
        );
      }
    }
    return { ok: true };
  }

  async deleteYoungster(actor: AccessUser, youngsterId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(youngsterId, 'youngsterId');
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT c.id, c.user_id FROM children c
         WHERE c.id = $1 AND c.deleted_at IS NULL
       ) t;`,
      [youngsterId],
    );
    if (!out) throw new NotFoundException('Youngster not found');
    const child = this.parseJsonLine<{ id: string; user_id: string }>(out);
    await runSql(`UPDATE children SET deleted_at = now(), is_active = false, updated_at = now() WHERE id = $1;`, [youngsterId]);
    await runSql(`UPDATE users SET is_active = false, deleted_at = now(), updated_at = now() WHERE id = $1;`, [child.user_id]);
    return { ok: true };
  }

  async adminResetUserPassword(actor: AccessUser, userId: string, newPasswordRaw?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(userId, 'userId');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, username, role::text AS role
        FROM users
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [userId],
    );
    if (!out) throw new NotFoundException('User not found');
    const target = this.parseJsonLine<{ id: string; username: string; role: string }>(out);
    if (!['PARENT', 'YOUNGSTER'].includes(target.role)) {
      throw new BadRequestException('Only PARENT and YOUNGSTER password reset is allowed here');
    }
    const newPassword = (newPasswordRaw || '').trim() || randomUUID().slice(0, 10);
    if (newPassword.length < 6) throw new BadRequestException('Password too short');
    const passwordHash = this.hashPassword(newPassword);
    await runSql(
      `UPDATE users
       SET password_hash = $1,
           updated_at = now()
       WHERE id = $2;`,
      [passwordHash, userId],
    );
    return { ok: true, userId, username: target.username, role: target.role, newPassword };
  }

  // ─── Missing CRUD: Ingredients ───────────────────────────────────────────

  async createIngredient(actor: AccessUser, input: { name?: string; allergenFlag?: boolean }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const name = (input.name || '').trim();
    if (!name) throw new BadRequestException('name is required');
    const allergenFlag = input.allergenFlag === true;
    const existingOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, name, allergen_flag, is_active
         FROM ingredients
         WHERE lower(name) = lower($1)
         LIMIT 1
       ) t;`,
      [name],
    );
    if (existingOut) {
      const existing = this.parseJsonLine<{ id: string; allergen_flag: boolean }>(existingOut);
      const updateOut = await runSql(
        `WITH updated AS (
           UPDATE ingredients
           SET name = $1,
               allergen_flag = ($2 OR allergen_flag),
               is_active = true,
               deleted_at = NULL,
               updated_at = now()
           WHERE id = $3
           RETURNING id, name, allergen_flag, is_active
         )
         SELECT row_to_json(updated)::text FROM updated;`,
        [name, allergenFlag, existing.id],
      );
      if (!updateOut) throw new BadRequestException('Failed to update ingredient');
      return this.parseJsonLine(updateOut);
    }
    const insertOut = await runSql(
      `WITH inserted AS (
         INSERT INTO ingredients (name, allergen_flag, is_active)
         VALUES ($1, $2, true)
         RETURNING id, name, allergen_flag, is_active
       )
       SELECT row_to_json(inserted)::text FROM inserted;`,
      [name, allergenFlag],
    );
    if (!insertOut) throw new BadRequestException('Failed to create ingredient');
    return this.parseJsonLine(insertOut);
  }

  async updateIngredient(actor: AccessUser, ingredientId: string, input: { name?: string; allergenFlag?: boolean; isActive?: boolean }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(ingredientId, 'ingredientId');
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.name) { params.push(input.name.trim()); updates.push(`name = $${params.length}`); }
    if (typeof input.allergenFlag === 'boolean') { params.push(input.allergenFlag); updates.push(`allergen_flag = $${params.length}`); }
    if (typeof input.isActive === 'boolean') { params.push(input.isActive); updates.push(`is_active = $${params.length}`); }
    if (updates.length === 0) throw new BadRequestException('No fields to update');
    updates.push('updated_at = now()');
    params.push(ingredientId);
    const out = await runSql(
      `WITH updated AS (
         UPDATE ingredients SET ${updates.join(', ')}
         WHERE id = $${params.length} AND deleted_at IS NULL
         RETURNING id, name, allergen_flag, is_active
       )
       SELECT row_to_json(updated)::text FROM updated;`,
      params,
    );
    if (!out) throw new NotFoundException('Ingredient not found');
    return this.parseJsonLine(out);
  }

  async deleteIngredient(actor: AccessUser, ingredientId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(ingredientId, 'ingredientId');
    const out = await runSql(
      `UPDATE ingredients SET deleted_at = now(), is_active = false, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id;`,
      [ingredientId],
    );
    if (!out) throw new NotFoundException('Ingredient not found');
    return { ok: true };
  }

  // ─── Missing CRUD: Menu Items ────────────────────────────────────────────

  async deleteMenuItem(actor: AccessUser, itemId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(itemId, 'itemId');
    const out = await runSql(
      `UPDATE menu_items SET deleted_at = now(), is_available = false, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id;`,
      [itemId],
    );
    if (!out) throw new NotFoundException('Menu item not found');
    return { ok: true };
  }

  // ─── Missing CRUD: Delivery user deactivate ──────────────────────────────

  async createDeliveryUser(
    actor: AccessUser,
    input: { username?: string; password?: string; firstName?: string; lastName?: string; phoneNumber?: string; email?: string },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const username = (input.username || '').trim().toLowerCase();
    const password = (input.password || '').trim();
    const firstName = (input.firstName || '').trim();
    const lastName = (input.lastName || '').trim();
    const phoneNumber = (input.phoneNumber || '').trim();
    const email = (input.email || '').trim().toLowerCase();
    if (!username || !password || !firstName || !lastName || !phoneNumber) {
      throw new BadRequestException('username, password, firstName, lastName, phoneNumber are required');
    }
    if (username.length < 3 || password.length < 6) {
      throw new BadRequestException('Username or password too short');
    }
    const exists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM users
         WHERE username = $1
       );`,
      [username],
    );
    if (exists === 't') throw new ConflictException('Username already exists');
    const passwordHash = this.hashPassword(password);
    const out = await runSql(
      `WITH inserted AS (
         INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email, is_active)
         VALUES ('DELIVERY', $1, $2, $3, $4, $5, $6, true)
         RETURNING id, username, first_name, last_name
       )
       SELECT row_to_json(inserted)::text FROM inserted;`,
      [username, passwordHash, firstName, lastName, phoneNumber, email || null],
    );
    if (!out) throw new BadRequestException('Failed to create delivery user');
    const user = this.parseJsonLine<{ id: string; username: string; first_name: string; last_name: string }>(out);
    await runSql(
      `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
       VALUES ($1, false, false, true)
       ON CONFLICT (user_id) DO NOTHING;`,
      [user.id],
    );
    return user;
  }

  async deactivateDeliveryUser(actor: AccessUser, targetUserId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(targetUserId, 'userId');
    const out = await runSql(
      `WITH updated AS (
         UPDATE users SET is_active = false, updated_at = now()
         WHERE id = $1 AND role = 'DELIVERY' AND deleted_at IS NULL
         RETURNING id, username, first_name, last_name
       )
       SELECT row_to_json(updated)::text FROM updated;`,
      [targetUserId],
    );
    if (!out) throw new NotFoundException('Delivery user not found');
    return { ok: true, user: this.parseJsonLine(out) };
  }

  async updateDeliveryUser(
    actor: AccessUser,
    targetUserId: string,
    input: { firstName?: string; lastName?: string; phoneNumber?: string; email?: string; username?: string; isActive?: boolean },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(targetUserId, 'userId');

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.username !== undefined) {
      const username = input.username.trim().toLowerCase();
      if (!username) throw new BadRequestException('username cannot be empty');
      if (username.length < 3) throw new BadRequestException('username too short');
      params.push(username);
      sets.push(`username = $${params.length}`);
    }
    if (input.firstName !== undefined) {
      const firstName = input.firstName.trim();
      if (!firstName) throw new BadRequestException('firstName cannot be empty');
      params.push(firstName);
      sets.push(`first_name = $${params.length}`);
    }
    if (input.lastName !== undefined) {
      const lastName = input.lastName.trim();
      if (!lastName) throw new BadRequestException('lastName cannot be empty');
      params.push(lastName);
      sets.push(`last_name = $${params.length}`);
    }
    if (input.phoneNumber !== undefined) {
      const phone = input.phoneNumber.trim();
      if (!phone) throw new BadRequestException('phoneNumber cannot be empty');
      params.push(phone);
      sets.push(`phone_number = $${params.length}`);
    }
    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      params.push(email || null);
      sets.push(`email = $${params.length}`);
    }
    if (input.isActive !== undefined) {
      params.push(Boolean(input.isActive));
      sets.push(`is_active = $${params.length}`);
    }

    if (sets.length === 0) throw new BadRequestException('No fields to update');

    params.push(targetUserId);
    const userIdParam = params.length;
    const out = await runSql(
      `WITH updated AS (
         UPDATE users
         SET ${sets.join(', ')},
             updated_at = now()
         WHERE id = $${userIdParam}
           AND role = 'DELIVERY'
           AND deleted_at IS NULL
         RETURNING id, username, first_name, last_name, phone_number, email, is_active
       )
       SELECT row_to_json(updated)::text FROM updated;`,
      params,
    );
    if (!out) throw new NotFoundException('Delivery user not found');
    return { ok: true, user: this.parseJsonLine(out) };
  }

  // ─── Health check ─────────────────────────────────────────────────────────

  async healthCheck() {
    const dbCheck = await runSql('SELECT 1;').then(() => 'ok').catch(() => 'error');
    return {
      status: dbCheck === 'ok' ? 'healthy' : 'degraded',
      db: dbCheck,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
