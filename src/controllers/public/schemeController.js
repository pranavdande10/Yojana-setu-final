const SchemeModel = require('../../models/Scheme');

exports.getSchemes = async (req, res, next) => {
    try {
        const { state, search, sort, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const result = await SchemeModel.getAll({
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

exports.getSchemeById = async (req, res, next) => {
    try {
        const scheme = await SchemeModel.getById(req.params.id);

        if (!scheme) {
            return res.status(404).json({
                success: false,
                message: 'Scheme not found'
            });
        }

        res.json({
            success: true,
            data: scheme
        });
    } catch (error) {
        next(error);
    }
};
