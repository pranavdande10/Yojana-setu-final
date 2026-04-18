// Request validation middleware
const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);

        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        next();
    };
};

// Sanitize query parameters
const sanitizeQuery = (req, res, next) => {
    // Limit pagination
    if (req.query.page) {
        req.query.page = Math.max(1, parseInt(req.query.page) || 1);
    }

    if (req.query.limit) {
        req.query.limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    }

    // Sanitize search
    if (req.query.search) {
        req.query.search = req.query.search.trim().substring(0, 200);
    }

    next();
};

module.exports = {
    validate,
    sanitizeQuery
};
