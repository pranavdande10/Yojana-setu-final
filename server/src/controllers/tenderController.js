const TenderModel = require('../models/Tender.js');

exports.getTenders = async (req, res) => {
    try {
        const { state, search, department, type, sort, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        const result = await TenderModel.getAll({ state, search, department, type, sort, limit: parseInt(limit), offset: parseInt(offset) });
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
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getTenderById = async (req, res) => {
    try {
        const tender = await TenderModel.getById(req.params.id);
        if (!tender) return res.status(404).json({ success: false, message: 'Tender not found' });
        res.json({ success: true, data: tender });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getFilters = async (req, res) => {
    try {
        const filters = await TenderModel.getFilters();
        res.json({ success: true, filters: filters });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
