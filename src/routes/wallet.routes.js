// src/routes/wallet.routes.js
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { performOperation } from '../services/replicator.js';

export default function createWalletRouter(models) {
  const router = Router();

  const {
    WalletSqlite,
    WalletTxSqlite,
    TopupSqlite,

    WalletMysql,
    WalletTxMysql,
    TopupMysql,

    // اختياري
    VoucherSqlite,
    VoucherMysql,

    OutboxSqlite,
  } = models;

  // طرق الشحن المسموح بها في TopupRequest
  const ALLOWED_TOPUP_METHODS = [
    'instapay',
    'wallet_transfer',
    'bank_transfer',
    'cash',
    'shakepay', // ✅ طريقة الشحن الجديدة
  ];

  // ===== helpers =========================================================

  // ترجع أو تنشئ المحفظة من غير ما تهتم بنوع الـ DB
  async function ensureWallet(studentId) {
    let wallet = null;

    // جرّب MySQL لو موجود
    if (WalletMysql?.findOne) {
      wallet = await WalletMysql.findOne({ where: { studentId } });
    }

    // لو ملقيناش، جرّب SQLite
    if (!wallet && WalletSqlite?.findOne) {
      wallet = await WalletSqlite.findOne({ where: { studentId } });
    }

    // لو لسه مفيش → أنشئ واحدة جديدة عن طريق الـ replicator
    if (!wallet) {
      const created = await performOperation({
        modelName: 'Wallet',
        sqliteModel: WalletSqlite,
        mysqlModel: WalletMysql,
        op: 'create',
        data: { studentId, balanceCents: 0, updatedAtLocal: new Date() },
        outboxModel: OutboxSqlite,
      });
      wallet = created;
    }

    return wallet;
  }

  // تحديث الرصيد + إنشاء حركة (بدون حقل type لتجنّب أعمدة مفقودة)
  async function creditWallet({ walletId, amountCents, desc }) {
    const now = new Date();

    // 1) اكتب الحركة عبر الريبلكيتر (create فقط)
    const tx = await performOperation({
      modelName: 'WalletTx',
      sqliteModel: WalletTxSqlite,
      mysqlModel: WalletTxMysql,
      op: 'create',
      data: {
        walletId,
        amountCents,
        desc: desc || 'شحن رصيد',
        createdAt: now,
        updatedAtLocal: now,
      },
      outboxModel: OutboxSqlite,
    });

    // 2) حدّث الرصيد في القاعدتين مباشرة (تجنّب update عبر performOperation)
    const updateData = {
      balanceCents: models.sequelize?.literal
        ? models.sequelize.literal(`balanceCents + ${amountCents}`)
        : undefined,
    };

    let usedLiteral = !!updateData.balanceCents;

    try {
      if (usedLiteral) {
        await WalletMysql?.update(updateData, { where: { id: walletId } });
        await WalletSqlite?.update(updateData, { where: { id: walletId } });
      } else {
        // fallback: اقرأ الحالي وحدثه رقمياً
        const wMy = await WalletMysql?.findByPk?.(walletId);
        const wSq = await WalletSqlite?.findByPk?.(walletId);

        const myBal = wMy ? (wMy.balanceCents || 0) + amountCents : null;
        const sqBal = wSq ? (wSq.balanceCents || 0) + amountCents : null;

        if (myBal !== null) {
          await WalletMysql.update(
            { balanceCents: myBal, updatedAtLocal: now },
            { where: { id: walletId } },
          );
        }
        if (sqBal !== null) {
          await WalletSqlite.update(
            { balanceCents: sqBal, updatedAtLocal: now },
            { where: { id: walletId } },
          );
        }
      }
    } catch (e) {
      console.error('[wallet] update-balance failed:', e);
      throw e;
    }

    // رجّع الحركة (الرصيد الجديد هنجبه من /me)
    return { tx };
  }

  // ===== [GET] /wallet/me ===============================================
  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      const studentId = req.user.id;

      // تأكد إن فيه wallet
      const wallet = await ensureWallet(studentId);

      // اختار موديل الحركات المتاح
      const TxModel = WalletTxMysql || WalletTxSqlite;

      let txs = [];
      if (TxModel?.findAll) {
        txs = await TxModel.findAll({
          where: { walletId: wallet.id },
          order: [['id', 'DESC']],
          limit: 20,
        });
      }

      res.json({ success: true, data: { wallet, recent: txs } });
    } catch (e) {
      next(e);
    }
  });

  // ===== [POST] /wallet/topup-intent ====================================
  router.post('/topup-intent', requireAuth, async (req, res, next) => {
    try {
      const { amountCents, method, transferRef, proofUrl, notes } =
        req.body || {};

      if (!amountCents || amountCents < 1000) {
        return res
          .status(400)
          .json({
            success: false,
            message: 'القيمة غير صالحة (أقل من 10 جنيه)',
          });
      }

      if (!ALLOWED_TOPUP_METHODS.includes(method)) {
        return res
          .status(400)
          .json({ success: false, message: 'طريقة الشحن غير معروفة' });
      }

      const now = new Date();

      const data = {
        studentId: req.user.id,
        amountCents,
        method,
        transferRef: transferRef || null,
        proofUrl: proofUrl || null,
        notes: notes || null,
        status: 'pending',
        createdAt: now,
        updatedAtLocal: now,
      };

      const created = await performOperation({
        modelName: 'TopupRequest',
        sqliteModel: TopupSqlite,
        mysqlModel: TopupMysql,
        op: 'create',
        data,
        outboxModel: OutboxSqlite,
      });

      res.json({
        success: true,
        message: 'تم تسجيل طلب الشحن بنجاح، سيتم مراجعته قريبًا',
        data: created,
      });
    } catch (e) {
      next(e);
    }
  });

  // ===== [POST] /wallet/redeem-code =====================================
  // نسخة دفاعية مع كشف سبب الخطأ
  router.post('/redeem-code', requireAuth, async (req, res) => {
    const dev = process.env.NODE_ENV !== 'production';
    try {
      const code = String(req.body?.code || '').trim();
      if (!code || code.length < 4) {
        return res
          .status(400)
          .json({ success: false, message: 'كود غير صالح' });
      }

      const studentId = req.user?.id;
      if (!studentId) {
        return res
          .status(401)
          .json({ success: false, message: 'غير مصرح — لا يوجد مستخدم' });
      }

      // اختر المصدر المتاح
      const Wallet = WalletMysql || WalletSqlite;
      const WalletTx = WalletTxMysql || WalletTxSqlite;
      if (!Wallet || !WalletTx) {
        return res
          .status(500)
          .json({ success: false, message: 'جداول المحفظة غير مهيأة' });
      }

      // helper: أسماء الأعمدة المتاحة فعليًا
      const getAttrs = (M) => M.getAttributes?.() || M.rawAttributes || {};
      const WAttrs = getAttrs(Wallet);
      const TAttrs = getAttrs(WalletTx);

      // تأكد من وجود المحفظة
      let wallet = await Wallet.findOne({ where: { studentId } });
      if (!wallet) {
        const wData = { studentId };
        if ('balanceCents' in WAttrs) wData.balanceCents = 0;
        if ('updatedAtLocal' in WAttrs) wData.updatedAtLocal = new Date();
        wallet = await Wallet.create(wData);
      }

      // قيمة الشحن: override لو مبعوت وإلا 50 جنيه
      const amountCents = Number.isFinite(Number(req.body?.amountCents))
        ? Number(req.body.amountCents)
        : 5000;
      if (amountCents < 100) {
        return res
          .status(400)
          .json({ success: false, message: 'قيمة الكود ضعيفة جدًا' });
      }

      // ابنِ بيانات الحركة حسب الأعمدة الموجودة فعلاً
      const memo = `شحن بكود (${code.slice(0, 4)}…${code.slice(-2)})`;
      const now = new Date();

      const txData = {};
      if ('walletId' in TAttrs) txData.walletId = wallet.id;
      if ('amountCents' in TAttrs) txData.amountCents = amountCents;
      if ('desc' in TAttrs) txData.desc = memo;
      else if ('description' in TAttrs) txData.description = memo;
      else if ('note' in TAttrs) txData.note = memo;
      if ('createdAt' in TAttrs) txData.createdAt = now;
      if ('updatedAtLocal' in TAttrs) txData.updatedAtLocal = now;

      // اكتب الحركة
      const tx = await WalletTx.create(txData);

      // حدّث الرصيد بأمان
      const newBalance = (Number(wallet.balanceCents) || 0) + amountCents;
      const upd = {};
      if ('balanceCents' in WAttrs) upd.balanceCents = newBalance;
      if ('updatedAtLocal' in WAttrs) upd.updatedAtLocal = now;
      if (Object.keys(upd).length) await wallet.update(upd);

      const resWallet = {
        ...(wallet.toJSON ? wallet.toJSON() : wallet),
      };
      if ('balanceCents' in resWallet) {
        resWallet.balanceCents = newBalance;
      }

      return res.json({
        success: true,
        message: `تم شحن محفظتك بـ ${(amountCents / 100).toFixed(2)} جنيه.`,
        data: { wallet: resWallet, tx },
      });
    } catch (e) {
      const detail = {
        name: e?.name,
        message: e?.message,
        sql: e?.sql,
        sqlMessage: e?.original?.sqlMessage || e?.parent?.sqlMessage,
        sqlState: e?.original?.code || e?.parent?.code,
        fields: e?.fields,
        stack: dev ? e?.stack : undefined,
      };
      console.error('[wallet][redeem-code] ERROR:', detail);
      return res.status(500).json({
        success: false,
        message: 'فشل شحن الكود.',
        ...(dev ? { detail } : {}),
      });
    }
  });

  // ================== ShakePay integration ===============================

  // ===== [POST] /wallet/shakepay/confirm ================================
  router.post('/shakepay/confirm', requireAuth, async (req, res, next) => {
    try {
      const { amountCents, gatewayRef } = req.body || {};

      if (!amountCents || amountCents < 1000) {
        return res.status(400).json({
          success: false,
          message: 'القيمة غير صالحة (أقل من 10 جنيه)',
        });
      }

      const now = new Date();

      const data = {
        studentId: req.user.id,
        amountCents,
        method: 'shakepay',
        transferRef: gatewayRef || null,
        proofUrl: null,
        notes: gatewayRef
          ? `ShakePay payment ref: ${gatewayRef}`
          : 'ShakePay payment',
        status: 'pending',
        createdAt: now,
        updatedAtLocal: now,
      };

      const created = await performOperation({
        modelName: 'TopupRequest',
        sqliteModel: TopupSqlite,
        mysqlModel: TopupMysql,
        op: 'create',
        data,
        outboxModel: OutboxSqlite,
      });

      return res.json({
        success: true,
        message:
          'تم تسجيل عملية الدفع عبر ShakePay، وسيقوم فريق الدعم بإرسال كود الشحن قريبًا.',
        data: created,
      });
    } catch (e) {
      next(e);
    }
  });

  // ===== [POST] /wallet/shakepay/create-session =========================
  router.post('/shakepay/create-session', requireAuth, async (req, res) => {
    try {
      const { amountCents } = req.body || {};
      if (!amountCents || amountCents < 1000) {
        return res
          .status(400)
          .json({ success: false, message: 'الحد الأدنى 10 جنيه' });
      }

      const amountEGP = (amountCents / 100).toFixed(2);

      // TODO: التكامل الحقيقي مع ShakePay
      const redirectUrl =
        'https://shakepay.example.com/checkout/demo';

      return res.json({
        success: true,
        redirectUrl,
        message: `سيتم تحويلك للدفع بمبلغ ${amountEGP} جنيه عبر ShakePay`,
      });
    } catch (e) {
      console.error('[shakepay][create-session] error:', e);
      return res.status(500).json({
        success: false,
        message: 'تعذر إنشاء جلسة الدفع مع ShakePay',
      });
    }
  });

  return router;
}
