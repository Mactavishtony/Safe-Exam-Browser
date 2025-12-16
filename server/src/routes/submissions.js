const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const {
    saveAnswer,
    bulkSaveAnswers,
    submitExam,
    getExamSubmissions,
    getAllSubmissions,
    updateTimeRemaining,
    deleteSubmission
} = require('../controllers/submissionController');
const { authenticate } = require('../middleware/auth');
const { adminOnly, studentOnly } = require('../middleware/roleCheck');
const { submitLimiter } = require('../middleware/rateLimiter');

// Student routes
router.post('/answer', authenticate, studentOnly, saveAnswer);
router.post('/answers', authenticate, studentOnly, bulkSaveAnswers);
router.post('/submit', authenticate, studentOnly, submitLimiter, submitExam);
router.post('/time', authenticate, studentOnly, updateTimeRemaining);

// Admin routes
router.get('/exam/:examId', authenticate, adminOnly, getExamSubmissions);
router.get('/', authenticate, adminOnly, getAllSubmissions);
router.delete('/:submissionId', authenticate, adminOnly, deleteSubmission);

// Export to Excel
router.get('/export', authenticate, adminOnly, async (req, res) => {
    try {
        const { examId, format = 'xlsx' } = req.query;

        // Reuse the getAllSubmissions logic
        const db = require('../config/database');
        let query = `
      SELECT 
        u.student_id as "Student ID",
        u.name as "Name",
        u.email as "Email",
        e.exam_code as "Exam Code",
        e.title as "Exam Title",
        ss.start_time as "Start Time",
        ss.end_time as "End Time",
        s.score as "Score",
        s.max_score as "Max Score",
        s.percentage as "Percentage",
        s.correct_answers as "Correct Answers",
        s.total_questions as "Total Questions",
        ss.violation_count as "Violations",
        ss.status as "Status"
      FROM submissions s
      JOIN student_sessions ss ON s.session_id = ss.id
      JOIN users u ON ss.user_id = u.id
      JOIN exams e ON ss.exam_id = e.id
    `;

        const params = [];
        if (examId) {
            query += ' WHERE ss.exam_id = $1';
            params.push(examId);
        }
        query += ' ORDER BY s.submitted_at DESC';

        const result = await db.query(query, params);

        if (format === 'csv') {
            // CSV format
            const headers = Object.keys(result.rows[0] || {}).join(',');
            const rows = result.rows.map(row => Object.values(row).join(',')).join('\n');
            const csv = `${headers}\n${rows}`;

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=submissions.csv');
            res.send(csv);
        } else {
            // XLSX format
            const ws = XLSX.utils.json_to_sheet(result.rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Submissions');

            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=submissions.xlsx');
            res.send(buffer);
        }
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export submissions' });
    }
});

module.exports = router;
