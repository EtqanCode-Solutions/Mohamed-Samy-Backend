// src/models/wallet-tx.model.js
import { DataTypes } from 'sequelize';

export function defineWalletTxModel(sequelize, tableName = 'wallet_tx') {
  const WalletTx = sequelize.define(
    'WalletTx',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

      walletId: { type: DataTypes.INTEGER, allowNull: false },
      type: { // credit / debit
        type: DataTypes.ENUM('credit', 'debit'),
        allowNull: false,
      },
      amountCents: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      reason: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },

      refType: { // optional reference type (order, topup, voucher)
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      refId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      balanceAfter: { // balance snapshot after transaction
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      meta: { // any extra info (JSON)
        type: DataTypes.JSON,
        allowNull: true,
      },

      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName,
      underscored: true,
      paranoid: false,
    }
  );

  return WalletTx;
}
