const jwt = require('jsonwebtoken');
const AdminModel = require('../../models/Admin');
const { query } = require('../../config/database');
const config = require('../../config/env');
const logger = require('../../services/logger');

// Admin login
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find admin by email
        const admin = await AdminModel.findByEmail(email);

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if admin is active
        if (!admin.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Verify password
        const isValidPassword = await AdminModel.verifyPassword(password, admin.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn }
        );

        logger.info(`Admin logged in: ${admin.email}`);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                admin: {
                    id: admin.id,
                    email: admin.email,
                    name: admin.name,
                    role: admin.role
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

// Get current admin profile
exports.getProfile = async (req, res, next) => {
    try {
        const admin = await AdminModel.findById(req.admin.id);

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        res.json({
            success: true,
            data: admin
        });

    } catch (error) {
        next(error);
    }
};

// Update admin profile
exports.updateProfile = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        const updated = await AdminModel.update(req.admin.id, {
            name,
            email,
            password
        });

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        logger.info(`Admin profile updated: ${req.admin.email}`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: updated
        });

    } catch (error) {
        next(error);
    }
};

// Get all admins (admin only)
exports.getAllAdmins = async (req, res, next) => {
    try {
        const admins = await AdminModel.getAll();

        res.json({
            success: true,
            data: admins
        });

    } catch (error) {
        next(error);
    }
};

// Create new admin (admin only)
exports.createAdmin = async (req, res, next) => {
    try {
        const { email, password, name, role } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const newAdmin = await AdminModel.create({
            email,
            password,
            name,
            role
        });

        // Log action
        await query(
            `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, changes)
       VALUES ($1, $2, $3, $4, $5)`,
            [
                req.admin.id,
                'create_admin',
                'admin',
                newAdmin.id,
                JSON.stringify({ email, name, role })
            ]
        );

        logger.info(`New admin created: ${email} by ${req.admin.email}`);

        res.status(201).json({
            success: true,
            message: 'Admin created successfully',
            data: newAdmin
        });

    } catch (error) {
        next(error);
    }
};
