import { examInfo, questions } from "../data/questions.js";

/**
 * @param {string} _examCode  
 *                             
 * @returns {Promise<{ exam: object, questions: object[] }>}
 */
export async function getExam(_examCode) {
  return {
    exam: {
      title: examInfo.title,
      code: examInfo.code,
      durationMinutes: examInfo.durationMinutes,
      totalQuestions: examInfo.totalQuestions,
    },
    questions: questions,
  };
}
