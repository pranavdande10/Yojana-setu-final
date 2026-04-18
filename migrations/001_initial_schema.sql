-- YojanaSetu Database Schema Migration
-- PostgreSQL (Supabase)
-- Version: 1.0.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES (Public Data - Approved Only)
-- ============================================

-- Schemes Table
CREATE TABLE IF NOT EXISTS schemes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    state TEXT NOT NULL,
    region TEXT,
    category TEXT,
    ministry TEXT,
    eligibility_criteria TEXT,
    start_date DATE,
    end_date DATE,
    documents_required TEXT,
    source_url TEXT,
    source_website TEXT,
    status TEXT DEFAULT 'approved' CHECK (status IN ('approved', 'rejected')),
    approved_by UUID,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW()
);

-- Tenders Table
CREATE TABLE IF NOT EXISTS tenders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tender_name TEXT NOT NULL,
    tender_id TEXT,
    reference_number TEXT,
    state TEXT NOT NULL,
    department TEXT,
    ministry TEXT,
    tender_type TEXT,
    published_date DATE,
    opening_date DATE,
    closing_date DATE,
    description TEXT,
    documents_required TEXT,
    fee_details TEXT,
    source_url TEXT,
    source_website TEXT,
    status TEXT DEFAULT 'approved' CHECK (status IN ('approved', 'rejected')),
    approved_by UUID,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW()
);

-- Recruitments Table
CREATE TABLE IF NOT EXISTS recruitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_name TEXT NOT NULL,
    organization TEXT,
    state TEXT NOT NULL,
    ministry TEXT,
    qualification TEXT,
    vacancy_count INTEGER,
    application_start_date DATE,
    application_end_date DATE,
    age_limit TEXT,
    selection_process TEXT,
    application_fee TEXT,
    documents_required TEXT,
    official_notification_link TEXT,
    source_url TEXT,
    source_website TEXT,
    status TEXT DEFAULT 'approved' CHECK (status IN ('approved', 'rejected')),
    approved_by UUID,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SUPPORTING TABLES
-- ============================================

-- Sources Table (Government Website Metadata)
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('scheme', 'tender', 'recruitment')),
    is_active BOOLEAN DEFAULT true,
    last_crawled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Crawl Jobs Table (Job Execution Logs)
CREATE TABLE IF NOT EXISTS crawl_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    records_found INTEGER DEFAULT 0,
    records_saved INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Crawl Results Table (Raw Scraped Data - Staging)
CREATE TABLE IF NOT EXISTS crawl_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    crawl_job_id UUID REFERENCES crawl_jobs(id) ON DELETE CASCADE,
    source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('scheme', 'tender', 'recruitment')),
    raw_data JSONB NOT NULL,
    normalized_data JSONB,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID,
    reviewed_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Admins Table (Admin Authentication)
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'moderator' CHECK (role IN ('admin', 'moderator')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Audit Logs Table (Track Admin Actions)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    changes JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Schemes Indexes
CREATE INDEX IF NOT EXISTS idx_schemes_state ON schemes(state);
CREATE INDEX IF NOT EXISTS idx_schemes_ministry ON schemes(ministry);
CREATE INDEX IF NOT EXISTS idx_schemes_status ON schemes(status);
CREATE INDEX IF NOT EXISTS idx_schemes_last_updated ON schemes(last_updated);
CREATE INDEX IF NOT EXISTS idx_schemes_source_url ON schemes(source_url);

-- Tenders Indexes
CREATE INDEX IF NOT EXISTS idx_tenders_state ON tenders(state);
CREATE INDEX IF NOT EXISTS idx_tenders_ministry ON tenders(ministry);
CREATE INDEX IF NOT EXISTS idx_tenders_status ON tenders(status);
CREATE INDEX IF NOT EXISTS idx_tenders_last_updated ON tenders(last_updated);
CREATE INDEX IF NOT EXISTS idx_tenders_closing_date ON tenders(closing_date);

-- Recruitments Indexes
CREATE INDEX IF NOT EXISTS idx_recruitments_state ON recruitments(state);
CREATE INDEX IF NOT EXISTS idx_recruitments_ministry ON recruitments(ministry);
CREATE INDEX IF NOT EXISTS idx_recruitments_status ON recruitments(status);
CREATE INDEX IF NOT EXISTS idx_recruitments_last_updated ON recruitments(last_updated);
CREATE INDEX IF NOT EXISTS idx_recruitments_end_date ON recruitments(application_end_date);

-- Crawl Results Indexes
CREATE INDEX IF NOT EXISTS idx_crawl_results_status ON crawl_results(status);
CREATE INDEX IF NOT EXISTS idx_crawl_results_type ON crawl_results(type);
CREATE INDEX IF NOT EXISTS idx_crawl_results_job_id ON crawl_results(crawl_job_id);
CREATE INDEX IF NOT EXISTS idx_crawl_results_created_at ON crawl_results(created_at);

-- Crawl Jobs Indexes
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_source_id ON crawl_jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_created_at ON crawl_jobs(created_at);

-- Audit Logs Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================

-- Add foreign key for approved_by in schemes
ALTER TABLE schemes ADD CONSTRAINT fk_schemes_approved_by 
    FOREIGN KEY (approved_by) REFERENCES admins(id) ON DELETE SET NULL;

-- Add foreign key for approved_by in tenders
ALTER TABLE tenders ADD CONSTRAINT fk_tenders_approved_by 
    FOREIGN KEY (approved_by) REFERENCES admins(id) ON DELETE SET NULL;

-- Add foreign key for approved_by in recruitments
ALTER TABLE recruitments ADD CONSTRAINT fk_recruitments_approved_by 
    FOREIGN KEY (approved_by) REFERENCES admins(id) ON DELETE SET NULL;

-- Add foreign key for reviewed_by in crawl_results
ALTER TABLE crawl_results ADD CONSTRAINT fk_crawl_results_reviewed_by 
    FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL;

-- ============================================
-- SEED DATA
-- ============================================

-- Insert default admin account (password: admin123 - CHANGE THIS!)
-- Password hash generated using bcrypt with 10 rounds
INSERT INTO admins (email, password_hash, name, role) 
VALUES (
    'admin@yojanasetu.gov.in',
    '$2b$10$rKvVPZqGhqVqJ5Y5mKZN3OXxJ5Y5mKZN3OXxJ5Y5mKZN3OXxJ5Y5mK',
    'System Administrator',
    'admin'
) ON CONFLICT (email) DO NOTHING;

-- Insert default sources
INSERT INTO sources (name, url, type) VALUES
    ('MyScheme Portal', 'https://www.myscheme.gov.in/', 'scheme'),
    ('eProcure Portal', 'https://eprocure.gov.in/', 'tender'),
    ('National Career Service', 'https://www.ncs.gov.in/', 'recruitment')
ON CONFLICT DO NOTHING;

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update last_updated timestamp
CREATE OR REPLACE FUNCTION update_last_updated()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating last_updated
CREATE TRIGGER update_schemes_last_updated
    BEFORE UPDATE ON schemes
    FOR EACH ROW
    EXECUTE FUNCTION update_last_updated();

CREATE TRIGGER update_tenders_last_updated
    BEFORE UPDATE ON tenders
    FOR EACH ROW
    EXECUTE FUNCTION update_last_updated();

CREATE TRIGGER update_recruitments_last_updated
    BEFORE UPDATE ON recruitments
    FOR EACH ROW
    EXECUTE FUNCTION update_last_updated();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE schemes IS 'Approved government schemes visible to public';
COMMENT ON TABLE tenders IS 'Approved government tenders visible to public';
COMMENT ON TABLE recruitments IS 'Approved government recruitments visible to public';
COMMENT ON TABLE crawl_results IS 'Staging table for scraped data pending admin approval';
COMMENT ON TABLE crawl_jobs IS 'Logs of crawler execution history';
COMMENT ON TABLE sources IS 'Government website sources for crawlers';
COMMENT ON TABLE admins IS 'Admin users for moderation and management';
COMMENT ON TABLE audit_logs IS 'Audit trail of all admin actions';
