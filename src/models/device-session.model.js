import { DataTypes } from 'sequelize';

export function defineDeviceSessionModel(sequelize, tableName = 'device_sessions') {
  return sequelize.define('DeviceSession', {
    id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId:     { type: DataTypes.INTEGER, allowNull: false },

    // تعريف الجهاز (نستخدمه للتمييز بين اللابتوب/الموبايل)
    deviceId:      { type: DataTypes.STRING,  allowNull: false }, // uuid أو fingerprint من الفرونت

    // Refresh Token (مُخزَّن هاش فقط للأمان)
    refreshHash:   { type: DataTypes.STRING,  allowNull: false },

    // عمر الريفريش
    expiresAt:     { type: DataTypes.DATE,    allowNull: false },

    // بيانات تشخيصية
    userAgent:     { type: DataTypes.STRING,  allowNull: true },
    ip:            { type: DataTypes.STRING,  allowNull: true },
    lastSeenAt:    { type: DataTypes.DATE,    allowNull: true },

    // في حال الدعم مسحه
    revokedAt:     { type: DataTypes.DATE,    allowNull: true },

    createdAtLocal:{ type: DataTypes.DATE,    defaultValue: DataTypes.NOW },
    updatedAtLocal:{ type: DataTypes.DATE,    defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['studentId'] },
      { unique: true, fields: ['studentId', 'deviceId'] },
      { fields: ['expiresAt'] },
      { fields: ['revokedAt'] },
    ],
  });
}
