// src/models/student.model.js
import { DataTypes } from 'sequelize';

/**
 * مطابق للفورم:
 * - studentName, email, studentPhone, guardianPhone, year, region
 * - centerName?, centerCode?, password => نخزنها كـ passwordHash (bcrypt)
 */
export function defineStudentModel(sequelize) {
  return sequelize.define('Student', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    studentName: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },

    studentPhone: { type: DataTypes.STRING, allowNull: false },
    guardianPhone: { type: DataTypes.STRING, allowNull: false },

    year: { type: DataTypes.STRING, allowNull: false },   // مثال: "أولى ثانوي" أو "3"
    region: { type: DataTypes.STRING, allowNull: false },

    centerName: { type: DataTypes.STRING, allowNull: true },
    centerCode: { type: DataTypes.STRING, allowNull: true },
    centerId:   { type: DataTypes.INTEGER, allowNull: true }, // FK → centers.id (اختياري)


    // نخزن الهاش فقط
    passwordHash: { type: DataTypes.STRING, allowNull: false },

    // للـmirror ونظام الفرز
    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'students',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['email'] },
      { unique: true, fields: ['studentPhone'] },
      { fields: ['studentName'] },
      { fields: ['centerId'] }
    ],
  });
}
