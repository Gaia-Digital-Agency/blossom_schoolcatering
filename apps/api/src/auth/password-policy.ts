import { BadRequestException } from '@nestjs/common';

const WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
]);

export function validatePasswordPolicy(passwordRaw: string, field = 'password') {
  const password = String(passwordRaw || '');
  if (password.length < 6 || password.length > 100) {
    throw new BadRequestException(`${field} must be between 6 and 100 characters`);
  }
  if (/\s/.test(password)) {
    throw new BadRequestException(`${field} must not contain spaces`);
  }
  if (!/[a-z]/.test(password)) {
    throw new BadRequestException(`${field} must include at least one lowercase letter`);
  }
  if (!/[A-Z]/.test(password)) {
    throw new BadRequestException(`${field} must include at least one uppercase letter`);
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestException(`${field} must include at least one number`);
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new BadRequestException(`${field} must include at least one symbol`);
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    throw new BadRequestException(`${field} is too weak`);
  }
}
