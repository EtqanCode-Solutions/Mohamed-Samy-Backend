// src/models/plan.model.js (لو عندك ملف مختلف، حط نفس الحقول هناك)
import { DataTypes } from "sequelize";

function definePlanModel(sequelize, tableName = "plans") {
  const Plan = sequelize.define(
    "Plan",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT },

      // السعر / المدة
      priceCents: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "EGP",
      },
      periodDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30,
      },

      // نشاط
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      // نوع الباقة:
      // - UNLIMITED: تغطي كل المؤهلين داخل الـscope
      // - QUOTA: تغطي N من المؤهلين (لازم consume قبل أول مشاهدة)
      kind: {
        type: DataTypes.ENUM("UNLIMITED", "QUOTA"),
        allowNull: false,
        defaultValue: "UNLIMITED",
      },
      quotaCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      }, // فعال فقط مع QUOTA

      // النطاق (الاستحقاق)
      scopeType: {
        type: DataTypes.ENUM(
          "ALL",
          "STAGE",
          "SUBJECT",
          "CATEGORY",
          "COURSE_LIST",
          "GRADE"
        ),
        allowNull: false,
        defaultValue: "ALL",
      },

      // لمواءمة دون لمس Course:
      // - STAGE: نقارن مع Course.level
      // - SUBJECT: نقارن Course.level + Course.category (stage+subject)
      // - CATEGORY: نقارن Course.category
      scopeStage: { type: DataTypes.STRING(255) }, // مثال: "ثانية"
      scopeSubject: { type: DataTypes.STRING(255) }, // مثال: "فيزياء"
      scopeValue: { type: DataTypes.STRING(255) }, // لاستخدامات مرنة/قديمة (مثّل CATEGORY…)
      includeCourseIds: { type: DataTypes.TEXT }, // JSON: [ids] لما تكون COURSE_LIST

      // تغطية الامتحانات (لاحقاً)
      coversExams: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      updatedAtLocal: { type: DataTypes.DATE },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName,
      timestamps: false,
      indexes: [
        { fields: ["isActive"] },
        { fields: ["scopeType"] },
        { fields: ["scopeStage"] },
        { fields: ["scopeSubject"] },
        { fields: ["scopeValue"] },
        { fields: ["kind"] },
      ],
    }
  );

  return Plan;
}

export default definePlanModel;
export { definePlanModel };
