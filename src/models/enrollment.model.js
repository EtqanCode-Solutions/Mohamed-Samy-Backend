import { DataTypes } from 'sequelize';

export function defineEnrollmentModel(sequelize, tableName = 'enrollments') {
  return sequelize.define('Enrollment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    studentId: { type: DataTypes.INTEGER, allowNull: false },
    courseId:  { type: DataTypes.INTEGER, allowNull: false },

    source:    { type: DataTypes.ENUM('purchase','gift','admin'), allowNull: false, defaultValue: 'purchase' },

    startsAt:  { type: DataTypes.DATE },
    endsAt:    { type: DataTypes.DATE },

    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, {
    tableName, timestamps: false,
    indexes: [{ fields: ['studentId','courseId'], unique: true }],
  });
}
