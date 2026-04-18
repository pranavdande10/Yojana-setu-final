// Script to create a new admin user
require('dotenv').config();
const readline = require('readline');
const AdminModel = require('../src/models/Admin');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function createAdmin() {
    try {
        console.log('\n=== Create New Admin ===\n');

        const email = await question('Email: ');
        const password = await question('Password: ');
        const name = await question('Name: ');
        const role = await question('Role (admin/moderator) [moderator]: ') || 'moderator';

        if (!email || !password) {
            console.error('Email and password are required!');
            process.exit(1);
        }

        const admin = await AdminModel.create({
            email,
            password,
            name,
            role
        });

        console.log('\n✓ Admin created successfully!');
        console.log(`Email: ${admin.email}`);
        console.log(`Role: ${admin.role}`);

        rl.close();
        process.exit(0);
    } catch (error) {
        console.error('Failed to create admin:', error.message);
        rl.close();
        process.exit(1);
    }
}

createAdmin();
