// src/models/notification.model.js
import { DataTypes } from "sequelize";

export function defineNotificationModel(sequelize, tableName = "notifications") {
  return sequelize.define(
    "Notification",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

      // الطالب المستهدف
      studentId: { type: DataTypes.INTEGER, allowNull: false },

      // عنوان قصير
      title: { type: DataTypes.STRING(200), allowNull: false },

      // نص الإشعار
      body: { type: DataTypes.TEXT, allowNull: false },

      // نوع الإشعار (تحذير حضور / عامة ... إلخ)
      kind: { type: DataTypes.STRING(50), allowNull: true },

      // بيانات إضافية JSON (courseId, lessonId, warnings...)
      dataJson: { type: DataTypes.JSON, allowNull: true },

      // هل الإشعار اتقرى
      isRead: { type: DataTypes.BOOLEAN, defaultValue: false },

      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName,
      timestamps: false,
      indexes: [
        { fields: ["studentId"] },
        { fields: ["studentId", "isRead"] },
        { fields: ["kind"] },
      ],
    }
  );
}
