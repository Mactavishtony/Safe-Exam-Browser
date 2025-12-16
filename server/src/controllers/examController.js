const db = require('../config/database');

/**
 * Create new exam
 */
const createExam = async (req, res) => {
    try {
        const {
            examCode,
            title,
            description,
            durationMinutes,
            maxViolations = 3,
            startTime,
            endTime,
            shuffleQuestions = true,
            shuffleOptions = true
        } = req.body;

        if (!examCode || !title || !durationMinutes) {
            return res.status(400).json({
                error: 'Exam code, title, and duration are required'
            });
        }

        const result = await db.query(
            `INSERT INTO exams 
       (exam_code, title, description, duration_minutes, max_violations, 
        start_time, end_time, shuffle_questions, shuffle_options, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
            [
                examCode, title, description, durationMinutes, maxViolations,
                startTime || null, endTime || null, shuffleQuestions, shuffleOptions,
                req.user.id
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Exam code already exists' });
        }
        console.error('Create exam error:', error);
        res.status(500).json({ error: 'Failed to create exam' });
    }
};

/**
 * Get all exams (admin)
 */
const getAllExams = async (req, res) => {
    try {
        const result = await db.query(`
      SELECT e.*, 
             u.name as created_by_name,
             (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count,
             (SELECT COUNT(*) FROM student_sessions WHERE exam_id = e.id) as session_count
      FROM exams e
      LEFT JOIN users u ON e.created_by = u.id
      ORDER BY e.created_at DESC
    `);

        res.json(result.rows);
    } catch (error) {
        console.error('Get exams error:', error);
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
};

/**
 * Get exam by ID
 */
const getExamById = async (req, res) => {
    try {
        const { id } = req.params;

        const examResult = await db.query(
            'SELECT * FROM exams WHERE id = $1',
            [id]
        );

        if (examResult.rows.length === 0) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        const questionsResult = await db.query(
            'SELECT id, question_text, question_type, options, marks, order_index FROM questions WHERE exam_id = $1 ORDER BY order_index',
            [id]
        );

        res.json({
            ...examResult.rows[0],
            questions: questionsResult.rows
        });
    } catch (error) {
        console.error('Get exam error:', error);
        res.status(500).json({ error: 'Failed to fetch exam' });
    }
};

/**
 * Update exam
 */
const updateExam = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            durationMinutes,
            maxViolations,
            startTime,
            endTime,
            isActive,
            shuffleQuestions,
            shuffleOptions
        } = req.body;

        const result = await db.query(
            `UPDATE exams SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         duration_minutes = COALESCE($3, duration_minutes),
         max_violations = COALESCE($4, max_violations),
         start_time = COALESCE($5, start_time),
         end_time = COALESCE($6, end_time),
         is_active = COALESCE($7, is_active),
         shuffle_questions = COALESCE($8, shuffle_questions),
         shuffle_options = COALESCE($9, shuffle_options)
       WHERE id = $10
       RETURNING *`,
            [
                title, description, durationMinutes, maxViolations,
                startTime, endTime, isActive, shuffleQuestions, shuffleOptions,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update exam error:', error);
        res.status(500).json({ error: 'Failed to update exam' });
    }
};

/**
 * Toggle exam active status
 */
const toggleExamStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `UPDATE exams SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Toggle exam error:', error);
        res.status(500).json({ error: 'Failed to toggle exam status' });
    }
};

/**
 * Delete exam (with optional force delete)
 */
const deleteExam = async (req, res) => {
    try {
        const { id } = req.params;
        const { force } = req.query;

        // Check if exam has sessions
        const sessions = await db.query(
            'SELECT COUNT(*) FROM student_sessions WHERE exam_id = $1',
            [id]
        );

        const sessionCount = parseInt(sessions.rows[0].count);

        if (sessionCount > 0 && force !== 'true') {
            return res.status(400).json({
                error: 'Exam has existing sessions. Use force=true to delete all data.',
                sessionCount
            });
        }

        // If force delete, remove all related data (CASCADE will handle most)
        // Questions, answers, violations, submissions will be deleted via CASCADE
        await db.query('DELETE FROM exams WHERE id = $1', [id]);

        res.json({ message: 'Exam deleted successfully', deletedSessions: sessionCount });
    } catch (error) {
        console.error('Delete exam error:', error);
        res.status(500).json({ error: 'Failed to delete exam' });
    }
};

/**
 * Get exam statistics
 */
const getExamStats = async (req, res) => {
    try {
        const { id } = req.params;

        const stats = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM student_sessions WHERE exam_id = $1) as total_sessions,
        (SELECT COUNT(*) FROM student_sessions WHERE exam_id = $1 AND status = 'ACTIVE') as active_sessions,
        (SELECT COUNT(*) FROM student_sessions WHERE exam_id = $1 AND status = 'SUBMITTED') as submitted_sessions,
        (SELECT COUNT(*) FROM student_sessions WHERE exam_id = $1 AND status = 'DISQUALIFIED') as disqualified_sessions,
        (SELECT COUNT(*) FROM violations v 
         JOIN student_sessions ss ON v.session_id = ss.id 
         WHERE ss.exam_id = $1) as total_violations,
        (SELECT AVG(percentage) FROM submissions s 
         JOIN student_sessions ss ON s.session_id = ss.id 
         WHERE ss.exam_id = $1) as average_score
    `, [id]);

        res.json(stats.rows[0]);
    } catch (error) {
        console.error('Get exam stats error:', error);
        res.status(500).json({ error: 'Failed to fetch exam statistics' });
    }
};

module.exports = {
    createExam,
    getAllExams,
    getExamById,
    updateExam,
    toggleExamStatus,
    deleteExam,
    getExamStats
};
