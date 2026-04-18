const { query } = require('../config/database');

class StatModel {
    static async getStats() {
        const schemesCount = await query('SELECT COUNT(*) as count FROM schemes');
        const tendersCount = await query('SELECT COUNT(*) as count FROM tenders');
        const recruitmentsCount = await query('SELECT COUNT(*) as count FROM recruitments');

        return {
            schemesCount: schemesCount.rows[0].count,
            tendersCount: tendersCount.rows[0].count,
            recruitmentsCount: recruitmentsCount.rows[0].count
        };
    }
}

module.exports = StatModel;
