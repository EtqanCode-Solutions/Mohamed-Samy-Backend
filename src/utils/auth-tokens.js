import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// Access Token قصير
export function issueAccessToken(payload) {
  const secret = process.env.JWT_SECRET || 'dev_secret';
  const expiresIn = process.env.JWT_AT_EXPIRES || '1d';
  return jwt.sign(payload, secret, { expiresIn });
}
// Refresh Token خام (نخزّن منه هاش فقط)
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex'); // 96 chars
}

// وقت انتهاء الريفريش (مثلاً 45 يوم)
export function refreshExpiryDate() {
  const days = Number(process.env.REFRESH_DAYS || 45);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// كوكي آمن للريفريش (اختياري لو عايزه Cookie)
export function setRefreshCookie(res, token) {
  const isProd = String(process.env.NODE_ENV).toLowerCase() === 'production';
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/students',       // نطاق استخدامه لراوتر الطلاب
    maxAge: 1000 * 60 * 60 * 24 * Number(process.env.REFRESH_DAYS || 45),
  });
}
