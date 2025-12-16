const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        error: 'Too many requests',
        retryAfter: 'Please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Stricter limiter for auth endpoints (relaxed for development)
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 attempts per 15 minutes (increased for dev)
    message: {
        error: 'Too many login attempts',
        retryAfter: 'Please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Very strict limiter for exam submission
 */
const submitLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 submissions per minute
    message: {
        error: 'Submission rate limit exceeded',
        retryAfter: 'Please wait before submitting again'
    }
});

module.exports = { apiLimiter, authLimiter, submitLimiter };
