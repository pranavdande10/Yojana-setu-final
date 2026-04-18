import RecruitmentModel from '../models/Recruitment.js';

export const getRecruitments = async (req, res) => {
    try {
        const { state, search, qualification, department, sort, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        const result = await RecruitmentModel.getAll({ state, search, qualification, department, sort, limit: parseInt(limit), offset: parseInt(offset) });
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

export const getRecruitmentById = async (req, res) => {
    try {
        const recruitment = await RecruitmentModel.getById(req.params.id);
        if (!recruitment) return res.status(404).json({ success: false, message: 'Recruitment not found' });
        res.json({ success: true, data: recruitment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
