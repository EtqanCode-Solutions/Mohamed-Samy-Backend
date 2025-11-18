import { DataTypes } from 'sequelize';

export function defineExamQuestionModel(sequelize, tableName = 'exam_questions') {
  const ExamQuestion = sequelize.define('ExamQuestion', {
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    examId:     { type: DataTypes.INTEGER, allowNull: false },
    text:       { type: DataTypes.TEXT, allowNull: false },
    imageUrl:   { type: DataTypes.STRING(1000) },
    // choices كـ JSON: [{ id: 'a', text: '...' }, ...]
    choicesJson:{ type: DataTypes.TEXT, allowNull: false }, 
    // answer = choice.id الصحيحة
    answer:     { type: DataTypes.STRING(64), allowNull: false },
    orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    tableName,
    timestamps: false,
    indexes: [{ fields: ['examId'] }, { fields: ['orderIndex'] }],
  });
  return ExamQuestion;
}
export default defineExamQuestionModel;
