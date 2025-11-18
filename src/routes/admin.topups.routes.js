// src/routes/admin.topups.routes.js
import { Router } from 'express';
import { performOperation } from '../services/replicator.js';
import { requireAuth } from '../middlewares/auth.js';

export default function createAdminTopupsRouter(models) {
  const router = Router();
  const {
    TopupSqlite,
    WalletSqlite,
    WalletTxSqlite,
    OutboxSqlite,
  } = models;

  // ===== عرض كل طلبات الشحن =====
  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const list = await TopupSqlite.findAll({
        order: [['id', 'DESC']],
        limit: 100,
      });
      res.json({ success: true, data: list });
    } catch (e) {
      next(e);
    }
  });

  // ===== عرض تفاصيل طلب واحد =====
  router.get('/:id', requireAuth, async (req, res, next) => {
    try {
      const topup = await TopupSqlite.findByPk(req.params.id);
      if (!topup) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
      res.json({ success: true, data: topup });
    } catch (e) {
      next(e);
    }
  });

  // ===== الموافقة على الشحن =====
  router.post('/:id/approve', requireAuth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const adminId = req.user?.id || null; // لاحقًا ممكن تستخدم صلاحية "admin"
      const topup = await TopupSqlite.findByPk(id);
      if (!topup) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
      if (topup.status !== 'pending')
        return res.status(400).json({ success: false, message: 'تمت معالجته مسبقًا' });

      const studentId = topup.studentId;
      const wallet = await WalletSqlite.findOne({ where: { studentId } });
      if (!wallet)
        return res.status(404).json({ success: false, message: 'محفظة الطالب غير موجودة' });

      // أضف الرصيد
      wallet.balanceCents += topup.amountCents;
      wallet.updatedAtLocal = new Date();
      await wallet.save();

      // سجّل الحركة
      await WalletTxSqlite.create({
        walletId: wallet.id,
        type: 'CREDIT',
        reason: 'TOPUP_APPROVED',
        amountCents: topup.amountCents,
        refType: 'TOPUP',
        refId: topup.id,
      });

      // عدّل حالة الطلب
      topup.status = 'approved';
      topup.reviewedAt = new Date();
      topup.reviewedBy = adminId;
      topup.updatedAtLocal = new Date();
      await topup.save();

      await performOperation({
        modelName: 'Wallet',
        sqliteModel: WalletSqlite,
        mysqlModel: WalletSqlite, // لو عندك نسخة MySQL بعدين غيّرها
        op: 'update',
        where: { id: wallet.id },
        data: { balanceCents: wallet.balanceCents, updatedAtLocal: new Date() },
        outboxModel: OutboxSqlite,
      });

      res.json({
        success: true,
        message: 'تمت الموافقة على الشحن وإضافة الرصيد بنجاح',
        data: { wallet, topup },
      });
    } catch (e) {
      next(e);
    }
  });

  // ===== رفض طلب الشحن =====
  router.post('/:id/reject', requireAuth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const topup = await TopupSqlite.findByPk(id);
      if (!topup) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
      if (topup.status !== 'pending')
        return res.status(400).json({ success: false, message: 'تمت معالجته مسبقًا' });

      topup.status = 'rejected';
      topup.reviewedAt = new Date();
      topup.updatedAtLocal = new Date();
      topup.reviewNotes = req.body?.reason || null;
      await topup.save();

      res.json({ success: true, message: 'تم رفض الطلب', data: topup });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
