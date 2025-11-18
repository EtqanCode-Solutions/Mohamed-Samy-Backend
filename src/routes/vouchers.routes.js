// src/routes/vouchers.routes.js
import { Router } from 'express';
import { sha256, generateVoucherCode } from '../utils/code.js';
import { requireAuth } from '../middlewares/auth.js';
import { performOperation } from '../services/replicator.js';

export default function createVouchersRouter(models) {
  const router = Router();

  const {
    VoucherSqlite,
    VoucherMysql,
    OutboxSqlite,
    WalletSqlite,
    WalletMysql,
    WalletTxSqlite,
    WalletTxMysql,
  } = models;

  // ===== إصدار كود جديد (للمشرف فقط حالياً) =====
  router.post('/issue', async (req, res, next) => {
    try {
      const { amountCents, targetType } = req.body || {};
      if (!amountCents || amountCents <= 0) {
        return res.status(400).json({
          success: false,
          message: 'القيمة مطلوبة',
        });
      }

      const code = generateVoucherCode(14);
      const codeHash = sha256(code);

      const data = {
        codeHash,
        length: 14,
        targetType: targetType || 'WALLET',
        amountCents,
        remainingCents: amountCents,
        currency: 'EGP',
        status: 'issued',
        issuedAt: new Date(),
        updatedAtLocal: new Date(),
      };

      const created = await performOperation({
        modelName: 'Voucher',
        sqliteModel: VoucherSqlite,
        mysqlModel: VoucherMysql,
        op: 'create',
        data,
        outboxModel: OutboxSqlite,
      });

      return res.json({
        success: true,
        code,        // ⚠️ الكود الخام لازم يتسجل/يتبعث الآن، مش هتشوفه تاني
        data: created,
      });
    } catch (e) {
      next(e);
    }
  });

  // ===== استرداد الكود للمحفظة =====
  router.post('/redeem', requireAuth, async (req, res, next) => {
    try {
      const { code } = req.body || {};
      if (!code || String(code).length !== 14) {
        return res.status(400).json({
          success: false,
          message: 'الكود غير صالح',
        });
      }

      const hash = sha256(code);

      // نقرأ الفاوتشر من SQLite
      const v = await VoucherSqlite.findOne({ where: { codeHash: hash } });

      if (
        !v ||
        !['issued', 'partially_redeemed'].includes(v.status)
      ) {
        return res.status(400).json({
          success: false,
          message: 'كود غير صالح أو مستخدم مسبقًا',
        });
      }

      if (v.remainingCents <= 0) {
        return res.status(400).json({
          success: false,
          message: 'الكود منتهي الرصيد',
        });
      }

      // ===== 1) احصل على محفظة الطالب من SQLite
      let wallet = await WalletSqlite.findOne({
        where: { studentId: req.user.id },
      });

      // لو مفيش محفظة، نعمل create بمحاولة sync
      if (!wallet) {
        const walletData = {
          studentId: req.user.id,
          balanceCents: 0,
          updatedAtLocal: new Date(),
        };

        const createdWallet = await performOperation({
          modelName: 'Wallet',
          sqliteModel: WalletSqlite,
          mysqlModel: WalletMysql,
          op: 'create',
          data: walletData,
          outboxModel: OutboxSqlite,
        });

        // لو performOperation رجّع instance مباشرة
        wallet =
          createdWallet ||
          (await WalletSqlite.findOne({
            where: { studentId: req.user.id },
          }));
      }

      // safety
      if (!wallet) {
        return res.status(500).json({
          success: false,
          message: 'تعذّر إنشاء المحفظة',
        });
      }

      // ===== 2) حدث رصيد المحفظة
      const newBalance = wallet.balanceCents + v.remainingCents;

      await performOperation({
        modelName: 'Wallet',
        sqliteModel: WalletSqlite,
        mysqlModel: WalletMysql,
        op: 'update',
        where: { id: wallet.id },
        data: {
          balanceCents: newBalance,
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      // ===== 3) سجّل الحركة (WalletTx) بالـ performOperation
      const txData = {
        walletId: wallet.id,
        type: 'CREDIT',
        reason: 'VOUCHER_REDEEM',
        amountCents: v.remainingCents,
        refType: 'VOUCHER',
        refId: v.id,
        createdAt: new Date(),
      };

      await performOperation({
        modelName: 'WalletTx',
        sqliteModel: WalletTxSqlite,
        mysqlModel: WalletTxMysql,
        op: 'create',
        data: txData,
        outboxModel: OutboxSqlite,
      });

      // ===== 4) عدّل حالة الكود (Voucher)
      await performOperation({
        modelName: 'Voucher',
        sqliteModel: VoucherSqlite,
        mysqlModel: VoucherMysql,
        op: 'update',
        where: { id: v.id },
        data: {
          remainingCents: 0,
          status: 'redeemed',
          redeemedAt: new Date(),
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      // رجّع response موحّد للفرونت
      res.json({
        success: true,
        message: 'تم إضافة الرصيد إلى محفظتك بنجاح',
        added: v.remainingCents,
        newBalance: newBalance,
      });
    } catch (e) {
      next(e);
    }
  });

  // ===== استعلام إداري سريع (آخر 50 قسيمة) =====
  router.get('/', async (_req, res, next) => {
    try {
      const list = await VoucherSqlite.findAll({
        order: [['id', 'DESC']],
        limit: 50,
      });
      res.json({ success: true, data: list });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
