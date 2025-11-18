import { DataTypes } from 'sequelize';

export function defineTopupRequestModel(sequelize, tableName = 'topup_requests') {
  return sequelize.define('TopupRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    amountCents: { type: DataTypes.INTEGER, allowNull: false },
    method: { type: DataTypes.ENUM('instapay','wallet_transfer','bank_transfer','cash'), allowNull: false },
    transferRef: { type: DataTypes.STRING(100) },
    proofUrl: { type: DataTypes.STRING(2048) },
    notes: { type: DataTypes.TEXT },

    status: { type: DataTypes.ENUM('pending','approved','rejected'), defaultValue: 'pending' },
    reviewedBy: { type: DataTypes.STRING(100) },
    reviewedAt: { type: DataTypes.DATE },

    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, { tableName, timestamps: false, indexes: [{ fields: ['studentId','status'] }] });
}
