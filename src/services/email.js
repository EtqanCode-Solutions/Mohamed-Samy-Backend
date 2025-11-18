// src/services/email.js
import nodemailer from 'nodemailer';
import path from 'path';

/* =========================
   Helpers
   ========================= */
function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return String(v).toLowerCase() === 'true';
}

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

// فحص صيغة أساسية (خفيف وسريع)
function isValidEmail(email) {
  // يسمح بحروف وأرقام ونقاط وشرطات سفلية قبل @، ودومين بسيط بعد @
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* =========================
   Transport (singleton)
   ========================= */
let _transporter = null;

export function makeMailer() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    SMTP_DEBUG,
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[email] SMTP not configured — OTP will be logged to console only.');
    _transporter = null;
    return null;
  }

  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: bool(SMTP_SECURE, false), // 465 => true ، 587 => false
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    logger: bool(SMTP_DEBUG, false),
    debug: bool(SMTP_DEBUG, false),
  });

  return _transporter;
}

/* =========================
   Send OTP Email
   ========================= */
/**
 * يرسل OTP إلى بريد المستخدم بتصميم احترافي وهوية "منصة المبدع محمد سامي".
 * يدعم اللوجو من الأصول المحلية (CID) تلقائيًا: src/assets/images/Group 24.png
 *
 * @param {string|string[]} to - بريد واحد أو مصفوفة بريد.
 * @param {string} otp - رمز التحقق.
 * @param {object} opts - خيارات إضافية:
 *   - brandName, primaryHex, darkHex, textHex, bgHex, cardHex, borderHex
 *   - supportEmail, subject, fromName
 *   - logoUrl (إن وُجد سيتم تجاهل CID واستخدام URL)
 *   - logoCid, logoPath (لتخصيص CID/المسار إن أردت)
 *   - ctaUrl, ctaText (زر اختياري)
 *   - attachments (مرفقات إضافية)
 */
export async function sendOtpEmail(to, otp, opts = {}) {
  const transporter = makeMailer();

  // ====== إعدادات العلامة ======
  const brandName   = opts.brandName   || 'منصة المبدع محمد سامي';
  const primaryHex  = opts.primaryHex  || '#2563EB';
  const darkHex     = opts.darkHex     || '#1E293B';
  const textHex     = opts.textHex     || '#334155';
  const bgHex       = opts.bgHex       || '#F8FAFC';
  const cardHex     = opts.cardHex     || '#FFFFFF';
  const borderHex   = opts.borderHex   || '#E2E8F0';

  // ====== اللوجو من assets (CID تلقائي) ======
  // المسار داخل المشروع: src/assets/images/Group 24.png
  const defaultLogoCid  = 'brand-logo@cid';
  const defaultLogoPath = path.join(process.cwd(), 'src', 'assets', 'images', 'Group 24.png');

  // إن مرّرت opts.logoUrl سنستعمله بدل الـ CID المحلي
  const logoUrl  = opts.logoUrl || null;
  const logoCid  = opts.logoCid || (!logoUrl ? defaultLogoCid : null);
  const logoPath = opts.logoPath || (!logoUrl ? defaultLogoPath : null);
  const logoAlt  = opts.logoAlt || brandName;

  const supportEmail = opts.supportEmail || 'support@example.com';
  const subject      = opts.subject || `رمز التحقق - ${brandName}`;
  const expMin       = process.env.OTP_EXP_MIN || 10;

  const smtpUser = normalizeEmail(process.env.SMTP_USER);
  const toList = (Array.isArray(to) ? to : [to]).map(normalizeEmail).filter(Boolean);

  // فحص الإيميلات + منع الإرسال لنفس SMTP_USER
  for (const addr of toList) {
    if (!isValidEmail(addr)) {
      console.warn(`[email] ABORT: invalid email format -> "${addr}"`);
      throw new Error('Invalid email address');
    }
    if (addr === smtpUser) {
      console.warn('[email] ABORT: Refusing to send to SMTP_USER (self-send). addr=', addr);
      throw new Error('Refusing to send to SMTP_USER');
    }
  }

  // ====== نص بديل (Plain Text) ======
  const text = [
    `${brandName}`,
    '',
    `رمز التحقق الخاص بك: ${otp}`,
    `صلاحيته ${expMin} دقائق.`,
    '',
    `إذا لم تطلب ذلك، تجاهل هذه الرسالة.`,
    `الدعم: ${supportEmail}`,
  ].join('\n');

  // ====== HTML احترافي (RTL + Inline CSS) ======
  const logoTag = logoUrl
    ? `<img src="${logoUrl}" alt="${logoAlt}" width="64" height="64" style="display:block;border:0;outline:none;border-radius:12px;" />`
    : (logoCid
        ? `<img src="cid:${logoCid}" alt="${logoAlt}" width="64" height="64" style="display:block;border:0;outline:none;border-radius:12px;" />`
        : '');

  const ctaHtml = opts.ctaUrl && opts.ctaText
    ? `<tr>
         <td align="center" style="padding: 6px 0 0 0;">
           <a href="${opts.ctaUrl}" style="display:inline-block;padding:12px 20px;background:${primaryHex};color:#fff;text-decoration:none;border-radius:10px;font-weight:bold;font-size:14px;">${opts.ctaText}</a>
         </td>
       </tr>`
    : '';

  const html = `
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta name="viewport" content="width=device-width" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:${bgHex};direction:rtl;text-align:right;font-family:Tahoma, Arial, sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${bgHex};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:${cardHex};border:1px solid ${borderHex};border-radius:14px;overflow:hidden;box-shadow:0 6px 18px rgba(30,41,59,0.06);">
            <!-- Header -->
            <tr>
              <td style="padding:24px 24px 12px 24px;">
                <table role="presentation" width="100%">
                  <tr>
                    <td align="center" style="padding-bottom:10px;">
                      ${logoTag}
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="font-size:20px;font-weight:800;letter-spacing:.2px;color:${darkHex};">
                      ${brandName}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:0 24px;">
                <div style="height:1px;background:${borderHex};width:100%;"></div>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:20px 24px 8px 24px;color:${textHex};">
                <h3 style="margin:0 0 10px 0;color:${darkHex};font-size:18px;">رمز التحقق لاستعادة كلمة المرور</h3>
                <p style="margin:0 0 10px 0;font-size:14px;line-height:1.9;">
                  مرحبًا بك في <b>${brandName}</b> — لا تقلق، سنعيد وصولك لحسابك خلال لحظات.
                </p>
                <p style="margin:0 0 12px 0;font-size:14px;line-height:1.9;">
                  أدخل رمز التحقق التالي داخل التطبيق/الموقع لإكمال العملية:
                </p>

                <!-- OTP Box -->
                <div style="margin:14px 0 10px 0;text-align:center;">
                  <div style="
                    display:inline-block;
                    background:${primaryHex};
                    color:#ffffff;
                    font-size:28px;
                    letter-spacing:10px;
                    font-weight:800;
                    padding:14px 22px;
                    border-radius:12px;">
                    ${otp}
                  </div>
                </div>

                <p style="margin:8px 0 0 0;font-size:13px;color:${textHex};opacity:.9;">
                  صالح لمدة <b>${expMin} دقيقة</b>. إذا لم تطلب ذلك، فتجاهل هذه الرسالة.
                </p>
              </td>
            </tr>

            ${ctaHtml}

            <!-- Footer -->
            <tr>
              <td style="padding:18px 24px 22px 24px;">
                <table role="presentation" width="100%" style="background:${bgHex};border:1px dashed ${borderHex};border-radius:12px;">
                  <tr>
                    <td style="padding:14px 16px;color:${textHex};font-size:12px;line-height:1.8;">
                      للدعم الفني أو الاستفسارات: <a href="mailto:${supportEmail}" style="color:${primaryHex};text-decoration:none;">${supportEmail}</a><br/>
                      © ${new Date().getFullYear()} ${brandName}. جميع الحقوق محفوظة.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>

          <div style="color:#94a3b8;font-size:11px;margin-top:10px;">
            تم إرسال هذه الرسالة تلقائيًا، لا تقم بالرد عليها.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;

  // تشخيص
  console.log('[email] Preparing to send OTP to:', toList);

  if (!transporter) {
    console.log(`[OTP][console] (${toList.join(', ')}) => ${otp}`);
    return { queued: true, transport: 'console', to: toList };
  }

  const fromHeader = `"${opts.fromName || brandName}" <${smtpUser}>`;

  // مرفقات (CID) تلقائية لو لم تُمرّر logoUrl
  const attachments = Array.isArray(opts.attachments) ? opts.attachments.slice() : [];
  if (!logoUrl && logoCid && logoPath && !attachments.some(a => a.cid === logoCid)) {
    attachments.push({
      cid: logoCid,
      path: logoPath,     // يقبل المسارات ذات المسافات
      filename: 'logo.png',
    });
  }

  try {
    const info = await transporter.sendMail({
      from: fromHeader,
      to: toList,
      subject,
      text,
      html,
      envelope: { from: smtpUser, to: toList },
      attachments, // يدعم CID للّوجو من assets
    });

    console.log('[email] Message sent:', {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      envelope: info.envelope,
      response: info.response,
    });

    return {
      queued: true,
      transport: 'smtp',
      to: toList,
      info: {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        envelope: info.envelope,
        response: info.response,
      },
    };
  } catch (err) {
    console.error('[email] SEND FAILED:', err?.message || err);
    throw err;
  }
}
