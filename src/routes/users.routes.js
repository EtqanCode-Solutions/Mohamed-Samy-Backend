import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';

function issueToken(payload) {
  const secret = process.env.JWT_SECRET || 'dev_secret';
  const expiresIn = process.env.JWT_EXPIRES || '7d';
  return jwt.sign(payload, secret, { expiresIn });
}

export default function createUsersRouter(models) {
  const router = Router();
  const { UserSqlite, UserMysql, OutboxSqlite } = models;

  // ===== Bootstrap أول أدمن لو مفيش مستخدمين =====
  router.post('/bootstrap-admin', async (req, res, next) => {
    try {
      const count = await UserSqlite.count();
      if (count > 0) {
        return res.status(400).json({ success: false, message: 'تم التهيئة بالفعل' });
      }

      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!email || password.length < 6) {
        return res.status(400).json({ success: false, message: 'أدخِل بريدًا صحيحًا وكلمة سر ≥ 6' });
      }

      const passwordHash = bcrypt.hashSync(password, 10);
      const data = { email, passwordHash, role: 'admin', isActive: true, updatedAtLocal: new Date() };

      // حفظ في الاثنين (SQLite + MySQL) بنفس أسلوبكم (لو بتحب تسجّل عبر outbox/replicator استعمل performOperation)
      await UserSqlite.create(data);
      try { await UserMysql.create(data); } catch {}

      const token = issueToken({ id: 1, role: 'admin', email });
      res.json({ success: true, message: 'تم إنشاء الأدمن', token });
    } catch (e) { next(e); }
  });

  // ===== إنشاء مستخدم (أدمن فقط) =====
  router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const role = ['admin','user'].includes(String(req.body?.role)) ? String(req.body.role) : 'user';

      if (!email || password.length < 6) {
        return res.status(400).json({ success: false, message: 'أدخِل بريدًا صحيحًا وكلمة سر ≥ 6' });
      }

      const exists = await UserSqlite.findOne({ where: { email } });
      if (exists) return res.status(409).json({ success: false, message: 'البريد مستخدم بالفعل' });

      const passwordHash = bcrypt.hashSync(password, 10);
      const data = { email, passwordHash, role, isActive: true, updatedAtLocal: new Date() };

      const created = await UserSqlite.create(data);
      try { await UserMysql.create(data); } catch {}

      res.json({ success: true, data: { id: created.id, email, role, isActive: true } });
    } catch (e) { next(e); }
  });

  // ===== تسجيل الدخول =====
  router.post('/login', async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'أدخل البريد وكلمة السر' });
      }

      const user = await UserSqlite.findOne({ where: { email, isActive: true } });
      if (!user) return res.status(401).json({ success: false, message: 'بيانات غير صحيحة' });

      const ok = bcrypt.compareSync(password, user.passwordHash || '');
      if (!ok) return res.status(401).json({ success: false, message: 'بيانات غير صحيحة' });

      const token = issueToken({ id: user.id, role: user.role, email: user.email });
      res.json({
        success: true,
        data: { id: user.id, email: user.email, role: user.role },
        token
      });
    } catch (e) { next(e); }
  });

  // ===== أنا =====
  router.get('/me', requireAuth, (req, res) => {
    res.json({ success: true, me: req.user });
  });

  // ===== قائمة المستخدمين (أدمن) =====
  router.get('/', requireAuth, requireRole('admin'), async (_req, res, next) => {
    try {
      const rows = await UserSqlite.findAll({
        order: [['id','ASC']],
        attributes: ['id','email','role','isActive','createdAtLocal','updatedAtLocal']
      });
      res.json({ success: true, data: rows });
    } catch (e) { next(e); }
  });

  return router;
}
