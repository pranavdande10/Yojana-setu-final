const { query } = require('../config/database');

// Helper to parse JSON fields from SQLite (since SQLite returns them as strings)
const parseJSONFields = (row) => {
    if (!row) return row;
    const jsonFields = [
        'detailed_description', 'sub_category', 'benefits', 'eligibility', 
        'application_process', 'documents_required', 'faqs', 'tags', 
        'target_beneficiaries', 'contact_info', 'references', 
        'applicable_states', 'translations', 'raw_data'
    ];
    
    const parsed = { ...row };
    for (const field of jsonFields) {
        if (typeof parsed[field] === 'string') {
            try {
                parsed[field] = JSON.parse(parsed[field]);
            } catch (e) {}
        }
    }
    return parsed;
};

class SchemeModel {
    // Get all approved schemes with filters
    static async getAll({ state, search, sort, limit = 10, offset = 0 }) {
        let queryText = `
      SELECT * FROM schemes 
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
            queryText += ` AND (title LIKE $${paramCount} OR description LIKE $${paramCount})`;
            params.push(`%${search}%`);
        }

        // Sorting
        if (sort === 'a-z') {
            queryText += ' ORDER BY title ASC';
        } else if (sort === 'z-a') {
            queryText += ' ORDER BY title DESC';
        } else if (sort === 'deadline') {
            queryText += ' ORDER BY end_date ASC';
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

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM schemes WHERE status = 'approved'`;
        const countParams = [];
        let countParamCount = 0;

        if (state) {
            countParamCount++;
            countQuery += ` AND LOWER(state) = LOWER($${countParamCount})`;
            countParams.push(state);
        }

        if (search) {
            countParamCount++;
            countQuery += ` AND (title LIKE $${countParamCount} OR description LIKE $${countParamCount})`;
            countParams.push(`%${search}%`);
        }

        const countResult = await query(countQuery, countParams);

        return {
            data: result.rows.map(parseJSONFields),
            total: parseInt(countResult.rows[0].total)
        };
    }

    // Get scheme by ID
    static async getById(id) {
        const result = await query(
            'SELECT * FROM schemes WHERE id = $1 AND status = $2',
            [id, 'approved']
        );
        return parseJSONFields(result.rows[0]);
    }

    // Get scheme by slug
    static async getBySlug(slug) {
        const result = await query(
            'SELECT * FROM schemes WHERE slug = $1 AND status = $2',
            [slug, 'approved']
        );
        if (result.rows.length > 0) {
            return parseJSONFields(result.rows[0]);
        }
        
        // Fallback for search compatibility (using LIKE on title or description)
        const searchResult = await query(
            'SELECT * FROM schemes WHERE (title LIKE $1 OR description LIKE $1) AND status = $2 LIMIT 1',
            [`%${slug}%`, 'approved']
        );
        return parseJSONFields(searchResult.rows[0]);
    }

    // Create new scheme (from approved crawl result)
    static async create(data, adminId) {
        const result = await query(`
            INSERT INTO schemes(
                external_id, slug, title, short_title, description, detailed_description,
                ministry, department, category, sub_category, level, scheme_type,
                benefits, eligibility, application_process, documents_required, faqs,
                tags, target_beneficiaries, open_date, close_date,
                application_url, contact_info, "references", applicable_states, state,
                lang, translations, raw_data, status
            ) VALUES(
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
            )
            ON CONFLICT(external_id) DO UPDATE SET
                slug = excluded.slug, title = excluded.title, short_title = excluded.short_title,
                description = excluded.description, detailed_description = excluded.detailed_description,
                ministry = excluded.ministry, department = excluded.department, category = excluded.category,
                sub_category = excluded.sub_category, level = excluded.level, scheme_type = excluded.scheme_type,
                benefits = excluded.benefits, eligibility = excluded.eligibility, application_process = excluded.application_process,
                documents_required = excluded.documents_required, faqs = excluded.faqs, tags = excluded.tags,
                target_beneficiaries = excluded.target_beneficiaries, open_date = excluded.open_date, close_date = excluded.close_date,
                application_url = excluded.application_url, contact_info = excluded.contact_info, "references" = excluded."references",
                applicable_states = excluded.applicable_states, state = excluded.state, lang = excluded.lang,
                translations = excluded.translations, raw_data = excluded.raw_data, status = excluded.status,
                last_updated = CURRENT_TIMESTAMP
        `, [
            data.external_id, data.slug, data.title, data.short_title,
            data.description, JSON.stringify(data.detailed_description || []),
            data.ministry, data.department, data.category, JSON.stringify(data.sub_category || []),
            data.level, data.scheme_type,
            JSON.stringify(data.benefits || []), JSON.stringify(data.eligibility || []),
            JSON.stringify(data.application_process || []), JSON.stringify(data.documents_required || []),
            JSON.stringify(data.faqs || []),
            JSON.stringify(data.tags || []), JSON.stringify(data.target_beneficiaries || []), data.open_date, data.close_date,
            data.application_url, JSON.stringify(data.contact_info || {}),
            JSON.stringify(data.references || []), JSON.stringify(data.applicable_states || []), data.state || 'All India',
            data.lang || 'en', JSON.stringify(data.translations || {}),
            JSON.stringify(data.raw_data || {}), 'approved'
        ]);

        if (result.lastID) {
            return await this.getById(result.lastID);
        }
        return null;
    }

    // Update scheme
    static async update(id, data) {
        await query(
            `UPDATE schemes SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        state = COALESCE($3, state),
        region = COALESCE($4, region),
        category = COALESCE($5, category),
        ministry = COALESCE($6, ministry),
        eligibility_criteria = COALESCE($7, eligibility_criteria),
        start_date = COALESCE($8, start_date),
        end_date = COALESCE($9, end_date),
        documents_required = COALESCE($10, documents_required),
        last_updated = CURRENT_TIMESTAMP
      WHERE id = $11`,
            [
                data.title, data.description, data.state, data.region, data.category,
                data.ministry, data.eligibility_criteria, data.start_date, data.end_date,
                data.documents_required, id
            ]
        );
        return await this.getById(id);
    }

    // Delete scheme
    static async delete(id) {
        await query('DELETE FROM schemes WHERE id = $1', [id]);
    }
}

module.exports = SchemeModel;
