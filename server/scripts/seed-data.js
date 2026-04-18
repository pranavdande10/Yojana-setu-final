const { query } = require('../src/config/database');
const bcrypt = require('bcrypt');

async function seed() {
    try {
        console.log('Seeding database...');

        // 1. Seed Admin
        const adminEmail = 'admin@yojanasetu.gov.in';
        const hashedPassword = await bcrypt.hash('admin123', 10);

        await query(`
            INSERT OR IGNORE INTO admins (email, password_hash, username, role)
            VALUES ($1, $2, $3, $4)
        `, [adminEmail, hashedPassword, 'Administrator', 'admin']);
        console.log('✅ Admin seeded.');

        // 2. Seed Sources
        const sources = [
            { name: 'MyScheme.gov.in', url: 'https://www.myscheme.gov.in/', type: 'schemes' },
            { name: 'eProcure Central', url: 'https://eprocure.gov.in/cppp/', type: 'tenders' },
            { name: 'National Career Service', url: 'https://www.ncs.gov.in/', type: 'recruitments' }
        ];

        for (const source of sources) {
            await query(`
                INSERT OR IGNORE INTO sources (name, url, type, is_active)
                VALUES ($1, $2, $3, 1)
            `, [source.name, source.url, source.type]);
        }
        console.log('✅ Sources seeded.');

        console.log('Seeding complete.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    }
}

seed();
