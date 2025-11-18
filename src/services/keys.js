// src/services/keys.js
import crypto from 'node:crypto';

/**
 * تعيد مفتاح AES-128 (طوله 16 بايت) كـ Buffer.
 *
 * الأولوية:
 * 1) لو حدّدت PLAYBACK_STATIC_KEY_HEX في .env (قيمة hex بطول 32 char = 16 بايت)
 * 2) اشتقاق حتمـي من PLAYBACK_SECRET + kid (تمهيد سريع للبيئة التجريبية)
 */
export function getLessonKeyBytes(kid) {
  const staticHex = (process.env.PLAYBACK_STATIC_KEY_HEX || '').trim();
  if (staticHex) {
    const buf = Buffer.from(staticHex, 'hex');
    if (buf.length !== 16) {
      throw new Error('PLAYBACK_STATIC_KEY_HEX يجب أن يكون 16 بايت (32 hex chars) لـ AES-128');
    }
    return buf;
  }

  const secret = (process.env.PLAYBACK_SECRET || 'dev-secret').trim();
  const seed = `${secret}:${kid || 'default'}`;
  // SHA-256 ثم أول 16 بايت = مفتاح AES-128
  return crypto.createHash('sha256').update(seed).digest().subarray(0, 16);
}

/**
 * توليد kid جديد (مُعرّف مفتاح) — مفيد عند تدوير المفاتيح.
 * يمكن تخزينه مع الدرس في DB لديك.
 */
export function mintKeyId() {
  return crypto.randomUUID();
}
