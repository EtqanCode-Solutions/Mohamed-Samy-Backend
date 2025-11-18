import { DataTypes } from 'sequelize';

export function defineMapBankModel(sequelize, tableName = 'map_banks') {
  return sequelize.define('MapBank', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    title:      { type: DataTypes.STRING, allowNull: false },
    level:      { type: DataTypes.STRING, allowNull: false }, // الصف الأول/الثاني/الثالث الثانوي (بنستخدم نفس normalize عند القراءة/الكتابة)
    status:     { type: DataTypes.STRING, allowNull: false, defaultValue: 'draft' }, // draft|published
    orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

    isDeleted:      { type: DataTypes.BOOLEAN, defaultValue: false },
    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['level'] },
      { fields: ['status'] },
      { fields: ['orderIndex'] },
    ],
  });
}
