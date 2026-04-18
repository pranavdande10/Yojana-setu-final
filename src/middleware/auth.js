const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { query } = require('../config/database');

// Verify JWT token
const verifyToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        const decoded = jwt.verify(token, config.jwt.secret);

        // Check if admin exists and is active
        const result = await query(
            'SELECT id, email, username, role, is_active FROM admins WHERE id = $1',
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token. Admin not found.'
            });
        }

        const admin = result.rows[0];
        admin.name = admin.username; // Map for consistency

        if (!admin.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Account is deactivated.'
            });
        }

        req.admin = admin;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token.'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired.'
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Authentication error.'
        });
    }
};

// Check if admin has required role
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        if (!roles.includes(req.admin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions.'
            });
        }

        next();
    };
};

module.exports = {
    verifyToken,
    requireRole
};
