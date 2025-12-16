/**
 * Check if user has required role
 */
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: `Required role: ${roles.join(' or ')}`
            });
        }

        next();
    };
};

/**
 * Admin only middleware
 */
const adminOnly = requireRole('ADMIN');

/**
 * Student only middleware
 */
const studentOnly = requireRole('STUDENT');

module.exports = { requireRole, adminOnly, studentOnly };
