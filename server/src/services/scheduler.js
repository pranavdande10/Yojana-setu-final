const cron = require('node-cron');
const { query } = require('../config/database');
const logger = require('./logger');
const config = require('../config/env');
const SchemesCrawler = require('./crawlers/schemesCrawler');
const TendersCrawler = require('./crawlers/tendersCrawler');
const RecruitmentsCrawler = require('./crawlers/recruitmentsCrawler');

class Scheduler {
    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
    }

    // Initialize and start scheduler
    async start() {
        if (this.isRunning) {
            logger.warn('Scheduler is already running');
            return;
        }

        logger.info('Starting crawler scheduler...');
        this.isRunning = true;

        // Schedule crawlers based on cron expression
        const cronSchedule = config.crawler.cronSchedule;

        cron.schedule(cronSchedule, async () => {
            logger.info('Scheduled crawler execution started');
            await this.runAllCrawlers();
        });

        logger.info(`Crawler scheduled with cron: ${cronSchedule}`);

        // Optionally run crawlers on startup (comment out if not needed)
        // await this.runAllCrawlers();
    }

    // Run all active crawlers
    async runAllCrawlers() {
        try {
            logger.info('Running all crawlers...');

            // Get all active sources
            const result = await query(
                'SELECT * FROM sources WHERE is_active = true ORDER BY type'
            );

            const sources = result.rows;

            if (sources.length === 0) {
                logger.warn('No active sources found');
                return;
            }

            // Run crawlers sequentially to avoid overwhelming servers
            for (const source of sources) {
                try {
                    await this.runCrawler(source);
                } catch (error) {
                    logger.error(`Error running crawler for ${source.name}:`, error);
                }
            }

            logger.info('All crawlers completed');

        } catch (error) {
            logger.error('Error in runAllCrawlers:', error);
        }
    }

    // Run a specific crawler
    async runCrawler(source) {
        let crawler;

        switch (source.type) {
            case 'scheme':
                crawler = new SchemesCrawler(source);
                break;
            case 'tender':
                crawler = new TendersCrawler(source);
                break;
            case 'recruitment':
                crawler = new RecruitmentsCrawler(source);
                break;
            default:
                logger.warn(`Unknown source type: ${source.type}`);
                return;
        }

        logger.info(`Starting crawler for ${source.name} (${source.type})`);

        try {
            await crawler.execute();
            logger.info(`Crawler completed for ${source.name}`);
        } catch (error) {
            logger.error(`Crawler failed for ${source.name}:`, error);
            throw error;
        }
    }

    // Manually trigger crawler for a specific source
    async triggerCrawler(sourceId) {
        try {
            const result = await query(
                'SELECT * FROM sources WHERE id = $1',
                [sourceId]
            );

            if (result.rows.length === 0) {
                throw new Error('Source not found');
            }

            const source = result.rows[0];

            if (!source.is_active) {
                throw new Error('Source is not active');
            }

            logger.info(`Manually triggering crawler for ${source.name}`);
            await this.runCrawler(source);

            return { success: true, message: `Crawler triggered for ${source.name}` };

        } catch (error) {
            logger.error('Error triggering crawler:', error);
            throw error;
        }
    }

    // Stop scheduler
    stop() {
        this.isRunning = false;
        this.jobs.forEach(job => job.stop());
        this.jobs.clear();
        logger.info('Scheduler stopped');
    }
}

// Export singleton instance
module.exports = new Scheduler();
