import crypto from 'crypto';

export function generateNumericOtp(length = 6) {
  const digits = '0123456789';
  let s = '';
  for (let i = 0; i < length; i++) s += digits[Math.floor(Math.random() * 10)];
  return s;
}

export function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

export function minutesFromNow(min) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + Number(min || 10));
  return d;
}
