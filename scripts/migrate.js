// Script to run database migration
require('dotenv').config();
const { initDb } = require('../src/config/database');

async function migrate() {
    try {
        console.log('Starting database migration...');

        // Execute migration
        await initDb();

        console.log('✓ Migration completed successfully!');
        console.log('✓ All tables created');
        console.log('✓ Indexes created');
        console.log('✓ Default admin account created (email: admin@yojanasetu.gov.in, password: admin123)');
        console.log('\n⚠️  IMPORTANT: Change the default admin password immediately!');

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
