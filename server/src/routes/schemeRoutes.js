const express = require('express');
const router = express.Router();
const schemesController = require('../controllers/schemesController');

/**
 * Enhanced Schemes Routes
 * Public API for scheme access with rich data
 */

// Get filter options (for dropdowns)
router.get('/filters', schemesController.getFilterOptions);

// Search schemes
router.get('/search', schemesController.searchSchemes);

// Get statistics
router.get('/stats', schemesController.getStats);

// List schemes with filters
router.get('/', schemesController.listSchemes);

// Get scheme by slug (must be after other routes to avoid conflicts)
router.get('/:slug', schemesController.getSchemeBySlug);

module.exports = router;
