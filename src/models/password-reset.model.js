import { DataTypes } from 'sequelize';

/** نخزن الـOTP كـ hash (SHA-256) + وقت الانتهاء + عدد المحاولات */
export function definePasswordResetModel(sequelize) {
  return sequelize.define('PasswordReset', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING, allowNull: false },

    otpHash: { type: DataTypes.STRING, allowNull: false }, // sha256(otp)
    expiresAt: { type: DataTypes.DATE, allowNull: false },

    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, defaultValue: 5 },

    usedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'password_resets',
    timestamps: false,
    indexes: [{ fields: ['email'] }, { fields: ['expiresAt'] }]
  });
}
