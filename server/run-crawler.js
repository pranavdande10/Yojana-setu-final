/**
 * run-crawler.js
 * ──────────────
 * Run the SchemesCrawler standalone — no server needed.
 *
 * Usage:
 *   node run-crawler.js              → crawl all (uses Puppeteer slug discovery + fallback)
 *   node run-crawler.js --dry-run    → fetch 3 known slugs, print results, don't save to DB
 *   node run-crawler.js --slugs pmmy,pmjdy,sui  → crawl specific slugs only
 */

require('dotenv').config();
const { initDb, query } = require('./src/config/database');
const SchemesCrawler = require('./src/services/crawlers/schemesCrawler');
const logger = require('./src/services/logger');

// ── Parse CLI args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun   = args.includes('--dry-run');
const slugsArg   = args.find(a => a.startsWith('--slugs='));
const customSlugs = slugsArg ? slugsArg.replace('--slugs=', '').split(',') : null;

async function main() {
    console.log('\n🚀 YojanaSetu — Scheme Crawler\n' + '─'.repeat(50));

    // ── 1. Init DB ────────────────────────────────────────────────────────
    console.log('📦 Initialising database...');
    await initDb();
    console.log('✓ Database ready\n');

    // ── 2. Dry-run mode ───────────────────────────────────────────────────
    if (isDryRun) {
        console.log('🔍 DRY RUN — fetching 3 known schemes (not saving to DB)\n');
        const axios = require('axios');
        const testSlugs = customSlugs || ['pmmy', 'pmjdy', 'sui'];
        const apiBase = process.env.MYSCHEME_API_BASE;
        const apiKey  = process.env.MYSCHEME_API_KEY;

        if (!apiBase) {
            console.error('❌ MYSCHEME_API_BASE is not set in your .env file');
            console.error('   Copy .env.example to .env and fill in the values\n');
            process.exit(1);
        }

        for (const slug of testSlugs) {
            try {
                console.log(`  Fetching: ${slug}...`);
                const res = await axios.get(`${apiBase}?slug=${slug}&lang=en`, {
                    headers: { 'x-api-key': apiKey },
                    timeout: 10000
                });

                if (res.data?.statusCode === 200 && res.data?.data) {
                    const d = res.data.data;
                    const name = d.en?.basicDetails?.schemeName || slug;
                    const ministry = d.en?.basicDetails?.nodalMinistryName?.label || 'N/A';
                    console.log(`  ✅ ${name}`);
                    console.log(`     Ministry : ${ministry}`);
                    console.log(`     ID       : ${d._id}\n`);
                } else {
                    console.log(`  ⚠️  ${slug} — unexpected response status: ${res.data?.statusCode}\n`);
                }

                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.log(`  ❌ ${slug} — ${err.message}\n`);
            }
        }

        console.log('✓ Dry run complete. API connection is working.\n');
        process.exit(0);
    }

    // ── 3. Full crawl ─────────────────────────────────────────────────────
    if (!process.env.MYSCHEME_API_BASE) {
        console.error('❌ MYSCHEME_API_BASE is not set in your .env file');
        console.error('   Copy .env.example to .env and fill in the values\n');
        process.exit(1);
    }

    // Get source record from DB
    const sourceResult = await query(
        "SELECT * FROM sources WHERE name = 'MyScheme.gov.in' AND is_active = 1 LIMIT 1"
    );

    if (sourceResult.rows.length === 0) {
        console.error('❌ MyScheme.gov.in source not found in DB. Run initDb first.');
        process.exit(1);
    }

    const source = sourceResult.rows[0];
    console.log(`📡 Source: ${source.name} (id=${source.id})`);

    if (customSlugs) {
        // Inject custom slugs by monkey-patching discoverSlugs
        console.log(`🔗 Using ${customSlugs.length} custom slugs: ${customSlugs.join(', ')}\n`);
    }

    const crawler = new SchemesCrawler(source);

    // Optionally override slug discovery with CLI-provided slugs
    if (customSlugs) {
        crawler.discoverSlugs = async () => customSlugs;
    }

    console.log('🕷️  Starting crawler...\n');

    try {
        const total = await crawler.crawl();
        console.log(`\n✅ Crawl complete — ${total} schemes fetched\n`);

        // Print DB summary
        const count = await query("SELECT COUNT(*) as c FROM schemes");
        console.log(`📊 Total schemes in DB: ${count.rows[0].c}`);

        const jobs = await query(
            "SELECT id, status, success_count, failed_count, started_at, completed_at FROM crawler_jobs ORDER BY id DESC LIMIT 1"
        );
        if (jobs.rows[0]) {
            console.log('\nLast job:');
            console.log(jobs.rows[0]);
        }

    } catch (err) {
        console.error('\n❌ Crawl failed:', err.message);
        process.exit(1);
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
