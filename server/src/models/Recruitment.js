const { query } = require('../config/database');

class RecruitmentModel {
    static async getAll({ state, search, sort, limit = 10, offset = 0 }) {
        let queryText = `
      SELECT * FROM recruitments 
      WHERE status = 'approved'
    `;
        const params = [];
        let paramCount = 0;

        if (state) {
            paramCount++;
            queryText += ` AND LOWER(state) = LOWER($${paramCount})`;
            params.push(state);
        }

        if (search) {
            paramCount++;
            queryText += ` AND (post_name LIKE $${paramCount} OR organization LIKE $${paramCount})`;
            params.push(`%${search}%`);
        }

        if (sort === 'a-z') {
            queryText += ' ORDER BY post_name ASC';
        } else if (sort === 'z-a') {
            queryText += ' ORDER BY post_name DESC';
        } else if (sort === 'deadline') {
            queryText += ' ORDER BY application_end_date ASC';
        } else {
            queryText += ' ORDER BY created_at DESC';
        }

        paramCount++;
        queryText += ` LIMIT $${paramCount}`;
        params.push(limit);

        paramCount++;
        queryText += ` OFFSET $${paramCount}`;
        params.push(offset);

        const result = await query(queryText, params);

        let countQuery = `SELECT COUNT(*) as total FROM recruitments WHERE status = 'approved'`;
        const countParams = [];
        let countParamCount = 0;

        if (state) {
            countParamCount++;
            countQuery += ` AND LOWER(state) = LOWER($${countParamCount})`;
            countParams.push(state);
        }

        if (search) {
            countParamCount++;
            countQuery += ` AND (post_name LIKE $${countParamCount} OR organization LIKE $${countParamCount})`;
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
            'SELECT * FROM recruitments WHERE id = $1 AND status = $2',
            [id, 'approved']
        );
        return result.rows[0];
    }

    static async create(data, adminId) {
        const result = await query(
            `INSERT INTO recruitments (
        post_name, organization, state, ministry, qualification, vacancy_count,
        application_start_date, application_end_date, age_limit, selection_process,
        application_fee, documents_required, official_notification_link,
        source_url, source_website, status, approved_by, approved_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(source_url) DO UPDATE SET
        post_name = excluded.post_name,
        organization = excluded.organization,
        state = excluded.state,
        ministry = excluded.ministry,
        qualification = excluded.qualification,
        vacancy_count = excluded.vacancy_count,
        application_start_date = excluded.application_start_date,
        application_end_date = excluded.application_end_date,
        age_limit = excluded.age_limit,
        selection_process = excluded.selection_process,
        application_fee = excluded.application_fee,
        documents_required = excluded.documents_required,
        official_notification_link = excluded.official_notification_link,
        source_website = excluded.source_website,
        status = excluded.status,
        approved_by = excluded.approved_by,
        approved_at = CURRENT_TIMESTAMP,
        last_updated = CURRENT_TIMESTAMP`,
            [
                data.post_name, data.organization, data.state, data.ministry,
                data.qualification, data.vacancy_count, data.application_start_date,
                data.application_end_date, data.age_limit, data.selection_process,
                data.application_fee, data.documents_required, data.official_notification_link,
                data.source_url, data.source_website, 'approved', adminId
            ]
        );

        if (result.lastID) {
            return await this.getById(result.lastID);
        }
        return null;
    }

    static async update(id, data) {
        await query(
            `UPDATE recruitments SET
        post_name = COALESCE($1, post_name),
        organization = COALESCE($2, organization),
        state = COALESCE($3, state),
        ministry = COALESCE($4, ministry),
        qualification = COALESCE($5, qualification),
        vacancy_count = COALESCE($6, vacancy_count),
        application_end_date = COALESCE($7, application_end_date),
        last_updated = CURRENT_TIMESTAMP
      WHERE id = $8`,
            [
                data.post_name, data.organization, data.state, data.ministry,
                data.qualification, data.vacancy_count, data.application_end_date, id
            ]
        );
        return await this.getById(id);
    }

    static async delete(id) {
        await query('DELETE FROM recruitments WHERE id = $1', [id]);
    }
}

module.exports = RecruitmentModel;
