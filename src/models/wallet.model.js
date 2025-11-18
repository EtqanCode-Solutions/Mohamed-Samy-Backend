import { DataTypes } from 'sequelize';

export function defineWalletModel(sequelize, tableName = 'wallets') {
  return sequelize.define('Wallet', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    balanceCents: { type: DataTypes.INTEGER, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, { tableName, timestamps: false, indexes: [{ fields: ['studentId'] }] });
}
