const AdminModel = require('../src/models/Admin');
const { query } = require('../src/config/database');

async function test() {
    try {
        const email = 'admin@yojanasetu.gov.in';
        console.log('Testing findByEmail for:', email);
        const admin = await AdminModel.findByEmail(email);
        console.log('Admin found:', JSON.stringify(admin, null, 2));

        if (admin) {
            console.log('password_hash type:', typeof admin.password_hash);
            console.log('password_hash value:', admin.password_hash);
        } else {
            console.log('No admin found with that email.');
        }
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

test();
