const express = require('express');
const { getTenders, getTenderById, getFilters } = require('../controllers/tenderController.js');

const router = express.Router();

router.get('/filters', getFilters);
router.get('/', getTenders);
router.get('/:id', getTenderById);

module.exports = router;
