const express = require('express');
const router = express.Router();
const examSessionsController = require('../controllers/examSessionsController');

router.post("/", examSessionsController.createSession);
router.post("/:sessionUuid/answers", examSessionsController.saveAnswer);
router.post("/:sessionUuid/submit", examSessionsController.submitSession);

module.exports = router;
