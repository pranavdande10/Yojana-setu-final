const BaseCrawler = require('./BaseCrawler');
const logger = require('../logger');
const { query } = require('../../config/database');
const puppeteer = require('puppeteer');
require('dotenv').config();

/**
 * Enhanced SchemesCrawler with MyScheme.gov.in API Integration
 * Supports batch processing, pause/resume, and rich data extraction
 */
class SchemesCrawler extends BaseCrawler {
    constructor(source) {
        // Fallback for manual trigger if source not provided
        super(source || { id: 1, type: 'schemes', name: 'MyScheme' });
        this.apiBase = process.env.MYSCHEME_API_BASE;
        this.apiKey = process.env.MYSCHEME_API_KEY;
        this.batchSize = parseInt(process.env.CRAWLER_BATCH_SIZE) || 50;
        this.delayMs = parseInt(process.env.CRAWLER_DELAY_MS) || 2000;

        // Crawler state
        this.isPaused = false;
        this.isStopped = false;
        this.currentJobId = null;
        this.currentJobId = null;
    }

    /**
     * Pause the crawler
     */
    pause() {
        this.isPaused = true;
        logger.info('Crawler pause requested');
    }

    /**
     * Resume the crawler
     */
    resume() {
        this.isPaused = false;
        logger.info('Crawler resume requested');
    }

    /**
     * Stop the crawler
     */
    stop() {
        this.isStopped = true;
        logger.info('Crawler stop requested');
    }

    /**
     * Main crawl method with batch processing
     */
    async execute(locationStr = null) {
        return await this.crawl(locationStr);
    }

    /**
     * Internal crawl method
     */
    async crawl(locationStr = null) {
        try {
            logger.info('Starting MyScheme crawler with Puppeteer discovery strategy');

            // Create crawler job
            this.currentJobId = await this.createCrawlerJob();

            // Update global status
            await this.updateGlobalStatus(true, this.currentJobId);

            // Step 1: Discover Slugs
            logger.info(`Discovering slugs for location: ${locationStr || 'All'}...`);
            let slugs = await this.discoverSlugs(locationStr);

            if (this.isStopped) {
                logger.info('Crawler stopped during discovery phase. Aborting.');
                await this.completeCrawlerJob(this.currentJobId, 0);
                await this.updateGlobalStatus(false, null);
                return 0;
            }

            if (slugs.length < (this.batchSize || 50)) {
                logger.warn(`Discovery returned only ${slugs.length} schemes. Appending fallback list to reach batch size.`);
                const fallback = [
                    // PM Schemes
                    'pmkvy', 'pmsby', 'pmjjby', 'apy', 'pmegp', 'pmjdy', 'pmay', 
                    'pmksy', 'pmmy', 'pm-kisan', 'pm-svp', 'pmfme', 'pmsvanidhi',
                    'pm-matru-vandana-yojana', 'pm-poshan', 'pm-shram-yogi-maandhan',
                    'pm-kisan-maan-dhan-yojana', 'pm-awas-yojana-gramin', 
                    
                    // State Government Schemes
                    'ladli-behna-yojana', 'mukhyamantri-kanya-vivah-yojana', 'yuvashree',
                    'mahatma-jyotirao-phule-karz-maafi', 'kalyana-lakshmi', 'rythu-bandhu',
                    'mukhyamantri-seekho-kamao-yojana', 'kanyashree-prakalpa', 'swasthya-sathi',
                    'krushak-assistance-for-livelihood-and-income-augmentation', 'jagananna-vidya-deevena',
                    'ySR-raithu-bharosa', 'bhavantar-bharpai-yojana', 'mukhya-mantri-parivar-samriddhi-yojana',
                    'dr-ysr-aarogyasri', 'ammavodi', 'chief-minister-solar-pump-yojana', 'shravan-bal-seva-rajya-nivrutti-vetan-yojana',
                    
                    // Specific prominent states
                    'magel-tyala-shet-tale', 'sanjay-gandhi-niradhar-anudan-yojana', 'baliraja-chetana-abhiyan',
                    'mukhyamantri-solar-pump-yojana', 'biju-swasthya-kalyan-yojana', 'madhubabu-pension-yojana',
                    'gopabandhu-sambadika-swasthya-bima-yojana', 'kalia-scheme', 'mo-sarkar',

                    // Startup & Business
                    'startup-india', 'standup-india', 'make-in-india', 'digital-india',
                    'mudra-yojana', 'cgtmse', 'psb-loans-in-59-minutes',
                    
                    // Women & Children
                    'sukanya-samriddhi-yojana', 'beti-bachao-beti-padhao', 
                    'udayaan-care', 'mahila-e-haat', 'one-stop-centre-scheme',
                    'women-helpline-scheme', 'working-women-hostel',
                    
                    // Education & Students
                    'vidyanjali', 'mid-day-meal', 'national-means-cum-merit-scholarship',
                    'central-sector-scheme-of-scholarships', 'udaan', 'pragati-scholarship',
                    'saksham-scholarship', 'pm-yayasvi', 'nos-swd', 'post-dis',
                    
                    // Agriculture & Farmers
                    'kisan-credit-card', 'soil-health-card', 'paramparagat-krishi-vikas-yojana',
                    'national-agriculture-market', 'pradhan-mantri-faisal-bima-yojana',
                    
                    // Health & Insurance
                    'ayushman-bharat', 'national-health-mission', 'esic', 'epfo',
                    'central-government-health-scheme', 'aww', 'ni-kshay-poshan-yojana',
                    
                    // Senior Citizens & Pension
                    'national-social-assistance-programme', 'atal-vayo-abhyuday-yojana',
                    'varishtha-pension-bima-yojana', 'pradhan-mantri-vaya-vandana-yojana',
                    
                    // Housing & Infrastructure
                    'swachh-bharat-mission', 'jal-jeevan-mission', 'hriday', 'amrut',
                    'smart-cities-mission', 'saubhagya', 'ujala', 'ujjwala-yojana',
                    
                    // Miscellaneous
                    'kisan-vikas-patra', 'national-savings-certificate', 'public-provident-fund',
                    'senior-citizen-savings-scheme', 'post-office-monthly-income-scheme',
                    'sl', 'sui', 'rmewf', 'rmewf-vocational-training', 'nps-tsep'
                ];
                slugs = [...new Set([...slugs, ...fallback])];
            }

            logger.info(`Found ${slugs.length} schemes to process.`);

            // Update estimated total
            await query('UPDATE crawler_jobs SET estimated_total = $1 WHERE id = $2', [slugs.length, this.currentJobId]);

            // Step 2: Extract Data
            let totalFetched = 0;
            let currentBatch = 1;

            for (const slug of slugs) {
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
                    // Quick DB check to avoid unnecessary API calls
                    const existingApproved = await query('SELECT id FROM schemes WHERE slug = $1 LIMIT 1', [slug]);
                    const existingPending = await query("SELECT id FROM crawl_results WHERE type='scheme' AND json_extract(normalized_data, '$.slug') = $1 LIMIT 1", [slug]);

                    if (existingApproved.rows.length > 0 || existingPending.rows.length > 0) {
                        // Skip without incrementing totalFetched so crawler hunts for actual new items
                        await query('UPDATE crawler_jobs SET duplicate_count = duplicate_count + 1 WHERE id = $1', [this.currentJobId]);
                        // Update current_batch just to show progress visually
                        await this.updateJobProgress(this.currentJobId, {
                            current_batch: currentBatch++,
                            total_fetched: totalFetched,
                            status: `Skipping duplicate ${slug}`
                        });
                        continue;
                    }

                    // Update job status
                    await this.updateJobProgress(this.currentJobId, {
                        current_batch: currentBatch++,
                        total_fetched: totalFetched,
                        status: `Fetching ${slug}`
                    });

                    // Fetch and save
                    const result = await this.fetchAndSaveScheme(slug);
                    
                    if (result === 'duplicate') {
                        await query('UPDATE crawler_jobs SET duplicate_count = duplicate_count + 1 WHERE id = $1', [this.currentJobId]);
                        // Don't increment totalFetched for duplicates, so batch size fills up with NEW schemes!
                    } else if (result) {
                        await query('UPDATE crawler_jobs SET success_count = success_count + 1 WHERE id = $1', [this.currentJobId]);
                        totalFetched++; // Only increment for newly saved schemes!
                    } else {
                        await query('UPDATE crawler_jobs SET failed_count = failed_count + 1 WHERE id = $1', [this.currentJobId]);
                        totalFetched++; // Count failures against the batch size so it doesn't loop forever if everything fails
                    }

                    // Stop if we reached the batch size requested by the user
                    if (totalFetched >= (this.batchSize || 50)) {
                        logger.info(`Reached requested batch size of ${totalFetched}. Stopping crawler loop.`);
                        break;
                    }

                    // Respectful delay
                    await new Promise(resolve => setTimeout(resolve, this.delayMs || 500));

                } catch (err) {
                    logger.error(`Failed to fetch scheme ${slug}:`, err.message);
                    await this.incrementErrorCount(this.currentJobId);
                }
            }

            // Mark job as completed
            await this.completeCrawlerJob(this.currentJobId, totalFetched);

            // Update global status
            await this.updateGlobalStatus(false, null);

            logger.info(`Crawler completed successfully. Total schemes fetched: ${totalFetched}`);

            return totalFetched;

        } catch (error) {
            logger.error('Crawler error:', error);

            if (this.currentJobId) {
                await this.failCrawlerJob(this.currentJobId, error.message);
            }

            await this.updateGlobalStatus(false, null, error.message);

            throw error;
        }
    }

    async discoverSlugs(locationStr = null) {
        logger.info(`Attempting slug discovery. Location: ${locationStr || 'All'}`);

        // ── Strategy 1: API pagination (fastest, most complete) ──────────
        const apiSlugs = await this.discoverSlugsViaAPI(locationStr);
        if (apiSlugs.length > 0) {
            logger.info(`API pagination found ${apiSlugs.length} slugs`);
            return apiSlugs;
        }

        logger.warn(`API pagination returned only ${apiSlugs.length} slugs — trying Puppeteer...`);

        // ── Strategy 2: Puppeteer with Load More button clicking ──────────
        const puppeteerSlugs = await this.discoverSlugsViaPuppeteer(locationStr);
        if (puppeteerSlugs.length > 0) {
            // Merge both results
            const merged = new Set([...apiSlugs, ...puppeteerSlugs]);
            logger.info(`Puppeteer found ${puppeteerSlugs.length} slugs. Combined total: ${merged.size}`);
            return Array.from(merged);
        }

        logger.warn('All discovery strategies failed — using hardcoded fallback list');
        return [];
    }

    // Discover slugs by calling the API with limit/offset pagination
    async discoverSlugsViaAPI(locationStr = null) {
        const slugs = new Set();
        const size = 100;
        let from = 0;
        let consecutiveFailures = 0;

        logger.info('Paginating through MyScheme Search API...');
        
        const keyword = locationStr ? encodeURIComponent(locationStr) : '';

        while (true) {
            if (this.isStopped) return Array.from(slugs);
            while (this.isPaused) {
                if (this.isStopped) return Array.from(slugs);
                await new Promise(r => setTimeout(r, 1000));
            }

            try {
                const url = `https://api.myscheme.gov.in/search/v6/schemes?lang=en&q=%5B%5D&keyword=${keyword}&sort=&from=${from}&size=${size}`;
                const response = await this.fetchWithRetry(url, {
                    headers: {
                        'x-api-key': this.apiKey || 'tYTy5eEhlu9rFjyxuCr7ra7ACp4dv1RH8gWuHTDc',
                        'accept': 'application/json, text/plain, */*',
                        'origin': 'https://www.myscheme.gov.in'
                    },
                    timeout: 15000
                });

                const data = response?.data;

                // Handle search response
                if (data?.data?.hits && Array.isArray(data.data.hits.items)) {
                    const batch = data.data.hits.items;
                    if (batch.length === 0) break; // No more results

                    batch.forEach(scheme => {
                        if (scheme.fields?.slug) slugs.add(scheme.fields.slug);
                    });

                    logger.info(`API from=${from}: got ${batch.length} schemes (total so far: ${slugs.size})`);

                    if (batch.length < size) break; // Last page
                    from += size;
                    consecutiveFailures = 0;

                } else {
                    consecutiveFailures++;
                    if (consecutiveFailures >= 3) break;
                    from += size;
                }

                await new Promise(r => setTimeout(r, 500));

            } catch (err) {
                logger.warn(`API pagination error at from=${from}: ${err.message}`);
                consecutiveFailures++;
                if (consecutiveFailures >= 3) break;
                from += size;
            }
        }

        return Array.from(slugs);
    }

    // Discover slugs via Puppeteer — clicks "Load More" button repeatedly
    async discoverSlugsViaPuppeteer(locationStr = null) {
        let browser;
        const slugs = new Set();

        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setDefaultNavigationTimeout(60000);

            let targetUrl = 'https://www.myscheme.gov.in/search';
            if (locationStr) {
                targetUrl = `https://www.myscheme.gov.in/search?q=${encodeURIComponent(locationStr)}`;
            }
            logger.info(`Puppeteer: navigating to search page: ${targetUrl}...`);
            await page.goto(targetUrl, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            // Wait for initial schemes to load
            try {
                await page.waitForSelector('a[href^="/schemes/"]', { timeout: 15000 });
            } catch (e) {
                logger.warn('Puppeteer: no scheme links found on page');
                return [];
            }

            // Click "Load More" / "Show More" button repeatedly
            let clickCount = 0;
            const maxClicks = 100; // Safety cap

            while (clickCount < maxClicks) {
                if (this.isStopped) return Array.from(slugs);
                while (this.isPaused) {
                    if (this.isStopped) return Array.from(slugs);
                    await new Promise(r => setTimeout(r, 1000));
                }

                // Collect current slugs
                const hrefs = await page.evaluate(() =>
                    Array.from(document.querySelectorAll('a[href^="/schemes/"]'))
                        .map(a => a.getAttribute('href'))
                );
                hrefs.forEach(href => {
                    const slug = href?.split('/')?.[2];
                    if (slug && !slug.includes('#') && !slug.includes('?')) slugs.add(slug);
                });

                // Try to find and click a "Load More" button
                const clicked = await page.evaluate(() => {
                    // Common button texts on Indian govt sites
                    const buttonTexts = ['load more', 'show more', 'view more', 'more schemes', 'next'];
                    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
                    const btn = buttons.find(b =>
                        buttonTexts.some(text => b.textContent.trim().toLowerCase().includes(text))
                    );
                    if (btn) { btn.click(); return true; }
                    return false;
                });

                if (!clicked) {
                    // No button — try scrolling to bottom to trigger lazy load
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await new Promise(r => setTimeout(r, 2500));

                    const newHrefs = await page.evaluate(() =>
                        Array.from(document.querySelectorAll('a[href^="/schemes/"]'))
                            .map(a => a.getAttribute('href'))
                    );
                    const prevSize = slugs.size;
                    newHrefs.forEach(href => {
                        const slug = href?.split('/')?.[2];
                        if (slug && !slug.includes('#') && !slug.includes('?')) slugs.add(slug);
                    });

                    // If scrolling added nothing new, we're done
                    if (slugs.size === prevSize) {
                        logger.info(`Puppeteer: no new schemes after scroll — stopping at ${slugs.size} slugs`);
                        break;
                    }
                } else {
                    await new Promise(r => setTimeout(r, 2500));
                    clickCount++;
                    logger.info(`Puppeteer: clicked Load More (${clickCount}), slugs so far: ${slugs.size}`);
                }
            }

        } catch (error) {
            logger.error('Puppeteer discovery error:', error.message);
        } finally {
            if (browser) await browser.close();
        }

        return Array.from(slugs);
    }

    async fetchAndSaveScheme(slug) {
        const url = `${this.apiBase}?slug=${slug}&lang=en`;
        const headers = {
            'x-api-key': this.apiKey || 'tYTy5eEhlu9rFjyxuCr7ra7ACp4dv1RH8gWuHTDc', // Fallback to known working key
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };

        const response = await this.fetchWithRetry(url, { headers });

        if (response.status === 200 && response.data && response.data.statusCode === 200 && response.data.data) {
            let schemeData = response.data.data;
            
            // Handle paginated list endpoint returning an array of 1 element
            if (Array.isArray(schemeData)) {
                schemeData = schemeData[0];
            }

            if (!schemeData) {
                logger.warn(`API returned 200 but no scheme found for ${slug}`);
                return false;
            }

            // Normalize
            const normalized = this.normalizeScheme(schemeData);

            if (normalized) {
                // Save to DB
                const saved = await this.saveScheme(normalized);
                if (saved === 'duplicate') {
                    return 'duplicate';
                }
                logger.info(`Successfully processed scheme: ${slug}`);
                return true;
            }
        } else {
            logger.warn(`Failed to fetch scheme ${slug}. Status: ${response.status}, API Status: ${response.data?.statusCode}`);
        }
        return false;
    }

    async processScheme(rawScheme) {
        try {
            // Enrich with additional data
            const enrichedScheme = await this.enrichSchemeData(rawScheme);

            // Normalize to database format
            const normalizedScheme = this.normalizeScheme(enrichedScheme);

            // Save to database
            const saved = await this.saveScheme(normalizedScheme);

            if (saved === 'duplicate') {
                logger.info(`Scheme ${rawScheme.slug} is a duplicate.`);
            } else {
                logger.info(`Successfully processed scheme: ${rawScheme.slug}`);
            }
            return saved;
        } catch (error) {
            logger.error(`Failed to process scheme ${rawScheme.slug}: ${error.message}`);
            throw error;
        }
    }

    async enrichSchemeData(scheme) {
        const schemeId = scheme._id;

        try {
            // Fetch additional data in parallel
            const [documents, faqs, channels] = await Promise.all([
                this.fetchSchemeDocuments(schemeId).catch(() => null),
                this.fetchSchemeFAQs(schemeId).catch(() => null),
                this.fetchApplicationChannels(schemeId).catch(() => null)
            ]);

            return {
                ...scheme,
                documents: documents?.data || [],
                faqs: faqs?.data || [],
                applicationChannels: channels?.data || []
            };

        } catch (error) {
            logger.warn(`Could not enrich scheme ${schemeId}: `, error.message);
            return scheme;
        }
    }

    /**
     * Fetch scheme documents
     */
    async fetchSchemeDocuments(schemeId) {
        const url = `${this.apiBase}/${schemeId}/documents?lang=en`;
        return await this.fetchWithRetry(url, {
            headers: { 'x-api-key': this.apiKey }
        });
    }

    /**
     * Fetch scheme FAQs
     */
    async fetchSchemeFAQs(schemeId) {
        const url = `${this.apiBase}/${schemeId}/faqs?lang=en`;
        return await this.fetchWithRetry(url, {
            headers: { 'x-api-key': this.apiKey }
        });
    }

    /**
     * Fetch application channels
     */
    async fetchApplicationChannels(schemeId) {
        const url = `${this.apiBase}/${schemeId}/applicationchannel`;
        return await this.fetchWithRetry(url, {
            headers: { 'x-api-key': this.apiKey }
        });
    }

    /**
     * Normalize scheme data to database format
     */
    normalizeScheme(rawScheme) {
        const langData = rawScheme.en || rawScheme.hi || {};
        const basicDetails = langData.basicDetails || {};
        const schemeContent = langData.schemeContent || {};
        const eligibility = langData.eligibilityCriteria || {};

        return {
            external_id: rawScheme._id,
            slug: rawScheme.slug,

            // Basic info
            title: basicDetails.schemeName || 'Untitled Scheme',
            short_title: basicDetails.schemeShortTitle,
            description: schemeContent.briefDescription,
            detailed_description: schemeContent.detailedDescription,

            // Organization
            ministry: basicDetails.nodalMinistryName?.label,
            department: basicDetails.nodalDepartmentName?.label,
            category: basicDetails.schemeCategory?.[0]?.label,
            sub_category: basicDetails.schemeSubCategory?.map(s => s.label) || [],
            level: basicDetails.level?.label,
            scheme_type: basicDetails.schemeType?.label,

            // Rich content (JSONB)
            benefits: schemeContent.benefits || [],
            eligibility: eligibility.eligibilityDescription || [],
            application_process: langData.applicationProcess || [],
            documents_required: rawScheme.documents || [],
            faqs: rawScheme.faqs || [],

            // Metadata
            tags: basicDetails.tags || [],
            target_beneficiaries: basicDetails.targetBeneficiaries?.map(t => t.label) || [],

            // Dates
            open_date: basicDetails.schemeOpenDate,
            close_date: basicDetails.schemeCloseDate,

            // Contact & links
            application_url: rawScheme.applicationChannels?.[0]?.applicationUrl,
            contact_info: this.extractContactInfo(langData),
            scheme_references: schemeContent.references || [],

            // Geographic coverage
            applicable_states: this.determineStates(basicDetails),
            state: this.determineStates(basicDetails)[0], // Use first state for search/filter

            // Multilingual
            lang: 'en',
            translations: this.extractTranslations(rawScheme),

            // Raw data for reference
            raw_data: rawScheme,

            // Status
            status: 'pending'  // Requires admin approval
        };
    }

    /**
     * Extract contact information
     */
    extractContactInfo(langData) {
        const contacts = {};

        // Extract from various possible locations
        if (langData.schemeContent?.contactInfo) {
            return langData.schemeContent.contactInfo;
        }

        return contacts;
    }

    /**
     * Determine applicable states
     */
    determineStates(basicDetails) {
        if (basicDetails.level?.value === 'central') {
            return ['All India'];
        }

        if (basicDetails.state) {
            return Array.isArray(basicDetails.state)
                ? basicDetails.state.map(s => typeof s === 'object' && s !== null ? (s.label || s.value) : s)
                : [typeof basicDetails.state === 'object' && basicDetails.state !== null ? (basicDetails.state.label || basicDetails.state.value) : basicDetails.state];
        }

        return ['All India'];
    }

    /**
     * Extract translations
     */
    extractTranslations(rawScheme) {
        const translations = {};

        // Extract all language versions except English
        Object.keys(rawScheme).forEach(key => {
            if (key !== 'en' && key !== '_id' && key !== 'slug' && typeof rawScheme[key] === 'object') {
                translations[key] = rawScheme[key];
            }
        });

        return translations;
    }

    /**
     * Save scheme to database (staging)
     */
    async saveScheme(scheme) {
        try {
            // Check if scheme already exists in approved schemes
            const existing = await query(
                'SELECT id FROM schemes WHERE external_id = $1',
                [scheme.external_id]
            );

            if (existing.rows.length > 0) {
                logger.info(`Scheme ${scheme.external_id} already exists, skipping`);
                return 'duplicate';
            }

            // Check if it already exists in pending review staging table
            const pending = await query(
                "SELECT id FROM crawl_results WHERE type = 'scheme' AND json_extract(normalized_data, '$.external_id') = $1 AND status = 'pending'",
                [scheme.external_id]
            );

            if (pending.rows.length > 0) {
                logger.info(`Scheme ${scheme.external_id} is already in pending reviews, skipping`);
                return 'duplicate';
            }

            // Insert into staging (crawl_results)
            const CrawlResultModel = require('../../models/CrawlResult');
            await CrawlResultModel.create({
                crawl_job_id: this.currentJobId,
                source_id: this.source.id,
                type: 'scheme',
                raw_data: scheme.raw_data,
                normalized_data: scheme
            });

            logger.info(`Saved scheme to pending: ${scheme.title}`);
            return 'success';

        } catch (error) {
            logger.error(`Failed to save scheme ${scheme.external_id}: `, error);
            throw error;
        }
    }

    // ============================================
    // Crawler Job Management
    // ============================================

    async createCrawlerJob() {
        const result = await query(`
            INSERT INTO crawler_jobs(job_type, status, batch_size)
            VALUES($1, $2, $3)
        `, ['schemes', 'running', this.batchSize]);

        if (!result.lastID) {
            throw new Error('Failed to create crawler job — no lastID returned');
        }
        return result.lastID;
    }

    async updateJobProgress(jobId, progress) {
        await query(`
            UPDATE crawler_jobs
            SET current_batch = $1, total_fetched = $2, last_updated = CURRENT_TIMESTAMP
            WHERE id = $3
    `, [progress.current_batch, progress.total_fetched, jobId]);
    }

    async updateJobCounts(jobId, counts) {
        await query(`
            UPDATE crawler_jobs
            SET success_count = $1, failed_count = $2, duplicate_count = $3, last_updated = CURRENT_TIMESTAMP
            WHERE id = $4
    `, [counts.success_count, counts.failed_count, counts.duplicate_count, jobId]);
    }

    async incrementErrorCount(jobId) {
        await query(`
            UPDATE crawler_jobs
            SET error_count = error_count + 1, last_updated = CURRENT_TIMESTAMP
            WHERE id = $1
    `, [jobId]);
    }

    async completeCrawlerJob(jobId, totalFetched) {
        await query(`
            UPDATE crawler_jobs
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP, total_fetched = $1, last_updated = CURRENT_TIMESTAMP
            WHERE id = $2
    `, [totalFetched, jobId]);
    }

    async failCrawlerJob(jobId, errorMessage) {
        await query(`
            UPDATE crawler_jobs
            SET status = 'failed', error_message = $1, completed_at = CURRENT_TIMESTAMP, last_updated = CURRENT_TIMESTAMP
            WHERE id = $2
    `, [errorMessage, jobId]);
    }

    async updateGlobalStatus(isRunning, jobId = null, error = null) {
        await query(`
            UPDATE crawler_status
            SET
                is_running      = $1,
                current_job_id  = $2,
                last_run_at     = CURRENT_TIMESTAMP,
                last_error      = $3,
                total_runs      = total_runs + 1,
                updated_at      = CURRENT_TIMESTAMP
            WHERE id = 1
        `, [isRunning ? 1 : 0, jobId, error]);

        // Update success/failure counters separately (SQLite CASE limitations)
        if (error === null) {
            await query(`UPDATE crawler_status SET last_success_at = CURRENT_TIMESTAMP, total_success = total_success + 1 WHERE id = 1`);
        } else {
            await query(`UPDATE crawler_status SET total_failures = total_failures + 1 WHERE id = 1`);
        }
    }

    // ============================================
    // Control Methods
    // ============================================

    pause() {
        this.isPaused = true;
        logger.info('Crawler paused');
    }

    resume() {
        this.isPaused = false;
        logger.info('Crawler resumed');
    }

    stop() {
        this.isStopped = true;
        logger.info('Crawler stopped');
    }
}

module.exports = SchemesCrawler;
