const TenderModel = require('../../models/Tender');

exports.getTenders = async (req, res, next) => {
    try {
        const { state, search, sort, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const result = await TenderModel.getAll({
            state,
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

exports.getTenderById = async (req, res, next) => {
    try {
        const tender = await TenderModel.getById(req.params.id);

        if (!tender) {
            return res.status(404).json({
                success: false,
                message: 'Tender not found'
            });
        }

        res.json({
            success: true,
            data: tender
        });
    } catch (error) {
        next(error);
    }
};
