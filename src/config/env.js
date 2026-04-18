const path = require('path');
require('dotenv').config();

module.exports = {
    database: {
        connectionString: process.env.DATABASE_URL,
        dbPath: process.env.SQLITE_PATH || path.resolve(__dirname, '../../database.sqlite'),
        ssl: {
            rejectUnauthorized: false
        },
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'your-secret-key-change-this',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },
    server: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development'
    },
    crawler: {
        cronSchedule: process.env.CRAWLER_CRON_SCHEDULE || '0 */12 * * *',
        userAgent: process.env.CRAWLER_USER_AGENT || 'YojanaSetu-Bot/1.0',
        timeout: parseInt(process.env.CRAWLER_TIMEOUT) || 30000,
        maxRetries: parseInt(process.env.CRAWLER_MAX_RETRIES) || 3,
        requestDelay: 2000 // 2 seconds between requests
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5000 // limit each IP to 5000 requests per windowMs
    }
};
