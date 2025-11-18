// src/routes/games.routes.js
import { Router } from "express";
import { fn, col, literal } from "sequelize";
import { performOperation } from "../services/replicator.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/roles.js"; // 👈 زوّد دي

function toInt(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : def;
}

// ====== BATTLE FRIEND ROOMS (in-memory) ======
const battleRooms = new Map();
const ROOM_TTL_MS = 60 * 60 * 1000; // ساعة

function normalizeRoomCode(code) {
  return String(code || "").trim().toUpperCase();
}

function getBattleRoomRaw(code) {
  const c = normalizeRoomCode(code);
  const room = battleRooms.get(c);
  if (!room) return null;

  // لو الغرفة عدّى عليها وقت كتير نمسحها
  if (Date.now() - room.createdAt > ROOM_TTL_MS) {
    battleRooms.delete(c);
    return null;
  }
  return room;
}

function getRemainingTime(room) {
  if (!room.turnStartedAt) return room.turnDurationSec;
  const elapsed = Math.floor((Date.now() - room.turnStartedAt) / 1000);
  const left = room.turnDurationSec - elapsed;
  return left > 0 ? left : 0;
}

function getBattleRoom(code) {
  const room = getBattleRoomRaw(code);
  if (!room) return null;

  // لو الوقت خلص واحنا لسه ماحدّثناش الدور
  const left = getRemainingTime(room);
  if (room.turnStartedAt && left <= 0 && !room.finished) {
    // الدور القديم خلص
    room.turnStartedAt = null;

    if (room.currentQuestionIndex < room.questions.length - 1) {
      // روح للسؤال اللي بعده وادّي الدور لصاحبك
      room.currentQuestionIndex += 1;
      room.currentPlayerSlot = room.currentPlayerSlot === "p1" ? "p2" : "p1";

      // ابدأ تايمر الدور الجديد أوتوماتيك
      room.turnStartedAt = Date.now();
    } else {
      // مفيش أسئلة تاني → الماتش خلص
      room.finished = true;
    }
  }

  return room;
}

function getPlayerSlot(room, studentId) {
  if (!room) return null;
  if (room.players.p1 && room.players.p1.studentId === studentId) return "p1";
  if (room.players.p2 && room.players.p2.studentId === studentId) return "p2";
  return null;
}

function serializeRoomForPlayer(room, slot, extra = {}) {
  const yourScore =
    slot === "p1"
      ? room.players.p1.score
      : room.players.p2
      ? room.players.p2.score
      : 0;

  const friendScore =
    slot === "p1"
      ? room.players.p2
        ? room.players.p2.score
        : 0
      : room.players.p1.score;

  const currentQuestion = room.questions[room.currentQuestionIndex] || null;
  const remainingTime = getRemainingTime(room);

  return {
    code: room.code,
    playerSlot: slot, // 'p1' أو 'p2'
    currentPlayerSlot: room.currentPlayerSlot,
    currentQuestionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    myScore: yourScore,
    friendScore,
    finished: room.finished,
    turnDurationSec: room.turnDurationSec,
    remainingTime,
    isYourTurn: !room.finished && room.currentPlayerSlot === slot,
    turnStarted: !!room.turnStartedAt,
    currentQuestion: currentQuestion
      ? {
          id: currentQuestion.id,
          text: currentQuestion.text,
          options: Array.isArray(currentQuestion.options)
            ? currentQuestion.options
            : [],
          correctIndex: currentQuestion.correctIndex,
        }
      : null,
    ...extra,
  };
}

export default function createGamesRouter(models) {
  const router = Router();

  const {
    TrueFalseQuestionSqlite,
    McqRushQuestionSqlite,
    FastAnswerQuestionSqlite,
    FlipCardCountrySqlite,
    FlipCardQuestionSqlite,
    BattleFriendQuestionSqlite,

    GameSessionSqlite,
    GameSessionMysql,

    StudentSqlite,
    OutboxSqlite,
  } = models;

  // أي موديل شغال يكفي نطلع منه sequelize
  const { sequelize } = TrueFalseQuestionSqlite;

  /* =========================================
     TRUE / FALSE GAME (صح ولا غلط)
     GET /games/true-false/questions
     ========================================= */
  router.get("/true-false/questions", requireAuth, async (req, res, next) => {
    try {
      const level = String(req.query.level || "").trim() || null;
      const limitRaw =
        req.query.limit !== undefined ? Number(req.query.limit) : 20;
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 100
          ? Math.round(limitRaw)
          : 20;

      const where = { isActive: true };
      if (level) where["level"] = level;

      const rows = await TrueFalseQuestionSqlite.findAll({
        where,
        order: [sequelize.random()],
        limit,
      });

      const data = rows.map((r) => ({
        id: r.id,
        text: r.text,
        isTrue: r.isTrue,
      }));

      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  /* -------- BULK INSERT: TRUE / FALSE -------- */
  router.post(
    "/true-false/questions/bulk",
    requireAuth,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const list = Array.isArray(req.body)
          ? req.body
          : Array.isArray(req.body?.questions)
          ? req.body.questions
          : [];

        if (!list.length) {
          return res.status(400).json({
            success: false,
            message: "questions[] مطلوب وفيه عناصر",
          });
        }

        const payload = list
          .map((q) => ({
            text: String(q.text || "").trim(),
            isTrue: Boolean(q.isTrue),
            level: q.level ? String(q.level).trim() : null,
            isActive: q.isActive === false ? false : true,
          }))
          .filter((q) => q.text);

        if (!payload.length) {
          return res.status(400).json({
            success: false,
            message: "كل الأسئلة فاضية أو مش صحيحة",
          });
        }

        const created = await TrueFalseQuestionSqlite.bulkCreate(payload, {
          returning: true,
        });

        const data = created.map((r) => ({
          id: r.id,
          text: r.text,
          isTrue: r.isTrue,
          level: r.level ?? null,
        }));

        res.json({ success: true, data });
      } catch (e) {
        next(e);
      }
    }
  );

  /* =========================================
     MCQ RUSH GAME
     GET /games/mcq-rush/questions
     ========================================= */
  router.get("/mcq-rush/questions", requireAuth, async (req, res, next) => {
    try {
      const level = String(req.query.level || "").trim() || null;
      const limitRaw =
        req.query.limit !== undefined ? Number(req.query.limit) : 10;
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50
          ? Math.round(limitRaw)
          : 10;

      const where = { isActive: true };
      if (level) where["level"] = level;

      const rows = await McqRushQuestionSqlite.findAll({
        where,
        order: [sequelize.random()],
        limit,
      });

      const data = rows.map((r) => ({
        id: r.id,
        text: r.text,
        options: Array.isArray(r.options) ? r.options : [],
        correctIndex: r.correctIndex,
      }));

      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  /* -------- BULK INSERT: MCQ RUSH -------- */
  router.post(
    "/mcq-rush/questions/bulk",
    requireAuth,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const list = Array.isArray(req.body)
          ? req.body
          : Array.isArray(req.body?.questions)
          ? req.body.questions
          : [];

        if (!list.length) {
          return res.status(400).json({
            success: false,
            message: "questions[] مطلوب وفيه عناصر",
          });
        }

        const payload = list
          .map((q) => {
            const options = Array.isArray(q.options) ? q.options : [];
            return {
              text: String(q.text || "").trim(),
              options,
              correctIndex: toInt(q.correctIndex, 0),
              level: q.level ? String(q.level).trim() : null,
              isActive: q.isActive === false ? false : true,
            };
          })
          .filter((q) => q.text && q.options.length >= 2);

        if (!payload.length) {
          return res.status(400).json({
            success: false,
            message: "كل الأسئلة فاضية أو مافيهاش options كفاية",
          });
        }

        const created = await McqRushQuestionSqlite.bulkCreate(payload, {
          returning: true,
        });

        const data = created.map((r) => ({
          id: r.id,
          text: r.text,
          options: Array.isArray(r.options) ? r.options : [],
          correctIndex: r.correctIndex,
          level: r.level ?? null,
        }));

        res.json({ success: true, data });
      } catch (e) {
        next(e);
      }
    }
  );

  /* =========================================
     FAST ANSWER GAME
     GET /games/fast-answer/questions
     ========================================= */
  router.get("/fast-answer/questions", requireAuth, async (req, res, next) => {
    try {
      const level = String(req.query.level || "").trim() || null;
      const limitRaw =
        req.query.limit !== undefined ? Number(req.query.limit) : 5;
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 20
          ? Math.round(limitRaw)
          : 5;

      const where = { isActive: true };
      if (level) where["level"] = level;

      const rows = await FastAnswerQuestionSqlite.findAll({
        where,
        order: [sequelize.random()],
        limit,
      });

      const data = rows.map((r) => ({
        id: r.id,
        text: r.text,
        options: Array.isArray(r.options) ? r.options : [],
        correctIndex: r.correctIndex,
      }));

      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  /* -------- BULK INSERT: FAST ANSWER -------- */
  router.post(
    "/fast-answer/questions/bulk",
    requireAuth,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const list = Array.isArray(req.body)
          ? req.body
          : Array.isArray(req.body?.questions)
          ? req.body.questions
          : [];

        if (!list.length) {
          return res.status(400).json({
            success: false,
            message: "questions[] مطلوب وفيه عناصر",
          });
        }

        const payload = list
          .map((q) => {
            const options = Array.isArray(q.options) ? q.options : [];
            return {
              text: String(q.text || "").trim(),
              options,
              correctIndex: toInt(q.correctIndex, 0),
              level: q.level ? String(q.level).trim() : null,
              isActive: q.isActive === false ? false : true,
            };
          })
          .filter((q) => q.text && q.options.length >= 2);

        if (!payload.length) {
          return res.status(400).json({
            success: false,
            message: "كل الأسئلة فاضية أو مافيهاش options كفاية",
          });
        }

        const created = await FastAnswerQuestionSqlite.bulkCreate(payload, {
          returning: true,
        });

        const data = created.map((r) => ({
          id: r.id,
          text: r.text,
          options: Array.isArray(r.options) ? r.options : [],
          correctIndex: r.correctIndex,
          level: r.level ?? null,
        }));

        res.json({ success: true, data });
      } catch (e) {
        next(e);
      }
    }
  );

  /* =========================================
     FLIP THE CARD GAME
     ========================================= */

  // لستة الدول
  router.get("/flip-card/countries", requireAuth, async (req, res, next) => {
    try {
      const rows = await FlipCardCountrySqlite.findAll({
        where: { isActive: true },
        order: [["name", "ASC"]],
      });

      const data = rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        flagEmoji: r.flagEmoji,
      }));

      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  // bulk countries
  router.post(
    "/flip-card/countries/bulk",
    requireAuth,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const list = Array.isArray(req.body)
          ? req.body
          : Array.isArray(req.body?.countries)
          ? req.body.countries
          : [];

        if (!list.length) {
          return res.status(400).json({
            success: false,
            message: "countries[] مطلوب وفيه عناصر",
          });
        }

        const payload = list
          .map((c) => ({
            code: String(c.code || "").trim().toUpperCase(),
            name: String(c.name || "").trim(),
            flagEmoji: c.flagEmoji ? String(c.flagEmoji).trim() : null,
            isActive: c.isActive === false ? false : true,
          }))
          .filter((c) => c.code && c.name);

        if (!payload.length) {
          return res.status(400).json({
            success: false,
            message: "كل الدول فاضية أو من غير code/name",
          });
        }

        const created = await FlipCardCountrySqlite.bulkCreate(payload, {
          returning: true,
        });

        const data = created.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          flagEmoji: r.flagEmoji,
        }));

        res.json({ success: true, data });
      } catch (e) {
        next(e);
      }
    }
  );

  // أسئلة دولة معيّنة
  router.get("/flip-card/questions", requireAuth, async (req, res, next) => {
    try {
      const countryIdRaw =
        req.query.countryId !== undefined ? Number(req.query.countryId) : NaN;
      const code = String(req.query.code || "").trim();

      let countryId = Number.isFinite(countryIdRaw) ? countryIdRaw : null;

      if (!countryId && code) {
        const c = await FlipCardCountrySqlite.findOne({
          where: { code, isActive: true },
        });
        if (!c) {
          return res.status(404).json({
            success: false,
            message: "الدولة غير موجودة",
          });
        }
        countryId = c.id;
      }

      if (!countryId) {
        return res.status(400).json({
          success: false,
          message: "countryId أو code مطلوب",
        });
      }

      const limitRaw =
        req.query.limit !== undefined ? Number(req.query.limit) : 5;
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 20
          ? Math.round(limitRaw)
          : 5;

      const rows = await FlipCardQuestionSqlite.findAll({
        where: { isActive: true, countryId },
        order: [sequelize.random()],
        limit,
      });

      const data = rows.map((r) => ({
        id: r.id,
        text: r.text,
        options: Array.isArray(r.options) ? r.options : [],
        correctIndex: r.correctIndex,
      }));

      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  // bulk flip-card questions
  router.post(
    "/flip-card/questions/bulk",
    requireAuth,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const list = Array.isArray(req.body)
          ? req.body
          : Array.isArray(req.body?.questions)
          ? req.body.questions
          : [];

        if (!list.length) {
          return res.status(400).json({
            success: false,
            message: "questions[] مطلوب وفيه عناصر",
          });
        }

        const countries = await FlipCardCountrySqlite.findAll({
          where: { isActive: true },
        });
        const byCode = new Map(
          countries.map((c) => [String(c.code).toUpperCase(), c.id])
        );
        const byId = new Set(countries.map((c) => c.id));

        const payload = [];

        for (const q of list) {
          let countryId = Number.isFinite(Number(q.countryId))
            ? Number(q.countryId)
            : null;

          if (!countryId && q.countryCode) {
            const cid = byCode.get(String(q.countryCode).toUpperCase());
            if (cid) countryId = cid;
          }

          const text = String(q.text || "").trim();
          const options = Array.isArray(q.options) ? q.options : [];
          const correctIndex = toInt(q.correctIndex, 0);

          if (!countryId || !byId.has(countryId)) continue;
          if (!text || options.length < 2) continue;

          payload.push({
            countryId,
            text,
            options,
            correctIndex,
            isActive: q.isActive === false ? false : true,
          });
        }

        if (!payload.length) {
          return res.status(400).json({
            success: false,
            message:
              "مفيش سؤال صالح (راجع countryId / countryCode و text / options)",
          });
        }

        const created = await FlipCardQuestionSqlite.bulkCreate(payload, {
          returning: true,
        });

        const data = created.map((r) => ({
          id: r.id,
          countryId: r.countryId,
          text: r.text,
          options: Array.isArray(r.options) ? r.options : [],
          correctIndex: r.correctIndex,
        }));

        res.json({ success: true, data });
      } catch (e) {
        next(e);
      }
    }
  );

  /* =========================================
     BATTLE FRIEND GAME
     ========================================= */
  router.get(
    "/battle-friend/questions",
    requireAuth,
    async (req, res, next) => {
      try {
        const level = String(req.query.level || "").trim() || null;
        const limitRaw =
          req.query.limit !== undefined ? Number(req.query.limit) : 5;
        const limit =
          Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 20
            ? Math.round(limitRaw)
            : 5;

        const where = { isActive: true };
        if (level) where["level"] = level;

        const rows = await BattleFriendQuestionSqlite.findAll({
          where,
          order: [sequelize.random()],
          limit,
        });

        const data = rows.map((r) => ({
          id: r.id,
          text: r.text,
          options: Array.isArray(r.options) ? r.options : [],
          correctIndex: r.correctIndex,
        }));

        res.json({ success: true, data });
      } catch (e) {
        next(e);
      }
    }
  );

  // bulk battle-friend questions
  router.post(
    "/battle-friend/questions/bulk",
    requireAuth,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const list = Array.isArray(req.body)
          ? req.body
          : Array.isArray(req.body?.questions)
          ? req.body.questions
          : [];

        if (!list.length) {
          return res.status(400).json({
            success: false,
            message: "questions[] مطلوب وفيه عناصر",
          });
        }

        const payload = list
          .map((q) => {
            const options = Array.isArray(q.options) ? q.options : [];
            return {
              text: String(q.text || "").trim(),
              options,
              correctIndex: toInt(q.correctIndex, 0),
              level: q.level ? String(q.level).trim() : null,
              isActive: q.isActive === false ? false : true,
            };
          })
          .filter((q) => q.text && q.options.length >= 2);

        if (!payload.length) {
          return res.status(400).json({
            success: false,
            message: "كل الأسئلة فاضية أو مافيهاش options كفاية",
          });
        }

        const created = await BattleFriendQuestionSqlite.bulkCreate(payload, {
          returning: true,
        });

        const data = created.map((r) => ({
          id: r.id,
          text: r.text,
          options: Array.isArray(r.options) ? r.options : [],
          correctIndex: r.correctIndex,
          level: r.level ?? null,
        }));

        res.json({ success: true, data });
      } catch (e) {
        next(e);
      }
    }
  );

  // ====== CREATE / JOIN ROOM (BATTLE FRIEND) ======
  router.post(
    "/battle-friend/room",
    requireAuth,
    async (req, res, next) => {
      try {
        const { mode, code, questionsCount, level } = req.body || {};
        const studentId = Number(req.user?.id);

        if (!studentId) {
          return res
            .status(401)
            .json({ success: false, message: "مطلوب تسجيل الدخول" });
        }

        const roomMode = String(mode || "").trim().toLowerCase(); // 'create' | 'join'
        const roomCode = normalizeRoomCode(code);

        if (!["create", "join"].includes(roomMode)) {
          return res.status(400).json({
            success: false,
            message: "mode لازم يكون 'create' أو 'join'",
          });
        }

        if (!roomCode || roomCode.length < 4) {
          return res.status(400).json({
            success: false,
            message: "code مطلوب",
          });
        }

        // ========== CREATE ==========
        if (roomMode === "create") {
          // لو الكود مستخدم بالفعل
          if (getBattleRoomRaw(roomCode)) {
            return res.status(409).json({
              success: false,
              message:
                "الكود ده مستخدم في غرفة تانية، جرّب تولّد كود جديد ثم ابدأ المسابقة",
            });
          }

          const limitRaw =
            questionsCount !== undefined ? Number(questionsCount) : 10;
          const limit =
            Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50
              ? Math.round(limitRaw)
              : 10;

          const where = { isActive: true };
          const lvl = String(level || "").trim();
          if (lvl) where["level"] = lvl;

          const rows = await BattleFriendQuestionSqlite.findAll({
            where,
            order: [sequelize.random()],
            limit,
          });

          const questions = rows.map((r) => ({
            id: r.id,
            text: r.text,
            options: Array.isArray(r.options) ? r.options : [],
            correctIndex: r.correctIndex,
          }));

          if (!questions.length) {
            return res.status(400).json({
              success: false,
              message: "لا توجد أسئلة متاحة للتحدي.",
            });
          }

          const room = {
            code: roomCode,
            createdAt: Date.now(),
            questions,
            players: {
              p1: { studentId, score: 0 },
              p2: null,
            },
            turnDurationSec: 20,
            currentQuestionIndex: 0,
            currentPlayerSlot: "p1", // host يبدأ
            turnStartedAt: null,
            finished: false,
          };
          battleRooms.set(roomCode, room);

          const dto = serializeRoomForPlayer(room, "p1");
          return res.json({
            success: true,
            data: dto,
          });
        }

        // ========== JOIN ==========
        const room = getBattleRoom(roomCode);
        if (!room) {
          return res.status(404).json({
            success: false,
            message:
              "الغرفة غير موجودة أو انتهت مدتها، خلى صاحبك يعمل كود جديد",
          });
        }

        let slot = getPlayerSlot(room, studentId);
        if (!slot) {
          if (!room.players.p2) {
            room.players.p2 = { studentId, score: 0 };
            slot = "p2";
          } else {
            return res.status(409).json({
              success: false,
              message: "الغرفة ممتلئة بالفعل",
            });
          }
        }

        // لو الاتنين جوه الغرفة ومفيش تايمر شغال، نبدأ أول دور تلقائي
        if (room.players.p1 && room.players.p2 && !room.finished && !room.turnStartedAt) {
          room.turnStartedAt = Date.now();
        }

        const dto = serializeRoomForPlayer(room, slot);
        return res.json({
          success: true,
          data: dto,
        });
      } catch (e) {
        next(e);
      }
    }
  );

  // GET STATE
  router.get(
    "/battle-friend/room/state",
    requireAuth,
    async (req, res, next) => {
      try {
        const roomCode = normalizeRoomCode(req.query.code);
        if (!roomCode) {
          return res
            .status(400)
            .json({ success: false, message: "code مطلوب" });
        }

        const room = getBattleRoom(roomCode);
        if (!room) {
          return res.status(404).json({
            success: false,
            message: "الغرفة غير موجودة أو انتهت مدتها",
          });
        }

        const studentId = Number(req.user?.id);
        const slot = getPlayerSlot(room, studentId);
        if (!slot) {
          return res
            .status(403)
            .json({ success: false, message: "أنت مش مشترك في الغرفة دي" });
        }

        const dto = serializeRoomForPlayer(room, slot);
        return res.json({ success: true, data: dto });
      } catch (e) {
        next(e);
      }
    }
  );

  // START TURN (ممكن تسيبه، بس مش محتاجه لو الأوتوماتيك شغال)
  router.post(
    "/battle-friend/room/start-turn",
    requireAuth,
    async (req, res, next) => {
      try {
        const { code } = req.body || {};
        const roomCode = normalizeRoomCode(code);
        if (!roomCode) {
          return res
            .status(400)
            .json({ success: false, message: "code مطلوب" });
        }

        const room = getBattleRoom(roomCode);
        if (!room) {
          return res.status(404).json({
            success: false,
            message: "الغرفة غير موجودة أو انتهت مدتها",
          });
        }

        if (room.finished) {
          return res
            .status(400)
            .json({ success: false, message: "المباراة خلصت بالفعل" });
        }

        const studentId = Number(req.user?.id);
        const slot = getPlayerSlot(room, studentId);
        if (!slot) {
          return res
            .status(403)
            .json({ success: false, message: "أنت مش مشترك في الغرفة دي" });
        }

        if (room.currentPlayerSlot !== slot) {
          return res
            .status(403)
            .json({ success: false, message: "مش دورك دلوقتي" });
        }

        if (room.turnStartedAt) {
          return res
            .status(400)
            .json({ success: false, message: "الدور شغال بالفعل" });
        }

        room.turnStartedAt = Date.now();

        const dto = serializeRoomForPlayer(room, slot);
        return res.json({ success: true, data: dto });
      } catch (e) {
        next(e);
      }
    }
  );

  // ANSWER
  router.post(
    "/battle-friend/room/answer",
    requireAuth,
    async (req, res, next) => {
      try {
        const { code, optionIndex } = req.body || {};
        const roomCode = normalizeRoomCode(code);
        if (!roomCode) {
          return res
            .status(400)
            .json({ success: false, message: "code مطلوب" });
        }

        const room = getBattleRoom(roomCode);
        if (!room) {
          return res.status(404).json({
            success: false,
            message: "الغرفة غير موجودة أو انتهت مدتها",
          });
        }

        if (room.finished) {
          return res
            .status(400)
            .json({ success: false, message: "المباراة خلصت بالفعل" });
        }

        const studentId = Number(req.user?.id);
        const slot = getPlayerSlot(room, studentId);
        if (!slot) {
          return res
            .status(403)
            .json({ success: false, message: "أنت مش مشترك في الغرفة دي" });
        }

        if (room.currentPlayerSlot !== slot) {
          return res
            .status(403)
            .json({ success: false, message: "مش دورك دلوقتي" });
        }

        if (!Number.isFinite(Number(optionIndex))) {
          return res.status(400).json({
            success: false,
            message: "optionIndex رقم مطلوب",
          });
        }

        const q = room.questions[room.currentQuestionIndex];
        if (!q) {
          return res
            .status(400)
            .json({ success: false, message: "لا يوجد سؤال حالي" });
        }

        const remaining = getRemainingTime(room);
        let isCorrect = false;
        let gained = 0;

        if (room.turnStartedAt && remaining > 0) {
          isCorrect = Number(optionIndex) === q.correctIndex;
          if (isCorrect) {
            const base = 80;
            const bonusPerSecond = 3;
            gained = base + remaining * bonusPerSecond;
          }
        }

        // update score
        if (slot === "p1") {
          room.players.p1.score += gained;
        } else if (room.players.p2) {
          room.players.p2.score += gained;
        }

        // advance
        room.turnStartedAt = null;

        if (room.currentQuestionIndex < room.questions.length - 1) {
          room.currentQuestionIndex += 1;
          room.currentPlayerSlot =
            room.currentPlayerSlot === "p1" ? "p2" : "p1";

          // ابدأ تايمر الدور الجديد لصاحبك أوتوماتيك
          room.turnStartedAt = Date.now();
        } else {
          room.finished = true;
        }

        const dto = serializeRoomForPlayer(room, slot, {
          lastAnswer: {
            isCorrect,
            gained,
            optionIndex: Number(optionIndex),
          },
        });

        return res.json({ success: true, data: dto });
      } catch (e) {
        next(e);
      }
    }
  );

  /* =========================================
     تسجيل نتيجة جولة (XP)
     POST /games/results
     ========================================= */
  router.post("/results", requireAuth, async (req, res, next) => {
    try {
      if (req.user?.role !== "student") {
        return res
          .status(403)
          .json({ success: false, message: "مصرّح للطلاب فقط" });
      }

      const { gameKey, xp, score = 0, meta } = req.body || {};
      const errors = [];

      if (!gameKey || typeof gameKey !== "string") {
        errors.push("gameKey مطلوب");
      }
      if (xp === undefined || xp === null || Number.isNaN(Number(xp))) {
        errors.push("xp رقم مطلوب");
      }

      if (errors.length) {
        return res.status(400).json({ success: false, errors });
      }

      const data = {
        studentId: Number(req.user.id),
        gameKey: String(gameKey).trim(),
        xp: Number(xp),
        score: Number(score) || 0,
        meta: meta ?? null,
        createdAtLocal: new Date(),
        updatedAtLocal: new Date(),
      };

      const created = await performOperation({
        modelName: "GameSession", // اسم الموديل جوه defineGameSessionModel
        sqliteModel: GameSessionSqlite,
        mysqlModel: GameSessionMysql,
        op: "create",
        data,
        outboxModel: OutboxSqlite,
      });

      return res.json({ success: true, data: created });
    } catch (e) {
      next(e);
    }
  });

  /* =========================================
     LEADERBOARD
     GET /games/leaderboard?gameKey=...&limit=10
     ========================================= */
  router.get("/leaderboard", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      const gameKeyRaw = String(req.query.gameKey || "all").trim();

      const where = {};
      if (gameKeyRaw && gameKeyRaw !== "all") {
        where.gameKey = gameKeyRaw;
      }

      const rows = await GameSessionSqlite.findAll({
        attributes: [
          "studentId",
          [fn("SUM", col("xp")), "totalXp"],
          [fn("COUNT", col("id")), "gamesCount"],
        ],
        where,
        group: ["studentId"],
        order: [[literal("totalXp"), "DESC"]],
        limit,
        raw: true,
      });

      const studentIds = rows.map((r) => r.studentId);
      const students = await StudentSqlite.findAll({
        where: { id: studentIds },
        attributes: ["id", "studentName", "centerName", "year"],
        raw: true,
      });

      const map = new Map(students.map((s) => [s.id, s]));

      const data = rows.map((row, idx) => {
        const s = map.get(row.studentId) || {};
        return {
          rank: idx + 1,
          studentId: row.studentId,
          name: s.studentName || "طالب",
          centerName: s.centerName || null,
          level: s.year || null,
          totalXp: Number(row.totalXp) || 0,
          gamesCount: Number(row.gamesCount) || 0,
        };
      });

      return res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
