import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { normalizeLevel } from "../utils/levels.js";

export default function createExamsRouter(models) {
  const router = Router();

  const {
    ExamSqlite,
    ExamQuestionSqlite,
    ExamAttemptSqlite,
    ExamMysql,
    ExamQuestionMysql,
    ExamAttemptMysql,
    StudentSqlite,
  } = models;

  // ============ Helpers ============

  // السؤال بدون الحل (للاستهلاك أثناء الامتحان)
  const pickPublicQuestion = (q) => {
    const raw = JSON.parse(q.choicesJson || "[]");
    const choices = toChoiceObjects(raw);
    return {
      id: String(q.id),
      text: q.text,
      imageUrl: q.imageUrl || null,
      choices,
    };
  };

  // سؤال مع الحل (للمراجعة)
  const pickReviewQuestion = (q) => {
    const raw = JSON.parse(q.choicesJson || "[]");
    const choices = toChoiceObjects(raw);
    const answer = answerIdFrom(choices, q.answer);
    return {
      id: String(q.id),
      text: q.text,
      imageUrl: q.imageUrl || null,
      choices,
      answer,
    };
  };

  // sync للـ MySQL (لو متاح)
  async function mirrorAttemptToMysql(payload) {
    if (!ExamAttemptMysql) return;
    try {
      const { examId, studentId, answersJson, startedAt, submittedAt, score } =
        payload;

      const [row] = await ExamAttemptMysql.findOrCreate({
        where: { examId, studentId },
        defaults: {
          examId,
          studentId,
          answersJson: answersJson ?? "[]",
          startedAt: startedAt ?? new Date(),
          submittedAt: submittedAt ?? null,
          score: typeof score === "number" ? score : null,
          updatedAtLocal: new Date(),
          createdAt: new Date(),
        },
      });

      await row.update({
        answersJson: answersJson ?? row.answersJson ?? "[]",
        startedAt: startedAt ?? row.startedAt ?? new Date(),
        submittedAt:
          typeof submittedAt !== "undefined" ? submittedAt : row.submittedAt,
        score: typeof score === "number" ? score : row.score,
        updatedAtLocal: new Date(),
      });
    } catch (err) {
      console.warn("MySQL mirror failed (non-blocking):", err?.message || err);
    }
  }

  function toChoiceObjects(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    if (arr.length && typeof arr[0] === "object" && arr[0] && "id" in arr[0]) {
      return arr;
    }
    return arr.map((t, i) => ({ id: String(i + 1), text: String(t) }));
  }

  function answerIdFrom(choices, dbAnswer) {
    if (dbAnswer == null) return null;
    const str = String(dbAnswer);
    if (choices.some((c) => c.id === str)) return str;
    const hit = choices.find((c) => c.text === str);
    return hit ? hit.id : str;
  }

  function isAdminReq(req) {
    return String(req.user?.role || "").toLowerCase() === "admin";
  }

  // ============ 1) قائمة الامتحانات ============

  router.get("/", requireAuth, async (req, res, next) => {
    try {
      const admin = isAdminReq(req);

      const student = await StudentSqlite.findByPk(req.user.id);

      const where = {
        status: "published",
        isDeleted: false,
      };

      if (req.query.category) where.category = req.query.category;
      if (req.query.level) where.level = req.query.level;

      if (!admin) {
        if (!student) {
          return res
            .status(401)
            .json({ success: false, message: "حساب غير صالح" });
        }

        const studentGradeNorm = normalizeLevel(student.year) || null;

        if (!studentGradeNorm) {
          return res.status(403).json({
            success: false,
            message:
              "لا يمكن تحديد سنتك الدراسية. يرجى استكمال بيانات الحساب لتظهر لك امتحانات سنتك.",
          });
        }

        where.grade = studentGradeNorm;
      } else {
        if (req.query.grade) {
          where.grade =
            normalizeLevel(req.query.grade) || req.query.grade || null;
        }
      }

      const exams = await ExamSqlite.findAll({
        where,
        order: [["id", "DESC"]],
      });
      const ids = exams.map((e) => e.id);

      const qCountRaw = await ExamQuestionSqlite.findAll({
        attributes: [
          "examId",
          [
            ExamQuestionSqlite.sequelize.fn(
              "COUNT",
              ExamQuestionSqlite.sequelize.col("id")
            ),
            "cnt",
          ],
        ],
        where: { examId: ids },
        group: ["examId"],
      });
      const qCountMap = new Map(
        qCountRaw.map((r) => [r.examId, Number(r.get("cnt"))])
      );

      const attempts = await ExamAttemptSqlite.findAll({
        where: { examId: ids, studentId: req.user.id },
      });
      const attemptMap = new Map(attempts.map((a) => [a.examId, a]));

      const data = exams.map((e) => ({
        id: String(e.id),
        title: e.title,
        description: e.description || "",
        level: e.level || null,
        category: e.category || null,
        grade: normalizeLevel(e.grade) || e.grade || null,
        durationMin: e.durationMin || 0,
        questionsCount: qCountMap.get(e.id) || 0,
        attempted: !!attemptMap.get(e.id)?.submittedAt,
        score: attemptMap.get(e.id)?.score ?? null,
        isFree: !!e.isFree,
      }));

      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  // ============ 2) تفاصيل امتحان واحد ============

  router.get("/:id", requireAuth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const exam = await ExamSqlite.findByPk(id);
      if (!exam || exam.isDeleted || exam.status !== "published") {
        return res
          .status(404)
          .json({ success: false, message: "الامتحان غير موجود" });
      }

      const admin = isAdminReq(req);
      const student = await StudentSqlite.findByPk(req.user.id);

      const examGradeNorm = normalizeLevel(exam.grade) || exam.grade;
      const studentGradeNorm = normalizeLevel(student?.year) || student?.year;

      if (!admin) {
        if (!student) {
          return res
            .status(401)
            .json({ success: false, message: "حساب غير صالح" });
        }

        if (examGradeNorm && examGradeNorm !== studentGradeNorm) {
          return res.status(403).json({
            success: false,
            code: "GRADE_MISMATCH",
            message: "هذا الامتحان مخصص لسنة دراسية مختلفة عن حسابك.",
          });
        }

        // ✅ تم تعطيل فحص الاشتراك هنا
      }

      const qs = await ExamQuestionSqlite.findAll({
        where: { examId: id },
        order: [
          ["orderIndex", "ASC"],
          ["id", "ASC"],
        ],
      });

      const data = {
        id: String(exam.id),
        title: exam.title,
        description: exam.description || "",
        level: exam.level || null,
        category: exam.category || null,
        grade: examGradeNorm || null,
        durationMin: exam.durationMin || 0,
        isFree: !!exam.isFree,
        questions: qs.map(pickPublicQuestion),
      };

      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  // ============ 3) بدء محاولة ============

  router.post("/:id/attempt", requireAuth, async (req, res, next) => {
    try {
      const examId = Number(req.params.id);
      const exam = await ExamSqlite.findByPk(examId);

      if (!exam || exam.isDeleted || exam.status !== "published") {
        return res
          .status(404)
          .json({ success: false, message: "الامتحان غير موجود" });
      }

      const admin = isAdminReq(req);
      const student = await StudentSqlite.findByPk(req.user.id);

      const examGradeNorm = normalizeLevel(exam.grade) || exam.grade;
      const studentGradeNorm = normalizeLevel(student?.year) || student?.year;

      if (!admin) {
        if (!student) {
          return res
            .status(401)
            .json({ success: false, message: "حساب غير صالح" });
        }

        if (examGradeNorm && examGradeNorm !== studentGradeNorm) {
          return res.status(403).json({
            success: false,
            code: "GRADE_MISMATCH",
            message: "هذا الامتحان مخصص لسنة دراسية مختلفة عن حسابك.",
          });
        }

        // ✅ تم تعطيل فحص الاشتراك هنا أيضًا
      }

      let attempt = await ExamAttemptSqlite.findOne({
        where: { examId, studentId: req.user.id },
      });

      if (attempt?.submittedAt) {
        return res
          .status(409)
          .json({ success: false, message: "تمت المحاولة من قبل" });
      }

      if (!attempt) {
        attempt = await ExamAttemptSqlite.create({
          examId,
          studentId: req.user.id,
          answersJson: "[]",
          startedAt: new Date(),
          updatedAtLocal: new Date(),
        });
      }

      await mirrorAttemptToMysql({
        examId,
        studentId: req.user.id,
        answersJson: attempt.answersJson,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        score: attempt.score,
      });

      res.json({ success: true, data: { attemptId: attempt.id } });
    } catch (e) {
      next(e);
    }
  });

  // ============ 4) حفظ إجابة ============

  router.post("/:id/answer", requireAuth, async (req, res, next) => {
    try {
      const examId = Number(req.params.id);
      const { qid, answer } = req.body || {};
      if (!qid || typeof answer !== "string") {
        return res
          .status(400)
          .json({ success: false, message: "بيانات ناقصة" });
      }

      const attempt = await ExamAttemptSqlite.findOne({
        where: { examId, studentId: req.user.id },
      });
      if (!attempt || attempt.submittedAt) {
        return res
          .status(400)
          .json({ success: false, message: "لا توجد محاولة نشطة" });
      }

      const arr = JSON.parse(attempt.answersJson || "[]");
      const idx = arr.findIndex((x) => String(x.qid) === String(qid));
      if (idx >= 0) arr[idx].answer = answer;
      else arr.push({ qid, answer });

      const newJson = JSON.stringify(arr);

      await attempt.update({
        answersJson: newJson,
        updatedAtLocal: new Date(),
      });

      await mirrorAttemptToMysql({
        examId,
        studentId: req.user.id,
        answersJson: newJson,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        score: attempt.score,
      });

      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // ============ 5) تسليم الامتحان ============

  router.post("/:id/submit", requireAuth, async (req, res, next) => {
    try {
      const examId = Number(req.params.id);

      const attempt = await ExamAttemptSqlite.findOne({
        where: { examId, studentId: req.user.id },
      });
      if (!attempt) {
        return res
          .status(400)
          .json({ success: false, message: "لا توجد محاولة" });
      }
      if (attempt.submittedAt) {
        return res.json({
          success: true,
          data: { score: attempt.score ?? 0 },
        });
      }

      const qs = await ExamQuestionSqlite.findAll({
        where: { examId },
        order: [
          ["orderIndex", "ASC"],
          ["id", "ASC"],
        ],
      });

      const answers = new Map(
        JSON.parse(attempt.answersJson || "[]").map((x) => [
          String(x.qid),
          String(x.answer),
        ])
      );

      let correct = 0;
      for (const q of qs) {
        const raw = JSON.parse(q.choicesJson || "[]");
        const choices = toChoiceObjects(raw);
        const correctId = answerIdFrom(choices, q.answer);
        const userAns = answers.get(String(q.id));
        if (!userAns) continue;

        if (
          userAns === correctId ||
          choices.find((c) => c.id === userAns)?.text === q.answer
        ) {
          correct++;
        }
      }

      const score = qs.length ? Math.round((correct / qs.length) * 100) : 0;

      const submittedAt = new Date();
      await attempt.update({
        submittedAt,
        score,
        updatedAtLocal: new Date(),
      });

      await mirrorAttemptToMysql({
        examId,
        studentId: req.user.id,
        answersJson: attempt.answersJson,
        startedAt: attempt.startedAt,
        submittedAt,
        score,
      });

      res.json({ success: true, data: { score } });
    } catch (e) {
      next(e);
    }
  });

  // ============ 6) مراجعة الامتحان ============

  router.get("/:id/review", requireAuth, async (req, res, next) => {
    try {
      const examId = Number(req.params.id);

      const attempt = await ExamAttemptSqlite.findOne({
        where: { examId, studentId: req.user.id },
      });
      if (!attempt || !attempt.submittedAt) {
        return res.status(403).json({
          success: false,
          message: "لا توجد محاولة مُسلَّمة",
        });
      }

      const qs = await ExamQuestionSqlite.findAll({
        where: { examId },
        order: [
          ["orderIndex", "ASC"],
          ["id", "ASC"],
        ],
      });

      const reviewQs = qs.map(pickReviewQuestion);

      const answers = new Map(
        JSON.parse(attempt.answersJson || "[]").map((x) => [
          String(x.qid),
          x.answer,
        ])
      );

      const review = reviewQs.map((q) => ({
        question: q,
        userAnswer: answers.get(q.id) || null,
        isCorrect: answers.get(q.id) === q.answer,
      }));

      res.json({
        success: true,
        data: {
          score: attempt.score ?? 0,
          review,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // ============ 7) إضافة امتحان (أدمن) ============

  router.post("/", requireAuth, async (req, res, next) => {
    try {
      if (String(req.user?.role || "").toLowerCase() !== "admin") {
        return res.status(403).json({
          success: false,
          message: "صلاحية مرفوضة: هذا الإجراء للأدمن فقط",
        });
      }

      const {
        title,
        description,
        category,
        grade,
        level,
        durationMin,
        isFree,
        status,
      } = req.body;

      if (!title) {
        return res.status(400).json({
          success: false,
          message: "العنوان مطلوب",
        });
      }

      const gradeNorm = normalizeLevel(grade) || null;

      const exam = await ExamSqlite.create({
        title,
        description: description || "",
        category: category || null,
        grade: gradeNorm,
        level: level || null,
        durationMin: durationMin || 0,
        isFree: !!isFree,
        status: status || "draft",
        isDeleted: false,
        createdAt: new Date(),
        updatedAtLocal: new Date(),
      });

      res.json({ success: true, data: exam });
    } catch (e) {
      next(e);
    }
  });

  // ============ 8) إضافة أسئلة بالجملة (أدمن) ============

  router.post("/:id/questions/bulk", requireAuth, async (req, res, next) => {
    try {
      if (String(req.user?.role || "").toLowerCase() !== "admin") {
        return res.status(403).json({
          success: false,
          message: "صلاحية مرفوضة: هذا الإجراء للأدمن فقط",
        });
      }

      const examId = Number(req.params.id);
      const exam = await ExamSqlite.findByPk(examId);
      if (!exam || exam.isDeleted) {
        return res
          .status(404)
          .json({ success: false, message: "الامتحان غير موجود" });
      }

      const questions = Array.isArray(req.body?.questions)
        ? req.body.questions
        : [];
      if (!questions.length) {
        return res
          .status(400)
          .json({ success: false, message: "أرسل مصفوفة questions غير فارغة" });
      }

      for (const [i, q] of questions.entries()) {
        if (!q?.text || !Array.isArray(q?.choices) || q.choices.length < 2) {
          return res.status(400).json({
            success: false,
            message: `سؤال #${i + 1}: نص السؤال والاختيارات مطلوبان (>=2)`,
          });
        }
        if (typeof q.answer !== "string" || !q.choices.includes(q.answer)) {
          return res.status(400).json({
            success: false,
            message: `سؤال #${
              i + 1
            }: answer يجب أن يكون عنصرًا موجودًا داخل choices`,
          });
        }
      }

      const t = await ExamQuestionSqlite.sequelize.transaction();
      try {
        const maxRow = await ExamQuestionSqlite.findOne({
          where: { examId },
          order: [["orderIndex", "DESC"]],
          transaction: t,
        });
        let order = (maxRow?.orderIndex || 0) + 1;

        const rows = questions.map((qItem) => ({
          examId,
          text: qItem.text,
          imageUrl: qItem.imageUrl ?? null,
          choicesJson: JSON.stringify(qItem.choices),
          answer: qItem.answer,
          orderIndex: qItem.orderIndex ?? order++,
          createdAt: new Date(),
          updatedAtLocal: new Date(),
        }));

        const created = await ExamQuestionSqlite.bulkCreate(rows, {
          transaction: t,
          returning: true,
        });
        await t.commit();

        if (ExamQuestionMysql) {
          for (const r of created) {
            try {
              const [row] = await ExamQuestionMysql.findOrCreate({
                where: { id: r.id },
                defaults: {
                  id: r.id,
                  examId,
                  text: r.text,
                  imageUrl: r.imageUrl,
                  choicesJson: r.choicesJson,
                  answer: r.answer,
                  orderIndex: r.orderIndex,
                  createdAt: r.createdAt,
                  updatedAtLocal: new Date(),
                },
              });
              await row.update({
                text: r.text,
                imageUrl: r.imageUrl,
                choicesJson: r.choicesJson,
                answer: r.answer,
                orderIndex: r.orderIndex,
                updatedAtLocal: new Date(),
              });
            } catch (_) {
              /* ignore MySQL errors */
            }
          }
        }

        res.json({
          success: true,
          data: created.map((qx) => ({
            id: String(qx.id),
            orderIndex: qx.orderIndex,
          })),
        });
      } catch (err) {
        await t.rollback();
        return next(err);
      }
    } catch (e) {
      next(e);
    }
  });

  return router;
}
