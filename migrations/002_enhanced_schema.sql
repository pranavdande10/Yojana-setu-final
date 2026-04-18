-- Enhanced Database Schema for YojanaSetu
-- Phase 7: MyScheme API Integration

-- ============================================
-- 1. Enhanced Schemes Table
-- ============================================

-- Drop existing schemes table if needed (for migration)
-- DROP TABLE IF EXISTS schemes CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enhanced schemes table with rich data support
CREATE TABLE IF NOT EXISTS schemes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- External References
    external_id TEXT UNIQUE,              -- MyScheme API _id
    slug TEXT UNIQUE,                     -- URL-friendly identifier
    
    -- Basic Information
    title TEXT NOT NULL,
    short_title TEXT,
    description TEXT,
    detailed_description JSONB,           -- Rich text with formatting
    
    -- Organization & Classification
    ministry TEXT,
    department TEXT,
    category TEXT,
    sub_category TEXT[],
    level TEXT,                           -- 'Central' or 'State'
    scheme_type TEXT,                     -- 'Central Sector Scheme', etc.
    
    -- Rich Content (JSONB for structured data)
    benefits JSONB,                       -- Structured benefits list
    eligibility JSONB,                    -- Structured eligibility criteria
    application_process JSONB,            -- Step-by-step process
    documents_required JSONB,             -- Required documents list
    faqs JSONB,                          -- Frequently asked questions
    
    -- Metadata & Tags
    tags TEXT[],
    target_beneficiaries TEXT[],
    
    -- Dates
    open_date DATE,
    close_date DATE,
    
    -- Contact & Links
    application_url TEXT,
    contact_info JSONB,                   -- Phone, email, toll-free numbers
    "references" JSONB,                     -- External links, brochures
    
    -- Geographic Coverage
    applicable_states TEXT[],             -- ['All India'] or specific states
    
    -- Multilingual Support
    lang TEXT DEFAULT 'en',
    translations JSONB,                   -- Other language versions
    
    -- Admin & Status
    status TEXT DEFAULT 'pending',        -- 'pending', 'approved', 'rejected'
    approved_by UUID,                     -- Admin who approved (no FK constraint)
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Raw Data (for debugging/reference)
    raw_data JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_schemes_external_id ON schemes(external_id);
CREATE INDEX IF NOT EXISTS idx_schemes_slug ON schemes(slug);
CREATE INDEX IF NOT EXISTS idx_schemes_status ON schemes(status);
CREATE INDEX IF NOT EXISTS idx_schemes_category ON schemes(category);
CREATE INDEX IF NOT EXISTS idx_schemes_ministry ON schemes(ministry);
CREATE INDEX IF NOT EXISTS idx_schemes_level ON schemes(level);
CREATE INDEX IF NOT EXISTS idx_schemes_tags ON schemes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_schemes_states ON schemes USING GIN(applicable_states);
CREATE INDEX IF NOT EXISTS idx_schemes_created_at ON schemes(created_at DESC);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_schemes_search ON schemes USING GIN(
    to_tsvector('english', 
        COALESCE(title, '') || ' ' || 
        COALESCE(description, '') || ' ' || 
        COALESCE(ministry, '') || ' ' ||
        COALESCE(category, '')
    )
);

-- ============================================
-- 2. Crawler Status Tracking Table
-- ============================================

CREATE TABLE IF NOT EXISTS crawler_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Job Information
    job_type TEXT NOT NULL,               -- 'schemes', 'tenders', 'recruitments'
    status TEXT NOT NULL,                 -- 'running', 'paused', 'stopped', 'completed', 'failed'
    
    -- Progress Tracking
    batch_size INTEGER DEFAULT 50,
    current_batch INTEGER DEFAULT 0,
    total_fetched INTEGER DEFAULT 0,
    estimated_total INTEGER,
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    last_updated TIMESTAMP DEFAULT NOW(),
    
    -- Error Handling
    error_message TEXT,
    error_count INTEGER DEFAULT 0,
    
    -- Configuration
    config JSONB,                         -- API params, filters, etc.
    
    -- Results
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    
    -- Metadata
    triggered_by UUID,                    -- Admin who triggered (no FK constraint)
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for crawler jobs
CREATE INDEX IF NOT EXISTS idx_crawler_jobs_status ON crawler_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawler_jobs_type ON crawler_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_crawler_jobs_started ON crawler_jobs(started_at DESC);

-- ============================================
-- 3. Crawler Status Singleton Table
-- ============================================

CREATE TABLE IF NOT EXISTS crawler_status (
    id INTEGER PRIMARY KEY DEFAULT 1,
    
    -- Current Status
    is_running BOOLEAN DEFAULT FALSE,
    current_job_id UUID REFERENCES crawler_jobs(id),
    
    -- Last Run Info
    last_run_at TIMESTAMP,
    last_success_at TIMESTAMP,
    last_error TEXT,
    
    -- Statistics
    total_runs INTEGER DEFAULT 0,
    total_success INTEGER DEFAULT 0,
    total_failures INTEGER DEFAULT 0,
    
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure only one row exists
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial status row
INSERT INTO crawler_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. User Eligibility Profiles (for eligibility checker)
-- ============================================

CREATE TABLE IF NOT EXISTS eligibility_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- User Information (anonymous)
    session_id TEXT,                      -- For tracking without login
    
    -- Personal Details
    age INTEGER,
    gender TEXT,
    state TEXT,
    category TEXT,                        -- 'general', 'sc', 'st', 'obc'
    
    -- Financial Details
    annual_income DECIMAL(15,2),
    has_bank_account BOOLEAN,
    
    -- Occupation
    employment_status TEXT,               -- 'employed', 'self-employed', 'unemployed', 'student'
    occupation_type TEXT,
    
    -- Results
    eligible_schemes UUID[],              -- Array of scheme IDs
    eligible_count INTEGER,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eligibility_session ON eligibility_checks(session_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_created ON eligibility_checks(created_at DESC);

-- ============================================
-- 5. Update Triggers
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to schemes table
DROP TRIGGER IF EXISTS update_schemes_updated_at ON schemes;
CREATE TRIGGER update_schemes_updated_at
    BEFORE UPDATE ON schemes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to crawler_status
DROP TRIGGER IF EXISTS update_crawler_status_updated_at ON crawler_status;
CREATE TRIGGER update_crawler_status_updated_at
    BEFORE UPDATE ON crawler_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. Helper Functions
-- ============================================

-- Function to check scheme eligibility
CREATE OR REPLACE FUNCTION check_scheme_eligibility(
    p_age INTEGER,
    p_gender TEXT,
    p_state TEXT,
    p_category TEXT,
    p_income DECIMAL,
    p_has_bank_account BOOLEAN,
    p_employment TEXT
)
RETURNS TABLE(scheme_id UUID, match_score INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        (
            -- Age matching
            CASE 
                WHEN s.eligibility->>'min_age' IS NOT NULL 
                    AND p_age >= (s.eligibility->>'min_age')::INTEGER 
                    AND p_age <= COALESCE((s.eligibility->>'max_age')::INTEGER, 999)
                THEN 20
                ELSE 0
            END +
            
            -- State matching
            CASE 
                WHEN 'All India' = ANY(s.applicable_states) THEN 20
                WHEN p_state = ANY(s.applicable_states) THEN 20
                ELSE 0
            END +
            
            -- Bank account requirement
            CASE 
                WHEN s.eligibility->>'requires_bank_account' = 'true' 
                    AND p_has_bank_account = TRUE 
                THEN 15
                WHEN s.eligibility->>'requires_bank_account' IS NULL 
                THEN 15
                ELSE 0
            END +
            
            -- Category matching
            CASE 
                WHEN s.eligibility->'categories' @> to_jsonb(p_category) THEN 15
                WHEN s.eligibility->'categories' IS NULL THEN 10
                ELSE 0
            END +
            
            -- Income criteria
            CASE 
                WHEN s.eligibility->>'max_income' IS NOT NULL 
                    AND p_income <= (s.eligibility->>'max_income')::DECIMAL 
                THEN 15
                WHEN s.eligibility->>'max_income' IS NULL 
                THEN 10
                ELSE 0
            END
        ) AS match_score
    FROM schemes s
    WHERE s.status = 'approved'
    HAVING match_score >= 40  -- Minimum 40% match
    ORDER BY match_score DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Sample Data for Testing
-- ============================================

-- This will be populated by the crawler
-- But we can add a sample scheme for testing

COMMENT ON TABLE schemes IS 'Enhanced schemes table with rich JSONB data for complete scheme information';
COMMENT ON TABLE crawler_jobs IS 'Tracks crawler batch jobs with progress and status';
COMMENT ON TABLE crawler_status IS 'Singleton table for current crawler status';
COMMENT ON TABLE eligibility_checks IS 'Stores user eligibility check requests and results';
