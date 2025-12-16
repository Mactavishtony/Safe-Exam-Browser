const jwt = require('jsonwebtoken');
const db = require('../config/database');

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Fetch user from database
            const result = await db.query(
                'SELECT id, student_id, name, email, role FROM users WHERE id = $1',
                [decoded.userId]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'User not found' });
            }

            req.user = result.rows[0];
            req.sessionId = decoded.sessionId; // For exam sessions
            next();
        } catch (jwtError) {
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
            return res.status(401).json({ error: 'Invalid token' });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

/**
 * Verify WebSocket connection token
 */
const authenticateSocket = async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const result = await db.query(
            'SELECT id, student_id, name, email, role FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return next(new Error('User not found'));
        }

        socket.user = result.rows[0];
        socket.sessionId = decoded.sessionId;
        next();
    } catch (error) {
        next(new Error('Invalid token'));
    }
};

module.exports = { authenticate, authenticateSocket };
