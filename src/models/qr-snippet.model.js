// src/models/qr-snippet.model.js
import { DataTypes } from "sequelize";

export function defineQrSnippetModel(sequelize, tableName = "qr_snippets") {
  const QrSnippet = sequelize.define(
    "QrSnippet",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      // كود الـ QR (اللي بيتحط في الـ URL)
      token: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },

      // ربط بالكورس والدرس
      courseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      lessonId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      // بيانات العرض
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // ميتاداتا اختيارية
      subject: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      teacher: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },

      // بيانات الفيديو
      streamType: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "mp4", // mp4 | hls | dash | external ...
      },
      provider: {
        type: DataTypes.STRING(32),
        allowNull: true, // youtube | vimeo | ...
      },
      streamUrl: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      posterUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      durationSec: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      // صلاحية الكود نفسه (مش حضور الطالب)
      linkExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      // تفعيل/تعطيل الكود
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      // مين أنشأه (اختياري)
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      // updatedAtLocal مستخدمة في باقي الموديلات عندك
      updatedAtLocal: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName,
      underscored: true,
      timestamps: true, // createdAt / updatedAt
      indexes: [
        { fields: ["token"], unique: true },
        { fields: ["course_id"] },
        { fields: ["lesson_id"] },
        { fields: ["is_active"] },
      ],
    }
  );

  return QrSnippet;
}
