const config = require('../config/env');

// Global error handler
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Default error
    let status = err.status || 500;
    let message = err.message || 'Internal server error';

    // PostgreSQL errors
    if (err.code) {
        switch (err.code) {
            case '23505': // Unique violation
                status = 409;
                message = 'Resource already exists';
                break;
            case '23503': // Foreign key violation
                status = 400;
                message = 'Invalid reference';
                break;
            case '22P02': // Invalid text representation
                status = 400;
                message = 'Invalid data format';
                break;
            case '23502': // Not null violation
                status = 400;
                message = 'Required field missing';
                break;
        }
    }

    // Send error response
    res.status(status).json({
        success: false,
        message: message,
        ...(config.server.env === 'development' && { stack: err.stack })
    });
};

// 404 handler
const notFound = (req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
};

module.exports = {
    errorHandler,
    notFound
};
