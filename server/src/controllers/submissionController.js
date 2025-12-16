const db = require('../config/database');

/**
 * Save answer (auto-save from client)
 */
const saveAnswer = async (req, res) => {
    try {
        const sessionId = req.sessionId;
        const { questionId, selectedAnswer } = req.body;

        if (!questionId) {
            return res.status(400).json({ error: 'Question ID required' });
        }

        // Check session is still active
        const sessionResult = await db.query(
            'SELECT status FROM student_sessions WHERE id = $1',
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (sessionResult.rows[0].status !== 'ACTIVE') {
            return res.status(403).json({ error: 'Session is no longer active' });
        }

        // Upsert answer
        await db.query(
            `INSERT INTO answers (session_id, question_id, selected_answer, saved_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (session_id, question_id)
       DO UPDATE SET selected_answer = $3, saved_at = CURRENT_TIMESTAMP`,
            [sessionId, questionId, selectedAnswer]
        );

        res.json({ saved: true });
    } catch (error) {
        console.error('Save answer error:', error);
        res.status(500).json({ error: 'Failed to save answer' });
    }
};

/**
 * Bulk save answers
 */
const bulkSaveAnswers = async (req, res) => {
    try {
        const sessionId = req.sessionId;
        const { answers } = req.body;

        if (!Array.isArray(answers)) {
            return res.status(400).json({ error: 'Answers array required' });
        }

        // Check session is still active
        const sessionResult = await db.query(
            'SELECT status FROM student_sessions WHERE id = $1',
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (sessionResult.rows[0].status !== 'ACTIVE') {
            return res.status(403).json({ error: 'Session is no longer active' });
        }

        for (const answer of answers) {
            await db.query(
                `INSERT INTO answers (session_id, question_id, selected_answer, saved_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (session_id, question_id)
         DO UPDATE SET selected_answer = $3, saved_at = CURRENT_TIMESTAMP`,
                [sessionId, answer.questionId, answer.selectedAnswer]
            );
        }

        res.json({ saved: true, count: answers.length });
    } catch (error) {
        console.error('Bulk save answers error:', error);
        res.status(500).json({ error: 'Failed to save answers' });
    }
};

/**
 * Submit exam
 */
const submitExam = async (req, res) => {
    try {
        const sessionId = req.sessionId;
        const { submissionType = 'MANUAL' } = req.body;

        // Check session
        const sessionResult = await db.query(
            `SELECT ss.*, e.id as exam_id_ref 
       FROM student_sessions ss 
       JOIN exams e ON ss.exam_id = e.id 
       WHERE ss.id = $1`,
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessionResult.rows[0];

        if (session.status === 'SUBMITTED') {
            return res.status(400).json({ error: 'Exam already submitted' });
        }

        if (session.status === 'DISQUALIFIED') {
            return res.status(403).json({ error: 'Session is disqualified' });
        }

        // Calculate score
        const scoreResult = await db.query(`
      SELECT 
        COUNT(q.id) as total_questions,
        COUNT(a.id) as answered_questions,
        SUM(CASE WHEN a.selected_answer = q.correct_answer THEN 1 ELSE 0 END) as correct_answers,
        SUM(q.marks) as max_score,
        SUM(CASE WHEN a.selected_answer = q.correct_answer THEN q.marks ELSE 0 END) as score
      FROM questions q
      LEFT JOIN answers a ON q.id = a.question_id AND a.session_id = $1
      WHERE q.exam_id = $2
    `, [sessionId, session.exam_id]);

        const scores = scoreResult.rows[0];
        const percentage = scores.max_score > 0
            ? (scores.score / scores.max_score * 100).toFixed(2)
            : 0;

        // Update answers with correctness
        await db.query(`
      UPDATE answers a
      SET is_correct = (a.selected_answer = q.correct_answer)
      FROM questions q
      WHERE a.question_id = q.id AND a.session_id = $1
    `, [sessionId]);

        // Create submission
        await db.query(
            `INSERT INTO submissions 
       (session_id, total_questions, answered_questions, correct_answers, score, max_score, percentage, submission_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (session_id) DO UPDATE SET
         total_questions = $2,
         answered_questions = $3,
         correct_answers = $4,
         score = $5,
         max_score = $6,
         percentage = $7,
         submission_type = $8,
         submitted_at = CURRENT_TIMESTAMP`,
            [
                sessionId,
                scores.total_questions,
                scores.answered_questions,
                scores.correct_answers,
                scores.score,
                scores.max_score,
                percentage,
                submissionType
            ]
        );

        // Update session status
        await db.query(
            'UPDATE student_sessions SET status = $1, end_time = CURRENT_TIMESTAMP WHERE id = $2',
            ['SUBMITTED', sessionId]
        );

        res.json({
            submitted: true,
            score: scores.score,
            maxScore: scores.max_score,
            percentage: parseFloat(percentage),
            correctAnswers: parseInt(scores.correct_answers),
            totalQuestions: parseInt(scores.total_questions)
        });
    } catch (error) {
        console.error('Submit exam error:', error);
        res.status(500).json({ error: 'Failed to submit exam' });
    }
};

/**
 * Get all submissions for an exam (admin)
 */
const getExamSubmissions = async (req, res) => {
    try {
        const { examId } = req.params;

        const result = await db.query(`
      SELECT 
        s.*,
        ss.violation_count,
        ss.status as session_status,
        ss.start_time,
        ss.end_time,
        u.student_id,
        u.name as student_name,
        u.email as student_email
      FROM submissions s
      JOIN student_sessions ss ON s.session_id = ss.id
      JOIN users u ON ss.user_id = u.id
      WHERE ss.exam_id = $1
      ORDER BY s.submitted_at DESC
    `, [examId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Get submissions error:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
};

/**
 * Get all submissions (admin - for export)
 */
const getAllSubmissions = async (req, res) => {
    try {
        const { examId, startDate, endDate } = req.query;

        let query = `
      SELECT 
        s.*,
        ss.violation_count,
        ss.status as session_status,
        ss.start_time,
        ss.end_time,
        u.student_id,
        u.name as student_name,
        u.email as student_email,
        e.exam_code,
        e.title as exam_title
      FROM submissions s
      JOIN student_sessions ss ON s.session_id = ss.id
      JOIN users u ON ss.user_id = u.id
      JOIN exams e ON ss.exam_id = e.id
      WHERE 1=1
    `;

        const params = [];
        let paramIndex = 1;

        if (examId) {
            query += ` AND ss.exam_id = $${paramIndex++}`;
            params.push(examId);
        }

        if (startDate) {
            query += ` AND s.submitted_at >= $${paramIndex++}`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND s.submitted_at <= $${paramIndex++}`;
            params.push(endDate);
        }

        query += ' ORDER BY s.submitted_at DESC';

        const result = await db.query(query, params);

        res.json(result.rows);
    } catch (error) {
        console.error('Get all submissions error:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
};

/**
 * Update time remaining (sync from client)
 */
const updateTimeRemaining = async (req, res) => {
    try {
        const sessionId = req.sessionId;
        const { timeRemaining } = req.body;

        await db.query(
            'UPDATE student_sessions SET time_remaining_seconds = $1 WHERE id = $2 AND status = $3',
            [timeRemaining, sessionId, 'ACTIVE']
        );

        res.json({ updated: true });
    } catch (error) {
        console.error('Update time error:', error);
        res.status(500).json({ error: 'Failed to update time' });
    }
};

/**
 * Delete submission (admin)
 */
const deleteSubmission = async (req, res) => {
    try {
        const { submissionId } = req.params;

        // Get session ID from submission
        const subResult = await db.query(
            'SELECT session_id FROM submissions WHERE id = $1',
            [submissionId]
        );

        if (subResult.rows.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        const sessionId = subResult.rows[0].session_id;

        // Delete submission (CASCADE will remove answers, violations via session)
        await db.query('DELETE FROM submissions WHERE id = $1', [submissionId]);

        // Also delete the session and related data
        await db.query('DELETE FROM student_sessions WHERE id = $1', [sessionId]);

        res.json({ message: 'Submission deleted successfully' });
    } catch (error) {
        console.error('Delete submission error:', error);
        res.status(500).json({ error: 'Failed to delete submission' });
    }
};

module.exports = {
    saveAnswer,
    bulkSaveAnswers,
    submitExam,
    getExamSubmissions,
    getAllSubmissions,
    updateTimeRemaining,
    deleteSubmission
};
