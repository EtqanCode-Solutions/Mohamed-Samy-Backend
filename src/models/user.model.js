import { DataTypes } from 'sequelize';

export function defineUserModel(sequelize, tableName = 'users') {
  return sequelize.define('User', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    email:        { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },

    // اسم يظهر في الداشبورد والإجابات (اختياري)
    name:  { type: DataTypes.STRING, allowNull: true },

    // admin | user
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'user' },

    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['email'] },
      { fields: ['role'] },
    ],
  });
}
