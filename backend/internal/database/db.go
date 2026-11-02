package database

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	Pool *pgxpool.Pool
}

func Connect(ctx context.Context) (*DB, error) {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		log.Println("[Database] DATABASE_URL not set. Running in decoupled standalone/in-memory mode.")
		return &DB{Pool: nil}, nil
	}

	config, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return nil, fmt.Errorf("unable to parse database config: %w", err)
	}

	// Production Pool Hardening (Promptbook: Prompt 68)
	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("unable to connect to connection pool: %w", err)
	}

	// Verify connectivity with a 5-second timeout
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database ping failed: %w", err)
	}

	log.Println("[Database] Successfully connected to PostgreSQL connection pool.")
	db := &DB{Pool: pool}

	// Auto-run schema migrations and initial seed data
	if err := db.autoMigrate(ctx); err != nil {
		log.Printf("[Database] Warning: auto-migration encountered error: %v", err)
	} else {
		log.Println("[Database] Schema migrations and seed tables verified successfully.")
	}

	return db, nil
}

func (db *DB) autoMigrate(ctx context.Context) error {
	schema := `
	CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
	CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

	CREATE TABLE IF NOT EXISTS teams (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		name VARCHAR(100) NOT NULL,
		code VARCHAR(30) UNIQUE NOT NULL,
		branch_city VARCHAR(100),
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW()
	);

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
		password_hash VARCHAR(255) NOT NULL,
		status user_status_enum DEFAULT 'ACTIVE',
		failed_login_attempts INT DEFAULT 0,
		locked_until TIMESTAMPTZ NULL,
		token_version INT DEFAULT 1,
		created_by UUID REFERENCES users(id),
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW(),
		deleted_at TIMESTAMPTZ NULL
	);

	-- Guarantee all expected columns exist even if table was created previously
	ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id UUID;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
	ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID;

	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
	CREATE INDEX IF NOT EXISTS idx_users_employee ON users(employee_code);

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

	CREATE TABLE IF NOT EXISTS user_asset_assignments (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		manager_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
		assigned_at TIMESTAMPTZ DEFAULT NOW(),
		UNIQUE(manager_id, agent_id)
	);

	CREATE INDEX IF NOT EXISTS idx_assignments_manager ON user_asset_assignments(manager_id);
	CREATE INDEX IF NOT EXISTS idx_assignments_agent ON user_asset_assignments(agent_id);

	DO $$ BEGIN
		CREATE TYPE report_status_enum AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');
	EXCEPTION
		WHEN duplicate_object THEN null;
	END $$;

	CREATE TABLE IF NOT EXISTS reports (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		report_number VARCHAR(30) UNIQUE NOT NULL,
		user_id UUID NOT NULL REFERENCES users(id),
		device_id UUID REFERENCES devices(id),
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
		agent_notes TEXT,
		status report_status_enum DEFAULT 'SUBMITTED',
		reviewed_by UUID REFERENCES users(id),
		reviewed_at TIMESTAMPTZ NULL,
		rejection_reason TEXT NULL,
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS audit_logs (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		actor_id UUID REFERENCES users(id),
		action_type VARCHAR(100) NOT NULL,
		target_entity VARCHAR(50) NOT NULL,
		target_id TEXT,
		details TEXT,
		created_at TIMESTAMPTZ DEFAULT NOW()
	);

	-- Seed Roles
	INSERT INTO roles (id, name, description) VALUES
	(1, 'SUPER_ADMIN', 'Full administrative access'),
	(2, 'BRANCH_MANAGER', 'Supervisory access for assigned 5-10 assets'),
	(3, 'FIELD_AGENT', 'Field tracking and expense claim filing')
	ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

	-- Bulletproof Seed & Sync of Default Users with Authentic Argon2id Hashes
	DO $$ BEGIN
		IF EXISTS (SELECT 1 FROM users WHERE employee_code = 'ADM-001' OR email = 'admin@geotrack.com') THEN
			UPDATE users SET 
				password_hash = '$argon2id$v=19$m=65536,t=3,p=4$Ljsw7Fo775UXrQdtM7+FUg$3T/0AgAaAO101crlH/bYP14Sb/h7sWXB4ZKuo3miXEo',
				role_id = 1,
				full_name = 'System Administrator',
				email = 'admin@geotrack.com',
				employee_code = 'ADM-001',
				status = 'ACTIVE',
				failed_login_attempts = 0,
				locked_until = NULL,
				deleted_at = NULL
			WHERE employee_code = 'ADM-001' OR email = 'admin@geotrack.com';
		ELSE
			INSERT INTO users (id, role_id, full_name, email, employee_code, password_hash, status)
			VALUES ('00000000-0000-0000-0000-000000000001', 1, 'System Administrator', 'admin@geotrack.com', 'ADM-001', '$argon2id$v=19$m=65536,t=3,p=4$Ljsw7Fo775UXrQdtM7+FUg$3T/0AgAaAO101crlH/bYP14Sb/h7sWXB4ZKuo3miXEo', 'ACTIVE');
		END IF;

		IF EXISTS (SELECT 1 FROM users WHERE employee_code = 'MGR-042' OR email = 'vikram.manager@geotrack.com') THEN
			UPDATE users SET 
				password_hash = '$argon2id$v=19$m=65536,t=3,p=4$otZE7kq3Nz49OKI1TMUKBQ$ABxRmQf6Sn5NGx18LE8YGXVDSeeTuepph+rdT2Q3D7w',
				role_id = 2,
				full_name = 'Vikram Deshmukh',
				email = 'vikram.manager@geotrack.com',
				employee_code = 'MGR-042',
				status = 'ACTIVE',
				failed_login_attempts = 0,
				locked_until = NULL,
				deleted_at = NULL
			WHERE employee_code = 'MGR-042' OR email = 'vikram.manager@geotrack.com';
		ELSE
			INSERT INTO users (id, role_id, full_name, email, employee_code, password_hash, status)
			VALUES ('00000000-0000-0000-0000-000000000002', 2, 'Vikram Deshmukh', 'vikram.manager@geotrack.com', 'MGR-042', '$argon2id$v=19$m=65536,t=3,p=4$otZE7kq3Nz49OKI1TMUKBQ$ABxRmQf6Sn5NGx18LE8YGXVDSeeTuepph+rdT2Q3D7w', 'ACTIVE');
		END IF;

		IF EXISTS (SELECT 1 FROM users WHERE employee_code = 'EMP-104' OR email = 'rahul.sharma@geotrack.com') THEN
			UPDATE users SET 
				password_hash = '$argon2id$v=19$m=65536,t=3,p=4$rdRv7qQMZJYafiAfLZo+Mg$Ot+2n6fSZcRI5xleoZushAG/RoA7I3m5//cvqLGSRfU',
				role_id = 3,
				full_name = 'Rahul Sharma',
				email = 'rahul.sharma@geotrack.com',
				employee_code = 'EMP-104',
				status = 'ACTIVE',
				failed_login_attempts = 0,
				locked_until = NULL,
				deleted_at = NULL
			WHERE employee_code = 'EMP-104' OR email = 'rahul.sharma@geotrack.com';
		ELSE
			INSERT INTO users (id, role_id, full_name, email, employee_code, password_hash, status)
			VALUES ('00000000-0000-0000-0000-000000000003', 3, 'Rahul Sharma', 'rahul.sharma@geotrack.com', 'EMP-104', '$argon2id$v=19$m=65536,t=3,p=4$rdRv7qQMZJYafiAfLZo+Mg$Ot+2n6fSZcRI5xleoZushAG/RoA7I3m5//cvqLGSRfU', 'ACTIVE');
		END IF;
	END $$;

	-- Seed Device and Manager-Agent Assignment
	DO $$ 
	DECLARE
		mgr_id UUID;
		agent_id UUID;
		dev_id UUID;
	BEGIN
		SELECT id INTO mgr_id FROM users WHERE employee_code = 'MGR-042' LIMIT 1;
		SELECT id INTO agent_id FROM users WHERE employee_code = 'EMP-104' LIMIT 1;
		
		IF agent_id IS NOT NULL THEN
			SELECT id INTO dev_id FROM devices WHERE assigned_user_id = agent_id LIMIT 1;
			IF dev_id IS NULL THEN
				INSERT INTO devices (id, hardware_device_id, assigned_user_id, vehicle_registration)
				VALUES ('00000000-0000-0000-0000-000000000010', 'HW-DEV-001', agent_id, 'MH-02-CB-8842')
				ON CONFLICT DO NOTHING
				RETURNING id INTO dev_id;
			END IF;

			IF mgr_id IS NOT NULL AND dev_id IS NOT NULL THEN
				INSERT INTO user_asset_assignments (manager_id, agent_id, device_id)
				VALUES (mgr_id, agent_id, dev_id)
				ON CONFLICT (manager_id, agent_id) DO NOTHING;
			END IF;
		END IF;
	END $$;
	`

	_, err := db.Pool.Exec(ctx, schema)
	return err
}

func (db *DB) Close() {
	if db.Pool != nil {
		log.Println("[Database] Closing database connection pool gracefully...")
		db.Pool.Close()
	}
}

func (db *DB) IsConnected() bool {
	return db.Pool != nil
}
