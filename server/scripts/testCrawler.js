#!/usr/bin/env node

/**
 * Test Enhanced SchemesCrawler
 * Tests the new crawler with MyScheme API integration
 */

const SchemesCrawler = require('../src/services/crawlers/schemesCrawler');
const logger = require('../src/services/logger');

async function testCrawler() {
    console.log('🧪 Testing Enhanced SchemesCrawler\n');
    console.log('='.repeat(70));

    const crawler = new SchemesCrawler();

    try {
        console.log('\n📋 Configuration:');
        console.log(`   API Base: ${crawler.apiBase}`);
        console.log(`   API Key: ${crawler.apiKey ? '✓ Set' : '✗ Missing'}`);
        console.log(`   Batch Size: ${crawler.batchSize}`);
        console.log(`   Delay: ${crawler.delayMs}ms`);

        console.log('\n🚀 Starting crawler...\n');
        console.log('─'.repeat(70));

        // Run crawler
        const totalFetched = await crawler.crawl();

        console.log('─'.repeat(70));
        console.log(`\n✅ Crawler completed successfully!`);
        console.log(`   Total schemes fetched: ${totalFetched}`);

        // Get final stats
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });

        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'approved') as approved
            FROM schemes
        `);

        console.log('\n📊 Database Statistics:');
        console.log(`   Total schemes: ${stats.rows[0].total}`);
        console.log(`   Pending approval: ${stats.rows[0].pending}`);
        console.log(`   Approved: ${stats.rows[0].approved}`);

        // Show sample schemes
        const samples = await pool.query(`
            SELECT title, ministry, category, level
            FROM schemes
            ORDER BY created_at DESC
            LIMIT 5
        `);

        console.log('\n📝 Sample Schemes:');
        samples.rows.forEach((scheme, i) => {
            console.log(`   ${i + 1}. ${scheme.title}`);
            console.log(`      Ministry: ${scheme.ministry}`);
            console.log(`      Category: ${scheme.category}`);
            console.log(`      Level: ${scheme.level}`);
        });

        await pool.end();

        console.log('\n🎉 Test completed successfully!');

    } catch (error) {
        console.error('\n❌ Test failed:');
        console.error(error.message);
        console.error('\nStack trace:');
        console.error(error.stack);
        process.exit(1);
    }
}

// Run test
testCrawler().catch(console.error);
