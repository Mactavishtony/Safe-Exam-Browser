const db = require('../config/database');

/**
 * Add question to exam
 */
const addQuestion = async (req, res) => {
    try {
        const { examId } = req.params;
        const { questionText, questionType = 'MCQ', options, correctAnswer, marks = 1 } = req.body;

        if (!questionText || !correctAnswer) {
            return res.status(400).json({ error: 'Question text and correct answer required' });
        }

        // Get max order index
        const orderResult = await db.query(
            'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM questions WHERE exam_id = $1',
            [examId]
        );

        const result = await db.query(
            `INSERT INTO questions (exam_id, question_text, question_type, options, correct_answer, marks, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
            [examId, questionText, questionType, JSON.stringify(options), correctAnswer, marks, orderResult.rows[0].next_order]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add question error:', error);
        res.status(500).json({ error: 'Failed to add question' });
    }
};

/**
 * Bulk add questions (CSV import)
 */
const bulkAddQuestions = async (req, res) => {
    try {
        const { examId } = req.params;
        const { questions } = req.body;

        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Questions array required' });
        }

        const orderResult = await db.query(
            'SELECT COALESCE(MAX(order_index), 0) as max_order FROM questions WHERE exam_id = $1',
            [examId]
        );
        let orderIndex = orderResult.rows[0].max_order;

        const insertedQuestions = [];
        for (const q of questions) {
            orderIndex++;
            const result = await db.query(
                `INSERT INTO questions (exam_id, question_text, question_type, options, correct_answer, marks, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
                [
                    examId,
                    q.questionText,
                    q.questionType || 'MCQ',
                    JSON.stringify(q.options),
                    q.correctAnswer,
                    q.marks || 1,
                    orderIndex
                ]
            );
            insertedQuestions.push(result.rows[0]);
        }

        res.status(201).json({
            message: `${insertedQuestions.length} questions added`,
            questions: insertedQuestions
        });
    } catch (error) {
        console.error('Bulk add questions error:', error);
        res.status(500).json({ error: 'Failed to add questions' });
    }
};

/**
 * Update question
 */
const updateQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const { questionText, questionType, options, correctAnswer, marks } = req.body;

        const result = await db.query(
            `UPDATE questions SET
         question_text = COALESCE($1, question_text),
         question_type = COALESCE($2, question_type),
         options = COALESCE($3, options),
         correct_answer = COALESCE($4, correct_answer),
         marks = COALESCE($5, marks)
       WHERE id = $6
       RETURNING *`,
            [questionText, questionType, options ? JSON.stringify(options) : null, correctAnswer, marks, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update question error:', error);
        res.status(500).json({ error: 'Failed to update question' });
    }
};

/**
 * Delete question
 */
const deleteQuestion = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query('DELETE FROM questions WHERE id = $1', [id]);

        res.json({ message: 'Question deleted successfully' });
    } catch (error) {
        console.error('Delete question error:', error);
        res.status(500).json({ error: 'Failed to delete question' });
    }
};

/**
 * Get questions for student session (shuffled based on session)
 */
const getSessionQuestions = async (req, res) => {
    try {
        const sessionId = req.sessionId;

        // Get session with question order
        const sessionResult = await db.query(
            'SELECT * FROM student_sessions WHERE id = $1',
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessionResult.rows[0];
        const questionOrder = session.question_order;
        const optionOrders = session.option_orders || {};

        // Get questions in session order
        const questions = [];
        for (const qId of questionOrder) {
            const qResult = await db.query(
                'SELECT id, question_text, question_type, options, marks FROM questions WHERE id = $1',
                [qId]
            );

            if (qResult.rows.length > 0) {
                const question = qResult.rows[0];

                // Shuffle options if order is defined
                if (optionOrders[qId] && question.options) {
                    const shuffledOptions = optionOrders[qId].map(i => question.options[i]);
                    question.options = shuffledOptions;
                    question.optionMapping = optionOrders[qId]; // For answer mapping
                }

                questions.push(question);
            }
        }

        // Get existing answers
        const answersResult = await db.query(
            'SELECT question_id, selected_answer FROM answers WHERE session_id = $1',
            [sessionId]
        );

        const answers = {};
        for (const a of answersResult.rows) {
            answers[a.question_id] = a.selected_answer;
        }

        res.json({
            questions,
            answers,
            timeRemaining: session.time_remaining_seconds,
            violationCount: session.violation_count
        });
    } catch (error) {
        console.error('Get session questions error:', error);
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
};

module.exports = {
    addQuestion,
    bulkAddQuestions,
    updateQuestion,
    deleteQuestion,
    getSessionQuestions
};
