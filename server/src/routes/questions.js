const express = require('express');
const router = express.Router();
const {
    addQuestion,
    bulkAddQuestions,
    updateQuestion,
    deleteQuestion,
    getSessionQuestions
} = require('../controllers/questionController');
const { authenticate } = require('../middleware/auth');
const { adminOnly, studentOnly } = require('../middleware/roleCheck');

// Admin routes
router.post('/exam/:examId', authenticate, adminOnly, addQuestion);
router.post('/exam/:examId/bulk', authenticate, adminOnly, bulkAddQuestions);
router.put('/:id', authenticate, adminOnly, updateQuestion);
router.delete('/:id', authenticate, adminOnly, deleteQuestion);

// Student routes
router.get('/session', authenticate, studentOnly, getSessionQuestions);

module.exports = router;
