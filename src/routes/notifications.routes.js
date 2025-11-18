// src/routes/notifications.routes.js
import { Router } from "express";
import { Op } from "sequelize";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/roles.js";
import { performOperation } from "../services/replicator.js";

export default function createNotificationsRouter(models) {
  const router = Router();
  const {
    NotificationSqlite,
    NotificationMysql,
    StudentSqlite,
    OutboxSqlite,
  } = models;

  // Helper: نجيب studentId من الـ JWT
  function getCurrentStudentId(req) {
    const u = req.user || {};
    if (u.studentId) return Number(u.studentId);
    if (u.role === "student" && u.id) return Number(u.id);
    return null;
  }

  // ========= 1) إشعارات الطالب الحالي =========
  // GET /notifications
  router.get("/", requireAuth, async (req, res, next) => {
    try {
      const studentId = getCurrentStudentId(req);
      if (!studentId) {
        return res.status(403).json({
          success: false,
          message: "لا يوجد طالب مرتبط بالحساب الحالي",
        });
      }

      const notifs = await NotificationSqlite.findAll({
        where: { studentId },
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
        limit: 200,
      });

      const data = notifs.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        date: n.createdAt
          ? new Date(n.createdAt).toISOString()
          : n.updatedAtLocal
          ? new Date(n.updatedAtLocal).toISOString()
          : null,
        read: !!n.isRead,
        kind: n.kind || null,
        data: n.dataJson || null,
      }));

      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  // ========= 2) تعليم واحد كمقروء =========
  // POST /notifications/:id/read
  router.post("/:id/read", requireAuth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({
          success: false,
          message: "معرّف الإشعار غير صالح",
        });
      }

      const studentId = getCurrentStudentId(req);
      if (!studentId) {
        return res.status(403).json({
          success: false,
          message: "لا يوجد طالب مرتبط بالحساب الحالي",
        });
      }

      const notif = await NotificationSqlite.findByPk(id);
      if (!notif || Number(notif.studentId) !== Number(studentId)) {
        return res.status(404).json({
          success: false,
          message: "الإشعار غير موجود",
        });
      }

      await performOperation({
        modelName: "Notification",
        sqliteModel: NotificationSqlite,
        mysqlModel: NotificationMysql,
        op: "update",
        where: { id },
        data: { isRead: true },
        outboxModel: OutboxSqlite,
      });

      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // ========= 3) تعليم الكل كمقروء =========
  // POST /notifications/mark-all-read
  router.post("/mark-all-read", requireAuth, async (req, res, next) => {
    try {
      const studentId = getCurrentStudentId(req);
      if (!studentId) {
        return res.status(403).json({
          success: false,
          message: "لا يوجد طالب مرتبط بالحساب الحالي",
        });
      }

      await performOperation({
        modelName: "Notification",
        sqliteModel: NotificationSqlite,
        mysqlModel: NotificationMysql,
        op: "update",
        where: { studentId, isRead: false },
        data: { isRead: true },
        outboxModel: OutboxSqlite,
      });

      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // ========= 4) Admin/Teacher Broadcast =========
  router.post(
    "/admin/broadcast",
    requireAuth,
    requireRole("admin", "teacher"),
    async (req, res, next) => {
      try {
        const {
          title,
          body,
          studentId,
          studentIds,
          centerId,
          level,
        } = req.body || {};

        const titleStr = String(title || "").trim();
        const bodyStr = String(body || "").trim();

        if (!titleStr || !bodyStr) {
          return res.status(400).json({
            success: false,
            message: "title و body مطلوبة",
          });
        }

        const targetIds = new Set();

        // طالب واحد
        if (studentId) {
          targetIds.add(Number(studentId));
        }

        // مجموعة طلاب
        if (Array.isArray(studentIds)) {
          studentIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0)
            .forEach((id) => targetIds.add(id));
        }

        // فلترة بالسنتر / المرحلة
        if (centerId || level) {
          const where = {};
          if (centerId) where.centerId = Number(centerId);

          // 👈 استخدمنا year بدل level لأن ده اسم العمود في جدول الطلاب
          if (level) where.year = String(level);

          const students = await StudentSqlite.findAll({ where });
          students.forEach((s) => targetIds.add(Number(s.id)));
        }

        if (!targetIds.size) {
          return res.status(400).json({
            success: false,
            message: "لا يوجد طلاب مستهدفين للإشعار",
          });
        }

        const now = new Date();
        let sentCount = 0;

        for (const sid of targetIds) {
          await performOperation({
            modelName: "Notification",
            sqliteModel: NotificationSqlite,
            mysqlModel: NotificationMysql,
            op: "create",
            data: {
              studentId: sid,
              title: titleStr,
              body: bodyStr,
              kind: "GENERAL",
              dataJson: null,
              isRead: false,
              createdAt: now,
              updatedAtLocal: now,
            },
            outboxModel: OutboxSqlite,
          });
          sentCount++;
        }

        res.json({
          success: true,
          data: { sentCount },
        });
      } catch (e) {
        next(e);
      }
    }
  );
  // ========= (إداري) قائمة كل الإشعارات مع pagination =========
// GET /notifications/admin?page=1&pageSize=20
router.get(
  "/admin",
  requireAuth,
  requireRole("admin", "teacher"),
  async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const offset = (page - 1) * pageSize;

      const { count, rows } = await NotificationSqlite.findAndCountAll({
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
        offset,
        limit: pageSize,
      });

      const data = rows.map(n => ({
        id: n.id,
        studentId: Number(n.studentId),
        title: n.title,
        body: n.body,
        date: n.createdAt ? new Date(n.createdAt).toISOString() :
              n.updatedAtLocal ? new Date(n.updatedAtLocal).toISOString() : null,
        read: !!n.isRead,
        kind: n.kind || null,
        data: n.dataJson || null,
      }));

      res.json({
        success: true,
        data,
        meta: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) }
      });
    } catch (e) { next(e); }
  }
);


  return router;
}
