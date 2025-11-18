// src/routes/students.routes.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Op } from "sequelize";

import "dotenv/config";

import { performOperation } from "../services/replicator.js";
import { sendOtpEmail } from "../services/email.js";
import {
  generateNumericOtp,
  sha256 as sha256Otp,
  minutesFromNow,
} from "../utils/otp.js";

import { requireAuth } from "../middlewares/auth.js";
import { normalizeLevel } from "../utils/levels.js";

const phoneRegex = /^01\d{9}$/;

const MAX_DEVICES = Number(process.env.MAX_DEVICES || 1);
const ACCESS_EXPIRES = process.env.JWT_AT_EXPIRES || "15m";
const REFRESH_DAYS = Number(process.env.REFRESH_DAYS || 45);
const REFRESH_IN_COOKIE =
  String(process.env.REFRESH_IN_COOKIE || "true").toLowerCase() === "true";

function validateBody(b) {
  const errors = [];
  if (!b.studentName || String(b.studentName).trim().length < 3)
    errors.push("الاسم مطلوب وبحد أدنى 3 أحرف");
  if (!b.email) errors.push("البريد الإلكتروني مطلوب");
  if (!b.studentPhone || !phoneRegex.test(b.studentPhone))
    errors.push("رقم الطالب غير صالح (01 + 9 أرقام)");
  if (!b.guardianPhone || !phoneRegex.test(b.guardianPhone))
    errors.push("رقم ولي الأمر غير صالح (01 + 9 أرقام)");
  if (!b.year) errors.push("السنة الدراسية مطلوبة");
  if (!b.region) errors.push("المحافظة مطلوبة");
  if (!b.password || String(b.password).length < 6)
    errors.push("كلمة السر مطلوبة وبحد أدنى 6 أحرف");
  if (b.confirmPassword !== undefined && b.confirmPassword !== b.password)
    errors.push("كلمتا السر غير متطابقتين");
  return errors;
}

console.log("JWT_AT_EXPIRES =", process.env.JWT_AT_EXPIRES);

function issueAccessToken(payload) {
  const secret = process.env.JWT_SECRET || "dev_secret";
  return jwt.sign(payload, secret, { expiresIn: ACCESS_EXPIRES });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}
function refreshExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_DAYS);
  return d;
}
function sha256(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}
function setRefreshCookie(res, token) {
  const isProd =
    String(process.env.NODE_ENV || "").toLowerCase() === "production";

  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    // المهم هنا:
    path: "/api/v1/students", // بدل "/students"
    maxAge: 1000 * 60 * 60 * 24 * REFRESH_DAYS,
  });
}

function safeStudent(s) {
  const j = typeof s?.toJSON === "function" ? s.toJSON() : s || {};
  const { passwordHash, ...rest } = j;
  return rest;
}

export function createStudentsRouter(models) {
  const router = Router();
  const {
    OutboxSqlite,
    StudentSqlite,
    StudentMysql,
    PasswordResetSqlite,
    DeviceSessionSqlite,
    CenterSqlite,
    CenterMysql,
  } = models;

  /** ========== إنشاء حساب طالب جديد ========== */
  router.post("/", async (req, res, next) => {
    try {
      const body = req.body || {};
      const errs = validateBody(body);

      const levelNorm = normalizeLevel(body.year);
      if (!levelNorm) errs.push("السنة الدراسية غير صالحة");

      if (errs.length)
        return res.status(400).json({ success: false, errors: errs });

      const passwordHash = bcrypt.hashSync(String(body.password), 10);

      // السنتر اختياري
      let centerId = null;
      let centerName = null;

      // المحافظة اللي الطالب اختارها في الفورم
      let regionValue = String(body.region || "").trim();

      const hasCenterId =
        body.centerId !== undefined &&
        body.centerId !== null &&
        String(body.centerId).trim() !== "";

      if (hasCenterId) {
        const cid = Number(body.centerId);
        if (Number.isNaN(cid)) {
          return res
            .status(400)
            .json({ success: false, message: "centerId غير صالح" });
        }
        const center = await CenterSqlite.findOne({
          where: { id: cid, isDeleted: false, isActive: true },
        });
        if (!center) {
          return res.status(400).json({
            success: false,
            message: "السنتر غير موجود أو غير مُفعّل",
          });
        }
        if (
          levelNorm &&
          Array.isArray(center.levelsSupported) &&
          center.levelsSupported.length
        ) {
          if (!center.levelsSupported.includes(levelNorm)) {
            return res.status(400).json({
              success: false,
              message: "السنتر المحدد لا يدعم هذه السنة الدراسية",
            });
          }
        }
        centerId = center.id;
        centerName = center.name || null;

        // لو الطالب مابعتش محافظة لأي سبب، نستخدم المحافظة بتاعة السنتر
        const centerRegion = String(center.region || "").trim();
        if (!regionValue && centerRegion) regionValue = centerRegion;
      } else if (body.centerName) {
        centerName = String(body.centerName || "").trim() || null;
      }

      if (!regionValue) {
        return res.status(400).json({
          success: false,
          message: "المحافظة مطلوبة",
        });
      }

const centerCode =
        String(body.centerCode || '')
          .trim()
          .toUpperCase() || null;

      // ⚠️ لو فيه centerCode لازم يكون فريد لكل طالب
      if (centerCode) {
        const existingByCode = await StudentSqlite.findOne({
          where: { centerCode },
        });
        if (existingByCode) {
          return res.status(409).json({
            success: false,
            message: 'كود الطالب (centerCode) مستخدم بالفعل لطالب آخر',
          });
        }
      }


      const data = {
        studentName: String(body.studentName).trim(),
        email: String(body.email).trim().toLowerCase(),
        studentPhone: String(body.studentPhone).trim(),
        guardianPhone: String(body.guardianPhone).trim(),
        year: levelNorm,
        region: regionValue, // ← محافظة الطالب
        centerId,
        centerName,
        centerCode,
        passwordHash,
        updatedAtLocal: new Date(),
      };

      const created = await performOperation({
        modelName: "Student",
        sqliteModel: StudentSqlite,
        mysqlModel: StudentMysql,
        op: "create",
        data,
        outboxModel: OutboxSqlite,
      });

      const safe = safeStudent(created);

      const accessToken = issueAccessToken({
        id: safe.id,
        role: "student",
        level: levelNorm,
      });

      if (req.session)
        req.session.user = { id: safe.id, role: "student", level: levelNorm };

      return res.json({
        success: true,
        data: { ...safe, level: levelNorm },
        accessToken,
      });
    } catch (e) {
      if (e?.name === 'SequelizeUniqueConstraintError') {
        const fields = e?.fields || {};

        if (fields.email) {
          return res.status(409).json({
            success: false,
            message: 'البريد الإلكتروني مسجل مسبقًا',
          });
        }
        if (fields.studentPhone) {
          return res.status(409).json({
            success: false,
            message: 'رقم الطالب مسجل مسبقًا',
          });
        }
        if (fields.centerCode) {
          return res.status(409).json({
            success: false,
            message: 'كود الطالب مستخدم بالفعل لطالب آخر',
          });
        }

        return res.status(409).json({
          success: false,
          message: 'يوجد بيانات مكررة لا يمكن استخدامها',
        });
      }
      next(e);
    }

  });

  /** ========== تسجيل الدخول ========== */
  router.post("/login", async (req, res, next) => {
    try {
      const login = String(req.body?.login || "").trim();
      const password = String(req.body?.password || "");
      if (!login || !password)
        return res.status(400).json({
          success: false,
          message: "يرجى إدخال بيانات الدخول وكلمة السر",
        });

      const isEmail = login.includes("@");

      const student = await StudentSqlite.findOne({
        where: isEmail
          ? { email: login.toLowerCase() }
          : { studentPhone: login },
      });
      if (!student)
        return res
          .status(401)
          .json({ success: false, message: "بيانات دخول غير صحيحة" });

      const ok = bcrypt.compareSync(password, student.passwordHash || "");
      if (!ok)
        return res
          .status(401)
          .json({ success: false, message: "بيانات دخول غير صحيحة" });

      const lvNow = normalizeLevel(student.year) || student.year;
      if (lvNow !== student.year) {
        student.year = lvNow;
        student.updatedAtLocal = new Date();
        await student.save();
      }

      const deviceId =
        String(req.headers["x-device-id"] || req.body?.deviceId || "").trim() ||
        crypto.randomUUID();

      const userAgent = String(req.headers["user-agent"] || "").slice(0, 255);
      const ip = (
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        ""
      )
        .toString()
        .slice(0, 64);

      const activeSessions = await DeviceSessionSqlite.count({
        where: {
          studentId: student.id,
          revokedAt: null,
          expiresAt: { [Op.gt]: new Date() },
        },
      });

      let session = await DeviceSessionSqlite.findOne({
        where: { studentId: student.id, deviceId },
      });

      if (!session && activeSessions >= MAX_DEVICES) {
        return res.status(409).json({
          success: false,
          code: "MAX_DEVICES",
          message:
            "حسابك مستخدم بالفعل على جهازين. تواصل مع الدعم لإخلاء الأجهزة.",
        });
      }

      const refreshRaw = generateRefreshToken();
      const refreshHash = sha256(refreshRaw);
      const expiresAt = refreshExpiryDate();

      if (!session) {
        session = await DeviceSessionSqlite.create({
          studentId: student.id,
          deviceId,
          refreshHash,
          expiresAt,
          userAgent,
          ip,
          lastSeenAt: new Date(),
          revokedAt: null,
          updatedAtLocal: new Date(),
        });
      } else {
        Object.assign(session, {
          refreshHash,
          expiresAt,
          userAgent,
          ip,
          lastSeenAt: new Date(),
          revokedAt: null,
          updatedAtLocal: new Date(),
        });
        await session.save();
      }

      const accessToken = issueAccessToken({
        id: student.id,
        role: "student",
        level: lvNow,
      });
      if (REFRESH_IN_COOKIE) setRefreshCookie(res, refreshRaw);

      return res.json({
        success: true,
        data: {
          id: student.id,
          studentName: student.studentName,
          email: student.email,
          level: lvNow,
          deviceId,
          centerId: student.centerId ?? null,
          centerName: student.centerName ?? null,
          centerCode: student.centerCode ?? null,
        },
        accessToken,
        refreshToken: REFRESH_IN_COOKIE ? undefined : refreshRaw,
      });
    } catch (e) {
      next(e);
    }
  });

  /** ========== refresh ========== */
  router.post("/refresh", async (req, res, next) => {
    try {
      const raw =
        req.cookies?.refresh_token || String(req.body?.refreshToken || "");
      const deviceId = String(
        req.headers["x-device-id"] || req.body?.deviceId || ""
      ).trim();

      if (!raw || !deviceId)
        return res
          .status(400)
          .json({ success: false, message: "refreshToken و deviceId مطلوبان" });

      const hash = sha256(raw);
      const session = await DeviceSessionSqlite.findOne({
        where: { refreshHash: hash, deviceId },
      });

      if (!session)
        return res
          .status(401)
          .json({ success: false, message: "جلسة غير صالحة" });
      if (session.revokedAt)
        return res
          .status(401)
          .json({ success: false, message: "الجلسة ملغاة" });
      if (new Date(session.expiresAt).getTime() <= Date.now())
        return res
          .status(401)
          .json({ success: false, message: "انتهت صلاحية الجلسة" });

      const newRaw = generateRefreshToken();
      const newHash = sha256(newRaw);
      const newExp = refreshExpiryDate();

      session.refreshHash = newHash;
      session.expiresAt = newExp;
      session.lastSeenAt = new Date();
      session.updatedAtLocal = new Date();
      await session.save();

      const student = await StudentSqlite.findByPk(session.studentId);
      if (!student)
        return res
          .status(404)
          .json({ success: false, message: "الحساب غير موجود" });

      const levelNorm = normalizeLevel(student.year) || student.year;
      const accessToken = issueAccessToken({
        id: student.id,
        role: "student",
        level: levelNorm,
      });

      if (REFRESH_IN_COOKIE) setRefreshCookie(res, newRaw);

      res.json({
        success: true,
        accessToken,
        refreshToken: REFRESH_IN_COOKIE ? undefined : newRaw,
      });
    } catch (e) {
      next(e);
    }
  });

  /** ========== logout من جهاز معيّن ========== */
  router.post("/logout", requireAuth, async (req, res, next) => {
    try {
      const deviceId = String(
        req.headers["x-device-id"] || req.body?.deviceId || ""
      ).trim();
      if (!deviceId)
        return res
          .status(400)
          .json({ success: false, message: "deviceId مطلوب" });

      const s = await DeviceSessionSqlite.findOne({
        where: { studentId: Number(req.user.id), deviceId },
      });
      if (!s)
        return res
          .status(404)
          .json({ success: false, message: "الجلسة غير موجودة" });

      s.revokedAt = new Date();
      s.updatedAtLocal = new Date();
      await s.save();

      if (req.cookies?.refresh_token) {
        res.clearCookie("refresh_token", { path: "/api/v1/students" });
      }

      res.json({ success: true, message: "تم تسجيل الخروج من هذا الجهاز" });
    } catch (e) {
      next(e);
    }
  });
  /** ========== forgot password (OTP via email) ========== */
  router.post("/forgot", async (req, res, next) => {
    try {
      const inputEmail = String(req.body?.email || "")
        .trim()
        .toLowerCase();
      if (!inputEmail)
        return res.status(400).json({
          success: false,
          message: "يرجى إدخال البريد الإلكتروني",
        });

      const student = await StudentSqlite.findOne({
        where: { email: inputEmail },
      });

      // لا نفصح هل الإيميل موجود ولا لأ
      if (!student) {
        console.log("[forgot] student not found -> NO SEND");
        return res.json({
          success: true,
          message: "تم إرسال رمز التحقق إن وُجد حساب مطابق",
        });
      }

      // rate limit: دقيقة
      const oneMinAgo = new Date(Date.now() - 60 * 1000);
      const recent = await PasswordResetSqlite.findOne({
        where: {
          email: inputEmail,
          createdAt: { [Op.gte]: oneMinAgo },
        },
      });
      if (recent) {
        console.log("[forgot] throttled -> NO SEND");
        return res.status(429).json({
          success: false,
          message: "حاول مرة أخرى بعد لحظات",
        });
      }

      const otpLength = Number(process.env.OTP_LENGTH || 6);
      const otpExpMin = Number(process.env.OTP_EXP_MIN || 10);
      const otpMaxAttempts = Number(process.env.OTP_MAX_ATTEMPTS || 5);

      const otp = generateNumericOtp(otpLength);
      const otpHash = sha256Otp(otp);
      const expiresAt = minutesFromNow(otpExpMin);

      await PasswordResetSqlite.create({
        email: inputEmail,
        otpHash,
        expiresAt,
        attempts: 0,
        maxAttempts: otpMaxAttempts,
      });

      console.log("[forgot] student found -> WILL SEND to", inputEmail);
      await sendOtpEmail(inputEmail, otp);

      return res.json({
        success: true,
        message: "تم إرسال رمز التحقق إلى بريدك الإلكتروني",
      });
    } catch (e) {
      next(e);
    }
  });

  /** ========== reset password باستخدام OTP ========== */
  router.post("/reset", async (req, res, next) => {
    try {
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();
      const otp = String(req.body?.otp || "").trim();
      const newPassword = String(req.body?.newPassword || "");
      const confirmNewPassword = String(req.body?.confirmNewPassword || "");

      if (!email || !otp || !newPassword || !confirmNewPassword) {
        return res.status(400).json({
          success: false,
          message: "يرجى إدخال جميع الحقول",
        });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "الحد الأدنى لكلمة السر 6 أحرف",
        });
      }
      if (newPassword !== confirmNewPassword) {
        return res.status(400).json({
          success: false,
          message: "كلمتا السر غير متطابقتين",
        });
      }

      const pr = await PasswordResetSqlite.findOne({
        where: { email },
        order: [["id", "DESC"]],
      });

      if (!pr)
        return res.status(400).json({
          success: false,
          message: "رمز غير صالح",
        });
      if (pr.usedAt)
        return res.status(400).json({
          success: false,
          message: "تم استخدام هذا الرمز من قبل",
        });
      if (new Date(pr.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({
          success: false,
          message: "انتهت صلاحية الرمز",
        });
      }
      if ((pr.attempts || 0) >= (pr.maxAttempts || 5)) {
        return res.status(429).json({
          success: false,
          message: "تجاوزت عدد المحاولات",
        });
      }

      const okOtp = sha256Otp(otp) === pr.otpHash;
      pr.attempts = (pr.attempts || 0) + 1;

      if (!okOtp) {
        await pr.save();
        return res.status(400).json({
          success: false,
          message: "رمز غير صحيح",
        });
      }

      const student = await StudentSqlite.findOne({
        where: { email },
      });
      if (!student)
        return res.status(404).json({
          success: false,
          message: "الحساب غير موجود",
        });

      const passwordHash = bcrypt.hashSync(newPassword, 10);

      await performOperation({
        modelName: "Student",
        sqliteModel: StudentSqlite,
        mysqlModel: StudentMysql,
        op: "update",
        data: { passwordHash, updatedAtLocal: new Date() },
        where: { id: student.id },
        outboxModel: OutboxSqlite,
      });

      pr.usedAt = new Date();
      await pr.save();

      return res.json({
        success: true,
        message: "تم تحديث كلمة السر بنجاح",
      });
    } catch (e) {
      next(e);
    }
  });
  /** ========== لستة الطلاب (بدون passwordHash) ========== */
  router.get("/", async (_req, res, next) => {
    try {
      const rows = await StudentSqlite.findAll({
        order: [["id", "ASC"]],
        attributes: { exclude: ["passwordHash"] },
      });
      return res.json({ success: true, data: rows });
    } catch (e) {
      next(e);
    }
  });

  /** ========== بيانات الطالب الحالي (me) ========== */
  router.get("/me", requireAuth, async (req, res, next) => {
    try {
      const studentId = Number(req.user?.id);
      if (!studentId || req.user?.role !== "student") {
        return res
          .status(403)
          .json({ success: false, message: "مصرّح للطلاب فقط" });
      }

      const student = await StudentSqlite.findByPk(studentId);
      if (!student) {
        return res
          .status(404)
          .json({ success: false, message: "الحساب غير موجود" });
      }

      return res.json({
        success: true,
        data: safeStudent(student),
      });
    } catch (e) {
      next(e);
    }
  });

  /** ========== تعديل بيانات الحساب (me) ========== */
  router.patch("/me", requireAuth, async (req, res, next) => {
    try {
      const studentId = Number(req.user?.id);
      if (!studentId || req.user?.role !== "student") {
        return res
          .status(403)
          .json({ success: false, message: "مصرّح للطلاب فقط" });
      }

      const body = req.body || {};
      const patch = { updatedAtLocal: new Date() };
      const errs = [];

      if (body.studentName !== undefined) {
        const name = String(body.studentName || "").trim();
        if (!name || name.length < 3) {
          errs.push("الاسم مطلوب وبحد أدنى 3 أحرف");
        } else {
          patch.studentName = name;
        }
      }

      if (body.email !== undefined) {
        const email = String(body.email || "")
          .trim()
          .toLowerCase();
        if (!email) {
          errs.push("البريد الإلكتروني مطلوب");
        } else {
          patch.email = email;
        }
      }

      if (body.studentPhone !== undefined) {
        const phone = String(body.studentPhone || "").trim();
        if (!phoneRegex.test(phone)) {
          errs.push("رقم الطالب غير صالح (01 + 9 أرقام)");
        } else {
          patch.studentPhone = phone;
        }
      }

      if (body.guardianPhone !== undefined) {
        const gPhone = String(body.guardianPhone || "").trim();
        if (!phoneRegex.test(gPhone)) {
          errs.push("رقم ولي الأمر غير صالح (01 + 9 أرقام)");
        } else {
          patch.guardianPhone = gPhone;
        }
      }

      if (body.region !== undefined) {
        const region = String(body.region || "").trim();
        if (!region) {
          errs.push("المحافظة مطلوبة");
        } else {
          patch.region = region;
        }
      }

      if (errs.length) {
        return res.status(400).json({ success: false, errors: errs });
      }

      await performOperation({
        modelName: "Student",
        sqliteModel: StudentSqlite,
        mysqlModel: StudentMysql,
        op: "update",
        where: { id: studentId },
        data: patch,
        outboxModel: OutboxSqlite,
      });

      const fresh = await StudentSqlite.findByPk(studentId);
      return res.json({ success: true, data: safeStudent(fresh) });
    } catch (e) {
      if (e?.name === 'SequelizeUniqueConstraintError') {
        const fields = e?.fields || {};

        if (fields.email) {
          return res.status(409).json({
            success: false,
            message: 'البريد الإلكتروني مسجل مسبقًا',
          });
        }
        if (fields.studentPhone) {
          return res.status(409).json({
            success: false,
            message: 'رقم الطالب مسجل مسبقًا',
          });
        }
        if (fields.centerCode) {
          return res.status(409).json({
            success: false,
            message: 'كود الطالب مستخدم بالفعل لطالب آخر',
          });
        }

        return res.status(409).json({
          success: false,
          message: 'يوجد بيانات مكررة لا يمكن استخدامها',
        });
      }
      next(e);
    }

  });

  /** ========== تغيير كلمة المرور (مع معرفة الحالية) ========== */
  router.post("/change-password", requireAuth, async (req, res, next) => {
    try {
      const studentId = Number(req.user?.id);
      if (!studentId || req.user?.role !== "student") {
        return res
          .status(403)
          .json({ success: false, message: "مصرّح للطلاب فقط" });
      }

      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      const confirmNewPassword = String(req.body?.confirmNewPassword || "");

      if (!currentPassword || !newPassword || !confirmNewPassword) {
        return res.status(400).json({
          success: false,
          message: "يرجى إدخال جميع الحقول",
        });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "الحد الأدنى لكلمة السر 6 أحرف",
        });
      }
      if (newPassword !== confirmNewPassword) {
        return res.status(400).json({
          success: false,
          message: "كلمتا السر غير متطابقتين",
        });
      }

      const student = await StudentSqlite.findByPk(studentId);
      if (!student) {
        return res
          .status(404)
          .json({ success: false, message: "الحساب غير موجود" });
      }

      const ok = bcrypt.compareSync(
        currentPassword,
        student.passwordHash || ""
      );
      if (!ok) {
        return res.status(400).json({
          success: false,
          message: "كلمة المرور الحالية غير صحيحة",
        });
      }

      const passwordHash = bcrypt.hashSync(newPassword, 10);

      await performOperation({
        modelName: "Student",
        sqliteModel: StudentSqlite,
        mysqlModel: StudentMysql,
        op: "update",
        where: { id: studentId },
        data: { passwordHash, updatedAtLocal: new Date() },
        outboxModel: OutboxSqlite,
      });

      return res.json({
        success: true,
        message: "تم تحديث كلمة السر بنجاح",
      });
    } catch (e) {
      next(e);
    }
  });

  /** ========== تعيين/تعديل/إزالة السنتر لاحقًا ========== */
  router.patch("/me/center", requireAuth, async (req, res, next) => {
    try {
      const studentId = Number(req.user?.id);
      if (!studentId || req.user?.role !== "student") {
        return res
          .status(403)
          .json({ success: false, message: "مصرّح للطلاب فقط" });
      }
      const student = await StudentSqlite.findByPk(studentId);
      if (!student)
        return res
          .status(404)
          .json({ success: false, message: "الحساب غير موجود" });

      const body = req.body || {};
      const patch = { updatedAtLocal: new Date() };

      if (body.centerId !== undefined) {
        if (body.centerId === null || String(body.centerId).trim() === "") {
          patch["centerId"] = null;
          patch["centerName"] = null;
          // مفيش سنتر ⇒ مابنمسش region (المحافظة) هنا
        } else {
          const cid = Number(body.centerId);
          if (Number.isNaN(cid))
            return res
              .status(400)
              .json({ success: false, message: "centerId غير صالح" });

          const center = await CenterSqlite.findOne({
            where: { id: cid, isDeleted: false, isActive: true },
          });
          if (!center)
            return res.status(400).json({
              success: false,
              message: "السنتر غير موجود أو غير مُفعّل",
            });

          const lvl = normalizeLevel(student.year) || student.year;
          if (
            lvl &&
            Array.isArray(center.levelsSupported) &&
            center.levelsSupported.length
          ) {
            if (!center.levelsSupported.includes(lvl))
              return res.status(400).json({
                success: false,
                message: "السنتر المحدد لا يدعم سنة الطالب الحالية",
              });
          }

          patch["centerId"] = center.id;
          patch["centerName"] = center.name || null;
          // المحافظة بتاعة الطالب بتفضل زي ما هي
        }
      }

      if (body.centerName !== undefined)
        patch["centerName"] = String(body.centerName || "").trim() || null;

      if (body.centerCode !== undefined) {
        const rawCode = String(body.centerCode || '').trim().toUpperCase();

        if (!rawCode) {
          // لو بعت فاضي نعتبره إلغاء الكود
          patch['centerCode'] = null;
        } else {
          // نتأكد إنه مش مستخدم لطالب تاني
          const existing = await StudentSqlite.findOne({
            where: {
              centerCode: rawCode,
              id: { [Op.ne]: studentId },
            },
          });

          if (existing) {
            return res.status(409).json({
              success: false,
              message: 'كود الطالب مستخدم بالفعل لطالب آخر',
            });
          }

          patch['centerCode'] = rawCode;
        }
      }


      await performOperation({
        modelName: "Student",
        sqliteModel: StudentSqlite,
        mysqlModel: StudentMysql,
        op: "update",
        where: { id: studentId },
        data: patch,
        outboxModel: OutboxSqlite,
      });

      const fresh = await StudentSqlite.findByPk(studentId);
      return res.json({ success: true, data: safeStudent(fresh) });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export default createStudentsRouter;
