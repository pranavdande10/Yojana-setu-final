const { query } = require('../src/config/database');

async function migrate() {
    try {
        console.log('Running schemes table migration...');

        // Check for 'state' in 'schemes'
        try {
            await query('SELECT state FROM schemes LIMIT 1');
            console.log('✅ "state" column already exists in "schemes".');
        } catch (err) {
            console.log('⚠️ "state" column missing in "schemes", adding it...');
            await query('ALTER TABLE schemes ADD COLUMN state TEXT');
        }

        console.log('Migration complete.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
