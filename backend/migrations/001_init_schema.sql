-- ==============================================================================
-- GeoTrack Enterprise - Database Migration 001: Schema Initialization
-- Designed for PostgreSQL 15+ (Compatible with Supabase, Neon.tech, and OCI)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Roles & Permissions (RBAC)
DO $$ BEGIN
    CREATE TYPE role_name_enum AS ENUM ('SUPER_ADMIN', 'BRANCH_MANAGER', 'FIELD_AGENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name role_name_enum NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Teams & Hierarchies
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(30) UNIQUE NOT NULL,
    branch_city VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Users & Argon2id Security
DO $$ BEGIN
    CREATE TYPE user_status_enum AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    
    -- Standard PHC format: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
    password_hash VARCHAR(255) NOT NULL,
    
    status user_status_enum DEFAULT 'ACTIVE',
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ NULL,
    password_changed_at TIMESTAMPTZ DEFAULT NOW(),
    token_version INT DEFAULT 1,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_employee ON users(employee_code);

-- 4. Devices & Fleet Vehicles
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hardware_device_id VARCHAR(100) UNIQUE NOT NULL,
    assigned_user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    
    vehicle_registration VARCHAR(50),
    vehicle_type VARCHAR(50) DEFAULT 'Motorcycle',
    fuel_efficiency_km_l NUMERIC(5,2) DEFAULT 35.0,
    fuel_rate_per_liter NUMERIC(6,2) DEFAULT 105.0,
    
    is_active BOOLEAN DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_hardware ON devices(hardware_device_id);

-- 5. User Asset Assignments (Enforces Manager's 5-10 Asset Scope)
CREATE TABLE IF NOT EXISTS user_asset_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    
    UNIQUE(manager_id, agent_id),
    UNIQUE(manager_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_manager ON user_asset_assignments(manager_id);
CREATE INDEX IF NOT EXISTS idx_assignments_agent ON user_asset_assignments(agent_id);

-- 6. Reports & Reimbursement Submissions
DO $$ BEGIN
    CREATE TYPE report_status_enum AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_number VARCHAR(30) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    device_id UUID NOT NULL REFERENCES devices(id),
    
    report_date DATE NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    
    total_distance_km NUMERIC(8,2) NOT NULL,
    total_moving_time_mins INT NOT NULL,
    total_idle_time_mins INT NOT NULL,
    calculated_fuel_liters NUMERIC(6,2) NOT NULL,
    fuel_rate_applied NUMERIC(6,2) NOT NULL,
    total_fuel_amount NUMERIC(10,2) NOT NULL,
    
    extra_toll_amount NUMERIC(8,2) DEFAULT 0.00,
    extra_parking_amount NUMERIC(8,2) DEFAULT 0.00,
    total_claim_amount NUMERIC(10,2) NOT NULL,
    receipt_image_urls JSONB DEFAULT '[]'::jsonb,
    
    agent_notes TEXT,
    status report_status_enum DEFAULT 'SUBMITTED',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ NULL,
    rejection_reason TEXT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_user_date ON reports(user_id, report_date);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reviewed_by ON reports(reviewed_by);

-- 7. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id),
    action_type VARCHAR(100) NOT NULL,
    target_entity VARCHAR(50) NOT NULL,
    target_id UUID,
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
