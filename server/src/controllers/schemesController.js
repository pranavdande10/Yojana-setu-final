const SchemeModel = require('../models/Scheme');
const { query } = require('../config/database');

/**
 * Schemes Controller (Refactored for SQLite compatibility)
 */

exports.listSchemes = async (req, res, next) => {
    try {
        const { state, search, sort, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const result = await SchemeModel.getAll({
            state: state === 'All India' ? null : state,
            search,
            sort,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: result.data,
            pagination: {
                total: result.total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(result.total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getSchemeBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;
        // Search by slug if exists, otherwise by ID
        let result;
        if (isNaN(slug)) {
            result = await SchemeModel.getBySlug(slug);
        } else {
            result = await SchemeModel.getById(slug);
        }

        if (!result) {
            return res.status(404).json({ success: false, message: 'Scheme not found' });
        }

        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.searchSchemes = async (req, res, next) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const result = await SchemeModel.getAll({
            search: q,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: result.data,
            pagination: {
                total: result.total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(result.total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getStats = async (req, res, next) => {
    try {
        const totalResult = await query("SELECT COUNT(*) as total FROM schemes");
        const categoryResult = await query("SELECT category, COUNT(*) as count FROM schemes GROUP BY category ORDER BY count DESC LIMIT 5");
        const stateResult = await query("SELECT state, COUNT(*) as count FROM schemes GROUP BY state ORDER BY count DESC LIMIT 5");

        res.json({
            success: true,
            stats: {
                total: totalResult.rows[0].total,
                by_category: categoryResult.rows,
                by_state: stateResult.rows
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getFilterOptions = async (req, res, next) => {
    try {
        const categories = await query("SELECT DISTINCT category FROM schemes WHERE category IS NOT NULL ORDER BY category");
        const ministries = await query("SELECT DISTINCT ministry FROM schemes WHERE ministry IS NOT NULL ORDER BY ministry");
        const levels = await query("SELECT DISTINCT level FROM schemes WHERE level IS NOT NULL ORDER BY level");

        const staticStates = [
            "All India", "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", 
            "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", 
            "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", 
            "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", 
            "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", 
            "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
        ];

        res.json({
            success: true,
            filters: {
                categories: categories.rows.map(r => r.category),
                ministries: ministries.rows.map(r => r.ministry),
                levels: levels.rows.map(r => r.level),
                states: staticStates
            }
        });
    } catch (error) {
        next(error);
    }
};
