const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

/**
 * Admin login
 */
const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const result = await db.query(
            'SELECT * FROM users WHERE email = $1 AND role = $2',
            [email, 'ADMIN']
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};

/**
 * Student login with exam code
 */
const studentLogin = async (req, res) => {
    try {
        let { studentId, examCode, password, studentName } = req.body;

        if (!studentName || !examCode) {
            return res.status(400).json({ error: 'Student name and exam code required' });
        }

        // Auto-generate studentId if not provided
        if (!studentId) {
            studentId = studentName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
        }

        // Find student - or allow guest if not found
        let student = null;
        const studentResult = await db.query(
            'SELECT * FROM users WHERE student_id = $1 AND role = $2',
            [studentId, 'STUDENT']
        );

        if (studentResult.rows.length > 0) {
            student = studentResult.rows[0];

            // Update user's name to the provided name
            await db.query('UPDATE users SET name = $1 WHERE id = $2', [studentName, student.id]);
            student.name = studentName;

            // Verify password if provided and student exists
            if (password && student.password_hash) {
                const validPassword = await bcrypt.compare(password, student.password_hash);
                if (!validPassword) {
                    return res.status(401).json({ error: 'Invalid password' });
                }
            }
        } else {
            // Create a new student record with default password (guest student)
            const defaultPasswordHash = await bcrypt.hash('guest_' + Date.now(), 10);
            const tempResult = await db.query(
                `INSERT INTO users (student_id, name, password_hash, role)
                 VALUES ($1, $2, $3, 'STUDENT')
                 RETURNING *`,
                [studentId, studentName, defaultPasswordHash]
            );
            student = tempResult.rows[0];
        }

        // Find exam
        const examResult = await db.query(
            'SELECT * FROM exams WHERE exam_code = $1',
            [examCode]
        );

        if (examResult.rows.length === 0) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        const exam = examResult.rows[0];

        // Check if exam is active
        if (!exam.is_active) {
            return res.status(403).json({ error: 'Exam is not active' });
        }

        // Check exam time window
        const now = new Date();
        if (exam.start_time && new Date(exam.start_time) > now) {
            return res.status(403).json({ error: 'Exam has not started yet' });
        }
        if (exam.end_time && new Date(exam.end_time) < now) {
            return res.status(403).json({ error: 'Exam has ended' });
        }

        // Check for existing session
        const existingSession = await db.query(
            `SELECT * FROM student_sessions 
       WHERE user_id = $1 AND exam_id = $2 AND status NOT IN ('SUBMITTED', 'DISQUALIFIED')`,
            [student.id, exam.id]
        );

        let session;
        if (existingSession.rows.length > 0) {
            session = existingSession.rows[0];

            // Update session status if reconnecting
            if (session.status === 'DISCONNECTED') {
                await db.query(
                    'UPDATE student_sessions SET status = $1 WHERE id = $2',
                    ['ACTIVE', session.id]
                );
            }
        } else {
            // Create new session with shuffled questions
            const questionOrder = await generateQuestionOrder(exam.id, exam.shuffle_questions);
            const optionOrders = exam.shuffle_options ? await generateOptionOrders(exam.id) : null;

            const sessionResult = await db.query(
                `INSERT INTO student_sessions 
         (user_id, exam_id, question_order, option_orders, start_time, time_remaining_seconds, status, ip_address)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, 'ACTIVE', $6)
         RETURNING *`,
                [
                    student.id,
                    exam.id,
                    JSON.stringify(questionOrder),
                    optionOrders ? JSON.stringify(optionOrders) : null,
                    exam.duration_minutes * 60,
                    req.ip
                ]
            );
            session = sessionResult.rows[0];
        }

        // Generate exam-scoped token
        const token = jwt.sign(
            {
                userId: student.id,
                role: student.role,
                sessionId: session.id,
                examId: exam.id
            },
            process.env.JWT_SECRET,
            { expiresIn: `${exam.duration_minutes + 30}m` } // Extra 30 min buffer
        );

        res.json({
            token,
            user: {
                id: student.id,
                studentId: student.student_id,
                name: studentName || student.name,  // Use provided name, fallback to DB name
                role: student.role
            },
            session: {
                id: session.id,
                status: session.status,
                startTime: session.start_time,
                timeRemaining: session.time_remaining_seconds,
                violationCount: session.violation_count
            },
            exam: {
                id: exam.id,
                title: exam.title,
                description: exam.description,
                durationMinutes: exam.duration_minutes,
                maxViolations: exam.max_violations
            }
        });
    } catch (error) {
        console.error('Student login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};

/**
 * Generate shuffled question order for a student
 */
async function generateQuestionOrder(examId, shuffle) {
    const result = await db.query(
        'SELECT id FROM questions WHERE exam_id = $1 ORDER BY order_index',
        [examId]
    );

    const questionIds = result.rows.map(r => r.id);

    if (shuffle) {
        // Fisher-Yates shuffle
        for (let i = questionIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [questionIds[i], questionIds[j]] = [questionIds[j], questionIds[i]];
        }
    }

    return questionIds;
}

/**
 * Generate shuffled option orders for each question
 */
async function generateOptionOrders(examId) {
    const result = await db.query(
        'SELECT id, options FROM questions WHERE exam_id = $1 AND options IS NOT NULL',
        [examId]
    );

    const optionOrders = {};

    for (const row of result.rows) {
        if (row.options && Array.isArray(row.options)) {
            const indices = row.options.map((_, i) => i);
            // Fisher-Yates shuffle
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            optionOrders[row.id] = indices;
        }
    }

    return optionOrders;
}

/**
 * Verify token validity
 */
const verifyToken = async (req, res) => {
    // If we reach here, token is valid (passed auth middleware)
    res.json({
        valid: true,
        user: req.user,
        sessionId: req.sessionId
    });
};

/**
 * Register new student (admin only)
 */
const registerStudent = async (req, res) => {
    try {
        const { studentId, name, email, password } = req.body;

        if (!studentId || !name || !password) {
            return res.status(400).json({ error: 'Student ID, name, and password required' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const result = await db.query(
            `INSERT INTO users (student_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'STUDENT')
       RETURNING id, student_id, name, email, role`,
            [studentId, name, email, passwordHash]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(409).json({ error: 'Student ID or email already exists' });
        }
        console.error('Register student error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
};

module.exports = { adminLogin, studentLogin, verifyToken, registerStudent };
