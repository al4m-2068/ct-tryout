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

const saveAnswer = async (req, res) => {
  const { sessionUuid } = req.params;
  const { questionId, selectedOption } = req.body;

  if (!Number.isInteger(questionId) || questionId <= 0) {
    return res.status(400).json({ message: "questionId must be a positive integer." });
  }

  if (!selectedOption || typeof selectedOption !== "string" || selectedOption.trim() === "") {
    return res.status(400).json({ message: "selectedOption must be a non-empty string." });
  }

  const option = selectedOption.trim().toUpperCase();
  if (!["A", "B", "C", "D"].includes(option)) {
    return res.status(400).json({ message: "selectedOption must be one of: A, B, C, D." });
  }

  try {
    const [sessions] = await db.query(
      "SELECT id, status FROM exam_sessions WHERE session_uuid = ?",
      [sessionUuid]
    );
    if (sessions.length === 0) {
      return res.status(404).json({ message: `Session "${sessionUuid}" not found.` });
    }

    const session = sessions[0];
    if (session.status !== "answering") {
      return res.status(409).json({
        message: `Cannot save answer: session status is "${session.status}", not "answering".`,
      });
    }

    const [result] = await db.query(
      `INSERT INTO answers (session_id, question_id, chosen_option)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE chosen_option = VALUES(chosen_option)`,
      [session.id, questionId, option]
    );

    res.status(201).json({
      message: "Answer saved.",
      data: { questionId, selectedOption: option, isUpdate: result.affectedRows === 2 },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to save answer.", error: error.message });
  }
};

const submitSession = async (req, res) => {
  const { sessionUuid } = req.params;

  if (typeof sessionUuid !== "string" || sessionUuid.trim() === "") {
    return res.status(400).json({ message: "sessionUuid is required." });
  }

  const uuid = sessionUuid.trim();
  if (uuid.length !== 36) {
    return res.status(400).json({ message: "sessionUuid must be a valid UUID (36 characters)." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.query("START TRANSACTION");

    const [sessions] = await connection.query(
      "SELECT id, status, submitted_at FROM exam_sessions WHERE session_uuid = ? FOR UPDATE",
      [uuid]
    );

    if (sessions.length === 0) {
      await connection.query("ROLLBACK");
      return res.status(404).json({ message: `Session "${uuid}" not found.` });
    }

    const session = sessions[0];
    if (session.status === "done") {
      await connection.query("COMMIT");
      return res.status(409).json({
        message: "Exam session has already been submitted.",
        data: {
          sessionUuid: uuid,
          status: "done",
          submittedAt: session.submitted_at,
        },
      });
    }

    if (session.status === "finalizing") {
      await connection.query("COMMIT");
      return res.status(409).json({
        message: "Exam session is currently being finalized. Please wait.",
      });
    }

    if (session.status !== "answering") {
      await connection.query("COMMIT");
      return res.status(409).json({
        message: `Cannot submit: session status is "${session.status}".`,
      });
    }
    await connection.query(
      `UPDATE exam_sessions
         SET status = 'done',
             submitted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [session.id]
    );
    await connection.query("COMMIT");

    res.json({
      message: "Exam submitted successfully.",
      data: {
        sessionUuid: uuid,
        status: "done",
        submittedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (connection) {
      try { await connection.query("ROLLBACK"); } catch {}
    }
    res.status(500).json({ message: "Failed to submit exam session.", error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = { createSession, saveAnswer, submitSession };
