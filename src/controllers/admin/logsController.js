const { query } = require('../../config/database');

// Get audit logs
exports.getAuditLogs = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, adminId, action } = req.query;
        const offset = (page - 1) * limit;

        let queryText = `
      SELECT al.*, a.email as admin_email, a.username as admin_name
      FROM audit_logs al
      LEFT JOIN admins a ON al.admin_id = a.id
      WHERE 1=1
    `;
        const params = [];
        let paramCount = 0;

        if (adminId) {
            paramCount++;
            queryText += ` AND al.admin_id = $${paramCount}`;
            params.push(adminId);
        }

        if (action) {
            paramCount++;
            queryText += ` AND al.action = $${paramCount}`;
            params.push(action);
        }

        queryText += ' ORDER BY al.created_at DESC';

        paramCount++;
        queryText += ` LIMIT $${paramCount}`;
        params.push(limit);

        paramCount++;
        queryText += ` OFFSET $${paramCount}`;
        params.push(offset);

        const result = await query(queryText, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
        const countParams = [];
        let countParamCount = 0;

        if (adminId) {
            countParamCount++;
            countQuery += ` AND admin_id = $${countParamCount}`;
            countParams.push(adminId);
        }

        if (action) {
            countParamCount++;
            countQuery += ` AND action = $${countParamCount}`;
            countParams.push(action);
        }

        const countResult = await query(countQuery, countParams);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].total),
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(countResult.rows[0].total / limit)
            }
        });

    } catch (error) {
        next(error);
    }
};

// Get statistics
exports.getStats = async (req, res, next) => {
    try {
        // Get counts for dashboard
        const stats = await Promise.all([
            query('SELECT COUNT(*) as count FROM crawl_results WHERE status = $1', ['pending']),
            query('SELECT COUNT(*) as count FROM schemes WHERE status = $1', ['approved']),
            query('SELECT COUNT(*) as count FROM tenders WHERE status = $1', ['approved']),
            query('SELECT COUNT(*) as count FROM recruitments WHERE status = $1', ['approved']),
            query('SELECT COUNT(*) as count FROM crawler_jobs WHERE status = $1', ['running']),
            query(`SELECT COUNT(*) as count FROM crawler_jobs 
             WHERE status = $1 AND started_at > datetime('now', '-24 hours')`, ['completed'])
        ]);

        res.json({
            success: true,
            data: {
                pendingReviews: parseInt(stats[0].rows[0].count),
                approvedSchemes: parseInt(stats[1].rows[0].count),
                approvedTenders: parseInt(stats[2].rows[0].count),
                approvedRecruitments: parseInt(stats[3].rows[0].count),
                runningCrawlers: parseInt(stats[4].rows[0].count),
                crawlersLast24h: parseInt(stats[5].rows[0].count)
            }
        });

    } catch (error) {
        next(error);
    }
};
