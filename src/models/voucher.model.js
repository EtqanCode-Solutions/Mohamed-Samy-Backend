import { DataTypes } from 'sequelize';

export function defineVoucherModel(sequelize, tableName = 'vouchers') {
  return sequelize.define('Voucher', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    codeHash: { type: DataTypes.STRING(64), allowNull: false, unique: true }, // sha256(code)
    length: { type: DataTypes.INTEGER, defaultValue: 14 },

    // قيمة الكود بالملّيم (50 جنيه = 5000)
    amountCents: { type: DataTypes.INTEGER, defaultValue: 0 },
    remainingCents: { type: DataTypes.INTEGER, defaultValue: 0 },
    currency: { type: DataTypes.STRING(10), defaultValue: 'EGP' },

    // اختياري: تخصيص
    targetType: { type: DataTypes.ENUM('WALLET','COURSE','PLAN'), defaultValue: 'WALLET' },
    targetId: { type: DataTypes.INTEGER }, // لو COURSE/PLAN فقط
    ownerPhone: { type: DataTypes.STRING(20) },

    status: { type: DataTypes.ENUM('issued','partially_redeemed','redeemed','expired','revoked'), defaultValue: 'issued' },
    issuedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    redeemedAt: { type: DataTypes.DATE },
    expiresAt: { type: DataTypes.DATE },

    maxAttempts: { type: DataTypes.INTEGER, defaultValue: 5 },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },

    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, { tableName, timestamps: false, indexes: [{ fields: ['status'] }] });
}
