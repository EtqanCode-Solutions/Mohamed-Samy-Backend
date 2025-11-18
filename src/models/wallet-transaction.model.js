import { DataTypes } from 'sequelize';

export function defineWalletTxModel(sequelize, tableName = 'wallet_transactions') {
  return sequelize.define('WalletTransaction', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    walletId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM('CREDIT','DEBIT'), allowNull: false },
    reason: { type: DataTypes.STRING(50) }, // RECHARGE / PURCHASE / VOUCHER / REFUND
    amountCents: { type: DataTypes.INTEGER, allowNull: false },
    refType: { type: DataTypes.STRING(30) }, // ORDER / TOPUP / VOUCHER / ADMIN
    refId: { type: DataTypes.INTEGER },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, { tableName, timestamps: false, indexes: [{ fields: ['walletId'] }] });
}
