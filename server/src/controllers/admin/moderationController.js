const CrawlResultModel = require('../../models/CrawlResult');
const SchemeModel = require('../../models/Scheme');
const TenderModel = require('../../models/Tender');
const RecruitmentModel = require('../../models/Recruitment');
const { query, transaction } = require('../../config/database');
const logger = require('../../services/logger');

// Get all pending crawl results
exports.getPending = async (req, res, next) => {
    try {
        const { type, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        const result = await CrawlResultModel.getPending({
            type,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: result.data,
            pagination: {
                total: result.total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(result.total / limit)
            }
        });

    } catch (error) {
        next(error);
    }
};

// Get single crawl result by ID
exports.getById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await CrawlResultModel.getById(id);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Crawl result not found'
            });
        }

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        next(error);
    }
};

// Update crawl result (edit normalized data before approval)
exports.update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { normalized_data } = req.body;

        if (!normalized_data) {
            return res.status(400).json({
                success: false,
                message: 'normalized_data is required'
            });
        }

        const updated = await CrawlResultModel.update(id, normalized_data);

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: 'Crawl result not found'
            });
        }

        // Log action
        await query(
            `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, changes)
       VALUES ($1, $2, $3, $4, $5)`,
            [req.admin.id, 'edit', 'crawl_result', id, JSON.stringify({ normalized_data })]
        );

        logger.info(`Crawl result ${id} updated by ${req.admin.email}`);

        res.json({
            success: true,
            message: 'Crawl result updated successfully',
            data: updated
        });

    } catch (error) {
        next(error);
    }
};

// Approve crawl result (move to public table)
exports.approve = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Get crawl result
        const crawlResult = await CrawlResultModel.getById(id);

        if (!crawlResult) {
            return res.status(404).json({
                success: false,
                message: 'Crawl result not found'
            });
        }

        if (crawlResult.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Crawl result is not pending'
            });
        }

        // Use transaction to ensure atomicity
        await transaction(async (client) => {
            // Mark as approved
            await client.query(
                `UPDATE crawl_results 
         SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
                [req.admin.id, id]
            );

            // Insert into appropriate public table
            const data = crawlResult.normalized_data;

            switch (crawlResult.type) {
                case 'scheme':
                    await SchemeModel.create(data, req.admin.id);
                    break;
                case 'tender':
                    await TenderModel.create(data, req.admin.id);
                    break;
                case 'recruitment':
                    await RecruitmentModel.create(data, req.admin.id);
                    break;
            }

            // Log action
            await client.query(
                `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id)
         VALUES ($1, $2, $3, $4)`,
                [req.admin.id, 'approve', crawlResult.type, id]
            );
        });

        logger.info(`Crawl result ${id} approved by ${req.admin.email}`);

        res.json({
            success: true,
            message: 'Crawl result approved and published successfully'
        });

    } catch (error) {
        next(error);
    }
};

// Reject crawl result
exports.reject = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        const rejected = await CrawlResultModel.reject(id, req.admin.id, reason);

        if (!rejected) {
            return res.status(404).json({
                success: false,
                message: 'Crawl result not found'
            });
        }

        // Log action
        await query(
            `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, changes)
       VALUES ($1, $2, $3, $4, $5)`,
            [req.admin.id, 'reject', 'crawl_result', id, JSON.stringify({ reason })]
        );

        logger.info(`Crawl result ${id} rejected by ${req.admin.email}`);

        res.json({
            success: true,
            message: 'Crawl result rejected successfully'
        });

    } catch (error) {
        next(error);
    }
};
