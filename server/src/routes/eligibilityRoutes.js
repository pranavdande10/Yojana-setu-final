const express = require('express');
const router = express.Router();
const eligibilityController = require('../controllers/eligibilityController');

/**
 * Eligibility Routes
 * Public API for eligibility checking
 */

// Check eligibility
router.post('/check', eligibilityController.checkEligibility);

// Get eligibility check by ID
router.get('/:id', eligibilityController.getEligibilityCheck);

module.exports = router;
