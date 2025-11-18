// src/models/course.model.js
import { DataTypes } from 'sequelize';

/**
 * نموذج الكورس
 * مطابق للاستخدام في routes:
 * - title, slug, shortDesc, longDesc, coverImageUrl, trailerUrl, teacherName, category
 * - level (عربي)، isFree، priceCents
 * - status: draft/published/archived، publishedAt
 * - totalDurationSec، lessonsCount
 * - isDeleted، updatedAtLocal، createdAt
 */
function defineCourseModel(sequelize, tableName = 'courses') {
  const Course = sequelize.define('Course', {
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    title:            { type: DataTypes.STRING(255), allowNull: false },
    slug:             { type: DataTypes.STRING(255), allowNull: false, unique: true },

    shortDesc:        { type: DataTypes.TEXT },
    longDesc:         { type: DataTypes.TEXT },

    coverImageUrl:    { type: DataTypes.STRING(1000) },
    trailerUrl:       { type: DataTypes.STRING(1000) },

    teacherName:      { type: DataTypes.STRING(255) },
    category:         { type: DataTypes.STRING(255) },

    level:            { type: DataTypes.STRING(255), allowNull: false },

    isFree:           { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    priceCents:       { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    status:           { type: DataTypes.ENUM('draft','published','archived'), allowNull: false, defaultValue: 'draft' },
    publishedAt:      { type: DataTypes.DATE },

    totalDurationSec: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lessonsCount:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    isDeleted:        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    updatedAtLocal:   { type: DataTypes.DATE },
    createdAt:        { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['slug'] },
      { fields: ['status'] },
      { fields: ['isDeleted'] },
      { fields: ['category'] },
      { fields: ['level'] },
    ],
  });

  return Course;
}

// صدّر الاتنين: named + default علشان import { defineCourseModel } يشتغل
export default defineCourseModel;
export { defineCourseModel };
