
import crypto from 'crypto';

export function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

export function generateVoucherCode(len = 14) {
  const digits = '0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += digits[Math.floor(Math.random() * 10)];
  return s;
}
