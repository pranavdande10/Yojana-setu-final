import StatModel from '../models/Stat.js';

export const getStats = async (req, res) => {
    try {
        const stats = await StatModel.getStats();
        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
