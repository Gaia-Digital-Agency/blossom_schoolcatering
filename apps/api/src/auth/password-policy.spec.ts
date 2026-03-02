import { BadRequestException } from '@nestjs/common';
import { validatePasswordPolicy } from './password-policy';

describe('validatePasswordPolicy', () => {
  it('accepts strong passwords', () => {
    expect(() => validatePasswordPolicy('Strong#Pass123')).not.toThrow();
    expect(() => validatePasswordPolicy('Abc!234567xyz')).not.toThrow();
  });

  it('rejects weak/common passwords', () => {
    expect(() => validatePasswordPolicy('password123')).toThrow(BadRequestException);
    expect(() => validatePasswordPolicy('admin123')).toThrow(BadRequestException);
  });

  it('rejects missing character class requirements', () => {
    expect(() => validatePasswordPolicy('lowercase#12')).toThrow('uppercase');
    expect(() => validatePasswordPolicy('UPPERCASE#12')).toThrow('lowercase');
    expect(() => validatePasswordPolicy('NoNumber#Pass')).toThrow('number');
    expect(() => validatePasswordPolicy('NoSymbol12345')).toThrow('symbol');
  });
});
