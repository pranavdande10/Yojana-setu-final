const axios = require('axios');
const { query } = require('../src/config/database');
const { STATES } = require('../src/config/constants');
require('dotenv').config();

const API_KEY = process.env.MYSCHEME_API_KEY || 'tYTy5eEhlu9rFjyxuCr7ra7ACp4dv1RH8gWuHTDc';
const API_BASE = 'https://api.myscheme.gov.in/schemes/v6/public/schemes';

/**
 * Main function to feed data
 */
async function feedData() {
    try {
        console.log('🚀 Starting direct data feed to SQLite...');

        // 1. Seed Default Admin
        await seedAdmin();

        // 2. Fetch and Seed Schemes
        await feedSchemes();

        // 3. Seed Recruitments
        await feedRecruitments();

        // 4. Seed Tenders
        await feedTenders();

        console.log('\n✅ Data feeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Data feeding failed:', error.message || error);
        process.exit(1);
    }
}

/**
 * Seeds a default admin
 */
async function seedAdmin() {
    console.log('\n--- Seeding Admin ---');
    try {
        await query(`
            INSERT OR IGNORE INTO admins (email, password, name, role)
            VALUES ($1, $2, $3, $4)
        `, ['admin@yojanasetu.gov.in', '$2b$10$rKvVPZqGhqVqJ5Y5mKZN3OXxJ5Y5mKZN3OXxJ5Y5mKZN3OXxJ5Y5mK', 'System Administrator', 'admin']);
        console.log('✅ Default admin ensured.');
    } catch (err) {
        console.error('Error seeding admin:', err.message);
    }
}

/**
 * Fetches schemes from MyScheme API and seeds them
 */
async function feedSchemes() {
    console.log('\n--- Feeding Schemes ---');
    try {
        // Use a list of known slugs since the list API is failing
        const slugs = [
            'pmmy', 'sui', 'pmjdy', 'pmjjby', 'pmsby', 'apy', 'pmegp',
            'nsap', 'pmksy', 'pmay-u', 'pmay-g', 'mgnrega', 'dbt', 'ssy',
            'kvp', 'scss', 'ppf', 'nsc', 'nps', 'pmsym'
        ];

        console.log(`Fetching ${slugs.length} schemes by slug...`);

        const rawSchemes = [];
        for (const slug of slugs) {
            let retries = 3;
            let success = false;

            while (retries > 0 && !success) {
                try {
                    const resp = await axios.get(`${API_BASE}?slug=${slug}&lang=en`, {
                        headers: { 'x-api-key': API_KEY },
                        timeout: 10000
                    });
                    if (resp.status === 200 && resp.data && resp.data.data) {
                        rawSchemes.push(resp.data.data);
                        success = true;
                    }
                } catch (err) {
                    retries--;
                    if (retries === 0) {
                        console.error(`\nFailed to fetch slug ${slug} after 3 attempts:`, err.message);
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`\nFetched ${rawSchemes.length} schemes.`);

        // Group by state for distribution
        const schemesByState = {};
        STATES.forEach(s => schemesByState[s] = []);

        rawSchemes.forEach(s => {
            const langData = s.en || s.hi || {};
            const state = langData.basicDetails?.state || 'Central';
            if (schemesByState[state]) {
                schemesByState[state].push(s);
            } else {
                schemesByState['Central'].push(s);
            }
        });

        // Ensure we have at least 10 per state (fill from Central if needed)
        const toSave = [];
        for (const state of STATES) {
            let stateSchemes = schemesByState[state].slice(0, 10);

            // If less than 10, fill from Central
            if (stateSchemes.length < 10 && state !== 'Central') {
                const fill = schemesByState['Central'].slice(0, 10 - stateSchemes.length);
                stateSchemes = [...stateSchemes, ...fill];
            }

            for (const s of stateSchemes) {
                const langData = s.en || s.hi || {};
                const bd = langData.basicDetails || {};
                const sc = langData.schemeContent || {};
                const ec = langData.eligibilityCriteria || {};

                toSave.push({
                    external_id: s._id,
                    slug: s.slug,
                    title: bd.schemeName || 'Untitled Scheme',
                    short_title: bd.schemeShortTitle,
                    description: sc.briefDescription || '',
                    detailed_description: JSON.stringify(sc.detailedDescription || {}),
                    ministry: bd.nodalMinistryName?.label || bd.ministry || 'Government of India',
                    department: bd.nodalDepartmentName?.label || bd.department,
                    category: bd.schemeCategory?.[0]?.label || 'General',
                    sub_category: JSON.stringify(bd.schemeSubCategory?.map(sc => sc.label) || []),
                    level: bd.level?.label || (state === 'Central' ? 'Central' : 'State'),
                    scheme_type: bd.schemeType?.label || 'Direct Benefit Transfer',
                    benefits: JSON.stringify(sc.benefits || []),
                    eligibility: JSON.stringify(ec.eligibilityDescription || []),
                    application_process: JSON.stringify(langData.applicationProcess || []),
                    documents_required: JSON.stringify(s.documents || []),
                    faqs: JSON.stringify(s.faqs || []),
                    tags: JSON.stringify(bd.tags || []),
                    target_beneficiaries: JSON.stringify(bd.targetBeneficiaries?.map(t => t.label) || []),
                    open_date: bd.schemeOpenDate,
                    close_date: bd.schemeCloseDate,
                    application_url: `https://www.myscheme.gov.in/schemes/${s.slug}`,
                    contact_info: JSON.stringify({}),
                    references: JSON.stringify(sc.references || []),
                    applicable_states: JSON.stringify([state]),
                    lang: 'en',
                    translations: JSON.stringify({}),
                    raw_data: JSON.stringify(s),
                    status: 'approved'
                });
            }
        }

        // Batch Insert for SQLite
        for (const item of toSave) {
            await query(`
                INSERT OR REPLACE INTO schemes (
                    external_id, slug, title, short_title, description, detailed_description,
                    ministry, department, category, sub_category, level, scheme_type,
                    benefits, eligibility, application_process, documents_required, faqs,
                    tags, target_beneficiaries, open_date, close_date,
                    application_url, contact_info, "references", applicable_states,
                    lang, translations, raw_data, status, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, CURRENT_TIMESTAMP)
            `, [
                item.external_id, item.slug, item.title, item.short_title, item.description, item.detailed_description,
                item.ministry, item.department, item.category, item.sub_category, item.level, item.scheme_type,
                item.benefits, item.eligibility, item.application_process, item.documents_required, item.faqs,
                item.tags, item.target_beneficiaries, item.open_date, item.close_date,
                item.application_url, item.contact_info, item.references, item.applicable_states,
                item.lang, item.translations, item.raw_data, item.status
            ]);
        }
        console.log(`✅ Successfully seeded ${toSave.length} schemes across states.`);
    } catch (err) {
        console.error('Error seeding schemes:', err.message);
    }
}

/**
 * Seeds Recruitments
 */
async function feedRecruitments() {
    console.log('\n--- Feeding Recruitments ---');
    const recruitments = [];
    const industries = ['IT & ITES', 'Manufacturing', 'Healthcare', 'Banking', 'Education', 'Public Administration'];
    const roles = ['Assistant Engineer', 'Data Entry Operator', 'Nurse', 'Clerk', 'Officer', 'Teacher', 'Technician'];

    for (const state of STATES) {
        for (let i = 1; i <= 10; i++) {
            const role = roles[Math.floor(Math.random() * roles.length)];
            const industry = industries[Math.floor(Math.random() * industries.length)];

            recruitments.push({
                post_name: `${role} - ${state} Region`,
                organization: `${state} ${industry} Department`,
                state: state,
                qualification: 'Graduation / Relevant Diploma',
                vacancies: Math.floor(Math.random() * 50) + 5,
                application_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                age_limit: '18-35 years',
                salary: `₹${Math.floor(Math.random() * 40000) + 20000} - ₹${Math.floor(Math.random() * 60000) + 50000}`,
                url: 'https://www.ncs.gov.in/',
                status: 'approved'
            });
        }
    }

    for (const r of recruitments) {
        await query(`
            INSERT OR IGNORE INTO recruitments (post_name, organization, state, qualification, vacancies, application_end_date, age_limit, salary, url, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [r.post_name, r.organization, r.state, r.qualification, r.vacancies, r.application_end_date, r.age_limit, r.salary, r.url, r.status]);
    }
    console.log(`✅ Seeded ${recruitments.length} recruitments.`);
}

/**
 * Seeds Tenders
 */
async function feedTenders() {
    console.log('\n--- Feeding Tenders ---');
    const tenders = [];
    const depts = ['Public Works', 'Irrigation', 'Water Resources', 'Health', 'Rural Development', 'Forest'];
    const types = ['Open Tender', 'Limited Tender', 'Auction', 'Expression of Interest'];

    for (const state of STATES) {
        for (let i = 1; i <= 10; i++) {
            const dept = depts[Math.floor(Math.random() * depts.length)];
            const type = types[Math.floor(Math.random() * types.length)];
            const randomNum = Math.floor(100000 + Math.random() * 900000); // 6 digit random

            tenders.push({
                tender_name: `Construction/Supply for ${dept} - ${state}`,
                tender_id: `TND/${state.substring(0, 2).toUpperCase()}/${2024}/${randomNum}`,
                state: state,
                department: `${dept} Department`,
                tender_type: type,
                closing_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                amount: `₹${(Math.random() * 50).toFixed(2)} Lakhs`,
                url: 'https://eprocure.gov.in/eprocure/app',
                status: 'approved'
            });
        }
    }

    for (const t of tenders) {
        await query(`
            INSERT OR IGNORE INTO tenders (tender_name, tender_id, state, department, tender_type, closing_date, amount, url, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [t.tender_name, t.tender_id, t.state, t.department, t.tender_type, t.closing_date, t.amount, t.url, t.status]);
    }
    console.log(`✅ Seeded ${tenders.length} tenders.`);
}

feedData();
