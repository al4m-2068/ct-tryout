const db = require('../config/db');

const createSession = async (req, res) => {
  const { studentId, examCode, sessionUuid } = req.body;

  if (!studentId || !examCode || !sessionUuid) {
    return res.status(400).json({
      message: "Missing required fields: studentId, examCode, and sessionUuid are required.",
    });
  }

  if (typeof studentId !== "number" || !Number.isInteger(studentId) || studentId <= 0) {
    return res.status(400).json({ message: "studentId must be a positive integer." });
  }

  if (typeof sessionUuid !== "string" || sessionUuid.trim() === "") {
    return res.status(400).json({ message: "sessionUuid must be a non-empty string." });
  }

  if (sessionUuid.length !== 36) {
    return res.status(400).json({ message: "sessionUuid must be a valid UUID (36 characters)." });
  }

  try {
    const [students] = await db.query("SELECT id FROM students WHERE id = ?", [studentId]);
    if (students.length === 0) {
      return res.status(404).json({ message: `Student with id ${studentId} not found.` });
    }

    const [exams] = await db.query(
      "SELECT id, exam_code, title, duration_minutes FROM exams WHERE exam_code = ?",
      [examCode]
    );
    if (exams.length === 0) {
      return res.status(404).json({ message: `Exam with code "${examCode}" not found.` });
    }

    const exam = exams[0];

    const [result] = await db.query(
      `INSERT INTO exam_sessions (student_id, exam_id, session_uuid, status, started_at)
       VALUES (?, ?, ?, 'answering', NOW())`,
      [studentId, exam.id, sessionUuid.trim()]
    );

    const [sessions] = await db.query(
      "SELECT id, session_uuid, status, started_at FROM exam_sessions WHERE id = ?",
      [result.insertId]
    );

    const session = sessions[0];

    res.status(201).json({
      message: "Exam session created.",
      data: {
        id: result.insertId,
        sessionUuid: sessionUuid.trim(),
        studentId,
        examId: exam.id,
        examCode: exam.exam_code,
        status: "answering",
        startedAt: session.started_at,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: `Student ${studentId} already has an exam session for exam "${examCode}". Only one attempt is allowed.`,
      });
    }
    res.status(500).json({ message: "Failed to create exam session.", error: error.message });
  }
};

module.exports = { createSession };
