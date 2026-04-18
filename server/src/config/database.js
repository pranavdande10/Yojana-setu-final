// Single source of truth for DB — delegates to src/database/db.js
const { db, query, initDb } = require('../database/db');

// Basic wrapper for transactions (since SQLite handles them differently)
const transaction = async (callback) => {
    // We pass a mock "client" that just calls query
    const client = { query };
    try {
        await query('BEGIN TRANSACTION');
        await callback(client);
        await query('COMMIT');
    } catch (error) {
        await query('ROLLBACK');
        throw error;
    }
};

module.exports = { pool: db, db, query, initDb, transaction };
