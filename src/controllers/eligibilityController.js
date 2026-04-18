const { query } = require('../config/database');

/**
 * Eligibility Controller
 * Handles eligibility checking for schemes
 */

/**
 * Check eligibility for schemes
 * POST /api/eligibility/check
 */
exports.checkEligibility = async (req, res, next) => {
    try {
        const {
            age,
            gender,
            state,
            category,
            annual_income,
            has_bank_account,
            employment_status,
            occupation_type
        } = req.body;

        // Validate required fields
        if (!age || !state) {
            return res.status(400).json({
                success: false,
                message: 'Age and state are required fields'
            });
        }

        // Save eligibility check
        const checkResult = await query(
            `INSERT INTO eligibility_checks (
                age, gender, state, category, annual_income,
                has_bank_account, employment_status, occupation_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [age, gender, state, category, annual_income, has_bank_account, employment_status, occupation_type]
        );

        const checkId = checkResult.lastID;

        // Fetch all approved schemes
        const SchemeModel = require('../models/Scheme');
        const allSchemesResponse = await SchemeModel.getAll({ limit: 1000, offset: 0 });
        const allSchemes = allSchemesResponse.data;

        // Calculate match scores in JavaScript (SQLite-compatible)
        const scoredSchemes = allSchemes.map(scheme => {
            let match_score = 0;
            const applicable_states = scheme.applicable_states || [];
            const eligibility = scheme.eligibility || {};

            // State matching (30 points)
            if (applicable_states.includes('All India') || applicable_states.includes(state)) {
                match_score += 30;
            }

            // Bank account requirement (20 points)
            if (eligibility.requires_bank_account === true && has_bank_account === true) {
                match_score += 20;
            } else if (eligibility.requires_bank_account === undefined || eligibility.requires_bank_account === null) {
                match_score += 15;
            }

            // Category matching (20 points)
            const schemeCategories = eligibility.categories || [];
            if (schemeCategories.includes(category)) {
                match_score += 20;
            } else if (!schemeCategories || schemeCategories.length === 0) {
                match_score += 10;
            }

            // Age matching (20 points)
            const minAge = parseInt(eligibility.min_age);
            const maxAge = parseInt(eligibility.max_age) || 999;
            if (!isNaN(minAge) && age >= minAge && age <= maxAge) {
                match_score += 20;
            } else if (isNaN(minAge)) {
                match_score += 10;
            }

            // Income criteria (10 points)
            const maxIncome = parseFloat(eligibility.max_income);
            if (!isNaN(maxIncome) && annual_income <= maxIncome) {
                match_score += 10;
            } else if (isNaN(maxIncome)) {
                match_score += 5;
            }

            return { ...scheme, match_score };
        });

        // Filter and sort schemes
        const eligibleSchemes = scoredSchemes
            .filter(s => s.match_score >= 40)
            .sort((a, b) => b.match_score - a.match_score)
            .slice(0, 50);

        const eligibleCount = eligibleSchemes.length;

        // Update eligibility check with results
        if (checkId) {
            await query(
                `UPDATE eligibility_checks
                SET eligible_schemes = $1, eligible_count = $2
                WHERE id = $3`,
                [JSON.stringify(eligibleSchemes.map(s => s.id)), eligibleCount, checkId]
            );
        }

        res.json({
            success: true,
            check_id: checkId,
            eligible_count: eligibleCount,
            schemes: eligibleSchemes.map(scheme => ({
                id: scheme.id,
                slug: scheme.slug,
                title: scheme.title,
                short_title: scheme.short_title,
                description: scheme.description,
                ministry: scheme.ministry,
                department: scheme.department,
                category: scheme.category,
                level: scheme.level,
                benefits: scheme.benefits,
                eligibility: scheme.eligibility,
                tags: scheme.tags,
                applicable_states: scheme.applicable_states,
                match_score: scheme.match_score
            }))
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get eligibility check by ID
 * GET /api/eligibility/:id
 */
exports.getEligibilityCheck = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT * FROM eligibility_checks WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Eligibility check not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        next(error);
    }
};
