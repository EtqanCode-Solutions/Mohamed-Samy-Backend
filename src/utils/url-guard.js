// src/utils/url-guard.js
import { URL } from 'url';

/**
 * يحاول إنشاء URL بأمان.
 * - يدعم إدخال بدون بروتوكول (يضيف http:// افتراضيًا للمحاولة)
 */
export function parseUrlSafe(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  // محاولة مباشرة
  try {
    return new URL(s);
  } catch {}

  // محاولة بإضافة http:// لو كان السلسلة بلا scheme
  try {
    return new URL(`http://${s}`);
  } catch {
    return null;
  }
}

/**
 * قراءة قواعد السماح من CLOUD_ALLOWED_HOSTS مع دعم فواصل متعددة:
 * - | أو , أو فراغات أو أسطر جديدة
 * - تُطبّع للأحرف الصغيرة وتُزال العناصر الفارغة والمكررة
 * - أمثلة القواعد:
 *   - "example.com"        => مطابقة صريحة
 *   - ".example.com"       => الجذر وأي subdomain
 *   - "*.example.com"      => أي subdomain فقط (بدون الجذر)
 *   - "*"                  => السماح للجميع
 */
export function getAllowedHosts() {
  const raw = process.env.CLOUD_ALLOWED_HOSTS || '';

  // نفصل بأي من هذه: | , فراغ/مسافات متعددة أو سطر جديد
  const parts = raw
    .split(/[\|\s,]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // إزالة تكرار
  const uniq = Array.from(new Set(parts));

  // تنظيف القواعد: إزالة scheme/port إن وُجدت بالخطأ
  return uniq.map((rule) => {
    // لو حد كتب https://example.com:443
    const u = parseUrlSafe(rule);
    if (u) {
      return u.hostname.toLowerCase();
    }
    return rule;
  });
}

/**
 * مطابقة مضبوطة بين host وقاعدة rule واحدة.
 * يدعم الأنماط:
 * - "*"                 => الكل مسموح
 * - "example.com"       => مطابقة صريحة
 * - ".example.com"      => الجذر + أي subdomain
 * - "*.example.com"     => أي subdomain فقط (وليس الجذر)
 */
function matchHostRule(host, rule) {
  if (rule === '*') return true;

  // تخلّص من أي port في host إن وُجد (URL.hostname عادةً بلا port، لكن للاحتياط)
  const pureHost = host.split(':')[0].toLowerCase();
  const r = String(rule || '').toLowerCase();

  if (!r) return false;

  // *.example.com => أي subdomain فقط
  if (r.startsWith('*.')) {
    const root = r.slice(2);
    // يجب أن يكون host منتهيًا بـ .root وألا يساوي root نفسه
    return pureHost.endsWith(`.${root}`);
  }

  // .example.com => الجذر + أي subdomain
  if (r.startsWith('.')) {
    const root = r.slice(1);
    return pureHost === root || pureHost.endsWith(`.${root}`);
  }

  // مطابقة صريحة
  return pureHost === r;
}

/**
 * التحقق هل رابط u ينتمي لدومين مسموح.
 * المنطق:
 * - لو CLOUD_ALLOWED_HOSTS فارغ => السماح (نفس سلوكك السابق).
 * - لو نجح أي rule => true
 */
export function isAllowedHost(u) {
  const url = parseUrlSafe(u);
  if (!url) return false;

  const host = (url.hostname || '').toLowerCase();
  if (!host) return false;

  const allowed = getAllowedHosts();

  // لا توجد قواعد: السماح للجميع (سلوك افتراضي)
  if (allowed.length === 0) return true;

  // طابق أي قاعدة
  return allowed.some((rule) => matchHostRule(host, rule));
}

/**
 * حذف Query/Fragment للاحتفاظ بالأساس فقط (اختياري)
 */
export function stripQueryAndHash(u) {
  const url = parseUrlSafe(u);
  if (!url) return null;
  url.search = '';
  url.hash = '';
  return url.toString();
}
