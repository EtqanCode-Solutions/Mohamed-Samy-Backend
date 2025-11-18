// src/utils/slug.js

/**
 * تحويل النص إلى slug صالح للروابط
 * أمثلة:
 *   "كورس الكيمياء - المستوى الأول" → "kurs-alkimia-almstwy-alawal"
 *   "Math Level 1" → "math-level-1"
 */
export function slugify(input) {
  if (!input) return '';

  return String(input)
    .trim()
    // استبدال الحروف العربية بنظيراتها اللاتينية البسيطة (اختياري)
    .replace(/[ء-ي]/g, c => {
      const map = {
        'أ':'a','إ':'i','آ':'a','ا':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
        'د':'d','ذ':'th','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z',
        'ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w','ي':'y'
      };
      return map[c] || '';
    })
    .replace(/[^a-zA-Z0-9]+/g, '-') // أي شيء غير حرف أو رقم → "-"
    .replace(/^-+|-+$/g, '')        // إزالة الشرطات الزائدة
    .toLowerCase();
}
