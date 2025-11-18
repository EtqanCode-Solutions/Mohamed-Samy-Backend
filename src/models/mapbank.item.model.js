import { DataTypes } from 'sequelize';

export function defineMapBankItemModel(sequelize, tableName = 'map_bank_items') {
  return sequelize.define('MapBankItem', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    bankId: { type: DataTypes.INTEGER, allowNull: false },

    // السؤال/الإجابة + صور اختيارية
    prompt:          { type: DataTypes.TEXT, allowNull: false },
    answerText:      { type: DataTypes.TEXT, allowNull: true },
    mapImageUrl:     { type: DataTypes.STRING, allowNull: true },
    questionImageUrl:{ type: DataTypes.STRING, allowNull: true },
    answerImageUrl:  { type: DataTypes.STRING, allowNull: true },

    tags:       { type: DataTypes.JSON, allowNull: true }, // Array<string>
    status:     { type: DataTypes.STRING, allowNull: false, defaultValue: 'draft' }, // draft|published
    orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

    isDeleted:      { type: DataTypes.BOOLEAN, defaultValue: false },
    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['bankId'] },
      { fields: ['status'] },
      { fields: ['orderIndex'] },
    ],
  });
}
