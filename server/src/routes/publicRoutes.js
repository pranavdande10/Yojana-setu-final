const express = require('express');
const router = express.Router();
const { publicLimiter } = require('../middleware/rateLimiter');
const { sanitizeQuery } = require('../middleware/validator');

// Public controllers
const schemeController = require('../controllers/public/schemeController');
const tenderController = require('../controllers/public/tenderController');
const recruitmentController = require('../controllers/public/recruitmentController');
const statController = require('../controllers/public/statController');

// Apply rate limiting and query sanitization to all public routes
router.use(publicLimiter);
router.use(sanitizeQuery);

// Schemes - Moved to schemeRoutes.js
// router.get('/schemes', schemeController.getSchemes);
// router.get('/schemes/:id', schemeController.getSchemeById);

// Tenders
router.get('/tenders', tenderController.getTenders);
router.get('/tenders/:id', tenderController.getTenderById);

// Recruitments
router.get('/recruitments', recruitmentController.getRecruitments);
router.get('/recruitments/:id', recruitmentController.getRecruitmentById);

// Stats
router.get('/stats', statController.getStats);

module.exports = router;
