import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';

export default function createDeviceSessionsRouter(models) {
  const router = Router();
  const { DeviceSessionSqlite } = models;

  // عرض أجهزة طالب معيّن
  router.get('/', requireAuth, requireRole('admin','user'), async (req, res, next) => {
    try {
      const studentId = Number(req.query.studentId || 0);
      if (!studentId) return res.status(400).json({ success:false, message:'studentId مطلوب' });

      const rows = await DeviceSessionSqlite.findAll({
        where: { studentId },
        order: [['id','ASC']],
        attributes: ['id','studentId','deviceId','userAgent','ip','lastSeenAt','expiresAt','revokedAt','createdAtLocal','updatedAtLocal'],
      });
      res.json({ success:true, data: rows });
    } catch (e) { next(e); }
  });

  // مسح جهاز واحد
  router.delete('/:id', requireAuth, requireRole('admin','user'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success:false, message:'id غير صالح' });

      const s = await DeviceSessionSqlite.findByPk(id);
      if (!s) return res.status(404).json({ success:false, message:'الجلسة غير موجودة' });

      s.revokedAt = new Date();
      s.updatedAtLocal = new Date();
      await s.save();

      res.json({ success:true, message:'تم إلغاء الجلسة' });
    } catch (e) { next(e); }
  });

  // مسح كل أجهزة طالب
  router.delete('/by-student/:studentId', requireAuth, requireRole('admin','user'), async (req, res, next) => {
    try {
      const studentId = Number(req.params.studentId);
      if (!studentId) return res.status(400).json({ success:false, message:'studentId غير صالح' });

      const rows = await DeviceSessionSqlite.findAll({ where: { studentId } });
      for (const r of rows) {
        r.revokedAt = new Date();
        r.updatedAtLocal = new Date();
        await r.save();
      }
      res.json({ success:true, message:'تم إلغاء جميع الجلسات لهذا الطالب' });
    } catch (e) { next(e); }
  });

  return router;
}
