const puppeteer = require('puppeteer');
const { query } = require('../../config/database');
const logger = require('../logger');
const Normalizer = require('../normalizer');

class TendersCrawler {
    constructor() {
        this.delayMs = 1500;
        this.currentJobId = null;
        this.isPaused = false;
        this.isStopped = false;
        this.batchSize = 100; // Increased to 100 to process the full Multi-Page diverse pool (Central + State)
    }

    pause() {
        this.isPaused = true;
        logger.info('Tenders crawler paused.');
    }

    resume() {
        this.isPaused = false;
        logger.info('Tenders crawler resumed.');
    }

    stop() {
        this.isStopped = true;
        logger.info('Tenders crawler stopped.');
    }

    async crawl(locationStr = null) {
        logger.info('Starting Tenders crawler job.');
        
        try {
            this.currentJobId = await this.createCrawlerJob();
            await this.updateGlobalStatus(true, this.currentJobId);
            
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            this.page = await this.browser.newPage();
            await this.page.setDefaultNavigationTimeout(60000);
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
            await this.page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
            
            logger.info('Discovering tenders...');
            let rawTenders = await this.discoverTenders(locationStr);

            if (this.isStopped) {
                logger.info('Crawler stopped during discovery phase. Aborting.');
                await this.completeCrawlerJob(this.currentJobId, 0);
                await this.updateGlobalStatus(false, null);
                return 0;
            }

            // We don't cap rawTenders here. We iterate through them until we save up to batchSize NEW tenders.
            logger.info(`Found ${rawTenders.length} tenders to process.`);

            // Update estimated total
            await query('UPDATE crawler_jobs SET estimated_total = $1 WHERE id = $2', [rawTenders.length, this.currentJobId]);

            let totalSaved = 0;
            let totalProcessed = 0;
            let currentBatch = 1;

            for (const tender of rawTenders) {
                if (this.isStopped) break;

                // Watch for external Database stop signals from Admin Dashboard
                try {
                    const statusCheck = await query('SELECT is_running FROM crawler_status WHERE id = 1');
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
                        total_fetched: totalSaved,
                        status: `Processing ${tender.tender_name.substring(0, 30)}...`
                    });

                    // Avoid expensive Deep Scrape if already duplicate
                    if (await this.isDuplicateTender(tender.tender_name, tender.tender_id)) {
                        totalProcessed++;
                        await query('UPDATE crawler_jobs SET duplicate_count = duplicate_count + 1 WHERE id = $1', [this.currentJobId]);
                        continue;
                    }

                    // Perform Deep Scrape since we need it!
                    const detailedTender = await this.fetchDeepTenderDetails(tender);

                    const normalized = this.normalizeTender(detailedTender, locationStr || 'Central');
                    const result = await this.saveTender(normalized);

                    totalProcessed++;
                    
                    if (result === 'duplicate') {
                        // Edge case fallback
                        await query('UPDATE crawler_jobs SET duplicate_count = duplicate_count + 1 WHERE id = $1', [this.currentJobId]);
                    } else if (result) {
                        totalSaved++;
                        await query('UPDATE crawler_jobs SET success_count = success_count + 1 WHERE id = $1', [this.currentJobId]);
                        
                        if (totalSaved >= this.batchSize) {
                            logger.info(`Reached requested batch size of ${this.batchSize} NEW tenders. Stopping crawler loop.`);
                            break;
                        }
                    } else {
                        await query('UPDATE crawler_jobs SET failed_count = failed_count + 1 WHERE id = $1', [this.currentJobId]);
                    }

                    await new Promise(resolve => setTimeout(resolve, this.delayMs));
                } catch (err) {
                    logger.error(`Failed to process tender ${tender.tender_name}:`, err.message);
                    await this.incrementErrorCount(this.currentJobId);
                }
            }

            // Mark job as completed
            await this.completeCrawlerJob(this.currentJobId, totalSaved);
            await this.updateGlobalStatus(false, null);

            logger.info(`Tenders crawler completed successfully. Total processed: ${totalProcessed}. New saved: ${totalSaved}`);
            return totalSaved;

        } catch (error) {
            logger.error('Tenders Crawler error:', error);
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

    async discoverTenders() {
        const tenders = [];

        try {
            logger.info('Puppeteer: navigating to eProcure Latest Tenders directly avoiding Captcha blocks...');
            
            // Bypass the Captcha-blocked search entirely by scraping both Central (cpppdata) and State (mmpdata) global feeds across multiple pages.
            const targetFeeds = ['cpppdata', 'mmpdata'];
            
            for (const feed of targetFeeds) {
                for (let pageNum = 1; pageNum <= 6; pageNum++) {
                    const targetUrl = `https://eprocure.gov.in/cppp/latestactivetendersnew/${feed}?page=${pageNum}`;
                    logger.info(`Puppeteer: Scraping Feed ${feed} Page ${pageNum}...`);
                    
                    const response = await this.page.goto(targetUrl, {
                        waitUntil: 'networkidle2',
                        timeout: 45000
                    });
                    
                    if (response.status() === 404 || response.status() === 403) {
                         logger.warn(`eProcure returned status ${response.status()} for ${feed}. Escaping...`);
                         continue;
                    }

                    try {
                        await this.page.waitForSelector('table.list_table', { timeout: 10000 });

                        const scrapedRows = await this.page.evaluate(() => {
                            return Array.from(document.querySelectorAll('table.list_table tr')).map(row => {
                                const tds = Array.from(row.querySelectorAll('td'));
                                if (tds.length < 6) return null;
                                
                                const aTag = row.querySelector('a');
                                const link = aTag ? aTag.href : null;
                                
                                return {
                                    cells: tds.map(td => td.innerText.trim()),
                                    link: link
                                };
                            }).filter(Boolean);
                        });
                        
                        scrapedRows.forEach(row => {
                            const titleRaw = row.cells[4] || '';
                            const titleParts = titleRaw.split('\n').map(s => s.trim());
                            
                            // eProcure displays: 1. Title, 2. Reference No
                            const tName = titleParts[0] || 'Unknown';
                            const tRef = titleParts.length > 1 ? titleParts[titleParts.length - 1] : tName;

                            tenders.push({
                                tender_id: tRef,
                                tender_name: tName,
                                department: row.cells[5],
                                closing_date: row.cells[2],
                                source_website: 'https://eprocure.gov.in',
                                source_url: `https://eprocure.gov.in/cppp/tendersearch#${tRef}`, // Append ID to satisfy unique constraint
                                deep_link: row.link // Save the deep hyperlink for Deep Scraping
                            });
                        });
                    } catch (e) {
                         logger.warn(`Puppeteer: table.list_table not found on ${feed} page ${pageNum}. Skipping...`);
                    }
                }
            }
            logger.info(`Puppeteer pooled ${tenders.length} diverse tenders globally.`);

        } catch (error) {
            logger.error('Puppeteer eProcure discovery error:', error.message);
        }

        return tenders;
    }

    async fetchDeepTenderDetails(tender) {
        if (!tender.deep_link || !tender.deep_link.startsWith('http')) return tender;
        
        try {
            await this.page.goto(tender.deep_link, { waitUntil: 'domcontentloaded', timeout: 35000 });
            
            const details = await this.page.evaluate(() => {
                const data = {};
                const rows = document.querySelectorAll('tr');
                rows.forEach(row => {
                    const cells = Array.from(row.querySelectorAll('td, th')).filter(c => c.innerText.trim());
                    if (cells.length === 2) {
                        const key = cells[0].innerText.trim().replace(/:\s*$/, '').replace(/\s+/g, ' ');
                        let val = cells[1].innerText.trim();
                        if (cells[1].querySelector('a')) val = cells[1].querySelector('a').href;
                        if(!data[key]) data[key] = val;
                    } else if (cells.length === 4) {
                        const key1 = cells[0].innerText.trim().replace(/:\s*$/, '').replace(/\s+/g, ' ');
                        let val1 = cells[1].innerText.trim();
                        if (cells[1].querySelector('a')) val1 = cells[1].querySelector('a').href;
                        if(!data[key1]) data[key1] = val1;
                        
                        const key2 = cells[2].innerText.trim().replace(/:\s*$/, '').replace(/\s+/g, ' ');
                        let val2 = cells[3].innerText.trim();
                        if (cells[3].querySelector('a')) val2 = cells[3].querySelector('a').href;
                        if(!data[key2]) data[key2] = val2;
                    }
                });
                return data;
            });
            
            // Map the parsed dict to specific properties requested by User
            if (details['Work Description']) tender.description = details['Work Description'];
            else if (details['Title']) tender.description = details['Title'];

            if (details['Tender Type'] || details['Tender Category']) {
                 const typeArr = [];
                 if(details['Tender Type']) typeArr.push(details['Tender Type']);
                 if(details['Tender Category']) typeArr.push(details['Tender Category']);
                 tender.tender_type = typeArr.join(' - ');
            }
            
            if (details['Location']) tender.location = details['Location'];
            if (details['Published Date']) tender.published_date = details['Published Date'];
            if (details['Bid Opening Date']) tender.opening_date = details['Bid Opening Date'];
            if (details['Document Download / Sale End Date']) tender.closing_date = details['Document Download / Sale End Date'];
            
            // Build a sophisticated Fee/Financial string
            let financialStr = '';
            if (details['Tender Value in ₹'] && details['Tender Value in ₹'] !== 'NA') {
                 financialStr += `Tender Value: ₹${details['Tender Value in ₹']}`;
            }
            if (details['EMD Amount in ₹'] && details['EMD Amount in ₹'] !== 'NA') {
                 financialStr += (financialStr ? ' | ' : '') + `EMD Amount: ₹${details['EMD Amount in ₹']}`;
            }
            if (details['Tender Fee in ₹'] && details['Tender Fee in ₹'] !== 'NA') {
                 financialStr += (financialStr ? ' | ' : '') + `Tender Fee: ₹${details['Tender Fee in ₹']}`;
            }
            if (details['Payment Mode']) {
                 financialStr += (financialStr ? ' | ' : '') + `Payment Mode: ${details['Payment Mode']}`;
            }
            if (financialStr) tender.fee_details = financialStr;

            // Extract Documents required/Cover Details
            if (details['Cover Details, No. Of Covers - 2'] || details['Cover Details, No. Of Covers - 1']) {
                 tender.documents_required = 'Standard Technical & Financial Covers required. Please view official document.';
            }

            // Users preferred the official web portal over the local cached HTML mirror
            // Keeping the original source_url which points to 'https://eprocure.gov.in/cppp/tendersearch'
            // We append the tender_id as a hash to satisfy SQLite's UNIQUE(source_url) constraint
            tender.source_url = `https://eprocure.gov.in/cppp/tendersearch#${tender.tender_id}`;
            
            tender.extended_details = JSON.stringify(details);

            logger.info(`Puppeteer Deep Scraped: Extracted value/EMD/Category for ${tender.tender_id}`);
            
        } catch (err) {
            logger.warn(`Failed to deep scrape url ${tender.deep_link} for ${tender.tender_id}: ${err.message}`);
        }
        return tender;
    }

    async isDuplicateTender(tender_name, tender_id) {
        const idToCheck = tender_id && tender_id !== 'Unknown' ? tender_id : tender_name;
        
        try {
            const existCheck = await query(
                'SELECT id FROM tenders WHERE (tender_name = ? OR tender_id = ?)',
                [tender_name, idToCheck]
            );
            if (existCheck.rows.length > 0) return true;

            const crawlCheck = await query(
                `SELECT id FROM crawl_results 
                 WHERE type = 'tender' 
                 AND (json_extract(normalized_data, '$.tender_name') = ? 
                      OR json_extract(normalized_data, '$.tender_id') = ?
                      OR normalized_data LIKE '%' || ? || '%' 
                      OR normalized_data LIKE '%' || ? || '%')`,
                [tender_name, idToCheck, `"tender_name":"${tender_name}"`, `"tender_id":"${idToCheck}"`]
            );
            if (crawlCheck.rows.length > 0) return true;
        } catch (e) {
            logger.warn(`isDuplicate check error: ${e.message}`);
        }
        return false;
    }

    async saveTender(data) {
        try {
            if (await this.isDuplicateTender(data.tender_name, data.tender_id)) {
                return 'duplicate';
            }

            // Insert into pending reviews
            await query(
                `INSERT INTO crawl_results (
                    crawl_job_id, source_id, type, raw_data, normalized_data, status
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    this.currentJobId, 
                    2, // Assuming 2 is eProcure.gov.in
                    'tender',
                    JSON.stringify(data),
                    JSON.stringify(data),
                    'pending'
                ]
            );

            return true;
        } catch (error) {
            logger.error(`Error saving tender ${data.tender_name}:`, error.message);
            return false;
        }
    }

    normalizeTender(rawData, state) {
        return Normalizer.normalizeTender(rawData, state);
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
                ['tenders'],
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
             SET total_fetched = ?, last_updated = CURRENT_TIMESTAMP
             WHERE id = ?`,
             [data.total_fetched, jobId]
        );
    }

    async completeCrawlerJob(jobId, totalSaved) {
        await query(
            `UPDATE crawler_jobs 
             SET status = 'completed', total_fetched = ?, completed_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
             [totalSaved, jobId]
        );
    }

    async incrementErrorCount(jobId) {
        await query('UPDATE crawler_jobs SET failed_count = failed_count + 1 WHERE id = ?', [jobId]);
    }

    async failCrawlerJob(jobId, errorMessage) {
        await query(
            `UPDATE crawler_jobs 
             SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
             [errorMessage, jobId]
        );
    }

    async updateGlobalStatus(isRunning, jobId, errorMessage = null) {
        // First get current stats if completing a run
        let updateQuery = `
            UPDATE crawler_status SET 
            is_running = ?,
            current_job_id = ?,
            last_error = ?,
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
        
        updateQuery += ` WHERE id = 2`;
        await query(updateQuery, params);
    }

    /* --- Fallback List --- */
    getFallbackTenders() {
        const fallback = [];
        for (let i = 1; i <= 60; i++) {
            fallback.push({
                tender_name: `Construction of Rural Road Project Phase ${i}`,
                tender_id: `TEND-2026-RR-${1000 + i}`,
                reference_number: `REF/PWD/26/${500 + i}`,
                department: i % 2 === 0 ? 'Public Works Department (PWD)' : 'Rural Development Agency',
                ministry: 'Road Transport and Highways',
                state: 'Maharashtra',
                tender_type: 'Open Tender',
                closing_date: `2026-04-${(i % 28) + 1}`,
                description: `This tender invites bids for the construction, leveling, and asphalt paving of major district rural connector roads under Phase ${i}.`,
                source_url: 'https://eprocure.gov.in',
                source_website: 'eprocure.gov.in'
            });
        }
        return fallback;
    }
}

module.exports = TendersCrawler;
