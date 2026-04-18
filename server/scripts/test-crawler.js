const SchemesCrawler = require('../src/services/crawlers/schemesCrawler');
const logger = require('../src/services/logger');

async function testCrawler() {
    try {
        console.log('Starting crawler test...');
        const crawler = new SchemesCrawler();

        // Let's mock a few things to make it faster/safer for testing
        // Or just let it run for a bit

        console.log('Triggering crawl...');
        // We'll only test the discovery and one fetch if possible
        // But the current execute() does everything.
        // Let's just run it and see if it hits the DB.

        await crawler.execute();

        console.log('Crawler test finished.');
        process.exit(0);
    } catch (err) {
        console.error('Crawler test failed:', err);
        process.exit(1);
    }
}

testCrawler();
