const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config/env');

const dbPath = config.database.dbPath;

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to SQLite database:', err.message);
    }
});

// ─── Query Helper (mimics pg interface) ───────────────────────────────────────
const query = (text, params = []) => {
    return new Promise((resolve, reject) => {
        let sql = text;
        const finalParams = [];

        if (Array.isArray(params) && params.length > 0) {
            const matches = [...text.matchAll(/\$(\d+)/g)];
            if (matches.length > 0) {
                matches.forEach(match => {
                    const index = parseInt(match[1]) - 1;
                    finalParams.push(params[index]);
                });
                sql = text.replace(/\$\d+/g, '?');
            } else {
                finalParams.push(...params);
            }
        }

        const trimmed = sql.trim().toUpperCase();
        const method = trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') ? 'all' : 'run';

        db[method](sql, finalParams, function (err, rows) {
            if (err) {
                console.error('DB error:', err.message, '\nSQL:', sql);
                return reject(err);
            }
            resolve({
                rows: Array.isArray(rows) ? rows : [],
                rowCount: Array.isArray(rows) ? rows.length : this.changes,
                lastID: this.lastID
            });
        });
    });
};

// ─── Schema Init ──────────────────────────────────────────────────────────────
const initDb = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('PRAGMA journal_mode=WAL');
            db.run('PRAGMA foreign_keys=ON');

            // ── Schemes (full MyScheme.gov.in schema) ──────────────────────
            db.run(`
                CREATE TABLE IF NOT EXISTS schemes (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    external_id          TEXT UNIQUE,
                    slug                 TEXT UNIQUE,
                    title                TEXT NOT NULL,
                    short_title          TEXT,
                    description          TEXT,
                    detailed_description TEXT,
                    ministry             TEXT,
                    department           TEXT,
                    category             TEXT,
                    sub_category         TEXT,
                    level                TEXT,
                    scheme_type          TEXT,
                    benefits             TEXT,
                    eligibility          TEXT,
                    application_process  TEXT,
                    documents_required   TEXT,
                    faqs                 TEXT,
                    tags                 TEXT,
                    target_beneficiaries TEXT,
                    open_date            TEXT,
                    close_date           TEXT,
                    application_url      TEXT,
                    contact_info         TEXT,
                    "references"         TEXT,
                    applicable_states    TEXT,
                    state                TEXT,
                    lang                 TEXT DEFAULT 'en',
                    translations         TEXT,
                    raw_data             TEXT,
                    status               TEXT DEFAULT 'pending',
                    approved_by          INTEGER,
                    approved_at          DATETIME,
                    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_updated         DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ── Tenders ────────────────────────────────────────────────────
            db.run(`
                CREATE TABLE IF NOT EXISTS tenders (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    tender_name      TEXT NOT NULL,
                    tender_id        TEXT UNIQUE,
                    reference_number TEXT,
                    state            TEXT NOT NULL,
                    department       TEXT,
                    ministry         TEXT,
                    tender_type      TEXT,
                    published_date   TEXT,
                    opening_date     TEXT,
                    closing_date     TEXT,
                    description      TEXT,
                    documents_required TEXT,
                    fee_details      TEXT,
                    source_url       TEXT UNIQUE,
                    source_website   TEXT,
                    status           TEXT DEFAULT 'pending',
                    approved_by      INTEGER,
                    approved_at      DATETIME,
                    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_updated     DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ── Recruitments ───────────────────────────────────────────────
            db.run(`
                CREATE TABLE IF NOT EXISTS recruitments (
                    id                         INTEGER PRIMARY KEY AUTOINCREMENT,
                    post_name                  TEXT NOT NULL,
                    organization               TEXT,
                    state                      TEXT NOT NULL,
                    ministry                   TEXT,
                    qualification              TEXT,
                    vacancy_count              INTEGER DEFAULT 0,
                    application_start_date     TEXT,
                    application_end_date       TEXT,
                    age_limit                  TEXT,
                    selection_process          TEXT,
                    application_fee            TEXT,
                    documents_required         TEXT,
                    official_notification_link TEXT,
                    source_url                 TEXT UNIQUE,
                    source_website             TEXT,
                    status                     TEXT DEFAULT 'pending',
                    approved_by                INTEGER,
                    approved_at                DATETIME,
                    created_at                 DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_updated               DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ── Sources ────────────────────────────────────────────────────
            db.run(`
                CREATE TABLE IF NOT EXISTS sources (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    name            TEXT NOT NULL,
                    url             TEXT NOT NULL,
                    type            TEXT NOT NULL,
                    is_active       INTEGER DEFAULT 1,
                    last_crawled_at DATETIME,
                    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ── Crawler Jobs ───────────────────────────────────────────────
            db.run(`
                CREATE TABLE IF NOT EXISTS crawler_jobs (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id       INTEGER,
                    job_type        TEXT NOT NULL,
                    status          TEXT DEFAULT 'pending',
                    batch_size      INTEGER DEFAULT 50,
                    current_batch   INTEGER DEFAULT 0,
                    estimated_total INTEGER DEFAULT 0,
                    total_fetched   INTEGER DEFAULT 0,
                    success_count   INTEGER DEFAULT 0,
                    failed_count    INTEGER DEFAULT 0,
                    duplicate_count INTEGER DEFAULT 0,
                    error_count     INTEGER DEFAULT 0,
                    error_message   TEXT,
                    started_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at    DATETIME,
                    last_updated    DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ── Crawler Status (singleton) ─────────────────────────────────
            db.run(`
                CREATE TABLE IF NOT EXISTS crawler_status (
                    id              INTEGER PRIMARY KEY DEFAULT 1,
                    is_running      INTEGER DEFAULT 0,
                    current_job_id  INTEGER,
                    last_run_at     DATETIME,
                    last_success_at DATETIME,
                    last_error      TEXT,
                    total_runs      INTEGER DEFAULT 0,
                    total_success   INTEGER DEFAULT 0,
                    total_failures  INTEGER DEFAULT 0,
                    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ── Crawl Results ──────────────────────────────────────────────
            db.run(`
                CREATE TABLE IF NOT EXISTS crawl_results (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    crawl_job_id    INTEGER,
                    source_id       INTEGER,
                    type            TEXT,
                    raw_data        TEXT,
                    normalized_data TEXT,
                    status          TEXT DEFAULT 'pending',
                    reviewed_by     INTEGER,
                    reviewed_at     DATETIME,
                    rejection_reason TEXT,
                    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ── Admins ─────────────────────────────────────────────────────
            db.run(`
                CREATE TABLE IF NOT EXISTS admins (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    email         TEXT UNIQUE NOT NULL,
                    username      TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role          TEXT DEFAULT 'moderator',
                    is_active     INTEGER DEFAULT 1,
                    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ── Eligibility Checks ─────────────────────────────────────────
            db.run(`
                CREATE TABLE IF NOT EXISTS eligibility_checks (
                    id                INTEGER PRIMARY KEY AUTOINCREMENT,
                    age               INTEGER,
                    gender            TEXT,
                    state             TEXT,
                    category          TEXT,
                    annual_income     REAL,
                    has_bank_account  INTEGER DEFAULT 0,
                    employment_status TEXT,
                    occupation_type   TEXT,
                    eligible_schemes  TEXT,
                    eligible_count    INTEGER DEFAULT 0,
                    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ── Audit Logs ─────────────────────────────────────────────────
            db.run(`
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_id    INTEGER,
                    action      TEXT NOT NULL,
                    entity_type TEXT,
                    entity_id   INTEGER,
                    changes     TEXT,
                    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ── Indexes ────────────────────────────────────────────────────
            const indexes = [
                'CREATE INDEX IF NOT EXISTS idx_schemes_state       ON schemes(state)',
                'CREATE INDEX IF NOT EXISTS idx_schemes_status      ON schemes(status)',
                'CREATE INDEX IF NOT EXISTS idx_schemes_slug        ON schemes(slug)',
                'CREATE INDEX IF NOT EXISTS idx_schemes_external_id ON schemes(external_id)',
                'CREATE INDEX IF NOT EXISTS idx_tenders_state       ON tenders(state)',
                'CREATE INDEX IF NOT EXISTS idx_tenders_status      ON tenders(status)',
                'CREATE INDEX IF NOT EXISTS idx_recruitments_state  ON recruitments(state)',
                'CREATE INDEX IF NOT EXISTS idx_crawler_jobs_status ON crawler_jobs(status)',
            ];
            indexes.forEach(idx => db.run(idx));

            // ── Seed: default sources ──────────────────────────────────────
            db.run(`
                INSERT OR IGNORE INTO sources (id, name, url, type, is_active)
                VALUES
                    (1, 'MyScheme.gov.in', 'https://www.myscheme.gov.in', 'scheme',      1),
                    (2, 'eProcure.gov.in', 'https://eprocure.gov.in/',   'tender',      0),
                    (3, 'NCS Portal',      'https://www.ncs.gov.in/',    'recruitment', 0)
            `);

            // ── Seed: crawler_status singleton ─────────────────────────────
            db.run(`INSERT OR IGNORE INTO crawler_status (id) VALUES (1), (2), (3)`, [], function(err) {
                if (err) return reject(err);
                resolve();
            });
        });
    });
};

module.exports = { db, query, initDb };
