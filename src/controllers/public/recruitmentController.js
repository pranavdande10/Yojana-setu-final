const RecruitmentModel = require('../../models/Recruitment');

exports.getRecruitments = async (req, res, next) => {
    try {
        const { state, search, sort, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const result = await RecruitmentModel.getAll({
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

exports.getRecruitmentById = async (req, res, next) => {
    try {
        const recruitment = await RecruitmentModel.getById(req.params.id);

        if (!recruitment) {
            return res.status(404).json({
                success: false,
                message: 'Recruitment not found'
            });
        }

        res.json({
            success: true,
            data: recruitment
        });
    } catch (error) {
        next(error);
    }
};
