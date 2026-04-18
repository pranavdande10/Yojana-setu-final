const { query } = require('../config/database');

class CrawlResultModel {
    // Get all pending crawl results for admin review
    static async getPending({ type, limit = 50, offset = 0 }) {
        let queryText = `
      SELECT cr.*, s.name as source_name, s.url as source_url
      FROM crawl_results cr
      LEFT JOIN sources s ON cr.source_id = s.id
      WHERE cr.status = 'pending'
    `;
        const params = [];
        let paramCount = 0;

        if (type) {
            paramCount++;
            queryText += ` AND cr.type = $${paramCount}`;
            params.push(type);
        }

        queryText += ' ORDER BY cr.created_at DESC';

        paramCount++;
        queryText += ` LIMIT $${paramCount}`;
        params.push(limit);

        paramCount++;
        queryText += ` OFFSET $${paramCount}`;
        params.push(offset);

        const result = await query(queryText, params);

        let countQuery = `SELECT COUNT(*) as total FROM crawl_results WHERE status = 'pending'`;
        if (type) {
            countQuery += ` AND type = $1`;
            const countResult = await query(countQuery, [type]);
            const returnRowsType = result.rows.map(row => {
                if (typeof row.raw_data === 'string') {
                    try { row.raw_data = JSON.parse(row.raw_data); } catch (e) {}
                }
                if (typeof row.normalized_data === 'string') {
                    try { row.normalized_data = JSON.parse(row.normalized_data); } catch (e) {}
                }
                return row;
            });
            return { data: returnRowsType, total: parseInt(countResult.rows[0].total) };
        }

        const countResult = await query(countQuery);
        const countResultTotal = parseInt(countResult.rows[0].total);
        
        const returnRows = result.rows.map(row => {
            if (typeof row.raw_data === 'string') {
                try { row.raw_data = JSON.parse(row.raw_data); } catch (e) {}
            }
            if (typeof row.normalized_data === 'string') {
                try { row.normalized_data = JSON.parse(row.normalized_data); } catch (e) {}
            }
            return row;
        });

        return { data: returnRows, total: countResultTotal };
    }

    // Get crawl result by ID
    static async getById(id) {
        const result = await query(
            `SELECT cr.*, s.name as source_name, s.url as source_url
       FROM crawl_results cr
       LEFT JOIN sources s ON cr.source_id = s.id
       WHERE cr.id = $1`,
            [id]
        );
        if (!result.rows[0]) return null;
        
        const row = result.rows[0];
        if (typeof row.raw_data === 'string') {
            try { row.raw_data = JSON.parse(row.raw_data); } catch (e) {}
        }
        if (typeof row.normalized_data === 'string') {
            try { row.normalized_data = JSON.parse(row.normalized_data); } catch (e) {}
        }
        
        return row;
    }

    // Create new crawl result
    static async create(data) {
        const result = await query(
            `INSERT INTO crawl_results (
        crawl_job_id, source_id, type, raw_data, normalized_data, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
            [
                data.crawl_job_id,
                data.source_id,
                data.type,
                JSON.stringify(data.raw_data),
                JSON.stringify(data.normalized_data),
                'pending'
            ]
        );

        if (result.lastID) {
            return await this.getById(result.lastID);
        }
        return null;
    }

    // Update crawl result (for editing before approval)
    static async update(id, normalizedData) {
        await query(
            `UPDATE crawl_results 
       SET normalized_data = $1
       WHERE id = $2`,
            [JSON.stringify(normalizedData), id]
        );
        return await this.getById(id);
    }

    // Approve crawl result
    static async approve(id, adminId) {
        await query(
            `UPDATE crawl_results 
       SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
            [adminId, id]
        );
        return await this.getById(id);
    }

    // Reject crawl result
    static async reject(id, adminId, reason) {
        await query(
            `UPDATE crawl_results 
       SET status = 'rejected', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = $2
       WHERE id = $3`,
            [adminId, reason, id]
        );
        return await this.getById(id);
    }

    // Bulk create crawl results
    static async bulkCreate(results) {
        if (results.length === 0) return [];

        const values = results.map((r, i) => {
            const base = i * 5;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
        }).join(', ');

        const params = results.flatMap(r => [
            r.crawl_job_id,
            r.source_id,
            r.type,
            JSON.stringify(r.raw_data),
            JSON.stringify(r.normalized_data)
        ]);

        const result = await query(
            `INSERT INTO crawl_results (crawl_job_id, source_id, type, raw_data, normalized_data, status)
       VALUES ${values}`,
            params
        );

        return result.rows; // Note: Bulk create without RETURNING will need extra handling if rows are needed immediately

        return result.rows;
    }
}

module.exports = CrawlResultModel;
