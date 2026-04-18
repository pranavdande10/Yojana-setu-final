const { query } = require('../../config/database');

exports.getStats = async (req, res, next) => {
    try {
        const stats = await Promise.all([
            query('SELECT COUNT(*) as count FROM schemes WHERE status = $1', ['approved']),
            query('SELECT COUNT(*) as count FROM tenders WHERE status = $1 AND (closing_date IS NULL OR date(closing_date) >= date("now"))', ['approved']),
            query('SELECT COUNT(*) as count FROM recruitments WHERE status = $1', ['approved'])
        ]);

        res.json({
            success: true,
            schemesCount: parseInt(stats[0].rows[0].count),
            tendersCount: parseInt(stats[1].rows[0].count),
            recruitmentsCount: parseInt(stats[2].rows[0].count)
        });
    } catch (error) {
        next(error);
    }
};
