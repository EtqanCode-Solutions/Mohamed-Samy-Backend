// src/routes/qr-links.routes.js
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { performOperation } from "../services/replicator.js";

export function createQrLinksRouter(models) {
  const router = Router();

  const {
    QrSnippetSqlite,
    QrSnippetMysql,
    StudentQrViewSqlite,
    StudentQrViewMysql,
    StudentAttendanceSqlite,
    OutboxSqlite,
  } = models;

  /**
   * GET /qr-links/:token
   * - لازم الطالب يكون logged-in (requireAuth)
   * - بيرجع بيانات الفيديو + يسجّل المشاهدة في StudentQrView
   * - الشكل متوافق مع QrVideoResponse في الفرونت:
   *   { ok: boolean, message?: string, data?: { ... } }
   */
  router.get("/:token", requireAuth, async (req, res, next) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) {
        return res.json({
          success: false,
          ok: false,
          message: "رمز QR غير صالح.",
        });
      }

      const studentId = Number(req.user?.id);
      if (!studentId || req.user?.role !== "student") {
        return res.status(403).json({
          success: false,
          ok: false,
          message: "مصرّح للطلاب فقط.",
        });
      }

      const qr = await QrSnippetSqlite.findOne({
        where: { token, isActive: true },
      });

      if (!qr) {
        return res.json({
          success: false,
          ok: false,
          message: "الكود غير صالح أو غير مفعّل.",
        });
      }

      const now = new Date();

      if (qr.linkExpiresAt && new Date(qr.linkExpiresAt).getTime() < now.getTime()) {
        return res.json({
          success: false,
          ok: false,
          message: "انتهت صلاحية هذا الكود.",
        });
      }

      // نحاول نربطه بـ attendance لو موجودة لنفس (student, course, lesson)
      let attendanceId = null;
      if (StudentAttendanceSqlite) {
        const att = await StudentAttendanceSqlite.findOne({
          where: {
            studentId,
            courseId: qr.courseId,
            lessonId: qr.lessonId,
          },
          order: [["id", "DESC"]],
        });
        if (att) attendanceId = att.id;
      }

      // Upsert بسيط لـ StudentQrView
      let view = await StudentQrViewSqlite.findOne({
        where: { studentId, qrId: qr.id },
      });

      if (!view) {
        const data = {
          studentId,
          qrId: qr.id,
          courseId: qr.courseId,
          lessonId: qr.lessonId,
          attendanceId,
          viewsCount: 1,
          firstViewedAt: now,
          lastViewedAt: now,
          updatedAtLocal: now,
        };

        const created = await performOperation({
          modelName: "StudentQrView",
          sqliteModel: StudentQrViewSqlite,
          mysqlModel: StudentQrViewMysql,
          op: "create",
          data,
          outboxModel: OutboxSqlite,
        });

        view = created;
      } else {
        const patch = {
          viewsCount: (view.viewsCount || 0) + 1,
          lastViewedAt: now,
          updatedAtLocal: now,
        };

        if (!view.attendanceId && attendanceId) {
          patch.attendanceId = attendanceId;
        }

        await performOperation({
          modelName: "StudentQrView",
          sqliteModel: StudentQrViewSqlite,
          mysqlModel: StudentQrViewMysql,
          op: "update",
          where: { id: view.id },
          data: patch,
          outboxModel: OutboxSqlite,
        });
      }

      // الـ payload اللي هنرجعه للفرونت
      const payload = {
        id: qr.id,
        title: qr.title,
        description: qr.description || null,
        subject: qr.subject || null,
        teacher: qr.teacher || null,
        videoUrl: qr.streamUrl,
        posterUrl: qr.posterUrl || null,
        expiresAt: qr.linkExpiresAt
          ? new Date(qr.linkExpiresAt).toISOString()
          : null,
      };

      return res.json({
        success: true, // للـ API العامة
        ok: true,      // للـ QrWatchService
        data: payload,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export default createQrLinksRouter;
