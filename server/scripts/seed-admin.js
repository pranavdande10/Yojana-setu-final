const AdminModel = require('../src/models/Admin');
const logger = require('../src/services/logger');
require('dotenv').config();

async function seedAdmin() {
    try {
        console.log('🌱 Seeding default admin user...');

        // Check if exists
        const exists = await AdminModel.findByEmail('admin@yojanasetu.gov.in');
        if (exists) {
            console.log('⚠️  Default admin already exists: admin@yojanasetu.gov.in');
            process.exit(0);
        }

        // Create new
        const newAdmin = await AdminModel.create({
            email: 'admin@yojanasetu.gov.in',
            password: 'admin123',
            username: 'Super Admin',
            role: 'admin'
        });

        console.log('✅ Default admin created successfully!');
        console.log('   Email: admin@yojanasetu.gov.in');
        console.log('   Password: admin123');
        console.log('   Role: admin');

    } catch (error) {
        console.error('❌ Failed to seed admin:', error.message);
        process.exit(1);
    } finally {
        // AdminModel likely uses pg pool internally which needs closing?
        // Or process exit handles it.
        // Assuming AdminModel uses a singleton pool or similar.
    }
}

seedAdmin();
