const db = require('../config/database');

// Store active connections
const activeConnections = new Map();

/**
 * Initialize WebSocket event handling
 */
function initializeSocketEvents(io) {
    io.on('connection', (socket) => {
        const user = socket.user;
        const sessionId = socket.sessionId;

        console.log(`[Socket] Connected: ${user.name} (${user.role})`);

        // Track connection
        if (sessionId) {
            activeConnections.set(sessionId, socket.id);
        }

        // Admin joins monitoring room
        if (user.role === 'ADMIN') {
            socket.join('admin-monitor');
        }

        // Student joins their session room
        if (sessionId) {
            socket.join(`session-${sessionId}`);

            // Broadcast student connected to admin
            io.to('admin-monitor').emit('student:connected', {
                sessionId,
                studentId: user.student_id,
                studentName: user.name,
                timestamp: Date.now()
            });
        }

        // Handle violation events from student
        socket.on('violation', async (data) => {
            try {
                const { eventType, description, metadata } = data;

                // Log violation to database
                await db.query(
                    `INSERT INTO violations (session_id, event_type, description, metadata)
           VALUES ($1, $2, $3, $4)`,
                    [sessionId, eventType, description, metadata ? JSON.stringify(metadata) : null]
                );

                // Increment violation count
                const result = await db.query(
                    `UPDATE student_sessions 
           SET violation_count = violation_count + 1 
           WHERE id = $1 
           RETURNING violation_count, (SELECT max_violations FROM exams WHERE id = exam_id) as max_violations`,
                    [sessionId]
                );

                const session = result.rows[0];

                // Broadcast to admin
                io.to('admin-monitor').emit('violation:new', {
                    sessionId,
                    studentId: user.student_id,
                    studentName: user.name,
                    eventType,
                    description,
                    violationCount: session.violation_count,
                    maxViolations: session.max_violations,
                    timestamp: Date.now()
                });

                // Check if max violations exceeded
                if (session.violation_count >= session.max_violations) {
                    await handleAutoDisqualify(io, sessionId, user);
                }

                // Acknowledge violation
                socket.emit('violation:ack', {
                    violationCount: session.violation_count,
                    maxViolations: session.max_violations
                });

            } catch (error) {
                console.error('[Socket] Violation handling error:', error);
            }
        });

        // Handle answer save (real-time sync)
        socket.on('answer:save', async (data) => {
            try {
                const { questionId, selectedAnswer } = data;

                await db.query(
                    `INSERT INTO answers (session_id, question_id, selected_answer, saved_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (session_id, question_id)
           DO UPDATE SET selected_answer = $3, saved_at = CURRENT_TIMESTAMP`,
                    [sessionId, questionId, selectedAnswer]
                );

                socket.emit('answer:saved', { questionId });
            } catch (error) {
                console.error('[Socket] Answer save error:', error);
            }
        });

        // Handle heartbeat (keep-alive)
        socket.on('heartbeat', async (data) => {
            try {
                const { timeRemaining } = data;

                await db.query(
                    'UPDATE student_sessions SET time_remaining_seconds = $1 WHERE id = $2',
                    [timeRemaining, sessionId]
                );

                // Broadcast status to admin
                io.to('admin-monitor').emit('student:heartbeat', {
                    sessionId,
                    studentId: user.student_id,
                    timeRemaining,
                    timestamp: Date.now()
                });

            } catch (error) {
                console.error('[Socket] Heartbeat error:', error);
            }
        });

        // Handle camera snapshot from student
        socket.on('snapshot', (data) => {
            try {
                const { image, timestamp } = data;

                // Broadcast snapshot to admin monitor (don't store in DB - too much data)
                io.to('admin-monitor').emit('student:snapshot', {
                    sessionId,
                    studentId: user.student_id,
                    studentName: user.name,
                    image,
                    timestamp
                });

            } catch (error) {
                console.error('[Socket] Snapshot error:', error);
            }
        });

        // Admin actions
        socket.on('admin:warn', async (data) => {
            if (user.role !== 'ADMIN') return;

            const { targetSessionId, message } = data;
            io.to(`session-${targetSessionId}`).emit('warning', {
                message: message || 'You have received a warning from the administrator.',
                timestamp: Date.now()
            });
        });

        socket.on('admin:forceSubmit', async (data) => {
            if (user.role !== 'ADMIN') return;

            const { targetSessionId } = data;
            io.to(`session-${targetSessionId}`).emit('force:submit', {
                reason: 'Administrator has force-submitted your exam.',
                timestamp: Date.now()
            });
        });

        socket.on('admin:disqualify', async (data) => {
            if (user.role !== 'ADMIN') return;

            const { targetSessionId, reason } = data;
            await handleDisqualify(io, targetSessionId, reason);
        });

        // Handle disconnection
        socket.on('disconnect', async () => {
            console.log(`[Socket] Disconnected: ${user.name}`);

            if (sessionId) {
                activeConnections.delete(sessionId);

                // Update session status
                await db.query(
                    `UPDATE student_sessions SET status = 'DISCONNECTED' 
           WHERE id = $1 AND status = 'ACTIVE'`,
                    [sessionId]
                );

                // Notify admin
                io.to('admin-monitor').emit('student:disconnected', {
                    sessionId,
                    studentId: user.student_id,
                    studentName: user.name,
                    timestamp: Date.now()
                });
            }
        });
    });
}

/**
 * Handle auto-disqualification due to violations
 */
async function handleAutoDisqualify(io, sessionId, user) {
    await db.query(
        "UPDATE student_sessions SET status = 'DISQUALIFIED', end_time = CURRENT_TIMESTAMP WHERE id = $1",
        [sessionId]
    );

    io.to(`session-${sessionId}`).emit('disqualified', {
        reason: 'Maximum violation limit exceeded',
        timestamp: Date.now()
    });

    io.to('admin-monitor').emit('student:disqualified', {
        sessionId,
        studentId: user.student_id,
        studentName: user.name,
        reason: 'Maximum violations exceeded',
        timestamp: Date.now()
    });
}

/**
 * Handle manual disqualification by admin
 */
async function handleDisqualify(io, sessionId, reason) {
    const result = await db.query(
        `UPDATE student_sessions SET status = 'DISQUALIFIED', end_time = CURRENT_TIMESTAMP 
     WHERE id = $1 
     RETURNING user_id`,
        [sessionId]
    );

    if (result.rows.length > 0) {
        const userResult = await db.query(
            'SELECT student_id, name FROM users WHERE id = $1',
            [result.rows[0].user_id]
        );

        const student = userResult.rows[0];

        io.to(`session-${sessionId}`).emit('disqualified', {
            reason: reason || 'You have been disqualified by the administrator.',
            timestamp: Date.now()
        });

        io.to('admin-monitor').emit('student:disqualified', {
            sessionId,
            studentId: student?.student_id,
            studentName: student?.name,
            reason: reason || 'Manual disqualification',
            timestamp: Date.now()
        });
    }
}

/**
 * Get live session data for admin
 */
async function getLiveSessions(examId = null) {
    let query = `
    SELECT 
      ss.*,
      u.student_id,
      u.name as student_name,
      e.title as exam_title,
      e.max_violations
    FROM student_sessions ss
    JOIN users u ON ss.user_id = u.id
    JOIN exams e ON ss.exam_id = e.id
    WHERE ss.status IN ('ACTIVE', 'DISCONNECTED')
  `;

    const params = [];
    if (examId) {
        query += ' AND ss.exam_id = $1';
        params.push(examId);
    }

    query += ' ORDER BY ss.start_time DESC';

    const result = await db.query(query, params);

    return result.rows.map(row => ({
        ...row,
        isOnline: activeConnections.has(row.id)
    }));
}

module.exports = {
    initializeSocketEvents,
    getLiveSessions,
    activeConnections
};
