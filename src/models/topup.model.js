// src/models/topup.model.js
import { DataTypes } from 'sequelize';

export function defineTopupModel(sequelize, tableName = 'topup_requests') {
  const Topup = sequelize.define(
    'Topup',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

      studentId: { type: DataTypes.INTEGER, allowNull: false },

      amountCents: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      method: { // transfer, instapay, wallet, etc.
        type: DataTypes.ENUM('transfer', 'instapay', 'wallet', 'other'),
        allowNull: false,
        defaultValue: 'transfer',
      },

      transferRef: { // transaction ID or sender name
        type: DataTypes.STRING(120),
        allowNull: true,
      },

      proofUrl: { // image of payment
        type: DataTypes.STRING(500),
        allowNull: true,
      },

      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },

      reviewedBy: { type: DataTypes.STRING(100), allowNull: true },
      reviewedAt: { type: DataTypes.DATE, allowNull: true },

      notes: { type: DataTypes.STRING(300), allowNull: true },

      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName,
      underscored: true,
      paranoid: false,
    }
  );

  return Topup;
}
