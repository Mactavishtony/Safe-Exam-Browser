const express = require('express');
const router = express.Router();
const {
    createExam,
    getAllExams,
    getExamById,
    updateExam,
    toggleExamStatus,
    deleteExam,
    getExamStats
} = require('../controllers/examController');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const { getLiveSessions } = require('../socket/eventHandler');

// All routes require admin authentication
router.use(authenticate, adminOnly);

// CRUD routes
router.post('/', createExam);
router.get('/', getAllExams);
router.get('/:id', getExamById);
router.put('/:id', updateExam);
router.delete('/:id', deleteExam);

// Actions
router.post('/:id/toggle', toggleExamStatus);
router.get('/:id/stats', getExamStats);

// Live monitoring
router.get('/:id/live', async (req, res) => {
    try {
        const sessions = await getLiveSessions(req.params.id);
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch live sessions' });
    }
});

module.exports = router;
