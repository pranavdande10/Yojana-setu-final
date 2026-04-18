// Quick script to fix admin password
require('dotenv').config();
const bcrypt = require('bcrypt');
const { query } = require('../src/config/database');

async function fixAdminPassword() {
    try {
        const email = 'admin@yojanasetu.gov.in';
        const password = 'admin123';

        // Generate proper bcrypt hash
        const passwordHash = await bcrypt.hash(password, 10);

        // Update or insert admin with correct hash
        await query(
            `INSERT INTO admins (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) 
       DO UPDATE SET password_hash = $2`,
            [email, passwordHash, 'System Administrator', 'admin']
        );

        console.log('✓ Admin account fixed successfully!');
        console.log('Email:', email);
        console.log('Password: admin123');
        console.log('\n⚠️  Please change this password after first login!');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

fixAdminPassword();
