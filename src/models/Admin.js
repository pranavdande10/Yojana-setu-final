const { query } = require('../config/database');
const bcrypt = require('bcrypt');

class AdminModel {
    // Find admin by email
    static async findByEmail(email) {
        const result = await query(
            'SELECT * FROM admins WHERE email = $1',
            [email]
        );
        const admin = result.rows[0];
        if (admin) {
            admin.name = admin.username; // Map username to name for controller
        }
        return admin;
    }

    // Find admin by ID
    static async findById(id) {
        const result = await query(
            'SELECT * FROM admins WHERE id = $1',
            [id]
        );
        const admin = result.rows[0];
        if (admin) {
            admin.name = admin.username;
        }
        return admin;
    }

    // Create new admin
    // Expects data.username or data.name
    static async create(data) {
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const username = data.username || data.name;

        const result = await query(
            `INSERT INTO admins (email, password_hash, username, role)
       VALUES ($1, $2, $3, $4)`,
            [data.email, hashedPassword, username, data.role || 'moderator']
        );

        if (result.lastID) {
            return await this.findById(result.lastID);
        }
        return null;
    }

    // Verify password
    static async verifyPassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }

    // Update admin
    static async update(id, data) {
        const updates = [];
        const params = [];
        let paramCount = 0;

        if (data.name || data.username) {
            paramCount++;
            updates.push(`username = $${paramCount}`);
            params.push(data.username || data.name);
        }

        if (data.email) {
            paramCount++;
            updates.push(`email = $${paramCount}`);
            params.push(data.email);
        }

        if (data.password) {
            paramCount++;
            const hashedPassword = await bcrypt.hash(data.password, 10);
            updates.push(`password_hash = $${paramCount}`);
            params.push(hashedPassword);
        }

        if (data.is_active !== undefined) {
            paramCount++;
            updates.push(`is_active = $${paramCount}`);
            params.push(data.is_active);
        }

        if (updates.length === 0) return null;

        paramCount++;
        params.push(id);

        await query(
            `UPDATE admins SET ${updates.join(', ')}
       WHERE id = $${paramCount}`,
            params
        );

        return await this.findById(id);
    }

    // Get all admins
    static async getAll() {
        const result = await query(
            'SELECT * FROM admins ORDER BY created_at DESC'
        );
        return result.rows.map(admin => ({
            ...admin,
            name: admin.username
        }));
    }
}

module.exports = AdminModel;
