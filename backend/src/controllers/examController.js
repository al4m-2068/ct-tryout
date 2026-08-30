const db = require('../config/db');

const getExamByCode = async (req, res) => {
  const { examCode } = req.params;

  try {
    const [exams] = await db.query(
      'SELECT id, exam_code, title, duration_minutes FROM exams WHERE exam_code = ?',
      [examCode]
    );

    if (exams.length === 0) {
      return res.status(404).json({
        message: `Exam with code ${examCode} not found`
      });
    }

    const examData = exams[0];
    const [questionsData] = await db.query(
      'SELECT id, question_text, options FROM questions WHERE exam_id = ? ORDER BY id ASC',
      [examData.id]
    );

    const formattedQuestions = questionsData.map(q => ({
      id: q.id,
      text: q.question_text,  
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
    }));

    res.json({
      exam: {
        title: examData.title,
        code: examData.exam_code,
        durationMinutes: examData.duration_minutes,
        totalQuestions: formattedQuestions.length
      },
      questions: formattedQuestions
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch exam data',
      error: error.message
    });
  }
};

module.exports = {
  getExamByCode
};
