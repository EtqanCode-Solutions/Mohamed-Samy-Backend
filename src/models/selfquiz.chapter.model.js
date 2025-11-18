import { DataTypes } from 'sequelize';

export function defineSelfQuizChapterModel(sequelize, tableName = 'selfquiz_chapters') {
  return sequelize.define('SelfQuizChapter', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    // 'first' | 'second' | 'third' (أو خليه نص عربي موحّد لو حابب)
    gradeLevel: { type: DataTypes.STRING, allowNull: false },

    title: { type: DataTypes.STRING, allowNull: false },
    orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['gradeLevel'] },
      { fields: ['orderIndex'] },
      { fields: ['isDeleted'] },
    ],
  });
}
