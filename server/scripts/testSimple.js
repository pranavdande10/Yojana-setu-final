#!/usr/bin/env node

/**
 * Simple Test - Fetch and Save 5 Schemes
 * Tests the MyScheme API and database integration
 */

const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const API_BASE = process.env.MYSCHEME_API_BASE;
const API_KEY = process.env.MYSCHEME_API_KEY;

async function testSimple() {
    console.log('🧪 Simple Test - Fetch 5 Schemes\n');
    console.log('='.repeat(70));

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // Test API connection
        console.log('\n📡 Testing MyScheme API...');
        console.log(`   URL: ${API_BASE}?limit=5&lang=en`);

        const response = await axios.get(`${API_BASE}?limit=5&lang=en`, {
            headers: { 'x-api-key': API_KEY }
        });

        console.log(`   ✅ API Response: ${response.status}`);
        console.log(`   ✅ Schemes received: ${response.data.data?.length || 0}`);

        const schemes = response.data.data || [];

        // Save each scheme
        console.log('\n💾 Saving schemes to database...\n');

        for (const rawScheme of schemes) {
            const langData = rawScheme.en || {};
            const basicDetails = langData.basicDetails || {};
            const schemeContent = langData.schemeContent || {};

            const title = basicDetails.schemeName || 'Untitled';
            const ministry = basicDetails.nodalMinistryName?.label;
            const category = basicDetails.schemeCategory?.[0]?.label;

            console.log(`   Processing: ${title}`);

            // Check if exists
            const existing = await pool.query(
                'SELECT id FROM schemes WHERE external_id = $1',
                [rawScheme._id]
            );

            if (existing.rows.length > 0) {
                console.log(`      ⏭️  Already exists, skipping`);
                continue;
            }

            // Insert
            await pool.query(`
                INSERT INTO schemes (
                    external_id, slug, title, short_title, description,
                    ministry, department, category, level,
                    benefits, eligibility, tags, applicable_states,
                    raw_data, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `, [
                rawScheme._id,
                rawScheme.slug,
                title,
                basicDetails.schemeShortTitle,
                schemeContent.briefDescription,
                ministry,
                basicDetails.nodalDepartmentName?.label,
                category,
                basicDetails.level?.label,
                JSON.stringify(schemeContent.benefits || []),
                JSON.stringify(langData.eligibilityCriteria || {}),
                basicDetails.tags || [],
                basicDetails.level?.value === 'central' ? ['All India'] : [],
                JSON.stringify(rawScheme),
                'pending'
            ]);

            console.log(`      ✅ Saved successfully`);
        }

        // Show stats
        console.log('\n📊 Database Statistics:');
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'pending') as pending
            FROM schemes
        `);

        console.log(`   Total schemes: ${stats.rows[0].total}`);
        console.log(`   Pending approval: ${stats.rows[0].pending}`);

        // Show sample
        const samples = await pool.query(`
            SELECT title, ministry, category, level
            FROM schemes
            WHERE external_id IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 5
        `);

        console.log('\n📝 Recent Schemes:');
        samples.rows.forEach((scheme, i) => {
            console.log(`   ${i + 1}. ${scheme.title}`);
            console.log(`      Ministry: ${scheme.ministry || 'N/A'}`);
            console.log(`      Category: ${scheme.category || 'N/A'}`);
            console.log(`      Level: ${scheme.level || 'N/A'}`);
        });

        await pool.end();

        console.log('\n🎉 Test completed successfully!');

    } catch (error) {
        console.error('\n❌ Test failed:');
        console.error(error.message);
        if (error.response) {
            console.error('API Response:', error.response.status, error.response.data);
        }
        console.error('\nStack trace:');
        console.error(error.stack);
        process.exit(1);
    }
}

testSimple().catch(console.error);
