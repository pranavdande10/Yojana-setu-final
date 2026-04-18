const { query } = require('../src/config/database');

async function migrate() {
    try {
        console.log('Running schema migrations...');

        // 1. Check for 'username' in 'admins'
        try {
            await query('SELECT username FROM admins LIMIT 1');
            console.log('✅ "username" column already exists in "admins".');
        } catch (err) {
            console.log('⚠️ "username" column missing in "admins", adding it...');
            await query('ALTER TABLE admins ADD COLUMN username TEXT');
        }

        // 2. Check for 'password_hash' in 'admins'
        try {
            await query('SELECT password_hash FROM admins LIMIT 1');
            console.log('✅ "password_hash" column already exists in "admins".');
        } catch (err) {
            console.log('⚠️ "password_hash" column missing or named differently, fixing...');
            // In SQLite we can't easily rename columns or drop them without a full table rebuild.
            // Let's check if 'password' exists.
            try {
                await query('SELECT password FROM admins LIMIT 1');
                console.log('   Renaming/Adding password_hash...');
                await query('ALTER TABLE admins ADD COLUMN password_hash TEXT');
                // Copy data if possible, but for dev it might be better to just leave it.
            } catch (pErr) {
                await query('ALTER TABLE admins ADD COLUMN password_hash TEXT');
            }
        }

        // 3. Check for 'is_active' in 'admins'
        try {
            await query('SELECT is_active FROM admins LIMIT 1');
            console.log('✅ "is_active" column already exists in "admins".');
        } catch (err) {
            console.log('⚠️ "is_active" column missing in "admins", adding it...');
            await query('ALTER TABLE admins ADD COLUMN is_active BOOLEAN DEFAULT 1');
        }

        console.log('Migration complete.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
