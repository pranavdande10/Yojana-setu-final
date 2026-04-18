#!/usr/bin/env node

/**
 * Database Migration Script - Add Enhanced Columns
 * Adds new JSONB columns to existing schemes table
 */

const { Pool } = require('pg');
require('dotenv').config();

const migrationSQL = `
-- Enhanced Database Schema for YojanaSetu
-- Phase 7: MyScheme API Integration
-- This migration ADDS columns to existing tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. Add New Columns to Existing Schemes Table
-- ============================================

-- Add external_id if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='external_id') THEN
        ALTER TABLE schemes ADD COLUMN external_id TEXT UNIQUE;
    END IF;
END $$;

-- Add slug if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='slug') THEN
        ALTER TABLE schemes ADD COLUMN slug TEXT UNIQUE;
    END IF;
END $$;

-- Add short_title
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='short_title') THEN
        ALTER TABLE schemes ADD COLUMN short_title TEXT;
    END IF;
END $$;

-- Add detailed_description (JSONB)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='detailed_description') THEN
        ALTER TABLE schemes ADD COLUMN detailed_description JSONB;
    END IF;
END $$;

-- Add department
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='department') THEN
        ALTER TABLE schemes ADD COLUMN department TEXT;
    END IF;
END $$;

-- Add sub_category
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='sub_category') THEN
        ALTER TABLE schemes ADD COLUMN sub_category TEXT[];
    END IF;
END $$;

-- Add level
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='level') THEN
        ALTER TABLE schemes ADD COLUMN level TEXT;
    END IF;
END $$;

-- Add scheme_type
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='scheme_type') THEN
        ALTER TABLE schemes ADD COLUMN scheme_type TEXT;
    END IF;
END $$;

-- Add benefits (JSONB)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='benefits') THEN
        ALTER TABLE schemes ADD COLUMN benefits JSONB;
    END IF;
END $$;

-- Add eligibility (JSONB)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='eligibility') THEN
        ALTER TABLE schemes ADD COLUMN eligibility JSONB;
    END IF;
END $$;

-- Add application_process (JSONB)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='application_process') THEN
        ALTER TABLE schemes ADD COLUMN application_process JSONB;
    END IF;
END $$;

-- Add faqs (JSONB)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='faqs') THEN
        ALTER TABLE schemes ADD COLUMN faqs JSONB;
    END IF;
END $$;

-- Add tags
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='tags') THEN
        ALTER TABLE schemes ADD COLUMN tags TEXT[];
    END IF;
END $$;

-- Add target_beneficiaries
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='target_beneficiaries') THEN
        ALTER TABLE schemes ADD COLUMN target_beneficiaries TEXT[];
    END IF;
END $$;

-- Add open_date
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='open_date') THEN
        ALTER TABLE schemes ADD COLUMN open_date DATE;
    END IF;
END $$;

-- Add close_date
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='close_date') THEN
        ALTER TABLE schemes ADD COLUMN close_date DATE;
    END IF;
END $$;

-- Add application_url
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='application_url') THEN
        ALTER TABLE schemes ADD COLUMN application_url TEXT;
    END IF;
END $$;

-- Add contact_info (JSONB)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='contact_info') THEN
        ALTER TABLE schemes ADD COLUMN contact_info JSONB;
    END IF;
END $$;

-- Add scheme_references (JSONB) - renamed from 'references' to avoid SQL keyword
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='scheme_references') THEN
        ALTER TABLE schemes ADD COLUMN scheme_references JSONB;
    END IF;
END $$;

-- Add applicable_states
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='applicable_states') THEN
        ALTER TABLE schemes ADD COLUMN applicable_states TEXT[];
    END IF;
END $$;

-- Add lang
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='lang') THEN
        ALTER TABLE schemes ADD COLUMN lang TEXT DEFAULT 'en';
    END IF;
END $$;

-- Add translations (JSONB)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='translations') THEN
        ALTER TABLE schemes ADD COLUMN translations JSONB;
    END IF;
END $$;

-- Add raw_data (JSONB)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schemes' AND column_name='raw_data') THEN
        ALTER TABLE schemes ADD COLUMN raw_data JSONB;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_schemes_external_id ON schemes(external_id);
CREATE INDEX IF NOT EXISTS idx_schemes_slug ON schemes(slug);
CREATE INDEX IF NOT EXISTS idx_schemes_tags ON schemes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_schemes_states ON schemes USING GIN(applicable_states);

-- ============================================
-- 2. Crawler Jobs Table
-- ============================================

CREATE TABLE IF NOT EXISTS crawler_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    status TEXT NOT NULL,
    batch_size INTEGER DEFAULT 50,
    current_batch INTEGER DEFAULT 0,
    total_fetched INTEGER DEFAULT 0,
    estimated_total INTEGER,
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    last_updated TIMESTAMP DEFAULT NOW(),
    error_message TEXT,
    error_count INTEGER DEFAULT 0,
    config JSONB,
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    triggered_by UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawler_jobs_status ON crawler_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawler_jobs_type ON crawler_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_crawler_jobs_started ON crawler_jobs(started_at DESC);

-- ============================================
-- 3. Crawler Status Table
-- ============================================

CREATE TABLE IF NOT EXISTS crawler_status (
    id INTEGER PRIMARY KEY DEFAULT 1,
    is_running BOOLEAN DEFAULT FALSE,
    current_job_id UUID,
    last_run_at TIMESTAMP,
    last_success_at TIMESTAMP,
    last_error TEXT,
    total_runs INTEGER DEFAULT 0,
    total_success INTEGER DEFAULT 0,
    total_failures INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO crawler_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. Eligibility Checks Table
-- ============================================

CREATE TABLE IF NOT EXISTS eligibility_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT,
    age INTEGER,
    gender TEXT,
    state TEXT,
    category TEXT,
    annual_income DECIMAL(15,2),
    has_bank_account BOOLEAN,
    employment_status TEXT,
    occupation_type TEXT,
    eligible_schemes UUID[],
    eligible_count INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eligibility_session ON eligibility_checks(session_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_created ON eligibility_checks(created_at DESC);

-- ============================================
-- 5. Update Triggers
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_schemes_updated_at ON schemes;
CREATE TRIGGER update_schemes_updated_at
    BEFORE UPDATE ON schemes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_crawler_status_updated_at ON crawler_status;
CREATE TRIGGER update_crawler_status_updated_at
    BEFORE UPDATE ON crawler_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

async function runMigration() {
    console.log('🚀 Starting Database Migration...\n');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('📡 Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected successfully\n');

        console.log('⚙️  Executing migration...');
        console.log('─'.repeat(60));

        await pool.query(migrationSQL);

        console.log('─'.repeat(60));
        console.log('✅ Migration completed successfully!\n');

        // Verify tables
        console.log('🔍 Verifying tables...');
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('schemes', 'crawler_jobs', 'crawler_status', 'eligibility_checks')
            ORDER BY table_name;
        `);

        console.log('\n📋 Tables found:');
        result.rows.forEach(row => {
            console.log(`   ✓ ${row.table_name}`);
        });

        // Check new columns in schemes table
        const columns = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'schemes'
            AND column_name IN ('external_id', 'slug', 'benefits', 'eligibility', 'tags', 'raw_data')
            ORDER BY column_name;
        `);

        console.log('\n📊 New columns in schemes table:');
        columns.rows.forEach(row => {
            console.log(`   ✓ ${row.column_name} (${row.data_type})`);
        });

        console.log('\n🎉 Database migration successful!');
        console.log('\n📝 Next steps:');
        console.log('   1. Test crawler: node scripts/testCrawler.js');
        console.log('   2. Verify data structure');

    } catch (error) {
        console.error('\n❌ Migration failed:');
        console.error(error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration().catch(console.error);
