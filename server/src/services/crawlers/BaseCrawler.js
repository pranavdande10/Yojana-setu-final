const axios = require('axios');
const cheerio = require('cheerio');
const { query } = require('../../config/database');
const logger = require('../logger');
const Normalizer = require('../normalizer');
const config = require('../../config/env');
const { STATES } = require('../../config/constants');

class BaseCrawler {
    constructor(source) {
        this.source = source; // { id, name, url, type }
        this.jobId = null;
        this.states = STATES;
        this.recordsFound = 0;
        this.recordsSaved = 0;
        this.errors = [];
    }

    // Main execution method
    async execute() {
        logger.info(`Starting crawler for ${this.source.name}`, { sourceId: this.source.id });

        try {
            // Create crawl job
            this.jobId = await this.createJob();
            await this.updateJobStatus('running');

            // Crawl data for each state
            for (const state of this.states) {
                try {
                    logger.info(`Crawling ${state}...`, { state, source: this.source.name });

                    const rawData = await this.crawlState(state);

                    if (rawData && rawData.length > 0) {
                        this.recordsFound += rawData.length;

                        // Normalize and save data
                        const normalizedData = rawData.map(item => ({
                            crawl_job_id: this.jobId,
                            source_id: this.source.id,
                            type: this.source.type,
                            raw_data: item,
                            normalized_data: this.normalize(item, state)
                        }));

                        await this.saveResults(normalizedData);
                        this.recordsSaved += normalizedData.length;

                        logger.info(`Saved ${normalizedData.length} records for ${state}`);
                    }

                    // Rate limiting - wait between states
                    await this.delay(config.crawler.requestDelay);

                } catch (error) {
                    logger.error(`Error crawling ${state}:`, error);
                    this.errors.push({ state, error: error.message });
                }
            }

            // Mark job as completed
            await this.updateJobStatus('completed');
            logger.info(`Crawler completed for ${this.source.name}`, {
                recordsFound: this.recordsFound,
                recordsSaved: this.recordsSaved
            });

        } catch (error) {
            logger.error(`Crawler failed for ${this.source.name}:`, error);
            await this.updateJobStatus('failed', error.message);
            throw error;
        }
    }

    // Crawl data for a specific state (to be overridden by subclasses)
    async crawlState(state) {
        throw new Error('crawlState() must be implemented by subclass');
    }

    // Normalize data (to be overridden by subclasses)
    normalize(rawData, state) {
        throw new Error('normalize() must be implemented by subclass');
    }

    // List of modern User Agents to rotate
    userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0'
    ];

    /**
     * Get a random User Agent
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * Get proxy configuration from environment
     * Format: CRAWLER_PROXIES=http://user:pass@host:port,http://host:port,...
     */
    getProxy() {
        if (!process.env.CRAWLER_PROXIES) return null;

        const proxies = process.env.CRAWLER_PROXIES.split(',').map(p => p.trim());
        if (proxies.length === 0) return null;

        const proxyUrl = proxies[Math.floor(Math.random() * proxies.length)];

        try {
            const url = new URL(proxyUrl);
            return {
                protocol: url.protocol.replace(':', ''),
                host: url.hostname,
                port: parseInt(url.port),
                auth: (url.username && url.password) ? {
                    username: url.username,
                    password: url.password
                } : undefined
            };
        } catch (e) {
            logger.warn('Invalid proxy URL:', proxyUrl);
            return null;
        }
    }

    // Fetch URL with retry logic
    async fetchWithRetry(url, options = {}) {
        const retries = options.retries || config.crawler.maxRetries || 3;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Rotate User Agent for each attempt
                const userAgent = this.getRandomUserAgent();

                // Get Proxy (if configured)
                const proxy = this.getProxy();
                const proxyLog = proxy ? ` via proxy ${proxy.host}` : '';

                logger.debug(`Fetching ${url} (attempt ${attempt}/${retries})${proxyLog}`);

                const axiosConfig = {
                    timeout: config.crawler.timeout,
                    ...options,
                    headers: {
                        'User-Agent': userAgent,
                        ...options.headers // Custom headers override rotated UA if passed explicitly
                    },
                    proxy: proxy
                };

                const response = await axios.get(url, axiosConfig);

                return response;

            } catch (error) {
                logger.warn(`Fetch attempt ${attempt} failed for ${url}:`, error.message);

                if (attempt === retries) {
                    if (error.response) return error.response;
                    throw new Error(`Failed to fetch ${url} after ${retries} attempts: ${error.message}`);
                }

                // Exponential backoff
                await this.delay(1000 * Math.pow(2, attempt));
            }
        }
    }

    // Parse HTML using cheerio
    parseHTML(html) {
        return cheerio.load(html);
    }

    // Save crawl results to database
    async saveResults(results) {
        if (results.length === 0) return;

        try {
            const values = results.map((r, i) => {
                const base = i * 5;
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
            }).join(', ');

            const params = results.flatMap(r => [
                r.crawl_job_id,
                r.source_id,
                r.type,
                JSON.stringify(r.raw_data),
                JSON.stringify(r.normalized_data)
            ]);

            await query(
                `INSERT INTO crawl_results (crawl_job_id, source_id, type, raw_data, normalized_data)
         VALUES ${values}`,
                params
            );

        } catch (error) {
            logger.error('Error saving crawl results:', error);
            throw error;
        }
    }

    // Create crawl job
    async createJob() {
        const result = await query(
            `INSERT INTO crawler_jobs (source_id, job_type, status, started_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
            [this.source.id, this.source.type, 'pending']
        );
        return result.lastID;
    }

    // Update job status
    async updateJobStatus(status, errorMessage = null) {
        await query(
            `UPDATE crawler_jobs 
       SET status = $1, 
           completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END,
           total_fetched = $2,
           success_count = $3,
           error_message = $4,
           last_updated = CURRENT_TIMESTAMP
       WHERE id = $5`,
            [status, this.recordsFound, this.recordsSaved, errorMessage, this.jobId]
        );

        // Update source last_crawled_at
        if (status === 'completed') {
            await query(
                'UPDATE sources SET last_crawled_at = CURRENT_TIMESTAMP WHERE id = $1',
                [this.source.id]
            );
        }
    }

    // Delay helper
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = BaseCrawler;
