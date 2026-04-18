const { query } = require('../config/database');

class TenderModel {
    static async getAll({ state, search, sort, limit = 10, offset = 0 }) {
        let queryText = `
      SELECT * FROM tenders 
      WHERE status = 'approved' AND (closing_date IS NULL OR date(closing_date) >= date('now'))
    `;
        const params = [];
        let paramCount = 0;

        if (state) {
            queryText += ` AND LOWER(state) = LOWER(?)`;
            params.push(state);
        }

        if (search) {
            queryText += ` AND (tender_name LIKE ? OR description LIKE ?)`;
            params.push(`%${search}%`);
            params.push(`%${search}%`);
        }

        if (sort === 'a-z') {
            queryText += ' ORDER BY tender_name ASC';
        } else if (sort === 'z-a') {
            queryText += ' ORDER BY tender_name DESC';
        } else if (sort === 'deadline') {
            queryText += ' ORDER BY closing_date ASC';
        } else {
            queryText += ' ORDER BY created_at DESC';
        }

        queryText += ` LIMIT ?`;
        params.push(limit);

        queryText += ` OFFSET ?`;
        params.push(offset);

        // Execute queries
        const result = await query(queryText, params);

        let countQuery = `SELECT COUNT(*) as total FROM tenders WHERE status = 'approved' AND (closing_date IS NULL OR date(closing_date) >= date('now'))`;
        const countParams = [];
        let countParamCount = 0;

        if (state) {
            countQuery += ` AND LOWER(state) = LOWER(?)`;
            countParams.push(state);
        }

        if (search) {
            countQuery += ` AND (tender_name LIKE ? OR description LIKE ?)`;
            countParams.push(`%${search}%`);
            countParams.push(`%${search}%`);
        }

        const countResult = await query(countQuery, countParams);

        return {
            data: result.rows,
            total: parseInt(countResult.rows[0].total)
        };
    }

    static async getById(id) {
        const result = await query(
            'SELECT * FROM tenders WHERE id = ? AND status = ?',
            [id, 'approved']
        );
        return result.rows[0];
    }

    static async create(data, adminId) {
        const result = await query(
            `INSERT INTO tenders (
        tender_name, tender_id, reference_number, state, department, ministry,
        tender_type, published_date, opening_date, closing_date, description,
        documents_required, fee_details, source_url, source_website,
        status, created_at, extended_details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(tender_id) DO UPDATE SET
        tender_name = excluded.tender_name,
        tender_id = excluded.tender_id,
        reference_number = excluded.reference_number,
        state = excluded.state,
        department = excluded.department,
        ministry = excluded.ministry,
        tender_type = excluded.tender_type,
        published_date = excluded.published_date,
        opening_date = excluded.opening_date,
        closing_date = excluded.closing_date,
        description = excluded.description,
        documents_required = excluded.documents_required,
        fee_details = excluded.fee_details,
        source_website = excluded.source_website,
        status = excluded.status,
        extended_details = excluded.extended_details,
        last_updated = CURRENT_TIMESTAMP`,
            [
                data.tender_name, data.tender_id, data.reference_number, data.state,
                data.department, data.ministry, data.tender_type, data.published_date,
                data.opening_date, data.closing_date, data.description,
                data.documents_required, data.fee_details, data.source_url,
                data.source_website, 'approved', data.extended_details
            ]
        );

        if (result.lastID) {
            return await this.getById(result.lastID);
        }
        return null;
    }

    static async update(id, data) {
        await query(
            `UPDATE tenders SET 
        tender_name = ?, tender_id = ?, reference_number = ?, state = ?, 
        department = ?, ministry = ?, tender_type = ?, published_date = ?, 
        opening_date = ?, closing_date = ?, description = ?, documents_required = ?, 
        fee_details = ?, source_url = ?, source_website = ?, extended_details = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
            [
                data.tender_name, data.tender_id, data.reference_number, data.state,
                data.department, data.ministry, data.tender_type, data.published_date,
                data.opening_date, data.closing_date, data.description,
                data.documents_required, data.fee_details, data.source_url,
                data.source_website, data.extended_details, id
            ]
        );
        return await this.getById(id);
    }

    static async updateStatus(id, status, adminId, reason = null) {
        await query(
            `UPDATE tenders SET 
        status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, 
        rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
            [status, adminId, reason, id]
        );
        return true;
    }

    static async delete(id) {
        await query('DELETE FROM tenders WHERE id = ?', [id]);
        return true;
    }

    static async getStats() {
        const result = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM tenders
    `);
        return result.rows[0];
    }

    static async getFilters() {
        const stateResult = await query(`SELECT DISTINCT state FROM tenders WHERE status = 'approved' AND state IS NOT NULL ORDER BY state`);
        const deptResult = await query(`SELECT DISTINCT department FROM tenders WHERE status = 'approved' AND department IS NOT NULL ORDER BY department`);
        const typeResult = await query(`SELECT DISTINCT tender_type FROM tenders WHERE status = 'approved' AND tender_type IS NOT NULL ORDER BY tender_type`);
        
        return {
            states: stateResult.rows.map(r => r.state),
            ministries: deptResult.rows.map(r => r.department),
            categories: typeResult.rows.map(r => r.tender_type),
            levels: ['Central', 'State']
        };
    }
}

module.exports = TenderModel;
