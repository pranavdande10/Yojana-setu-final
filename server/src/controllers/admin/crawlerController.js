const scheduler = require('../../services/scheduler');
const { query } = require('../../config/database');
const logger = require('../../services/logger');

// Get all sources
exports.getSources = async (req, res, next) => {
    try {
        const result = await query(
            'SELECT * FROM sources ORDER BY type, name'
        );

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        next(error);
    }
};

// Manually trigger crawler for a specific source
exports.triggerCrawler = async (req, res, next) => {
    try {
        const { sourceId } = req.body;

        if (!sourceId) {
            return res.status(400).json({
                success: false,
                message: 'sourceId is required'
            });
        }

        // Trigger crawler
        const result = await scheduler.triggerCrawler(sourceId);

        // Log action
        await query(
            `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id)
       VALUES ($1, $2, $3, $4)`,
            [req.admin.id, 'trigger_crawler', 'source', sourceId]
        );

        logger.info(`Crawler triggered for source ${sourceId} by ${req.admin.email}`);

        res.json({
            success: true,
            message: result.message
        });

    } catch (error) {
        next(error);
    }
};

// Get crawl jobs history
exports.getCrawlJobs = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status, sourceId } = req.query;
        const offset = (page - 1) * limit;

        let queryText = `
      SELECT cj.*, s.name as source_name, s.type as source_type
      FROM crawler_jobs cj
      LEFT JOIN sources s ON cj.source_id = s.id
      WHERE 1=1
    `;
        const params = [];
        let paramCount = 0;

        if (status) {
            paramCount++;
            queryText += ` AND cj.status = $${paramCount}`;
            params.push(status);
        }

        if (sourceId) {
            paramCount++;
            queryText += ` AND cj.source_id = $${paramCount}`;
            params.push(sourceId);
        }

        queryText += ' ORDER BY started_at DESC';

        paramCount++;
        queryText += ` LIMIT $${paramCount}`;
        params.push(parseInt(limit));

        paramCount++;
        queryText += ` OFFSET $${paramCount}`;
        params.push(offset);

        const result = await query(queryText, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM crawler_jobs WHERE 1=1';
        const countParams = [];
        let countParamCount = 0;

        if (status) {
            countParamCount++;
            countQuery += ` AND status = $${countParamCount}`;
            countParams.push(status);
        }

        if (sourceId) {
            countParamCount++;
            countQuery += ` AND source_id = $${countParamCount}`;
            countParams.push(sourceId);
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

// Get crawl job details
exports.getCrawlJobById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT cj.*, s.name as source_name, s.type as source_type, s.url as source_url
       FROM crawler_jobs cj
       LEFT JOIN sources s ON cj.source_id = s.id
       WHERE cj.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Crawl job not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        next(error);
    }
};

// ============================================
// Enhanced MyScheme Crawler Control
// ============================================

const SchemesCrawler = require('../../services/crawlers/schemesCrawler');

// Global crawler instance (singleton pattern)
let mySchemeCrawlerInstance = null;

/**
 * Start MyScheme crawler
 * POST /api/admin/crawler/myscheme/start
 */
exports.startMySchemeCrawler = async (req, res, next) => {
    try {
        let { location = null } = req.body;
        // Always prioritize the environment batch size if set, otherwise fallback to UI or 50
        let batch_size = parseInt(process.env.CRAWLER_BATCH_SIZE) || parseInt(req.body.batch_size) || 50;

        // Validate batch size
        if (batch_size < 10 || batch_size > 5000) {
            return res.status(400).json({
                success: false,
                message: 'Batch size must be between 10 and 5000'
            });
        }

        // Check if crawler is already running
        const statusCheck = await query(
            'SELECT is_running, current_job_id FROM crawler_status WHERE id = 1'
        );

        if (statusCheck.rows[0]?.is_running) {
            return res.status(409).json({
                success: false,
                message: 'Crawler is already running',
                job_id: statusCheck.rows[0].current_job_id
            });
        }

        // Create new crawler instance
        mySchemeCrawlerInstance = new SchemesCrawler();
        mySchemeCrawlerInstance.batchSize = batch_size;

        // Start crawler in background
        mySchemeCrawlerInstance.crawl(location).catch(error => {
            logger.error('MyScheme crawler error:', error);
        });

        // Wait for job to be created
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get the job ID
        const jobResult = await query(
            'SELECT current_job_id FROM crawler_status WHERE id = 1'
        );

        // Log action
        await query(
            `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id)
             VALUES ($1, $2, $3, $4)`,
            [req.admin.id, 'start_myscheme_crawler', 'crawler_job', jobResult.rows[0]?.current_job_id]
        );

        logger.info(`MyScheme crawler started by ${req.admin.email} with batch size ${batch_size}`);

        res.json({
            success: true,
            message: 'MyScheme crawler started successfully',
            job_id: jobResult.rows[0]?.current_job_id,
            batch_size
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Pause MyScheme crawler
 * POST /api/admin/crawler/myscheme/pause
 */
exports.pauseMySchemeCrawler = async (req, res, next) => {
    try {
        if (mySchemeCrawlerInstance) {
            mySchemeCrawlerInstance.pause();
        }

        // Update job status
        await query(`
            UPDATE crawler_jobs
            SET status = 'paused', last_updated = CURRENT_TIMESTAMP
            WHERE id = (SELECT current_job_id FROM crawler_status WHERE id = 1)
        `);

        logger.info(`MyScheme crawler paused by ${req.admin.email}`);

        res.json({
            success: true,
            message: 'MyScheme crawler paused successfully'
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Resume MyScheme crawler
 * POST /api/admin/crawler/myscheme/resume
 */
exports.resumeMySchemeCrawler = async (req, res, next) => {
    try {
        if (mySchemeCrawlerInstance) {
            mySchemeCrawlerInstance.resume();
        }

        // Update job status
        await query(`
            UPDATE crawler_jobs
            SET status = 'running', last_updated = CURRENT_TIMESTAMP
            WHERE id = (SELECT current_job_id FROM crawler_status WHERE id = 1)
        `);

        logger.info(`MyScheme crawler resumed by ${req.admin.email}`);

        res.json({
            success: true,
            message: 'MyScheme crawler resumed successfully'
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Stop MyScheme crawler
 * POST /api/admin/crawler/myscheme/stop
 */
exports.stopMySchemeCrawler = async (req, res, next) => {
    try {
        if (mySchemeCrawlerInstance) {
            mySchemeCrawlerInstance.stop();
            mySchemeCrawlerInstance = null;
        }

        // Update job status
        await query(`
            UPDATE crawler_jobs
            SET status = 'stopped', completed_at = CURRENT_TIMESTAMP, last_updated = CURRENT_TIMESTAMP
            WHERE id = (SELECT current_job_id FROM crawler_status WHERE id = 1)
        `);

        // Update global status explicitly for CLI processes
        await query(`UPDATE crawler_status SET is_running = false WHERE id = 1`);

        logger.info(`MyScheme crawler stopped by ${req.admin.email}`);

        res.json({
            success: true,
            message: 'MyScheme crawler stopped successfully'
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get MyScheme crawler status
 * GET /api/admin/crawler/myscheme/status
 */
exports.getMySchemeCrawlerStatus = async (req, res, next) => {
    try {
        // Get global status
        const statusResult = await query(`
            SELECT * FROM crawler_status WHERE id = 1
        `);

        const status = statusResult.rows[0];

        if (!status) {
            return res.status(500).json({
                success: false,
                message: 'Crawler status not initialized'
            });
        }

        // Get current job details if running
        let currentJob = null;
        if (status.is_running && status.current_job_id) {
            const jobResult = await query(`
                SELECT * FROM crawler_jobs WHERE id = $1
            `, [status.current_job_id]);

            currentJob = jobResult.rows[0];
        }

        res.json({
            success: true,
            status: {
                is_running: !!status.is_running,
                last_run_at: status.last_run_at,
                last_success_at: status.last_success_at,
                last_error: status.last_error,
                total_runs: status.total_runs,
                total_success: status.total_success,
                total_failures: status.total_failures
            },
            current_job: currentJob ? {
                id: currentJob.id,
                status: currentJob.status,
                batch_size: currentJob.batch_size,
                current_batch: currentJob.current_batch,
                total_fetched: currentJob.total_fetched,
                progress_percentage: currentJob.progress_percentage,
                success_count: currentJob.success_count,
                failed_count: currentJob.failed_count,
                duplicate_count: currentJob.duplicate_count,
                started_at: currentJob.started_at,
                last_updated: currentJob.last_updated
            } : null
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get MyScheme crawler jobs
 * GET /api/admin/crawler/myscheme/jobs
 */
exports.getMySchemeJobs = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const offset = (page - 1) * limit;

        let queryText = `SELECT * FROM crawler_jobs WHERE job_type = 'schemes'`;
        const params = [];
        let paramCount = 0;

        if (status) {
            paramCount++;
            queryText += ` AND status = $${paramCount}`;
            params.push(status);
        }

        queryText += ' ORDER BY started_at DESC';

        paramCount++;
        queryText += ` LIMIT $${paramCount}`;
        params.push(parseInt(limit));

        paramCount++;
        queryText += ` OFFSET $${paramCount}`;
        params.push(offset);

        const result = await query(queryText, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM crawler_jobs WHERE job_type = 'schemes'`;
        const countParams = [];

        if (status) {
            countQuery += ` AND status = $1`;
            countParams.push(status);
        }

        const countResult = await query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        next(error);
    }
};

// ============================================
// Enhanced Tenders Crawler Control
// ============================================

const TendersCrawler = require('../../services/crawlers/tendersCrawler');

let tendersCrawlerInstance = null;

exports.startTendersCrawler = async (req, res, next) => {
    try {
        const { batch_size = 50, location = null } = req.body;

        if (batch_size < 10 || batch_size > 100) {
            return res.status(400).json({ success: false, message: 'Batch size must be between 10 and 100' });
        }

        const statusCheck = await query('SELECT is_running, current_job_id FROM crawler_status WHERE id = 2');
        if (statusCheck.rows[0]?.is_running) {
            return res.status(409).json({ success: false, message: 'Crawler is already running', job_id: statusCheck.rows[0].current_job_id });
        }

        tendersCrawlerInstance = new TendersCrawler();
        tendersCrawlerInstance.batchSize = batch_size;

        tendersCrawlerInstance.crawl(location).catch(error => logger.error('Tenders crawler error:', error));

        await new Promise(resolve => setTimeout(resolve, 500));
        const jobResult = await query('SELECT current_job_id FROM crawler_status WHERE id = 2');

        await query(
            `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4)`,
            [req.admin.id, 'start_tenders_crawler', 'crawler_job', jobResult.rows[0]?.current_job_id]
        );

        logger.info(`Tenders crawler started by ${req.admin.email} with batch size ${batch_size}`);
        res.json({ success: true, message: 'Tenders crawler started successfully', job_id: jobResult.rows[0]?.current_job_id, batch_size });
    } catch (error) { next(error); }
};

exports.pauseTendersCrawler = async (req, res, next) => {
    try {
        if (!tendersCrawlerInstance) return res.status(400).json({ success: false, message: 'No Tenders crawler running' });
        tendersCrawlerInstance.pause();
        await query(`UPDATE crawler_jobs SET status = 'paused', last_updated = CURRENT_TIMESTAMP WHERE id = (SELECT current_job_id FROM crawler_status WHERE id = 2)`);
        logger.info(`Tenders crawler paused by ${req.admin.email}`);
        res.json({ success: true, message: 'Tenders crawler paused successfully' });
    } catch (error) { next(error); }
};

exports.resumeTendersCrawler = async (req, res, next) => {
    try {
        if (!tendersCrawlerInstance) return res.status(400).json({ success: false, message: 'No loaded Tenders crawler' });
        tendersCrawlerInstance.resume();
        await query(`UPDATE crawler_jobs SET status = 'running', last_updated = CURRENT_TIMESTAMP WHERE id = (SELECT current_job_id FROM crawler_status WHERE id = 2)`);
        logger.info(`Tenders crawler resumed by ${req.admin.email}`);
        res.json({ success: true, message: 'Tenders crawler resumed successfully' });
    } catch (error) { next(error); }
};

exports.stopTendersCrawler = async (req, res, next) => {
    try {
        if (!tendersCrawlerInstance) return res.status(400).json({ success: false, message: 'No Tenders crawler running' });
        tendersCrawlerInstance.stop();
        await query(`UPDATE crawler_jobs SET status = 'stopped', completed_at = CURRENT_TIMESTAMP, last_updated = CURRENT_TIMESTAMP WHERE id = (SELECT current_job_id FROM crawler_status WHERE id = 2)`);
        tendersCrawlerInstance = null;
        logger.info(`Tenders crawler stopped by ${req.admin.email}`);
        res.json({ success: true, message: 'Tenders crawler stopped successfully' });
    } catch (error) { next(error); }
};

exports.getTendersCrawlerStatus = async (req, res, next) => {
    try {
        const statusResult = await query(`SELECT * FROM crawler_status WHERE id = 2`);
        const status = statusResult.rows[0];
        if (!status) return res.json({ success: true, data: { is_running: false, current_job: null, last_error: null } });

        let currentJob = null;
        if (status.current_job_id) {
            const jobResult = await query(`
                SELECT *, 
                ROUND((success_count + failed_count + duplicate_count) * 100.0 / NULLIF(estimated_total, 0)) as progress_percentage
                FROM crawler_jobs WHERE id = $1
            `, [status.current_job_id]);
            currentJob = jobResult.rows[0];
        }

        res.json({
            success: true,
            data: { is_running: status.is_running, last_error: status.last_error, last_updated: status.last_updated },
            current_job: currentJob
        });
    } catch (error) { next(error); }
};

exports.getTendersJobs = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const offset = (page - 1) * limit;

        let queryText = `SELECT * FROM crawler_jobs WHERE job_type = 'tenders'`;
        const params = [];
        let paramCount = 0;

        if (status) {
            paramCount++;
            queryText += ` AND status = $${paramCount}`;
            params.push(status);
        }

        queryText += ' ORDER BY started_at DESC LIMIT $' + (++paramCount) + ' OFFSET $' + (++paramCount);
        params.push(parseInt(limit), offset);

        const result = await query(queryText, params);
        
        let countQuery = `SELECT COUNT(*) as total FROM crawler_jobs WHERE job_type = 'tenders'`;
        const countParams = [];
        if (status) { countQuery += ` AND status = $1`; countParams.push(status); }

        const countResult = await query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            data: result.rows,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) { next(error); }
};

// ============================================
// Enhanced Recruitments Crawler Control
// ============================================

const RecruitmentsCrawler = require('../../services/crawlers/recruitmentsCrawler');

let recruitmentsCrawlerInstance = null;

exports.startRecruitmentsCrawler = async (req, res, next) => {
    try {
        const { batch_size = 50, location = null } = req.body;

        if (batch_size < 10 || batch_size > 100) {
            return res.status(400).json({ success: false, message: 'Batch size must be between 10 and 100' });
        }

        const statusCheck = await query('SELECT is_running, current_job_id FROM crawler_status WHERE id = 3');
        if (statusCheck.rows[0]?.is_running) {
            return res.status(409).json({ success: false, message: 'Crawler is already running', job_id: statusCheck.rows[0].current_job_id });
        }

        recruitmentsCrawlerInstance = new RecruitmentsCrawler();
        recruitmentsCrawlerInstance.batchSize = batch_size;

        recruitmentsCrawlerInstance.crawl(location).catch(error => logger.error('Recruitments crawler error:', error));

        await new Promise(resolve => setTimeout(resolve, 500));
        const jobResult = await query('SELECT current_job_id FROM crawler_status WHERE id = 3');

        await query(
            `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4)`,
            [req.admin.id, 'start_recruitments_crawler', 'crawler_job', jobResult.rows[0]?.current_job_id]
        );

        logger.info(`Recruitments crawler started by ${req.admin.email} with batch size ${batch_size}`);
        res.json({ success: true, message: 'Recruitments crawler started successfully', job_id: jobResult.rows[0]?.current_job_id, batch_size });
    } catch (error) { next(error); }
};

exports.pauseRecruitmentsCrawler = async (req, res, next) => {
    try {
        if (!recruitmentsCrawlerInstance) return res.status(400).json({ success: false, message: 'No Recruitments crawler running' });
        recruitmentsCrawlerInstance.pause();
        await query(`UPDATE crawler_jobs SET status = 'paused', last_updated = CURRENT_TIMESTAMP WHERE id = (SELECT current_job_id FROM crawler_status WHERE id = 3)`);
        logger.info(`Recruitments crawler paused by ${req.admin.email}`);
        res.json({ success: true, message: 'Recruitments crawler paused successfully' });
    } catch (error) { next(error); }
};

exports.resumeRecruitmentsCrawler = async (req, res, next) => {
    try {
        if (!recruitmentsCrawlerInstance) return res.status(400).json({ success: false, message: 'No loaded Recruitments crawler' });
        recruitmentsCrawlerInstance.resume();
        await query(`UPDATE crawler_jobs SET status = 'running', last_updated = CURRENT_TIMESTAMP WHERE id = (SELECT current_job_id FROM crawler_status WHERE id = 3)`);
        logger.info(`Recruitments crawler resumed by ${req.admin.email}`);
        res.json({ success: true, message: 'Recruitments crawler resumed successfully' });
    } catch (error) { next(error); }
};

exports.stopRecruitmentsCrawler = async (req, res, next) => {
    try {
        if (!recruitmentsCrawlerInstance) return res.status(400).json({ success: false, message: 'No Recruitments crawler running' });
        recruitmentsCrawlerInstance.stop();
        await query(`UPDATE crawler_jobs SET status = 'stopped', completed_at = CURRENT_TIMESTAMP, last_updated = CURRENT_TIMESTAMP WHERE id = (SELECT current_job_id FROM crawler_status WHERE id = 3)`);
        recruitmentsCrawlerInstance = null;
        logger.info(`Recruitments crawler stopped by ${req.admin.email}`);
        res.json({ success: true, message: 'Recruitments crawler stopped successfully' });
    } catch (error) { next(error); }
};

exports.getRecruitmentsCrawlerStatus = async (req, res, next) => {
    try {
        const statusResult = await query(`SELECT * FROM crawler_status WHERE id = 3`);
        const status = statusResult.rows[0];
        if (!status) return res.json({ success: true, data: { is_running: false, current_job: null, last_error: null } });

        let currentJob = null;
        if (status.current_job_id) {
            const jobResult = await query(`
                SELECT *, 
                ROUND((success_count + failed_count + duplicate_count) * 100.0 / NULLIF(estimated_total, 0)) as progress_percentage
                FROM crawler_jobs WHERE id = $1
            `, [status.current_job_id]);
            currentJob = jobResult.rows[0];
        }

        res.json({
            success: true,
            data: { is_running: status.is_running, last_error: status.last_error, last_updated: status.last_updated },
            current_job: currentJob
        });
    } catch (error) { next(error); }
};

exports.getRecruitmentsJobs = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const offset = (page - 1) * limit;

        let queryText = `SELECT * FROM crawler_jobs WHERE job_type = 'recruitments'`;
        const params = [];
        let paramCount = 0;

        if (status) {
            paramCount++;
            queryText += ` AND status = $${paramCount}`;
            params.push(status);
        }

        queryText += ' ORDER BY started_at DESC LIMIT $' + (++paramCount) + ' OFFSET $' + (++paramCount);
        params.push(parseInt(limit), offset);

        const result = await query(queryText, params);
        
        let countQuery = `SELECT COUNT(*) as total FROM crawler_jobs WHERE job_type = 'recruitments'`;
        const countParams = [];
        if (status) { countQuery += ` AND status = $1`; countParams.push(status); }

        const countResult = await query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            data: result.rows,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) { next(error); }
};
