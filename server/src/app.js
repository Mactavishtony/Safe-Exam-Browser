require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const { apiLimiter } = require('./middleware/rateLimiter');
const { authenticateSocket } = require('./middleware/auth');
const { initializeSocketEvents, getLiveSessions } = require('./socket/eventHandler');

// Routes
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const questionRoutes = require('./routes/questions');
const submissionRoutes = require('./routes/submissions');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
    }
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Disabled for dev; enable in production
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api', apiLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/submissions', submissionRoutes);

// Live sessions endpoint
app.get('/api/monitor/live', async (req, res) => {
    try {
        const { authenticate } = require('./middleware/auth');
        const { adminOnly } = require('./middleware/roleCheck');

        // Quick auth check
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const sessions = await getLiveSessions();
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch live sessions' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Serve static dashboard (production)
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../../dashboard/dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../dashboard/dist/index.html'));
    });
}

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Socket.IO authentication and events
io.use(authenticateSocket);
initializeSocketEvents(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║     Safe Exam Browser - Server                     ║
╠═══════════════════════════════════════════════════╣
║  Server running on port ${PORT}                       ║
║  Environment: ${process.env.NODE_ENV || 'development'}                      ║
╚═══════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };
