import { BadRequestException, Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { createSign, randomUUID } from 'crypto';
import { HelpersService } from './helpers.service';

/**
 * MediaService
 * ============
 *
 * Scope:
 *   - Google Cloud Storage: bucket + folder config, public URL
 *     construction, upload pipeline (uploadToGcs).
 *   - Google service-account auth: access-token minting for GCS,
 *     Vertex AI, and Gmail API scopes (getGoogleAccessToken,
 *     getComputeEngineAccessToken).
 *   - PDF generation: escapePdfText, buildSimplePdf, and the
 *     two-column delivery-order PDF layout.
 *   - Email with attachment (sendEmailWithPdfAttachment) used for
 *     delivery notifications and billing receipts.
 *   - Content validation: image mime detection from magic bytes,
 *     PDF header check, safe payload enforcement, proof-URL
 *     allowlist, Google Storage host check.
 *   - Remote binary fetch: fetchProofImageBinary, fetchReceiptPdfBinary,
 *     resolveMenuImageUrl.
 *
 * Owned methods (moved from CoreService in this extraction):
 *   toBase64Url, normalizeGcsFolder, getGcsBucket, getGcsRootFolder,
 *   getGcsCategoryFolder, buildStoragePublicUrl,
 *   buildGoogleStoragePublicUrl, getGoogleServiceAccount,
 *   getGoogleAccessToken, getComputeEngineAccessToken, uploadToGcs,
 *   parseDataUrl, detectImageMimeFromMagicBytes, isPdfBinary,
 *   assertSafeImagePayload, getFileExtFromContentType,
 *   isAllowedProofImageUrl, isGoogleStorageHost,
 *   fetchProofImageBinary, fetchReceiptPdfBinary, resolveMenuImageUrl,
 *   escapePdfText, buildSimplePdf, buildTwoColumnDeliveryPdfLines,
 *   sendEmailWithPdfAttachment.
 *
 * Dependencies:
 *   - fs/promises (readFile), crypto (createSign, randomUUID), global fetch
 *   - HelpersService (clipText for PDF label truncation)
 *   - Env vars: GCS_BUCKET, GOOGLE_APPLICATION_CREDENTIALS, Gmail config
 *
 * Consumers:
 *   - CoreService facade keeps thin delegation stubs so existing
 *     internal callsites (uploadMenuImage, billing proof upload,
 *     receipt PDF build, delivery email) continue to call
 *     this.xxx() unchanged.
 *   - Later sub-services (MenuService, BillingService, DeliveryService,
 *     MultiOrderService, GaiaService, SiteSettingsService) can inject
 *     MediaService directly.
 */
@Injectable()
export class MediaService {
  constructor(private readonly helpers: HelpersService) {}

  toBase64Url(value: string | Buffer) {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  normalizeGcsFolder(value?: string) {
    return (value || '')
      .trim()
      .replace(/^\/+|\/+$/g, '');
  }

  getGcsBucket() {
    const bucket = (process.env.GCS_BUCKET || '').trim();
    if (!bucket) throw new BadRequestException('GCS_BUCKET is required for file uploads');
    return bucket;
  }

  getGcsRootFolder() {
    return this.normalizeGcsFolder(process.env.GCS_FOLDER || '');
  }

  getGcsCategoryFolder(kind: 'menu-images' | 'receipts' | 'payment-proofs') {
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

  buildStoragePublicUrl(objectName: string) {
    const cdnBase = (process.env.CDN_BASE_URL || '').trim().replace(/\/+$/, '');
    const normalizedObject = objectName.replace(/^\/+/, '');
    if (cdnBase) return `${cdnBase}/${normalizedObject}`;
    return `https://storage.googleapis.com/${this.getGcsBucket()}/${normalizedObject}`;
  }

  buildGoogleStoragePublicUrl(objectName: string) {
    const normalizedObject = objectName.replace(/^\/+/, '');
    return `https://storage.googleapis.com/${this.getGcsBucket()}/${normalizedObject}`;
  }

  async getGoogleServiceAccount() {
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

  async getGoogleAccessToken(scopes: string[], delegatedUserEmail?: string) {
    const { clientEmail, privateKey } = await this.getGoogleServiceAccount();
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const header = this.toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const delegated = (delegatedUserEmail || '').trim().toLowerCase();
    const payloadClaims: Record<string, unknown> = {
      iss: clientEmail,
      scope: scopes.join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      exp,
      iat,
    };
    if (delegated) payloadClaims.sub = delegated;
    const payload = this.toBase64Url(
      JSON.stringify(payloadClaims),
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

  buildTwoColumnDeliveryPdfLines(input: {
    title: string;
    serviceDate: string;
    deliveryName: string;
    orders: Array<{
      session: string;
      child_name: string;
      school_name?: string | null;
      youngster_mobile?: string | null;
      allergen_items?: string | null;
      status: string;
      delivery_status: string;
      dishes: Array<{ item_name: string; quantity: number }>;
    }>;
  }) {
    const cards = input.orders.map((order) => {
      const dishText = (order.dishes || []).map((d) => `${d.item_name} x${d.quantity}`).join(', ') || '-';
      const allergy = (order.allergen_items || '').trim() || '-';
      return [
        `Session: ${this.helpers.clipText(order.session, 24)}`,
        `Youngster Full Name: ${this.helpers.clipText(order.child_name, 52)}`,
        `School: ${this.helpers.clipText(order.school_name || '-', 60)}`,
        `Phone Number: ${this.helpers.clipText(order.youngster_mobile || '-', 48)}`,
        `Dietary Allergies: ${this.helpers.clipText(allergy, 48)}`,
        `Status: ${this.helpers.clipText(`${order.status} | Delivery: ${order.delivery_status}`, 52)}`,
        `Dishes: ${this.helpers.clipText(dishText, 60)}`,
      ];
    });

    const lines: string[] = [
      input.title,
      `Service Date: ${input.serviceDate}`,
      `Delivery Personnel: ${input.deliveryName}`,
      `Total Orders: ${cards.length}`,
      '',
    ];

    const colWidth = 86;
    for (let idx = 0; idx < cards.length; idx += 2) {
      const left = cards[idx];
      const right = cards[idx + 1] || [];
      const maxRows = Math.max(left.length, right.length);
      for (let row = 0; row < maxRows; row += 1) {
        const l = (left[row] || '').padEnd(colWidth, ' ');
        const r = right[row] || '';
        lines.push(`${l} | ${r}`.slice(0, 180));
      }
      lines.push('');
    }
    return lines;
  }

  async sendEmailWithPdfAttachment(input: {
    to: string;
    subject: string;
    bodyText: string;
    attachmentFileName: string;
    attachmentData: Buffer;
  }) {
    const delegatedUser = (process.env.GOOGLE_GMAIL_DELEGATED_USER || '').trim().toLowerCase();
    if (!delegatedUser) {
      throw new BadRequestException('GOOGLE_GMAIL_DELEGATED_USER is required to send notification emails');
    }
    const from = (process.env.NOTIFICATION_EMAIL_FROM || delegatedUser).trim();
    const boundary = `mixed_${randomUUID().replace(/-/g, '')}`;
    const attachmentBase64 = input.attachmentData.toString('base64');
    const attachmentChunks = attachmentBase64.match(/.{1,76}/g) || [];
    const mime = [
      `From: ${from}`,
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      input.bodyText,
      '',
      `--${boundary}`,
      'Content-Type: application/pdf; name="assignment.pdf"',
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${input.attachmentFileName}"`,
      '',
      ...attachmentChunks,
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const raw = this.toBase64Url(Buffer.from(mime, 'utf8'));
    const accessToken = await this.getGoogleAccessToken(['https://www.googleapis.com/auth/gmail.send'], delegatedUser);
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(`Failed sending notification email: ${text || res.statusText}`);
    }
  }

  async uploadToGcs(params: {
    objectName: string;
    contentType: string;
    data: Buffer;
    cacheControl?: string;
    publicRead?: boolean;
  }) {
    const bucket = this.getGcsBucket();
    const accessToken = await this.getGoogleAccessToken(['https://www.googleapis.com/auth/devstorage.read_write']);
    const objectName = params.objectName.replace(/^\/+/, '');
    const query = new URLSearchParams({
      uploadType: 'media',
      name: objectName,
    });
    if (params.publicRead) query.set('predefinedAcl', 'publicRead');
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?${query.toString()}`;
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

  parseDataUrl(input: string): { contentType: string; data: Buffer } {
    const match = input.match(/^data:([a-zA-Z0-9/+.-]+);base64,([\s\S]+)$/);
    if (!match) throw new BadRequestException('Invalid data URL payload');
    const contentType = match[1]?.trim() || 'application/octet-stream';
    const b64 = (match[2] || '').trim();
    if (!b64) throw new BadRequestException('Empty data URL payload');
    const data = Buffer.from(b64, 'base64');
    return { contentType, data };
  }

  detectImageMimeFromMagicBytes(data: Buffer) {
    if (data.length >= 8) {
      const isPng =
        data[0] === 0x89 &&
        data[1] === 0x50 &&
        data[2] === 0x4e &&
        data[3] === 0x47 &&
        data[4] === 0x0d &&
        data[5] === 0x0a &&
        data[6] === 0x1a &&
        data[7] === 0x0a;
      if (isPng) return 'image/png';
    }
    if (data.length >= 3) {
      const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
      if (isJpeg) return 'image/jpeg';
    }
    if (
      data.length >= 12 &&
      data.subarray(0, 4).toString('ascii') === 'RIFF' &&
      data.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }
    return '';
  }

  isPdfBinary(data: Buffer) {
    return data.length >= 5
      && data[0] === 0x25
      && data[1] === 0x50
      && data[2] === 0x44
      && data[3] === 0x46
      && data[4] === 0x2d;
  }

  assertSafeImagePayload(input: { contentType: string; data: Buffer; maxBytes: number; label: string }) {
    const normalizedContentType = String(input.contentType || '').toLowerCase();
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowedTypes.has(normalizedContentType)) {
      throw new BadRequestException(`${input.label} must be PNG, JPEG, or WEBP`);
    }
    if (!input.data?.length) {
      throw new BadRequestException(`${input.label} payload is empty`);
    }
    if (input.data.length > input.maxBytes) {
      throw new BadRequestException(`${input.label} exceeds size limit`);
    }
    const detected = this.detectImageMimeFromMagicBytes(input.data);
    if (!detected || detected !== normalizedContentType) {
      throw new BadRequestException(`${input.label} failed file signature validation`);
    }
  }

  getFileExtFromContentType(contentType: string) {
    const normalized = contentType.toLowerCase();
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('pdf')) return 'pdf';
    return 'bin';
  }

  isAllowedProofImageUrl(urlRaw: string) {
    try {
      const parsed = new URL(urlRaw);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      const path = (parsed.pathname || '').toLowerCase();
      const extAllowed = /\.(png|jpe?g|webp)$/.test(path);
      if (!extAllowed) return false;
      const trustedHosts = new Set<string>(['storage.googleapis.com']);
      const cdnHost = (() => {
        try {
          const base = (process.env.CDN_BASE_URL || '').trim();
          return base ? new URL(base).host : '';
        } catch {
          return '';
        }
      })();
      if (cdnHost) trustedHosts.add(cdnHost);
      return trustedHosts.has(parsed.host);
    } catch {
      return false;
    }
  }

  isGoogleStorageHost(hostRaw: string) {
    const host = String(hostRaw || '').toLowerCase();
    return host === 'storage.googleapis.com' || host.endsWith('.storage.googleapis.com');
  }

  async fetchProofImageBinary(proofImageUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(proofImageUrl);
    } catch {
      throw new BadRequestException('Invalid proof image URL');
    }

    const performFetch = async (authToken?: string) => fetch(proofImageUrl, {
      method: 'GET',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    });

    let res = await performFetch();
    if (
      (res.status === 401 || res.status === 403) &&
      this.isGoogleStorageHost(parsed.host)
    ) {
      try {
        const accessToken = await this.getGoogleAccessToken(['https://www.googleapis.com/auth/devstorage.read_only']);
        res = await performFetch(accessToken);
      } catch {
        // Continue and let the non-ok response below raise a clear API error.
      }
    }

    if (!res.ok) {
      throw new BadRequestException(`PAYMENT_PROOF_NOT_ACCESSIBLE (${res.status})`);
    }

    const data = Buffer.from(await res.arrayBuffer());
    if (!data.length) throw new BadRequestException('PAYMENT_PROOF_EMPTY');
    if (data.length > 10 * 1024 * 1024) {
      throw new BadRequestException('PAYMENT_PROOF_TOO_LARGE');
    }

    const detectedMime = this.detectImageMimeFromMagicBytes(data);
    if (!detectedMime) {
      throw new BadRequestException('PAYMENT_PROOF_NOT_IMAGE');
    }

    return { contentType: detectedMime, data };
  }

  async fetchReceiptPdfBinary(pdfUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(pdfUrl);
    } catch {
      throw new BadRequestException('Invalid receipt PDF URL');
    }

    const performFetch = async (authToken?: string) => fetch(pdfUrl, {
      method: 'GET',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    });

    let res = await performFetch();
    if ((res.status === 401 || res.status === 403) && this.isGoogleStorageHost(parsed.host)) {
      try {
        const accessToken = await this.getGoogleAccessToken(['https://www.googleapis.com/auth/devstorage.read_only']);
        res = await performFetch(accessToken);
      } catch {
        // Continue and let the non-ok response below raise a clear API error.
      }
    }

    if (!res.ok) {
      throw new BadRequestException(`RECEIPT_PDF_NOT_ACCESSIBLE (${res.status})`);
    }

    const data = Buffer.from(await res.arrayBuffer());
    if (!data.length) throw new BadRequestException('RECEIPT_PDF_EMPTY');
    if (data.length > 10 * 1024 * 1024) {
      throw new BadRequestException('RECEIPT_PDF_TOO_LARGE');
    }
    if (!this.isPdfBinary(data)) {
      throw new BadRequestException('RECEIPT_NOT_PDF');
    }
    return { contentType: 'application/pdf', data };
  }

  async resolveMenuImageUrl(imageUrl: string, menuItemName: string) {
    const trimmed = (imageUrl || '').trim();
    if (!trimmed) throw new BadRequestException('imageUrl is required');
    if (trimmed.startsWith('data:')) {
      const parsed = this.parseDataUrl(trimmed);
      this.assertSafeImagePayload({
        contentType: parsed.contentType,
        data: parsed.data,
        maxBytes: 5 * 1024 * 1024,
        label: 'Menu image',
      });
      const ext = this.getFileExtFromContentType(parsed.contentType);
      const objectName = `${this.getGcsCategoryFolder('menu-images')}/${this.helpers.slugify(menuItemName)}-${Date.now()}.${ext}`;
      try {
        const uploaded = await this.uploadToGcs({
          objectName,
          contentType: parsed.contentType,
          data: parsed.data,
          cacheControl: 'public, max-age=86400',
          publicRead: true,
        });
        // Use direct GCS public URL for menu images so they render consistently on public /menu.
        return this.buildGoogleStoragePublicUrl(uploaded.objectName);
      } catch (err) {
        // Fallback when GCS credentials are unavailable: keep a valid inline image so UI updates persist.
        // This preserves admin update behavior instead of hard-failing image changes.
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('Google credentials missing')) {
          return trimmed;
        }
        throw err;
      }
    }
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return trimmed;
  }

  escapePdfText(text: string) {
    return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  buildSimplePdf(lines: string[]) {
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

  async getComputeEngineAccessToken() {
    const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' },
    });
    if (!res.ok) {
      throw new BadRequestException('Failed to obtain Google Cloud access token');
    }
    const data = await res.json() as { access_token?: string };
    const token = String(data.access_token || '').trim();
    if (!token) throw new BadRequestException('Missing Google Cloud access token');
    return token;
  }

  async uploadMenuImage(buffer: Buffer, mimetype: string): Promise<{ url: string }> {
    if (!buffer?.length) throw new BadRequestException('No file data received');
    this.assertSafeImagePayload({
      contentType: mimetype,
      data: buffer,
      maxBytes: 5 * 1024 * 1024,
      label: 'Menu image',
    });
    const ext = this.getFileExtFromContentType(mimetype);
    const objectName = `${this.getGcsCategoryFolder('menu-images')}/upload-${Date.now()}.${ext}`;
    const uploaded = await this.uploadToGcs({
      objectName,
      contentType: mimetype,
      data: buffer,
      cacheControl: 'public, max-age=86400',
      publicRead: true,
    });
    return { url: this.buildGoogleStoragePublicUrl(uploaded.objectName) };
  }

  async uploadSiteHeroImage(buffer: Buffer, mimetype: string): Promise<{ url: string }> {
    if (!buffer?.length) throw new BadRequestException('No file data received');
    this.assertSafeImagePayload({
      contentType: mimetype,
      data: buffer,
      maxBytes: 5 * 1024 * 1024,
      label: 'Hero image',
    });
    const ext = this.getFileExtFromContentType(mimetype);
    const objectName = `${this.getGcsCategoryFolder('menu-images')}/hero-${Date.now()}.${ext}`;
    const uploaded = await this.uploadToGcs({
      objectName,
      contentType: mimetype,
      data: buffer,
      cacheControl: 'public, max-age=86400',
      publicRead: true,
    });
    return { url: this.buildGoogleStoragePublicUrl(uploaded.objectName) };
  }
}
