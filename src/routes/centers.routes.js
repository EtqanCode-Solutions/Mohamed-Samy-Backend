// src/routes/centers.routes.js
import { Router } from "express";
import { Op, fn, col } from "sequelize";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/roles.js";
import { performOperation } from "../services/replicator.js";
import { EGYPT_GOVERNORATES } from "../utils/egypt-governorates.js";
import { LEVELS_AR, normalizeLevel } from "../utils/levels.js";

// تحقّق أساسي لرابط خرائط جوجل
function isAllowedMapsUrl(url) {
  if (!url) return true; // اختياري
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    const allowed = [
      "google.com",
      "www.google.com",
      "maps.google.com",
      "goo.gl",
      "maps.app.goo.gl",
      "g.page",
    ];
    return (
      host.endsWith("google.com") ||
      host === "maps.google.com" ||
      host === "maps.app.goo.gl" ||
      (host === "goo.gl" && u.pathname.startsWith("/maps")) ||
      host === "g.page"
    );
  } catch {
    return false;
  }
}

// تطبيع مصفوفة السنوات المدعومة للسنتر
function normalizeLevels(arr) {
  const s = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const norm = normalizeLevel(v);
    if (norm) s.add(norm);
  }
  return Array.from(s);
}

function validateSchedule(items) {
  if (!Array.isArray(items)) return [];
  const errors = [];
  for (const it of items) {
    const weekday = Number(it?.weekday);
    const from = String(it?.from || "").trim();
    const to = String(it?.to || "").trim();
    if (!(weekday >= 0 && weekday <= 6))
      errors.push("weekday يجب أن يكون 0..6");
    if (!/^\d{2}:\d{2}$/.test(from)) errors.push("from بصيغة HH:mm");
    if (!/^\d{2}:\d{2}$/.test(to)) errors.push("to بصيغة HH:mm");
    if (from && to && from >= to) errors.push("from يجب أن يكون قبل to");

    if (it.level) {
      const lNorm = normalizeLevel(it.level);
      if (!lNorm) errors.push("level في schedule غير صالح");
    }

    if (errors.length) break;
  }
  return errors;
}

// التحقق من اسم المحافظة من اللستة
function validateRegionName(region) {
  const r = String(region || "").trim();
  if (!r) return "المحافظة مطلوبة";
  if (!EGYPT_GOVERNORATES.includes(r)) return "المحافظة غير صالحة";
  return null;
}

export default function createCentersRouter(models) {
  const router = Router();
  const { CenterSqlite, CenterMysql, StudentSqlite, OutboxSqlite } = models;

  // ===================================================================
  // 🧑‍🎓 أولاً: Routes عامة / للطلبة (قراءة بيانات السناتر)
  // ===================================================================

  // GET /centers/regions
  // لستة المحافظات المتاحة (ثابتة من EGYPT_GOVERNORATES)
  router.get("/regions", (_req, res) => {
    res.json({ success: true, data: EGYPT_GOVERNORATES });
  });

  // GET /centers/cities?level=...&active=true
  // لستة المدن (distinct) مع عدد السناتر في كل مدينة، مع فلترة اختيارية
  router.get("/cities", async (req, res, next) => {
    try {
      const levelRaw = req.query.level?.toString().trim() || "";
      const levelNorm = levelRaw ? normalizeLevel(levelRaw) : null;
      const activeQ = req.query.active?.toString().trim(); // 'true' | 'false' | undefined

      const where = { isDeleted: false };
      if (activeQ === "true") where["isActive"] = true;
      if (activeQ === "false") where["isActive"] = false;

      const rows = await CenterSqlite.findAll({
        where,
        attributes: ["city", "region", "levelsSupported", "isActive"],
      });

      let filtered = rows.filter((r) => {
        const cityName = (r.city || r.region || "").toString().trim();
        return !!cityName;
      });

      if (levelNorm) {
        filtered = filtered.filter((r) => {
          const arr = Array.isArray(r.levelsSupported) ? r.levelsSupported : [];
          return !arr.length || arr.includes(levelNorm);
        });
      }

      const map = new Map(); // cityName -> count
      for (const r of filtered) {
        const cityName = (r.city || r.region || "").toString().trim();
        if (!cityName) continue;
        map.set(cityName, (map.get(cityName) || 0) + 1);
      }

      const data = Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "ar"))
        .map(([city, count]) => ({ city, count }));

      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  // GET /centers
  // قائمة السناتر مع فلترة بالمحافظة + المدينة + المرحلة + حالة التفعيل
  // مثال:
  // /centers?region=القاهرة&city=مدينة%20نصر&level=الصف%20الاول%20الثانوي&active=true&withStats=true
  router.get("/", async (req, res, next) => {
    try {
      const region = req.query.region?.toString().trim() || "";
      const city = req.query.city?.toString().trim() || "";
      const levelRaw = req.query.level?.toString().trim() || "";
      const levelNorm = levelRaw ? normalizeLevel(levelRaw) : null;
      const active = req.query.active?.toString().trim(); // 'true' | 'false' | undefined
      const withStats = req.query.withStats?.toString().trim() === "true";

      const where = { isDeleted: false };
      if (region) where["region"] = region;

      if (city) {
        where[Op.or] = [
          { city }, // سنتر فيه city متخزنة
          { city: null, region: city }, // سنتر قديم المنطقة فيه متخزنة كـ region
        ];
      }

      if (active === "true") where["isActive"] = true;
      if (active === "false") where["isActive"] = false;

      const rows = await CenterSqlite.findAll({
        where,
        order: [["id", "ASC"]],
      });

      let data = rows;
      if (levelNorm) {
        data = rows.filter((r) => {
          const arr = Array.isArray(r.levelsSupported) ? r.levelsSupported : [];
          return arr.includes(levelNorm);
        });
      }

      if (withStats) {
        const ids = data.map((d) => d.id);
        if (ids.length) {
          const counts = await StudentSqlite.findAll({
            attributes: ["centerId", [fn("COUNT", col("id")), "c"]],
            where: { centerId: { [Op.in]: ids } },
            group: ["centerId"],
            raw: true,
          });
          const map = new Map(
            counts.map((x) => [Number(x.centerId), Number(x.c)])
          );
          data = data.map((d) => ({
            ...d.toJSON(),
            studentCount: map.get(d.id) || 0,
          }));
        } else {
          data = data.map((d) => ({ ...d.toJSON(), studentCount: 0 }));
        }
      } else {
        data = data.map((d) => d.toJSON());
      }

      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  // GET /centers/:id
  // قراءة بيانات سنتر واحد
  router.get("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const center = await CenterSqlite.findOne({
        where: { id, isDeleted: false },
      });
      if (!center)
        return res
          .status(404)
          .json({ success: false, message: "غير موجود" });
      res.json({ success: true, data: center.toJSON() });
    } catch (e) {
      next(e);
    }
  });

  // ===================================================================
  // 🛠️ ثانيًا: Routes الأدمن (إدارة السناتر: إضافة / تعديل / حذف)
  // ===================================================================

  // POST /centers
  // إنشاء سنتر جديد (Admin فقط)
  router.post(
    "/",
    requireAuth,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const b = req.body || {};
        const levels = normalizeLevels(b.levelsSupported);
        const schErr = validateSchedule(b.schedule);
        if (schErr.length)
          return res.status(400).json({ success: false, errors: schErr });

        const mapsUrl = b.mapsUrl?.trim() || null;
        if (mapsUrl && !isAllowedMapsUrl(mapsUrl)) {
          return res
            .status(400)
            .json({ success: false, message: "رابط خرائط غير صالح" });
        }

        const regionErr = validateRegionName(b.region);
        if (regionErr) {
          return res.status(400).json({ success: false, message: regionErr });
        }

        const data = {
          code: b.code?.trim() || null,
          name: String(b.name || "").trim(),
          region: String(b.region || "").trim(), // محافظة
          city: b.city?.trim() || null, // المدينة
          addressLine: String(b.addressLine || "").trim(),

          mapsUrl,

          levelsSupported: levels.length ? levels : null,
          schedule: Array.isArray(b.schedule) ? b.schedule : null,

          managerName: b.managerName?.trim() || null,
          managerPhone: b.managerPhone?.trim() || null,
          whatsapp: b.whatsapp?.trim() || null,
          email: b.email?.trim() || null,

          isActive: b.isActive !== undefined ? !!b.isActive : true,
          isDeleted: false,
          updatedAtLocal: new Date(),
        };

        if (!data.name || !data.region || !data.addressLine) {
          return res.status(400).json({
            success: false,
            message: "name و region و addressLine مطلوبة",
          });
        }

        const created = await performOperation({
          modelName: "Center",
          sqliteModel: CenterSqlite,
          mysqlModel: CenterMysql,
          op: "create",
          data,
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, data: created.toJSON() });
      } catch (e) {
        next(e);
      }
    }
  );

  // PATCH /centers/:id
  // تعديل بيانات سنتر (Admin فقط)
  router.patch(
    "/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const center = await CenterSqlite.findOne({
          where: { id, isDeleted: false },
        });
        if (!center)
          return res
            .status(404)
            .json({ success: false, message: "السنتر غير موجود" });

        const b = req.body || {};
        const patch = { updatedAtLocal: new Date() };

        if (b.levelsSupported !== undefined)
          patch.levelsSupported = normalizeLevels(b.levelsSupported);

        if (b.schedule !== undefined) {
          const schErr = validateSchedule(b.schedule);
          if (schErr.length)
            return res.status(400).json({ success: false, errors: schErr });
          patch.schedule = b.schedule;
        }

        if (b.mapsUrl !== undefined) {
          const m = String(b.mapsUrl || "").trim();
          if (m && !isAllowedMapsUrl(m)) {
            return res
              .status(400)
              .json({ success: false, message: "رابط خرائط غير صالح" });
          }
          patch.mapsUrl = m || null;
        }

        if (b.region !== undefined) {
          const regionErr = validateRegionName(b.region);
          if (regionErr) {
            return res
              .status(400)
              .json({ success: false, message: regionErr });
          }
          patch.region = String(b.region || "").trim();
        }

        if (b.city !== undefined) {
          const c = String(b.city || "").trim();
          patch.city = c || null;
        }

        [
          "code",
          "name",
          "addressLine",
          "managerName",
          "managerPhone",
          "whatsapp",
          "email",
        ].forEach((k) => {
          if (b[k] !== undefined) patch[k] = b[k];
        });

        if (b.isActive !== undefined) patch.isActive = !!b.isActive;
        if (b.isDeleted !== undefined) patch.isDeleted = !!b.isDeleted;

        await performOperation({
          modelName: "Center",
          sqliteModel: CenterSqlite,
          mysqlModel: CenterMysql,
          op: "update",
          where: { id },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, data: { id, ...patch } });
      } catch (e) {
        next(e);
      }
    }
  );

  // DELETE /centers/:id
  // حذف ناعم (soft delete) لسنتر (Admin فقط)
  router.delete(
    "/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const center = await CenterSqlite.findOne({
          where: { id, isDeleted: false },
        });
        if (!center)
          return res
            .status(404)
            .json({ success: false, message: "السنتر غير موجود" });

        await performOperation({
          modelName: "Center",
          sqliteModel: CenterSqlite,
          mysqlModel: CenterMysql,
          op: "update",
          where: { id },
          data: { isDeleted: true, updatedAtLocal: new Date() },
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, message: "تم حذف السنتر (soft delete)" });
      } catch (e) {
        next(e);
      }
    }
  );

  return router;
}
