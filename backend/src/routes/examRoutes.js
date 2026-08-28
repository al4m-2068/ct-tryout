const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
router.get('/:examCode', examController.getExamByCode);

module.exports = router;
