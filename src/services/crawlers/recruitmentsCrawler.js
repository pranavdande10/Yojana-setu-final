const puppeteer = require('puppeteer');
const { query } = require('../../config/database');
const logger = require('../logger');
const Normalizer = require('../normalizer');
const axios = require('axios');


class RecruitmentsCrawler {
    constructor() {
        this.delayMs = 1500;
        this.currentJobId = null;
        this.isPaused = false;
        this.isStopped = false;
        this.batchSize = 100;
    }

    pause() {
        this.isPaused = true;
        logger.info('Recruitments crawler paused.');
    }

    resume() {
        this.isPaused = false;
        logger.info('Recruitments crawler resumed.');
    }

    stop() {
        this.isStopped = true;
        logger.info('Recruitments crawler stopped.');
    }

    async crawl(locationStr = null) {
        logger.info('Starting Recruitments crawler job.');
        
        try {
            this.currentJobId = await this.createCrawlerJob();
            await this.updateGlobalStatus(true, this.currentJobId);
            
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            this.page = await this.browser.newPage();
            await this.page.setDefaultNavigationTimeout(60000);
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
            
            logger.info('Discovering recruitments...');
            let rawRecruitments = await this.discoverRecruitments(locationStr);

            if (this.isStopped) {
                logger.info('Crawler stopped during discovery phase. Aborting.');
                await this.completeCrawlerJob(this.currentJobId, 0);
                await this.updateGlobalStatus(false, null);
                return 0;
            }

            // Do not artificially cap the raw array length, let the database track progress
            logger.info(`Found ${rawRecruitments.length} raw recruitments available to scan.`);

            // Update estimated total to represent the full discover list
            await query('UPDATE crawler_jobs SET estimated_total = $1 WHERE id = $2', [rawRecruitments.length, this.currentJobId]);

            let totalFetched = 0;
            let currentBatch = 1;

            for (const recruitment of rawRecruitments) {
                if (this.isStopped) break;

                // Watch for external Database stop signals from Admin Dashboard
                try {
                    const statusCheck = await query('SELECT is_running FROM crawler_status WHERE id = 3');
                    if (statusCheck.rows[0] && statusCheck.rows[0].is_running === false) {
                        logger.info('External Stop signal received from database. Aborting CLI Crawler loop.');
                        this.isStopped = true;
                        break;
                    }
                } catch(e) {}

                while (this.isPaused) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                try {
                    await this.updateJobProgress(this.currentJobId, {
                        current_batch: currentBatch++,
                        total_fetched: totalFetched,
                        status: `Processing ${recruitment.post_name.substring(0, 30)}...`
                    });

                    if (await this.isDuplicateRecruitment(recruitment.post_name, recruitment.organization)) {
                        await query('UPDATE crawler_jobs SET duplicate_count = duplicate_count + 1 WHERE id = $1', [this.currentJobId]);
                        // Do NOT increment totalFetched for duplicates, otherwise batch is wasted
                        continue;
                    }

                    // Perform Deep Scrape if deep link exists
                    const detailedRecruitment = await this.fetchDeepRecruitmentDetails(recruitment);

                    const normalized = this.normalizeRecruitment(detailedRecruitment, locationStr || 'Central');
                    const result = await this.saveRecruitment(normalized);

                    if (result === 'duplicate') {
                        totalFetched++;
                        await query('UPDATE crawler_jobs SET duplicate_count = duplicate_count + 1 WHERE id = $1', [this.currentJobId]);
                    } else if (result) {
                        totalFetched++;
                        await query('UPDATE crawler_jobs SET success_count = success_count + 1 WHERE id = $1', [this.currentJobId]);
                        
                        if (totalFetched >= this.batchSize) {
                            logger.info(`Reached requested batch size of ${this.batchSize}. Stopping crawler loop.`);
                            break;
                        }
                    } else {
                        totalFetched++;
                        await query('UPDATE crawler_jobs SET failed_count = failed_count + 1 WHERE id = $1', [this.currentJobId]);
                    }

                    await new Promise(resolve => setTimeout(resolve, this.delayMs));
                } catch (err) {
                    logger.error(`Failed to process recruitment ${recruitment.post_name}:`, err.message);
                    await this.incrementErrorCount(this.currentJobId);
                }
            }

            // Mark job as completed
            await this.completeCrawlerJob(this.currentJobId, totalFetched);
            await this.updateGlobalStatus(false, null);

            logger.info(`Recruitments crawler completed successfully. Total fetched: ${totalFetched}`);
            return totalFetched;

        } catch (error) {
            logger.error('Recruitments Crawler error:', error);
            if (this.currentJobId) await this.failCrawlerJob(this.currentJobId, error.message);
            await this.updateGlobalStatus(false, null, error.message);
            throw error;
        } finally {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
            }
        }
    }

    async discoverRecruitments(locationStr) {
        let recruitments = [];
        const targetState = locationStr ? locationStr.trim() : 'Central';
        
        try {
            switch (targetState) {
                case 'Maharashtra':
                    logger.info('Fetching Majhi Naukri Jobs for Maharashtra...');
                    await this.page.goto('https://majhinaukri.in/maharashtra-govt-jobs/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                    const mnJobs = await this.page.evaluate(() => {
                        const jobs = [];
                        const rows = document.querySelectorAll('tr');
                        for(let tr of rows) {
                            const a = tr.querySelector('a');
                            if(a && a.href) {
                                let txt = a.innerText.trim();
                                if (txt.length < 5) continue;
                                jobs.push({
                                    post_name: txt.substring(0, 255),
                                    source_url: a.href,
                                    deep_link: a.href
                                });
                            }
                        }
                        // Deduplicate and get first 30
                        const unique = [];
                        jobs.forEach(j => { if(!unique.find(x => x.source_url === j.source_url)) unique.push(j); });
                        return unique.slice(0, 30);
                    });

                    recruitments = mnJobs.map(job => ({
                        post_name: job.post_name,
                        organization: 'Maharashtra Govt Dept.',
                        state: 'Maharashtra',
                        qualification: 'Refer to Notification',
                        vacancy_count: 0,
                        selection_process: 'Via Majhi Naukri Site',
                        source_url: job.source_url,
                        source_website: 'majhinaukri.in',
                        deep_link: job.deep_link,
                        application_fee: 'Refer to site'
                    }));
                    logger.info(`Successfully fetched ${recruitments.length} jobs from Majhi Naukri.`);
                    break;

                case 'Uttar Pradesh':
                    logger.info('Fetching Sarkari Result Jobs for UP...');
                    await this.page.goto('https://www.sarkariresult.com/latestjob.php', { waitUntil: 'domcontentloaded', timeout: 30000 });
                    const srJobs = await this.page.evaluate(() => {
                        const jobs = [];
                        const links = document.querySelectorAll('#post a');
                        for(let a of links) {
                            if(a && a.href && a.innerText) {
                                jobs.push({
                                    post_name: a.innerText.trim().substring(0, 255),
                                    source_url: a.href,
                                    deep_link: a.href
                                });
                            }
                        }
                        return jobs.slice(0, 30);
                    });

                    recruitments = srJobs.map(job => ({
                        post_name: job.post_name,
                        organization: 'Uttar Pradesh Govt Dept.',
                        state: 'Uttar Pradesh',
                        qualification: 'Refer to Notification',
                        vacancy_count: 0,
                        selection_process: 'Via Sarkari Result',
                        source_url: job.source_url,
                        source_website: 'sarkariresult.com',
                        deep_link: job.deep_link,
                        application_fee: 'Refer to site'
                    }));
                    logger.info(`Successfully fetched ${recruitments.length} jobs from Sarkari Result.`);
                    break;

                default: // 'Central' or anything else falls back to NCS
                    logger.info('Fetching NCS Government Jobs via JSON API...');
                    const payload = { "isGovernmentJob": true, "sortBy": "RELEVANCE" };
                    if (targetState !== 'Central') payload.states = [targetState];

                    const response = await axios.post('https://betacloud.ncs.gov.in/api/v1/job-posts/search?page=0&size=100', payload, {
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (response.data && response.data.data && Array.isArray(response.data.data.content)) {
                        const scrapedJobs = response.data.data.content;
                        logger.info(`Successfully fetched ${scrapedJobs.length} real jobs from NCS API.`);
                        
                        recruitments = scrapedJobs.map(job => {
                            let education = "Not specified";
                            if (job.educationPreferences && job.educationPreferences.length > 0) {
                                education = job.educationPreferences.map(e => `${e.educationLevel || ''} - ${e.education || ''} ${e.specialization || ''}`.trim()).join(', ');
                            }
                            let actualState = targetState;
                            if (job.isJobAllIndiaOrRemote) actualState = 'All India';

                            return {
                                post_name: (job.jobTitle || 'Government Job').substring(0, 255),
                                organization: job.organizationName || 'Government of India',
                                state: actualState, 
                                qualification: education,
                                vacancy_count: job.noOfVacancies || 0,
                                application_start_date: job.createdAt ? new Date(job.createdAt).toISOString() : null,
                                application_end_date: job.expiredAt ? new Date(job.expiredAt).toISOString() : null,
                                age_limit: `Min: ${job.minAge || 'NA'}, Max: ${job.maxAge || 'NA'}`,
                                selection_process: 'Application Mode: Online (NCS Portal)',
                                source_url: `https://betacloud.ncs.gov.in/job-listing/${job.id || Math.random().toString(36).substring(7)}`, 
                                source_website: 'ncs.gov.in',
                                deep_link: `https://betacloud.ncs.gov.in/job-listing/${job.id || ''}`,
                                application_fee: 'As per NCS portal details', 
                            };
                        });
                    }
                    break;
            }
        } catch (error) {
            logger.error(`Discovery fetching failed (${error.message}).`);
        }
        return recruitments;
    }

    async fetchDeepRecruitmentDetails(recruitment) {
        if (!recruitment.deep_link || !recruitment.deep_link.startsWith('http') || recruitment.source_website === 'ncs.gov.in') return recruitment;
        
        try {
            await this.page.goto(recruitment.deep_link, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            const details = await this.page.evaluate(() => {
                const data = {};
                
                // General Extractor for Fees (works decently on SarkariResult/FreeJobAlert)
                const textNodes = document.body.innerText;
                const feeMatch = textNodes.match(/Application Fee[\s\S]{1,150}/i);
                if (feeMatch) data.application_fee = feeMatch[0].replace(/\n/g, ' ').substring(0, 200);

                // General Extractor for Age Limits
                const ageMatch = textNodes.match(/(Age Limit|Age limit as on)[\s\S]{1,100}/i);
                if (ageMatch) data.age_limit = ageMatch[0].replace(/\n/g, ' ').substring(0, 200);

                // Find Apply Online / Official Website Link
                let applyLinks = Array.from(document.querySelectorAll('a'))
                    .filter(a => a.innerText && (a.innerText.toLowerCase().includes('apply online') || a.innerText.toLowerCase().includes('official website') || a.innerText.toLowerCase().includes('registration')));
                
                if (applyLinks.length === 0) {
                    const rows = Array.from(document.querySelectorAll('tr'));
                    for (let tr of rows) {
                        if (tr.innerText && tr.innerText.toLowerCase().includes('apply online')) {
                            const aTag = tr.querySelector('a');
                            if (aTag && aTag.href) {
                                applyLinks.push(aTag);
                                break;
                            }
                        }
                    }
                }

                if (applyLinks.length > 0) {
                    data.official_notification_link = applyLinks[0].href;
                }

                return data;
            });
            
            if (details.application_fee) recruitment.application_fee = details.application_fee;
            if (details.age_limit) recruitment.age_limit = details.age_limit;
            
            // If we found a direct apply link, store it!
            if (details.official_notification_link) {
                recruitment.official_notification_link = details.official_notification_link;
            }
            
            logger.info(`Deep scraped details for ${recruitment.post_name}`);
        } catch(err) {
            logger.warn(`Failed deep scrape for recruitment link ${recruitment.deep_link}: ${err.message}`);
        }
        
        return recruitment;
    }

    async isDuplicateRecruitment(post_name, organization) {
        try {
            const existCheck = await query(
                'SELECT id FROM recruitments WHERE post_name = $1 AND organization = $2',
                [post_name, organization]
            );
            if (existCheck.rows.length > 0) return true;

            const crawlCheck = await query(
                `SELECT id FROM crawl_results 
                 WHERE type = 'recruitment' 
                 AND json_extract(normalized_data, '$.post_name') = $1 
                 AND json_extract(normalized_data, '$.organization') = $2`,
                [post_name, organization]
            );
            if (crawlCheck.rows.length > 0) return true;
        } catch (e) {
            logger.warn(`isDuplicate check error: ${e.message}`);
        }
        return false;
    }

    async saveRecruitment(data) {
        try {
            if (await this.isDuplicateRecruitment(data.post_name, data.organization)) {
                return 'duplicate';
            }

            // Dynamically assign source_id based on website
            let sourceId = 3; // default NCS
            if (data.source_website === 'majhinaukri.in') sourceId = 4;
            if (data.source_website === 'sarkariresult.com') sourceId = 5;

            await query(
                `INSERT INTO crawl_results (
                    crawl_job_id, source_id, type, raw_data, normalized_data, status
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    this.currentJobId, 
                    sourceId,
                    'recruitment',
                    JSON.stringify(data),
                    JSON.stringify(data),
                    'pending'
                ]
            );

            return true;
        } catch (error) {
            logger.error(`Error saving recruitment ${data.post_name}:`, error.message);
            return false;
        }
    }

    normalizeRecruitment(rawData, state) {
        return Normalizer.normalizeRecruitment(rawData, state);
    }

    /* --- Job Management --- */
    createCrawlerJob() {
        return new Promise((resolve, reject) => {
            const sqlite3 = require('sqlite3');
            const path = require('path');
            const dbPath = path.resolve(__dirname, '../../../database.sqlite');
            const db = new sqlite3.Database(dbPath);
            
            db.run(
                `INSERT INTO crawler_jobs (job_type, status, total_fetched)
                 VALUES (?, 'running', 0)`,
                ['recruitments'],
                function(err) {
                    db.close();
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async updateJobProgress(jobId, data) {
        await query(
            `UPDATE crawler_jobs 
             SET total_fetched = $1, last_updated = CURRENT_TIMESTAMP
             WHERE id = $2`,
             [data.total_fetched, jobId]
        );
    }

    async completeCrawlerJob(jobId, totalSaved) {
        await query(
            `UPDATE crawler_jobs 
             SET status = 'completed', total_fetched = $1, completed_at = CURRENT_TIMESTAMP, last_updated = CURRENT_TIMESTAMP
             WHERE id = $2`,
             [totalSaved, jobId]
        );
    }

    async incrementErrorCount(jobId) {
        await query('UPDATE crawler_jobs SET failed_count = failed_count + 1 WHERE id = $1', [jobId]);
    }

    async failCrawlerJob(jobId, errorMessage) {
        await query(
            `UPDATE crawler_jobs 
             SET status = 'failed', error_message = $1, completed_at = CURRENT_TIMESTAMP, last_updated = CURRENT_TIMESTAMP
             WHERE id = $2`,
             [errorMessage, jobId]
        );
    }

    async updateGlobalStatus(isRunning, jobId, errorMessage = null) {
        let updateQuery = `
            UPDATE crawler_status SET 
            is_running = $1,
            current_job_id = $2,
            last_error = $3,
            updated_at = CURRENT_TIMESTAMP
        `;
        let params = [isRunning ? 1 : 0, jobId, errorMessage];

        if (!isRunning && !errorMessage) {
            updateQuery += `, total_runs = total_runs + 1, total_success = total_success + 1, last_success_at = CURRENT_TIMESTAMP, last_run_at = CURRENT_TIMESTAMP`;
        } else if (!isRunning && errorMessage) {
            updateQuery += `, total_runs = total_runs + 1, total_failures = total_failures + 1, last_run_at = CURRENT_TIMESTAMP`;
        } else if (isRunning) {
            updateQuery += `, last_run_at = CURRENT_TIMESTAMP`;
        }
        
        updateQuery += ` WHERE id = 3`;
        await query(updateQuery, params);
    }

}

module.exports = RecruitmentsCrawler;
