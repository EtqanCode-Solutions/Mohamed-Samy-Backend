// src/app.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

// Routers الأساسية
import { createClientsRouter } from "./routes/clients.routes.js";
import { createStudentsRouter } from "./routes/students.routes.js";
import healthRoutes from "./routes/health.routes.js";
import createCoursesRouter from "./routes/courses.routes.js";
import createCheckoutRouter from "./routes/checkout.routes.js";
import createPlansRouter from "./routes/plans.routes.js";
import createUsersRouter from "./routes/users.routes.js";
import createVouchersRouter from "./routes/vouchers.routes.js";
import createWalletRouter from "./routes/wallet.routes.js";
import createAdminTopupsRouter from "./routes/admin.topups.routes.js";
import createCommunityRouter from "./routes/community.routes.js";
import hlsRouter from "./routes/hls.routes.js";
import createFaqRouter from "./routes/faq.routes.js";
import createSelfQuizRouter from "./routes/self-quiz.routes.js";
import createMapFaqRouter from "./routes/map-faq.routes.js";
import createDeviceSessionsRouter from "./routes/device-sessions.routes.js";
import createCentersRouter from "./routes/centers.routes.js";
import createAdminExamsRouter from "./routes/admin.exams.routes.js";

import createGamesRouter from "./routes/games.routes.js";

import createQrLinksRouter from "./routes/qr-links.routes.js";
import createQrSnippetsRouter from "./routes/qr-snippets.routes.js";

import createStudentInsightsRouter from "./routes/student-insights.routes.js";
import createNotificationsRouter from "./routes/notifications.routes.js";

import createCertificatesRouter from "./routes/certificates.routes.js";

import createStudentActivityRouter from "./routes/student-activity.routes.js";





// NEW: الراوترات الجديدة
import createAttendanceRouter from "./routes/attendance.routes.js";
import createProgressRouter from "./routes/progress.routes.js";

import createExamsRouter from "./routes/exams.routes.js";

// Middlewares
import { notFound } from "./middlewares/not-found.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { requireAuth } from "./middlewares/auth.js";

export async function initApp(models, modelsMap) {
  const app = express();

  // =====================================
  // 0) مساعدة مسار الملفات (ESM friendly)
  // =====================================
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // ✅ Prefix ثابت للـ API version
  const API_PREFIX = "/api/v1";

  // =====================================
  // 1) CORS مضبوط
  // =====================================
  const ALLOWED_ORIGIN = "http://localhost:4200";

  const corsOptions = {
    origin: (origin, cb) => {
      // السماح لتطبيق Angular المحلي + Postman/Curl (origin=null)
      if (!origin || origin === ALLOWED_ORIGIN) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true, // لو عندك كوكيز/جلسات
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "x-device-id",
      "x-app-version",
      "x-platform",
    ],
    optionsSuccessStatus: 204,
  };

  // لازم يتسجل قبل أي Routes
  app.use(cors(corsOptions));
  // دعم كل طلبات preflight
  app.options("*", cors(corsOptions));

  // =====================================
  // 2) Middlewares أساسية
  // =====================================
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));

  // HLS – هو أصلاً تحت /api/hls فهنسيبه زي ما هو
  app.use("/api/hls", hlsRouter);

  // =====================================
  // 3) ملفات ثابتة (Static)
  // =====================================
  app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));


    app.use("/certificates", createCertificatesRouter(models));
  app.use(API_PREFIX + "/certificates", createCertificatesRouter(models));

  // =====================================
  // 4) لوج تشخيصي (Dev)
  // =====================================
  app.use((req, _res, next) => {
    console.log("[REQ]", req.method, req.url, req.body);
    next();
  });

  // =====================================
  // 5) Routes العامة / النصف عامة
  // =====================================

  // Health
  app.use("/health", healthRoutes);
  app.use(API_PREFIX + "/health", healthRoutes);

  // Clients
  app.use("/clients", createClientsRouter(models));
  app.use(API_PREFIX + "/clients", createClientsRouter(models));

  // Students
  app.use("/students", createStudentsRouter(models));
  app.use(API_PREFIX + "/students", createStudentsRouter(models));

  // مجتمع الأسئلة والأجوبة
  app.use("/community", createCommunityRouter(models));
  app.use(API_PREFIX + "/community", createCommunityRouter(models));

  // Users
  app.use("/users", createUsersRouter(models));
  app.use(API_PREFIX + "/users", createUsersRouter(models));

  // Centers
  app.use("/centers", createCentersRouter(models));
  app.use(API_PREFIX + "/centers", createCentersRouter(models));

  // FAQ
  app.use("/faq", createFaqRouter(models));
  app.use(API_PREFIX + "/faq", createFaqRouter(models));

  // Self-Quiz
  app.use("/self-quiz", createSelfQuizRouter(models));
  app.use(API_PREFIX + "/self-quiz", createSelfQuizRouter(models));

  // Map FAQ
  app.use("/map-faq", createMapFaqRouter(models));
  app.use(API_PREFIX + "/map-faq", createMapFaqRouter(models));

  // Device Sessions
  app.use("/device-sessions", createDeviceSessionsRouter(models));
  app.use(API_PREFIX + "/device-sessions", createDeviceSessionsRouter(models));

  // Exams (student)
  app.use("/exams", createExamsRouter(models));
  app.use(API_PREFIX + "/exams", createExamsRouter(models));

  // Admin Exams
  app.use("/admin/exams", createAdminExamsRouter(models));
  app.use(API_PREFIX + "/admin/exams", createAdminExamsRouter(models));

  // كورسات
  app.use("/courses", createCoursesRouter(models));
  app.use(API_PREFIX + "/courses", createCoursesRouter(models));

  // QR Snippets
  app.use("/qr-snippets", createQrSnippetsRouter(models));
  app.use(API_PREFIX + "/qr-snippets", createQrSnippetsRouter(models));

  // Games
  app.use("/games", createGamesRouter(models));
  app.use(API_PREFIX + "/games", createGamesRouter(models));

  // QR Links
  app.use("/qr-links", createQrLinksRouter(models));
  app.use(API_PREFIX + "/qr-links", createQrLinksRouter(models));

  // Student Insights (Dashboard)
  app.use("/student-insights", createStudentInsightsRouter(models));
  app.use(API_PREFIX + "/student-insights", createStudentInsightsRouter(models));

    // Student Activity (My dashboard)
  app.use("/student-activity", createStudentActivityRouter(models));
  app.use(API_PREFIX + "/student-activity", createStudentActivityRouter(models));

  // =====================================
  // 6) الدفع / الاشتراكات / المحفظة
  // =====================================
  app.use("/checkout", requireAuth, createCheckoutRouter(models));
  app.use(API_PREFIX + "/checkout", requireAuth, createCheckoutRouter(models));

  app.use("/plans", createPlansRouter(models));
  app.use(API_PREFIX + "/plans", createPlansRouter(models));

  app.use("/vouchers", createVouchersRouter(models));
  app.use(API_PREFIX + "/vouchers", createVouchersRouter(models));

  app.use("/wallet", createWalletRouter(models));
  app.use(API_PREFIX + "/wallet", createWalletRouter(models));

  app.use("/admin/topups", requireAuth, createAdminTopupsRouter(models));
  app.use(API_PREFIX + "/admin/topups", requireAuth, createAdminTopupsRouter(models));

  // =====================================
  // 7) الطالب الحالي (debug)
  // =====================================
  app.get("/students/me", requireAuth, (req, res) => {
    res.json({ success: true, me: req.user });
  });
  app.get(API_PREFIX + "/students/me", requireAuth, (req, res) => {
    res.json({ success: true, me: req.user });
  });

  // =====================================
  // 8) NEW: Attendance + Progress
  // =====================================
  app.use("/attendance", createAttendanceRouter(models));
  app.use(API_PREFIX + "/attendance", createAttendanceRouter(models));

  // Progress routes جوّه createProgressRouter:
  // POST /lessons/:lessonId/progress
  app.use("/", createProgressRouter(models));
  app.use(API_PREFIX, createProgressRouter(models));

  // Notifications
  app.use("/notifications", createNotificationsRouter(models));
  app.use(API_PREFIX + "/notifications", createNotificationsRouter(models));

  // =====================================
  // 9) أخطاء
  // =====================================
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
