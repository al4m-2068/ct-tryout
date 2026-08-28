const express = require('express');
const router = express.Router();
const examSessionsController = require('../controllers/examSessionsController');

// POST /api/exam-sessions — start a new exam session for a student
router.post('/', examSessionsController.createSession);

module.exports = router;
