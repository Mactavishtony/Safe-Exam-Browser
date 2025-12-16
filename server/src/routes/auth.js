const express = require('express');
const router = express.Router();
const { adminLogin, studentLogin, verifyToken, registerStudent } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const { authLimiter } = require('../middleware/rateLimiter');

// Public routes
router.post('/admin/login', authLimiter, adminLogin);
router.post('/student/login', authLimiter, studentLogin);

// Protected routes
router.get('/verify', authenticate, verifyToken);
router.post('/register-student', authenticate, adminOnly, registerStudent);

module.exports = router;
