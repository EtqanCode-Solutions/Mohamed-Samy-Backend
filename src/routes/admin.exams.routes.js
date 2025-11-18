// src/routes/admin-exams.routes.js
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/roles.js";
import { normalizeLevel } from "../utils/levels.js";

function serializeExam(e) {
  return {
    id: e.id,
    title: e.title,
    description: e.description || "",
    level: e.level,
    category: e.category,
    grade: e.grade,
    isFree: !!e.isFree,
    status: e.status,
    durationMin: e.durationMin,
    courseId: e.courseId ?? null,
    lessonId: e.lessonId ?? null,
  };
}

export default function createAdminExamsRouter(models) {
  const router = Router();
  const { ExamSqlite, ExamMysql, ExamQuestionSqlite, ExamQuestionMysql } =
    models;

  // ✅ كل راوت هنا أدمن بس
  router.use(requireAuth, requireRole("admin"));

  // =================== إنشاء امتحان جديد ===================
  router.post("/", async (req, res, next) => {
    try {
      const body = req.body || {};

      const title = body.title;
      const description = body.description || "";
      const level = body.level ?? null;
      const category = body.category ?? null;

      const durationMin = body.durationMin ?? 20;
      const isFree = body.isFree ?? true;
      const status = body.status ?? "published";

      const gradeRaw = body.grade;
      const grade = normalizeLevel(gradeRaw);

      const courseId = body.courseId ? Number(body.courseId) : null;
      const lessonId = body.lessonId ? Number(body.lessonId) : null;

      if (!title) {
        return res.status(400).json({
          success: false,
          message: "title مطلوب",
        });
      }

      if (!grade) {
        return res.status(400).json({
          success: false,
          message: "grade غير صالح",
        });
      }

      const now = new Date();

      const exam = await ExamSqlite.create({
        title,
        description,
        level,
        category,
        grade,
        durationMin,
        isFree: !!isFree,
        status,
        isDeleted: false,
        courseId,
        lessonId,
        createdAt: now,
        updatedAtLocal: now,
      });

      if (ExamMysql) {
        try {
          await ExamMysql.create({
            id: exam.id,
            title,
            description,
            level,
            category,
            grade,
            durationMin,
            isFree: !!isFree,
            status,
            isDeleted: false,
            courseId,
            lessonId,
            createdAt: exam.createdAt,
            updatedAtLocal: now,
          });
        } catch {
          // MySQL اختياري
        }
      }

      res.json({ success: true, data: { id: exam.id } });
    } catch (e) {
      next(e);
    }
  });

  // =================== تعديل امتحان ===================
  router.put("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "examId غير صالح" });
      }

      const exam = await ExamSqlite.findByPk(id);
      if (!exam) {
        return res
          .status(404)
          .json({ success: false, message: "الامتحان غير موجود" });
      }

      const body = req.body || {};

      let title = body.title ?? exam.title;
      let description = body.description ?? exam.description ?? "";
      let level = body.level ?? exam.level;
      let category = body.category ?? exam.category;
      let status = body.status ?? exam.status;

      let durationMin =
        body.durationMin != null ? Number(body.durationMin) : exam.durationMin;
      let isFree =
        typeof body.isFree === "boolean" ? body.isFree : exam.isFree;

      const grade = normalizeLevel(body.grade ?? exam.grade);

      const courseId =
        body.courseId != null ? Number(body.courseId) : exam.courseId;
      const lessonId =
        body.lessonId != null ? Number(body.lessonId) : exam.lessonId;

      if (!title) {
        return res.status(400).json({
          success: false,
          message: "title مطلوب",
        });
      }

      if (!grade) {
        return res.status(400).json({
          success: false,
          message: "grade غير صالح",
        });
      }

      if (Number.isNaN(durationMin) || durationMin <= 0) {
        return res.status(400).json({
          success: false,
          message: "durationMin غير صالح",
        });
      }

      const now = new Date();

      await exam.update({
        title,
        description,
        level,
        category,
        grade,
        durationMin,
        isFree: !!isFree,
        status,
        courseId,
        lessonId,
        updatedAtLocal: now,
      });

      if (ExamMysql) {
        try {
          const examMysql = await ExamMysql.findByPk(id);
          if (examMysql) {
            await examMysql.update({
              title,
              description,
              level,
              category,
              grade,
              durationMin,
              isFree: !!isFree,
              status,
              courseId,
              lessonId,
              updatedAtLocal: now,
            });
          }
        } catch {
          // MySQL اختياري
        }
      }

      return res.json({ success: true, data: serializeExam(exam) });
    } catch (e) {
      next(e);
    }
  });

  // =================== حذف امتحان (Hard delete) ===================
  router.delete("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "examId غير صالح" });
      }

      const exam = await ExamSqlite.findByPk(id);
      if (!exam) {
        return res
          .status(404)
          .json({ success: false, message: "الامتحان غير موجود" });
      }

      // 1) حذف أسئلة الامتحان من SQLite
      await ExamQuestionSqlite.destroy({ where: { examId: id } });

      // 2) حذف أسئلة الامتحان من MySQL إن وُجد
      if (ExamQuestionMysql) {
        try {
          await ExamQuestionMysql.destroy({ where: { examId: id } });
        } catch {
          // MySQL اختياري
        }
      }

      // 3) حذف الامتحان نفسه من SQLite
      await exam.destroy();

      // 4) حذف الامتحان من MySQL إن وُجد
      if (ExamMysql) {
        try {
          await ExamMysql.destroy({ where: { id } });
        } catch {
          // MySQL اختياري
        }
      }

      return res.json({ success: true, data: { id } });
    } catch (e) {
      next(e);
    }
  });

  // =================== جلب أسئلة امتحان واحد ===================
  router.get("/:id/questions", async (req, res, next) => {
    try {
      const examId = Number(req.params.id);
      if (Number.isNaN(examId) || examId <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "examId غير صالح" });
      }

      // تأكد أن الامتحان موجود
      const exam = await ExamSqlite.findByPk(examId);
      if (!exam) {
        return res
          .status(404)
          .json({ success: false, message: "الامتحان غير موجود" });
      }

      const qRows = await ExamQuestionSqlite.findAll({
        where: { examId },
        order: [
          ["orderIndex", "ASC"],
          ["id", "ASC"],
        ],
      });

      const data = qRows.map((q) => {
        let parsed;
        try {
          parsed = JSON.parse(q.choicesJson || "[]");
        } catch {
          parsed = [];
        }
        const choicesArr = Array.isArray(parsed) ? parsed : [];
        const choices = choicesArr.map((c) => String(c.text || ""));

        const idx = choicesArr.findIndex((c) => c.id === q.answer);
        const correctIndex = idx >= 0 ? idx : 0;

        return {
          id: q.id,
          examId: q.examId,
          text: q.text || "",
          imageUrl: q.imageUrl || null, // ✅ دعم صورة السؤال
          choices,
          correctIndex,
        };
      });

      return res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  // =================== إضافة / استبدال أسئلة الامتحان ===================
  router.post("/:id/questions", async (req, res, next) => {
    try {
      const examId = Number(req.params.id);
      if (Number.isNaN(examId) || examId <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "examId غير صالح" });
      }

      // تأكد إن الامتحان موجود
      const exam = await ExamSqlite.findByPk(examId);
      if (!exam) {
        return res
          .status(404)
          .json({ success: false, message: "الامتحان غير موجود" });
      }

      const body = req.body || {};
      if (!Array.isArray(body.questions)) {
        return res.status(400).json({
          success: false,
          message: "questions يجب أن تكون مصفوفة",
        });
      }

      const questions = body.questions;

      const now = new Date();

      // لو المصفوفة فاضية → نمسح كل الأسئلة فقط (دعم الحذف الكامل)
      if (!questions.length) {
        await ExamQuestionSqlite.destroy({ where: { examId } });
        if (ExamQuestionMysql) {
          try {
            await ExamQuestionMysql.destroy({ where: { examId } });
          } catch {
            // MySQL اختياري
          }
        }

        return res.json({
          success: true,
          data: { examId, count: 0 },
        });
      }

      const errors = [];
      const rows = [];

      questions.forEach((q, index) => {
        const rawText = q?.text;
        const rawImageUrl = q?.imageUrl;

        const text =
          rawText != null ? String(rawText || "").trim() : "";
        const imageUrl =
          rawImageUrl != null &&
          String(rawImageUrl).trim() !== ""
            ? String(rawImageUrl).trim()
            : null;

        const rawChoices = Array.isArray(q?.choices) ? q.choices : [];
        const correctIndex = Number(q?.correctIndex);
        const points = q?.points != null ? Number(q.points) : 1;

        // على الأقل نص أو صورة
        if (!text && !imageUrl) {
          errors.push(
            `السؤال رقم ${
              index + 1
            }: مطلوب نص للسؤال أو رابط صورة (imageUrl)`
          );
        }

        if (!rawChoices.length || rawChoices.length < 2) {
          errors.push(
            `السؤال رقم ${index + 1}: choices مطلوبة وبحد أدنى 2 اختيار`
          );
        }

        if (
          Number.isNaN(correctIndex) ||
          correctIndex < 0 ||
          correctIndex >= rawChoices.length
        ) {
          errors.push(
            `السؤال رقم ${
              index + 1
            }: correctIndex غير صالح (يجب أن يكون بين 0 و ${
              rawChoices.length - 1
            })`
          );
        }

        if (Number.isNaN(points) || points <= 0) {
          errors.push(`السؤال رقم ${index + 1}: points غير صالح`);
        }

        const baseCharCode = "a".charCodeAt(0); // 97
        const choiceObjects = rawChoices.map((ch, i) => ({
          id: String.fromCharCode(baseCharCode + i), // 'a', 'b', 'c', ...
          text: String(ch || "").trim(),
        }));

        const correctChoice = choiceObjects[correctIndex];
        if (!correctChoice) {
          errors.push(
            `السؤال رقم ${index + 1}: لا يمكن تحديد الاختيار الصحيح`
          );
          return;
        }

        rows.push({
          examId,
          text,
          imageUrl, // ✅ حفظ الرابط لو السؤال صورة
          choicesJson: JSON.stringify(choiceObjects),
          correctIndex,
          points,
          answer: correctChoice.id,
          orderIndex: index,
          isDeleted: false,
          createdAt: now,
          updatedAtLocal: now,
        });
      });

      if (errors.length) {
        return res.status(400).json({ success: false, errors });
      }

      // ✅ استبدال الأسئلة القديمة بالكامل
      await ExamQuestionSqlite.destroy({ where: { examId } });
      if (ExamQuestionMysql) {
        try {
          await ExamQuestionMysql.destroy({ where: { examId } });
        } catch {
          // MySQL اختياري
        }
      }

      // إنشاء الأسئلة الجديدة في SQLite
      const created = await ExamQuestionSqlite.bulkCreate(rows);

      // وتكرارها في MySQL إن وُجد
      if (ExamQuestionMysql) {
        try {
          await ExamQuestionMysql.bulkCreate(
            created.map((q) => ({
              id: q.id,
              examId: q.examId,
              text: q.text,
              imageUrl: q.imageUrl,
              choicesJson: q.choicesJson,
              correctIndex: q.correctIndex,
              points: q.points,
              answer: q.answer,
              orderIndex: q.orderIndex,
              isDeleted: q.isDeleted,
              createdAt: q.createdAt,
              updatedAtLocal: q.updatedAtLocal,
            }))
          );
        } catch {
          // MySQL اختياري
        }
      }

      return res.json({
        success: true,
        data: { examId, count: created.length },
      });
    } catch (e) {
      next(e);
    }
  });

  // =================== لستة الامتحانات ===================
  router.get("/", async (_req, res, next) => {
    try {
      const rows = await ExamSqlite.findAll({
        where: { isDeleted: false },
        order: [["id", "DESC"]],
      });
      res.json({
        success: true,
        data: rows.map(serializeExam),
      });
    } catch (e) {
      next(e);
    }
  });
  // داخل admin-exams.routes.js مثلاً:

router.get('/:id/report', async (req, res, next) => {
  try {
    const examId = Number(req.params.id);
    if (Number.isNaN(examId) || examId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: 'examId غير صالح' });
    }

    const exam = await ExamSqlite.findByPk(examId);
    if (!exam) {
      return res
        .status(404)
        .json({ success: false, message: 'الامتحان غير موجود' });
    }

    // هنا حسب الداتا عندك (ExamResult / ExamSession ...)
    const rows = await ExamResultSqlite.findAll({ where: { examId } });

    const examDto = {
      id: exam.id,
      title: exam.title,
      year: exam.grade,
      totalQuestions: exam.totalQuestions ?? 0, // أو احسبها من جدول الأسئلة
      maxScore: exam.maxScore ?? exam.totalQuestions ?? 0,
    };

    const results = rows.map((r) => ({
      studentId: r.studentId,
      studentName: r.studentName,
      examId: r.examId,
      score: r.score,
      correctCount: r.correctCount,
      wrongCount: r.wrongCount,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    }));

    return res.json({
      success: true,
      data: { exam: examDto, results },
    });
  } catch (e) {
    next(e);
  }
});


  return router;
}
