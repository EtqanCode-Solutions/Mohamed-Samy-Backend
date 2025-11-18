import { Router } from "express";
import { Op, literal } from "sequelize";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";

import { performOperation } from "../services/replicator.js";
import { isAllowedHost } from "../utils/url-guard.js";
import { requireAuth } from "../middlewares/auth.js";
import softAuth from "../middlewares/soft-auth.js";
import { requireRole } from "../middlewares/roles.js";

/* ---------------------------------
   إعدادات مساعدة
---------------------------------- */

// هنحتاج __dirname لأننا شغالين ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// فولدر هنخزن فيه الصور المرفوعة من الطلبة
// هيكون فعليًا: <project-root>/src/public/uploads
const uploadsDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ده الـ base URL اللي هنستخدمه في اللينك اللي بنرجعه للفرونت بعد الرفع
// لو عندك دومين بجد في الإنتاج حطّه هنا في ENV
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || "http://localhost:3000";

// أنواع المرفقات المسموحة في الإجابات (ملحقات الـ admin)
const ALLOWED_KINDS = [
  "image",
  "video",
  "audio",
  "pdf",
  "doc",
  "mp4",
  "hls",
  "external",
  "link",
];

/**
 * بننضّف attachments جاي من الـ body في POST /questions/:id/answers
 * ونتأكد إن URLs اللي مش "external" جاية من دومين مسموح
 */
function normalizeAttachments(arr) {
  if (!arr) return null;
  if (!Array.isArray(arr)) return null;

  const out = [];

  for (const x of arr) {
    if (!x || typeof x !== "object") continue;

    const kind = String(x.kind || "").toLowerCase();
    if (!ALLOWED_KINDS.includes(kind)) continue;

    const url = String(x.url || "").trim();
    if (!url) continue;

    const isExternal =
      kind === "external" ||
      ["youtube", "vimeo"].includes(
        String(x.provider || "").toLowerCase()
      );

    // لو مش external لازم يكون الهوست مسموح
    if (!isExternal && !isAllowedHost(url)) continue;

    out.push({
      kind,
      url,
      mime: x.mime ?? null,
      provider: x.provider ? String(x.provider).toLowerCase() : null,
      streamType: x.streamType
        ? String(x.streamType).toLowerCase()
        : null,
      durationSec:
        x.durationSec != null ? Number(x.durationSec) : null,
      thumb: x.thumb ?? null,
    });
  }

  return out.length ? out : null;
}

/* ---------------------------------
   Multer (رفع الصور)
---------------------------------- */

// إعداد التخزين: اسم ملف unique + الاحتفاظ بالامتداد
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  },
});

// فلتر: بس صور
function imageOnlyFilter(_req, file, cb) {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Only image/* files are allowed"));
  }
  cb(null, true);
}

const uploadImage = multer({
  storage,
  fileFilter: imageOnlyFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

/* ---------------------------------
   الراوتر الرئيسي
---------------------------------- */

export default function createCommunityRouter(models) {
  const router = Router();

  const {
    OutboxSqlite,
    CommunityQuestionSqlite,
    CommunityQuestionMysql,
    CommunityAnswerSqlite,
    CommunityAnswerMysql,
    StudentSqlite, // بيانات الطالب اللي سأل
    UserSqlite, // بيانات اللي بيرد (المُجيب)
  } = models;

  /* ================================
     1. رفع صورة سؤال (طالب)
     POST /community/upload
     form-data: image=<File>
     يرجّع: { success, url, fileName, mime, size }
     --------------------------------
     الفكرة:
     - الطالب (أو أي مستخدم لوجيد) يرفع صورة أولاً
     - السيرفر يحطها في public/uploads
     - نرجع URL ثابت
     - الفرونت بعدين يبعت /questions وفيه imageUrl = نفس الـURL
  ================================= */
  router.post(
    "/upload",
    requireAuth, // لازم يكون مسجّل دخول
    uploadImage.single("image"), // "image" هو اسم الحقل في form-data
    async (req, res) => {
      try {
        // ممكن تقيّد رول الطالب فقط لو حابب:
        // if (req.user?.role !== "student") { ... }

        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "لم يتم استلام أي ملف صورة",
          });
        }

        // URL عام يقدر الفرونت يستخدمه مباشرة في <img src="...">
        const filePublicUrl = `${PUBLIC_BASE_URL}/uploads/${req.file.filename}`;

        // NOTE:
        // علشان الراوت /questions يقبله، لازم الدومين ده يكون مسموح
        // داخل CLOUD_ALLOWED_HOSTS (هنتكلم تحت)
        return res.json({
          success: true,
          url: filePublicUrl,
          fileName: req.file.originalname,
          mime: req.file.mimetype,
          size: req.file.size,
        });
      } catch (err) {
        console.error("upload error:", err);
        return res.status(500).json({
          success: false,
          message: "فشل رفع الملف",
        });
      }
    }
  );

  /* ================================
     2. إنشاء سؤال (طالب)
     POST /community/questions
     body: { body: string, imageUrl?: string }
  ================================= */
  router.post("/questions", requireAuth, async (req, res, next) => {
    try {
      // مسموح للطالب فقط يسأل
      if (req.user?.role !== "student") {
        return res
          .status(403)
          .json({ success: false, message: "هذا المسار للطلاب فقط" });
      }

      const body = String(req.body?.body || "").trim();
      const imageUrl = req.body?.imageUrl
        ? String(req.body.imageUrl).trim()
        : null;

      if (!body || body.length < 3) {
        return res.status(400).json({
          success: false,
          message: "محتوى السؤال (نص) مطلوب بحد أدنى 3 أحرف",
        });
      }

      // لو فيه صورة، اتحقق إن الهوست بتاعها مسموح
      if (imageUrl && !isAllowedHost(imageUrl)) {
        return res.status(400).json({
          success: false,
          message: "دومين الصورة غير مسموح",
        });
      }

      const data = {
        studentId: Number(req.user.id),
        body,
        imageUrl,
        status: "open", // لسة ماحدش جاوب
        updatedAtLocal: new Date(),
      };

      const created = await performOperation({
        modelName: "CommunityQuestion",
        sqliteModel: CommunityQuestionSqlite,
        mysqlModel: CommunityQuestionMysql,
        op: "create",
        data,
        outboxModel: OutboxSqlite,
      });

      res.json({ success: true, data: created.toJSON() });
    } catch (e) {
      next(e);
    }
  });

  /* ================================
     3. لستة الأسئلة (Dashboard + واجهة الطالب)
     GET /community/questions
     query:
       q=بحث نصي داخل body
       status=open/answered/closed
       mine=1 => رجّع أسئلتي أنا بس (لو أنا student)
       page, limit (pagination) أو all=1 لكل النتائج
  ================================= */
  router.get("/questions", softAuth, async (req, res, next) => {
    try {
      const q = String(req.query.q || "").trim();
      const status = String(req.query.status || "").trim();
      const mine = String(req.query.mine || "").trim() === "1";
      const all = String(req.query.all || "").trim() === "1";

      const page = Math.max(1, Number(req.query.page || 1));
      const limit = all
        ? undefined
        : Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const offset = all ? undefined : (page - 1) * limit;

      const where = { isDeleted: false };
      if (q) where.body = { [Op.like]: `%${q}%` };
      if (status) where.status = status;
      if (mine && req.user?.role === "student") {
        where.studentId = Number(req.user.id);
      }

      const findOpts = {
        where,
        order: [["id", "DESC"]],
        include: [
          {
            model: StudentSqlite,
            as: "student",
            attributes: [
              "id",
              "studentName",
              "email",
              "studentPhone",
              "year",
              "region",
              "centerName",
              "centerCode",
            ],
          },
        ],
        attributes: {
          include: [
            // عدد الإجابات
            [
              literal(
                `(SELECT COUNT(1)
                    FROM community_answers a
                   WHERE a.questionId = CommunityQuestion.id
                     AND a.isDeleted = 0)`
              ),
              "answersCount",
            ],
            // آخر مين رد (اسم او ايميل)
            [
              literal(
                `(SELECT COALESCE(u.name, u.email)
                    FROM community_answers a
                    JOIN users u ON u.id = a.responderId
                   WHERE a.questionId = CommunityQuestion.id
                     AND a.isDeleted = 0
                   ORDER BY a.id DESC
                   LIMIT 1)`
              ),
              "lastAnswerByName",
            ],
          ],
        },
      };

      if (!all) {
        findOpts.limit = limit;
        findOpts.offset = offset;
      }

      const { rows, count } =
        await CommunityQuestionSqlite.findAndCountAll(findOpts);

      return res.json({
        success: true,
        data: rows,
        pagination: all
          ? { total: count }
          : { page, limit, total: count },
      });
    } catch (e) {
      next(e);
    }
  });

  /* ================================
     4. كل الأسئلة مرة واحدة
     GET /community/questions/all
  ================================= */
  router.get("/questions/all", softAuth, async (_req, res, next) => {
    try {
      const rows = await CommunityQuestionSqlite.findAll({
        where: { isDeleted: false },
        order: [["id", "DESC"]],
        include: [
          {
            model: StudentSqlite,
            as: "student",
            attributes: [
              "id",
              "studentName",
              "email",
              "studentPhone",
              "year",
              "region",
              "centerName",
              "centerCode",
            ],
          },
        ],
        attributes: {
          include: [
            [
              literal(
                `(SELECT COUNT(1)
                    FROM community_answers a
                   WHERE a.questionId = CommunityQuestion.id
                     AND a.isDeleted = 0)`
              ),
              "answersCount",
            ],
            [
              literal(
                `(SELECT COALESCE(u.name, u.email)
                    FROM community_answers a
                    JOIN users u ON u.id = a.responderId
                   WHERE a.questionId = CommunityQuestion.id
                     AND a.isDeleted = 0
                   ORDER BY a.id DESC
                   LIMIT 1)`
              ),
              "lastAnswerByName",
            ],
          ],
        },
      });

      return res.json({
        success: true,
        data: rows,
        total: rows.length,
      });
    } catch (e) {
      next(e);
    }
  });

  /* ================================
     5. تفاصيل سؤال + الردود
     GET /community/questions/:id
  ================================= */
  router.get("/questions/:id", softAuth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "معرّف غير صالح" });
      }

      const q = await CommunityQuestionSqlite.findOne({
        where: { id, isDeleted: false },
        include: [
          {
            model: StudentSqlite,
            as: "student",
            attributes: [
              "id",
              "studentName",
              "email",
              "studentPhone",
              "year",
              "region",
              "centerName",
              "centerCode",
            ],
          },
        ],
      });

      if (!q) {
        return res.status(404).json({
          success: false,
          message: "السؤال غير موجود",
        });
      }

      const answers = await CommunityAnswerSqlite.findAll({
        where: { questionId: id, isDeleted: false },
        order: [["id", "ASC"]],
        include: [
          {
            model: UserSqlite,
            as: "responder",
            attributes: ["id", "email", "role", "name"], // الشخص اللي جاوب
          },
        ],
      });

      res.json({
        success: true,
        data: { question: q, answers },
      });
    } catch (e) {
      next(e);
    }
  });

  /* ================================
     6. إضافة إجابة (مشرف / أدمن / مدرس)
     POST /community/questions/:id/answers
     body:
       {
         contentText?: string,
         attachments?: [
           {
             kind: "image" | "video" | "audio" | "pdf" | "doc" | "mp4" | "hls" | "external" | "link",
             url: "https://...",
             mime?: "image/png",
             provider?: "youtube",
             streamType?: "hls",
             durationSec?: 123,
             thumb?: "https://..."
           }
         ]
       }
  ================================= */
  router.post(
    "/questions/:id/answers",
    requireAuth,
    requireRole("admin", "user"), // مش طالب عادي
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (!id) {
          return res
            .status(400)
            .json({ success: false, message: "معرّف غير صالح" });
        }

        const q = await CommunityQuestionSqlite.findOne({
          where: { id, isDeleted: false },
        });
        if (!q) {
          return res.status(404).json({
            success: false,
            message: "السؤال غير موجود",
          });
        }

        const contentText = String(req.body?.contentText || "").trim();
        const attachments = normalizeAttachments(req.body?.attachments);

        if (!contentText && !attachments) {
          return res.status(400).json({
            success: false,
            message: "أرسل نصًا أو وسائط واحدة على الأقل",
          });
        }

        const created = await performOperation({
          modelName: "CommunityAnswer",
          sqliteModel: CommunityAnswerSqlite,
          mysqlModel: CommunityAnswerMysql,
          op: "create",
          data: {
            questionId: id,
            responderId: Number(req.user.id),
            responderRole: req.user.role || "user",
            contentText: contentText || null,
            attachments,
            updatedAtLocal: new Date(),
          },
          outboxModel: OutboxSqlite,
        });

        // أول رد → غيّر status من open لـ answered
        if (q.status === "open") {
          await performOperation({
            modelName: "CommunityQuestion",
            sqliteModel: CommunityQuestionSqlite,
            mysqlModel: CommunityQuestionMysql,
            op: "update",
            where: { id },
            data: {
              status: "answered",
              updatedAtLocal: new Date(),
            },
            outboxModel: OutboxSqlite,
          });
        }

        // رجّع الإجابة مع بيانات المجيب
        const withResponder = await CommunityAnswerSqlite.findByPk(
          created.id,
          {
            include: [
              {
                model: UserSqlite,
                as: "responder",
                attributes: ["id", "email", "role", "name"],
              },
            ],
          }
        );

        res.json({ success: true, data: withResponder });
      } catch (e) {
        next(e);
      }
    }
  );

  /* ================================
     7. تغيير حالة السؤال (admin فقط)
     PATCH /community/questions/:id/status
     body: { status: "open" | "answered" | "closed" }
  ================================= */
  router.patch(
    "/questions/:id/status",
    requireAuth,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const nextStatus = String(req.body?.status || "").trim();

        if (!id || !["open", "answered", "closed"].includes(nextStatus)) {
          return res.status(400).json({
            success: false,
            message: "بيانات غير صالحة",
          });
        }

        const q = await CommunityQuestionSqlite.findOne({
          where: { id, isDeleted: false },
        });
        if (!q) {
          return res.status(404).json({
            success: false,
            message: "السؤال غير موجود",
          });
        }

        await performOperation({
          modelName: "CommunityQuestion",
          sqliteModel: CommunityQuestionSqlite,
          mysqlModel: CommunityQuestionMysql,
          op: "update",
          where: { id },
          data: {
            status: nextStatus,
            updatedAtLocal: new Date(),
          },
          outboxModel: OutboxSqlite,
        });

        res.json({
          success: true,
          message: "تم التحديث",
          data: { id, status: nextStatus },
        });
      } catch (e) {
        next(e);
      }
    }
  );
  /* ================================
   8) حذف سؤال واحد (Admin)
   DELETE /community/questions/:id
   - Soft delete للسؤال + كل الردود التابعة له
================================ */
router.delete(
  "/questions/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({ success: false, message: "معرّف غير صالح" });
      }

      const q = await CommunityQuestionSqlite.findOne({
        where: { id, isDeleted: false },
        attributes: ["id"],
      });
      if (!q) {
        return res.status(404).json({ success: false, message: "السؤال غير موجود" });
      }

      // احذف السؤال (soft)
      await performOperation({
        modelName: "CommunityQuestion",
        sqliteModel: CommunityQuestionSqlite,
        mysqlModel: CommunityQuestionMysql,
        op: "update",
        where: { id },
        data: { isDeleted: true, updatedAtLocal: new Date() },
        outboxModel: OutboxSqlite,
      });

      // احذف الردود التابعة (soft)
      const answers = await CommunityAnswerSqlite.findAll({
        where: { questionId: id, isDeleted: false },
        attributes: ["id"],
      });
      for (const a of answers) {
        await performOperation({
          modelName: "CommunityAnswer",
          sqliteModel: CommunityAnswerSqlite,
          mysqlModel: CommunityAnswerMysql,
          op: "update",
          where: { id: a.id },
          data: { isDeleted: true, updatedAtLocal: new Date() },
          outboxModel: OutboxSqlite,
        });
      }

      return res.json({
        success: true,
        message: "تم حذف السؤال وجميع ردوده",
        data: { id, answersDeleted: answers.length },
      });
    } catch (e) {
      next(e);
    }
  }
);

/* ================================
   9) حذف مجموعة/كل الأسئلة (Admin)
   DELETE /community/questions
   - إن بَعَتَّ ids[] في الـ body: يحذف المحدد فقط
   - إن حطيت ?all=1: يحذف كل الأسئلة (الغير محذوفة)
================================ */
router.delete(
  "/questions",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const all = String(req.query.all || "") === "1";
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((n) => Number(n)).filter(Boolean)
        : [];

      if (!all && ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "أرسل ids كـ Array أو استخدم all=1",
        });
      }

      // حدد الأهداف الفعلية الموجودة وغير المحذوفة
      let targetIds = [];
      if (all) {
        const rows = await CommunityQuestionSqlite.findAll({
          where: { isDeleted: false },
          attributes: ["id"],
        });
        targetIds = rows.map((r) => r.id);
      } else {
        const rows = await CommunityQuestionSqlite.findAll({
          where: { id: ids, isDeleted: false },
          attributes: ["id"],
        });
        targetIds = rows.map((r) => r.id);
      }

      if (targetIds.length === 0) {
        return res.json({
          success: true,
          message: "لا توجد أسئلة مطابقة للحذف",
          data: { questions: 0, answers: 0, ids: [] },
        });
      }

      let deletedQ = 0;
      let deletedA = 0;

      for (const qid of targetIds) {
        // delete question
        await performOperation({
          modelName: "CommunityQuestion",
          sqliteModel: CommunityQuestionSqlite,
          mysqlModel: CommunityQuestionMysql,
          op: "update",
          where: { id: qid },
          data: { isDeleted: true, updatedAtLocal: new Date() },
          outboxModel: OutboxSqlite,
        });
        deletedQ++;

        // delete its answers
        const answers = await CommunityAnswerSqlite.findAll({
          where: { questionId: qid, isDeleted: false },
          attributes: ["id"],
        });
        for (const a of answers) {
          await performOperation({
            modelName: "CommunityAnswer",
            sqliteModel: CommunityAnswerSqlite,
            mysqlModel: CommunityAnswerMysql,
            op: "update",
            where: { id: a.id },
            data: { isDeleted: true, updatedAtLocal: new Date() },
            outboxModel: OutboxSqlite,
          });
          deletedA++;
        }
      }

      return res.json({
        success: true,
        message: "تم الحذف بنجاح",
        data: { questions: deletedQ, answers: deletedA, ids: targetIds },
      });
    } catch (e) {
      next(e);
    }
  }
);


  return router;
}