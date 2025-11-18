// src/models/student-qr-view.model.js
import { DataTypes } from "sequelize";

export function defineStudentQrViewModel(
  sequelize,
  tableName = "student_qr_views"
) {
  const StudentQrView = sequelize.define(
    "StudentQrView",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      studentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      qrId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      // denormalized لسهولة التقارير
      courseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      lessonId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      // ممكن نربطه بالحضور لو موجود
      attendanceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      viewsCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      firstViewedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastViewedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

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
        {
          unique: true,
          fields: ["student_id", "qr_id"],
        },
        { fields: ["student_id", "lesson_id"] },
        { fields: ["course_id"] },
      ],
    }
  );

  return StudentQrView;
}
