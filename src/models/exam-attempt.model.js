import { DataTypes } from 'sequelize';

export function defineExamAttemptModel(sequelize, tableName = 'exam_attempts') {
  const ExamAttempt = sequelize.define('ExamAttempt', {
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    examId:     { type: DataTypes.INTEGER, allowNull: false },
    studentId:  { type: DataTypes.INTEGER, allowNull: false },

    // answersJson: [{ qid: number, answer: string }]
    answersJson:{ type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },

    startedAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    submittedAt:{ type: DataTypes.DATE },
    score:      { type: DataTypes.INTEGER }, // 0..100

    updatedAtLocal:{ type: DataTypes.DATE },
    createdAt:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['examId','studentId'] }, // محاولة واحدة لكل طالب
      { fields: ['submittedAt'] },
    ],
  });
  return ExamAttempt;
}
export default defineExamAttemptModel;
