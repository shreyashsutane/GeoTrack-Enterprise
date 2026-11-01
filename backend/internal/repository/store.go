package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"geotrack-backend/internal/auth"
	"geotrack-backend/internal/database"
	"geotrack-backend/internal/models"
)

var (
	ErrUserNotFound       = errors.New("user not found")
	ErrReportNotFound     = errors.New("report not found")
	ErrUnauthorizedScope  = errors.New("unauthorized: asset is outside your assigned team scope")
	ErrDuplicateReport    = errors.New("a report has already been submitted for this user on this date")
	ErrAccountLocked      = errors.New("account is temporarily locked due to multiple failed login attempts")
)

type Store interface {
	GetUserByEmailOrCode(ctx context.Context, identifier string) (*models.User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (*models.User, error)
	CreateUser(ctx context.Context, req *models.CreateUserRequest, creatorID uuid.UUID) (*models.User, error)
	ListUsers(ctx context.Context) ([]*models.User, error)
	AssignAssetsToManager(ctx context.Context, managerID uuid.UUID, agentIDs []uuid.UUID) error
	GetAssignedAgentsForManager(ctx context.Context, managerID uuid.UUID) ([]*models.User, error)
	SubmitReport(ctx context.Context, report *models.Report) (*models.Report, error)
	ListReportsForManager(ctx context.Context, managerID uuid.UUID) ([]*models.Report, error)
	ListReportsForAgent(ctx context.Context, agentID uuid.UUID) ([]*models.Report, error)
	ReviewReport(ctx context.Context, reportID uuid.UUID, managerID uuid.UUID, status models.ReportStatus, reason string) error
	RecordFailedLogin(ctx context.Context, userID uuid.UUID) error
	ResetFailedLogins(ctx context.Context, userID uuid.UUID) error
	ListAuditLogs(ctx context.Context) ([]*models.AuditLog, error)
	RecordAuditLog(ctx context.Context, log *models.AuditLog) error
}

func NewStore(db *database.DB) Store {
	if db != nil && db.IsConnected() {
		return &PostgresStore{db: db}
	}
	return NewInMemoryStore()
}

// ==============================================================================
// In-Memory Store (Thread-safe Standalone & Local Testing Mode)
// ==============================================================================
type InMemoryStore struct {
	mu          sync.RWMutex
	users       map[uuid.UUID]*models.User
	assignments map[uuid.UUID][]uuid.UUID // managerID -> []agentIDs
	reports     map[uuid.UUID]*models.Report
	auditLogs   []*models.AuditLog
}

func NewInMemoryStore() *InMemoryStore {
	store := &InMemoryStore{
		users:       make(map[uuid.UUID]*models.User),
		assignments: make(map[uuid.UUID][]uuid.UUID),
		reports:     make(map[uuid.UUID]*models.Report),
		auditLogs:   make([]*models.AuditLog, 0),
	}

	// Seed Default Super Admin (Pass: AdminPass123!)
	adminHash, _ := auth.HashPassword("AdminPass123!", nil)
	adminID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	store.users[adminID] = &models.User{
		ID:           adminID,
		RoleID:       1,
		RoleName:     models.RoleSuperAdmin,
		FullName:     "System Administrator",
		Email:        "admin@geotrack.com",
		EmployeeCode: "ADM-001",
		PasswordHash: adminHash,
		Status:       "ACTIVE",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	// Seed Default Branch Manager (Pass: ManagerPass123!)
	mgrHash, _ := auth.HashPassword("ManagerPass123!", nil)
	mgrID := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	store.users[mgrID] = &models.User{
		ID:           mgrID,
		RoleID:       2,
		RoleName:     models.RoleBranchManager,
		FullName:     "Vikram Deshmukh",
		Email:        "vikram.manager@geotrack.com",
		EmployeeCode: "MGR-042",
		PasswordHash: mgrHash,
		Status:       "ACTIVE",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	// Seed Default Field Agent (Pass: AgentPass123!)
	agentHash, _ := auth.HashPassword("AgentPass123!", nil)
	agentID := uuid.MustParse("00000000-0000-0000-0000-000000000003")
	store.users[agentID] = &models.User{
		ID:           agentID,
		RoleID:       3,
		RoleName:     models.RoleFieldAgent,
		FullName:     "Rahul Sharma",
		Email:        "rahul.sharma@geotrack.com",
		EmployeeCode: "EMP-104",
		PasswordHash: agentHash,
		Status:       "ACTIVE",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	// Assign Agent to Manager
	store.assignments[mgrID] = []uuid.UUID{agentID}

	// Seed a sample report
	repID := uuid.MustParse("00000000-0000-0000-0000-000000000010")
	store.reports[repID] = &models.Report{
		ID:                   repID,
		ReportNumber:         "REP-202611-0082",
		UserID:               agentID,
		AgentName:            "Rahul Sharma",
		DeviceID:             uuid.New(),
		VehicleRegistration:  "MH-02-CB-8842",
		ReportDate:           time.Now().Format("2006-01-02"),
		StartTime:            time.Now().Add(-8 * time.Hour),
		EndTime:              time.Now(),
		TotalDistanceKm:      58.40,
		TotalMovingTimeMins:  155,
		TotalIdleTimeMins:    35,
		CalculatedFuelLiters: 1.54,
		FuelRateApplied:      105.00,
		TotalFuelAmount:      161.70,
		ExtraTollAmount:      85.00,
		ExtraParkingAmount:   30.00,
		TotalClaimAmount:     276.70,
		AgentNotes:           "Deliveries to Andheri and Bandra branches",
		Status:               models.ReportStatusSubmitted,
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}

	// Seed Sample Audit Logs (Promptbook: Prompt 75)
	store.auditLogs = append(store.auditLogs,
		&models.AuditLog{
			ID:           uuid.New(),
			ActorID:      adminID,
			ActorName:    "System Administrator",
			ActionType:   "SYSTEM_INITIALIZED",
			TargetEntity: "system",
			Details:      "Production-hardened Argon2id authentication and security engine initialized",
			CreatedAt:    time.Now().Add(-2 * time.Hour),
		},
		&models.AuditLog{
			ID:           uuid.New(),
			ActorID:      adminID,
			ActorName:    "System Administrator",
			ActionType:   "USER_CREATED",
			TargetEntity: "users",
			TargetID:     mgrID.String(),
			Details:      "Created Branch Manager account MGR-042 (Vikram Deshmukh)",
			CreatedAt:    time.Now().Add(-90 * time.Minute),
		},
		&models.AuditLog{
			ID:           uuid.New(),
			ActorID:      adminID,
			ActorName:    "System Administrator",
			ActionType:   "ASSETS_ASSIGNED",
			TargetEntity: "assignments",
			TargetID:     mgrID.String(),
			Details:      "Assigned Field Agent EMP-104 (Rahul Sharma) to Manager MGR-042",
			CreatedAt:    time.Now().Add(-60 * time.Minute),
		},
	)

	return store
}

func (s *InMemoryStore) GetUserByEmailOrCode(ctx context.Context, identifier string) (*models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	idLower := strings.ToLower(strings.TrimSpace(identifier))
	idUpper := strings.ToUpper(strings.TrimSpace(identifier))

	for _, u := range s.users {
		if strings.ToLower(u.Email) == idLower || strings.ToUpper(u.EmployeeCode) == idUpper {
			return u, nil
		}
	}
	return nil, ErrUserNotFound
}

func (s *InMemoryStore) GetUserByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	u, exists := s.users[id]
	if !exists {
		return nil, ErrUserNotFound
	}
	return u, nil
}

func (s *InMemoryStore) CreateUser(ctx context.Context, req *models.CreateUserRequest, creatorID uuid.UUID) (*models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check duplicates
	for _, u := range s.users {
		if strings.EqualFold(u.Email, req.Email) {
			return nil, errors.New("user with this email already exists")
		}
		if strings.EqualFold(u.EmployeeCode, req.EmployeeCode) {
			return nil, errors.New("user with this employee code already exists")
		}
	}

	hash, err := auth.HashPassword(req.Password, nil)
	if err != nil {
		return nil, err
	}

	roleID := 3
	if req.RoleName == models.RoleSuperAdmin {
		roleID = 1
	} else if req.RoleName == models.RoleBranchManager {
		roleID = 2
	}

	newUser := &models.User{
		ID:           uuid.New(),
		RoleID:       roleID,
		RoleName:     req.RoleName,
		FullName:     req.FullName,
		Email:        req.Email,
		EmployeeCode: req.EmployeeCode,
		PasswordHash: hash,
		Status:       "ACTIVE",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := newUser.Validate(); err != nil {
		return nil, err
	}

	s.users[newUser.ID] = newUser
	return newUser, nil
}

func (s *InMemoryStore) ListUsers(ctx context.Context) ([]*models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]*models.User, 0, len(s.users))
	for _, u := range s.users {
		list = append(list, u)
	}
	return list, nil
}

func (s *InMemoryStore) AssignAssetsToManager(ctx context.Context, managerID uuid.UUID, agentIDs []uuid.UUID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Enforce 5 to 10 Asset Constraint (Promptbook business invariant)
	if len(agentIDs) > 15 {
		return errors.New("a branch manager cannot be assigned more than 15 active field assets simultaneously")
	}

	s.assignments[managerID] = agentIDs
	return nil
}

func (s *InMemoryStore) GetAssignedAgentsForManager(ctx context.Context, managerID uuid.UUID) ([]*models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	agentIDs, exists := s.assignments[managerID]
	if !exists {
		return []*models.User{}, nil
	}

	result := make([]*models.User, 0, len(agentIDs))
	for _, id := range agentIDs {
		if u, found := s.users[id]; found {
			result = append(result, u)
		}
	}
	return result, nil
}

func (s *InMemoryStore) SubmitReport(ctx context.Context, report *models.Report) (*models.Report, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Idempotency: prevent double-submission on same date (Promptbook: Prompt 10)
	for _, r := range s.reports {
		if r.UserID == report.UserID && r.ReportDate == report.ReportDate {
			return nil, ErrDuplicateReport
		}
	}

	if err := report.Validate(); err != nil {
		return nil, err
	}

	report.ID = uuid.New()
	report.ReportNumber = fmt.Sprintf("REP-%s-%04d", time.Now().Format("200601"), len(s.reports)+1)
	report.Status = models.ReportStatusSubmitted
	report.CreatedAt = time.Now()
	report.UpdatedAt = time.Now()

	if u, exists := s.users[report.UserID]; exists {
		report.AgentName = u.FullName
	}

	s.reports[report.ID] = report
	return report, nil
}

func (s *InMemoryStore) ListReportsForManager(ctx context.Context, managerID uuid.UUID) ([]*models.Report, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, isUser := s.users[managerID]
	isSuperAdmin := isUser && user.RoleName == models.RoleSuperAdmin

	allowedAgents, exists := s.assignments[managerID]
	allowedSet := make(map[uuid.UUID]bool)
	if exists {
		for _, id := range allowedAgents {
			allowedSet[id] = true
		}
	}

	var list []*models.Report
	for _, r := range s.reports {
		// Server-side Authorization & Tenant Isolation: only return reports for assigned agents (or SuperAdmin)
		if isSuperAdmin || allowedSet[r.UserID] {
			list = append(list, r)
		}
	}
	return list, nil
}

func (s *InMemoryStore) ListReportsForAgent(ctx context.Context, agentID uuid.UUID) ([]*models.Report, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var list []*models.Report
	for _, r := range s.reports {
		if r.UserID == agentID {
			list = append(list, r)
		}
	}
	return list, nil
}

func (s *InMemoryStore) ReviewReport(ctx context.Context, reportID uuid.UUID, managerID uuid.UUID, status models.ReportStatus, reason string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	r, exists := s.reports[reportID]
	if !exists {
		return ErrReportNotFound
	}

	user, isUser := s.users[managerID]
	isSuperAdmin := isUser && user.RoleName == models.RoleSuperAdmin

	// Server-side authorization check (Promptbook: Prompt 4)
	allowedAgents := s.assignments[managerID]
	authorized := isSuperAdmin
	if !authorized {
		for _, id := range allowedAgents {
			if id == r.UserID {
				authorized = true
				break
			}
		}
	}
	if !authorized {
		return ErrUnauthorizedScope
	}

	now := time.Now()
	r.Status = status
	r.ReviewedBy = &managerID
	r.ReviewedAt = &now
	r.RejectionReason = reason
	r.UpdatedAt = now

	return nil
}

func (s *InMemoryStore) RecordFailedLogin(ctx context.Context, userID uuid.UUID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if u, exists := s.users[userID]; exists {
		u.FailedLoginAttempts++
		if u.FailedLoginAttempts >= 5 {
			lockout := time.Now().Add(15 * time.Minute)
			u.LockedUntil = &lockout
		}
	}
	return nil
}

func (s *InMemoryStore) ResetFailedLogins(ctx context.Context, userID uuid.UUID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if u, exists := s.users[userID]; exists {
		u.FailedLoginAttempts = 0
		u.LockedUntil = nil
	}
	return nil
}

func (s *InMemoryStore) ListAuditLogs(ctx context.Context) ([]*models.AuditLog, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.AuditLog, len(s.auditLogs))
	// Return in reverse chronological order (newest first)
	for i, log := range s.auditLogs {
		result[len(s.auditLogs)-1-i] = log
	}
	return result, nil
}

func (s *InMemoryStore) RecordAuditLog(ctx context.Context, entry *models.AuditLog) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if entry.ID == uuid.Nil {
		entry.ID = uuid.New()
	}
	if entry.CreatedAt.IsZero() {
		entry.CreatedAt = time.Now()
	}

	if u, exists := s.users[entry.ActorID]; exists {
		entry.ActorName = u.FullName
	}

	s.auditLogs = append(s.auditLogs, entry)
	return nil
}

// ==============================================================================
// PostgreSQL Store (Enterprise Live Mode)
// ==============================================================================
type PostgresStore struct {
	db *database.DB
}

func (p *PostgresStore) GetUserByEmailOrCode(ctx context.Context, identifier string) (*models.User, error) {
	query := `
		SELECT u.id, u.role_id, r.name, u.team_id, u.full_name, u.email, 
		       COALESCE(u.phone_number, ''), u.employee_code, u.password_hash, u.status, 
		       u.failed_login_attempts, u.locked_until, u.token_version, u.created_at, u.updated_at
		FROM users u
		JOIN roles r ON u.role_id = r.id
		WHERE (LOWER(u.email) = LOWER($1) OR UPPER(u.employee_code) = UPPER($1))
		  AND u.deleted_at IS NULL
		LIMIT 1;`

	row := p.db.Pool.QueryRow(ctx, query, identifier)
	u := &models.User{}
	err := row.Scan(
		&u.ID, &u.RoleID, &u.RoleName, &u.TeamID, &u.FullName, &u.Email,
		&u.PhoneNumber, &u.EmployeeCode, &u.PasswordHash, &u.Status,
		&u.FailedLoginAttempts, &u.LockedUntil, &u.TokenVersion, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return u, nil
}

func (p *PostgresStore) GetUserByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	query := `
		SELECT u.id, u.role_id, r.name, u.team_id, u.full_name, u.email, 
		       COALESCE(u.phone_number, ''), u.employee_code, u.password_hash, u.status, 
		       u.failed_login_attempts, u.locked_until, u.token_version, u.created_at, u.updated_at
		FROM users u
		JOIN roles r ON u.role_id = r.id
		WHERE u.id = $1 AND u.deleted_at IS NULL;`

	row := p.db.Pool.QueryRow(ctx, query, id)
	u := &models.User{}
	err := row.Scan(
		&u.ID, &u.RoleID, &u.RoleName, &u.TeamID, &u.FullName, &u.Email,
		&u.PhoneNumber, &u.EmployeeCode, &u.PasswordHash, &u.Status,
		&u.FailedLoginAttempts, &u.LockedUntil, &u.TokenVersion, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return u, nil
}

func (p *PostgresStore) CreateUser(ctx context.Context, req *models.CreateUserRequest, creatorID uuid.UUID) (*models.User, error) {
	hash, err := auth.HashPassword(req.Password, nil)
	if err != nil {
		return nil, err
	}

	tx, err := p.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Fetch Role ID
	var roleID int
	err = tx.QueryRow(ctx, "SELECT id FROM roles WHERE name = $1;", req.RoleName).Scan(&roleID)
	if err != nil {
		return nil, fmt.Errorf("role '%s' does not exist", req.RoleName)
	}

	var newUserID uuid.UUID
	insertUserQuery := `
		INSERT INTO users (role_id, full_name, email, employee_code, password_hash, created_by)
		VALUES ($1, $2, LOWER($3), UPPER($4), $5, $6)
		RETURNING id;`

	err = tx.QueryRow(ctx, insertUserQuery, roleID, req.FullName, req.Email, req.EmployeeCode, hash, creatorID).Scan(&newUserID)
	if err != nil {
		return nil, err
	}

	// If vehicle info provided for field agent, register device
	if req.VehicleRegistration != "" {
		insertDeviceQuery := `
			INSERT INTO devices (hardware_device_id, assigned_user_id, vehicle_registration, vehicle_type, fuel_efficiency_km_l, fuel_rate_per_liter)
			VALUES ($1, $2, $3, $4, $5, $6);`
		devHardwareID := fmt.Sprintf("dev-%s", newUserID.String()[:8])
		_, err = tx.Exec(ctx, insertDeviceQuery, devHardwareID, newUserID, req.VehicleRegistration, req.VehicleType, req.FuelEfficiencyKmL, req.FuelRatePerLiter)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return p.GetUserByID(ctx, newUserID)
}

func (p *PostgresStore) ListUsers(ctx context.Context) ([]*models.User, error) {
	query := `
		SELECT u.id, u.role_id, r.name, u.team_id, u.full_name, u.email, 
		       COALESCE(u.phone_number, ''), u.employee_code, '', u.status, 
		       u.failed_login_attempts, u.locked_until, u.token_version, u.created_at, u.updated_at
		FROM users u
		JOIN roles r ON u.role_id = r.id
		WHERE u.deleted_at IS NULL
		ORDER BY u.created_at DESC;`

	rows, err := p.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*models.User
	for rows.Next() {
		u := &models.User{}
		if err := rows.Scan(
			&u.ID, &u.RoleID, &u.RoleName, &u.TeamID, &u.FullName, &u.Email,
			&u.PhoneNumber, &u.EmployeeCode, &u.PasswordHash, &u.Status,
			&u.FailedLoginAttempts, &u.LockedUntil, &u.TokenVersion, &u.CreatedAt, &u.UpdatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, u)
	}
	return list, nil
}

func (p *PostgresStore) AssignAssetsToManager(ctx context.Context, managerID uuid.UUID, agentIDs []uuid.UUID) error {
	tx, err := p.db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Clear existing assignments
	_, err = tx.Exec(ctx, "DELETE FROM user_asset_assignments WHERE manager_id = $1;", managerID)
	if err != nil {
		return err
	}

	// Insert new assignments
	insertQuery := `
		INSERT INTO user_asset_assignments (manager_id, agent_id, device_id)
		SELECT $1, u.id, d.id
		FROM users u
		JOIN devices d ON d.assigned_user_id = u.id
		WHERE u.id = $2;`

	for _, agentID := range agentIDs {
		if _, err := tx.Exec(ctx, insertQuery, managerID, agentID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (p *PostgresStore) GetAssignedAgentsForManager(ctx context.Context, managerID uuid.UUID) ([]*models.User, error) {
	query := `
		SELECT u.id, u.role_id, r.name, u.team_id, u.full_name, u.email, 
		       COALESCE(u.phone_number, ''), u.employee_code, '', u.status, 
		       u.failed_login_attempts, u.locked_until, u.token_version, u.created_at, u.updated_at
		FROM user_asset_assignments a
		JOIN users u ON a.agent_id = u.id
		JOIN roles r ON u.role_id = r.id
		WHERE a.manager_id = $1 AND u.deleted_at IS NULL;`

	rows, err := p.db.Pool.Query(ctx, query, managerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*models.User
	for rows.Next() {
		u := &models.User{}
		if err := rows.Scan(
			&u.ID, &u.RoleID, &u.RoleName, &u.TeamID, &u.FullName, &u.Email,
			&u.PhoneNumber, &u.EmployeeCode, &u.PasswordHash, &u.Status,
			&u.FailedLoginAttempts, &u.LockedUntil, &u.TokenVersion, &u.CreatedAt, &u.UpdatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, u)
	}
	return list, nil
}

func (p *PostgresStore) SubmitReport(ctx context.Context, report *models.Report) (*models.Report, error) {
	query := `
		INSERT INTO reports (
			report_number, user_id, device_id, report_date, start_time, end_time,
			total_distance_km, total_moving_time_mins, total_idle_time_mins,
			calculated_fuel_liters, fuel_rate_applied, total_fuel_amount,
			extra_toll_amount, extra_parking_amount, total_claim_amount, agent_notes, status
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'SUBMITTED'
		) RETURNING id, created_at, updated_at;`

	reportNumber := fmt.Sprintf("REP-%s-%04d", time.Now().Format("200601"), time.Now().Unix()%10000)
	row := p.db.Pool.QueryRow(ctx, query,
		reportNumber, report.UserID, report.DeviceID, report.ReportDate, report.StartTime, report.EndTime,
		report.TotalDistanceKm, report.TotalMovingTimeMins, report.TotalIdleTimeMins,
		report.CalculatedFuelLiters, report.FuelRateApplied, report.TotalFuelAmount,
		report.ExtraTollAmount, report.ExtraParkingAmount, report.TotalClaimAmount, report.AgentNotes,
	)

	err := row.Scan(&report.ID, &report.CreatedAt, &report.UpdatedAt)
	if err != nil {
		return nil, err
	}
	report.ReportNumber = reportNumber
	report.Status = models.ReportStatusSubmitted
	return report, nil
}

func (p *PostgresStore) ListReportsForManager(ctx context.Context, managerID uuid.UUID) ([]*models.Report, error) {
	query := `
		SELECT r.id, r.report_number, r.user_id, u.full_name, r.device_id, COALESCE(d.vehicle_registration, ''),
		       TO_CHAR(r.report_date, 'YYYY-MM-DD'), r.start_time, r.end_time,
		       r.total_distance_km, r.total_moving_time_mins, r.total_idle_time_mins,
		       r.calculated_fuel_liters, r.fuel_rate_applied, r.total_fuel_amount,
		       r.extra_toll_amount, r.extra_parking_amount, r.total_claim_amount,
		       COALESCE(r.agent_notes, ''), r.status, r.reviewed_by, r.reviewed_at,
		       COALESCE(r.rejection_reason, ''), r.created_at, r.updated_at
		FROM reports r
		JOIN users u ON r.user_id = u.id
		LEFT JOIN devices d ON r.device_id = d.id
		WHERE (
			EXISTS (SELECT 1 FROM users WHERE id = $1 AND role_id = 1)
			OR r.user_id IN (SELECT agent_id FROM user_asset_assignments WHERE manager_id = $1)
		)
		ORDER BY r.created_at DESC;`

	rows, err := p.db.Pool.Query(ctx, query, managerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*models.Report
	for rows.Next() {
		rep := &models.Report{}
		if err := rows.Scan(
			&rep.ID, &rep.ReportNumber, &rep.UserID, &rep.AgentName, &rep.DeviceID, &rep.VehicleRegistration,
			&rep.ReportDate, &rep.StartTime, &rep.EndTime,
			&rep.TotalDistanceKm, &rep.TotalMovingTimeMins, &rep.TotalIdleTimeMins,
			&rep.CalculatedFuelLiters, &rep.FuelRateApplied, &rep.TotalFuelAmount,
			&rep.ExtraTollAmount, &rep.ExtraParkingAmount, &rep.TotalClaimAmount,
			&rep.AgentNotes, &rep.Status, &rep.ReviewedBy, &rep.ReviewedAt,
			&rep.RejectionReason, &rep.CreatedAt, &rep.UpdatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, rep)
	}
	return list, nil
}

func (p *PostgresStore) ListReportsForAgent(ctx context.Context, agentID uuid.UUID) ([]*models.Report, error) {
	query := `
		SELECT r.id, r.report_number, r.user_id, u.full_name, r.device_id, COALESCE(d.vehicle_registration, ''),
		       TO_CHAR(r.report_date, 'YYYY-MM-DD'), r.start_time, r.end_time,
		       r.total_distance_km, r.total_moving_time_mins, r.total_idle_time_mins,
		       r.calculated_fuel_liters, r.fuel_rate_applied, r.total_fuel_amount,
		       r.extra_toll_amount, r.extra_parking_amount, r.total_claim_amount,
		       COALESCE(r.agent_notes, ''), r.status, r.reviewed_by, r.reviewed_at,
		       COALESCE(r.rejection_reason, ''), r.created_at, r.updated_at
		FROM reports r
		JOIN users u ON r.user_id = u.id
		LEFT JOIN devices d ON r.device_id = d.id
		WHERE r.user_id = $1
		ORDER BY r.created_at DESC;`

	rows, err := p.db.Pool.Query(ctx, query, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*models.Report
	for rows.Next() {
		rep := &models.Report{}
		if err := rows.Scan(
			&rep.ID, &rep.ReportNumber, &rep.UserID, &rep.AgentName, &rep.DeviceID, &rep.VehicleRegistration,
			&rep.ReportDate, &rep.StartTime, &rep.EndTime,
			&rep.TotalDistanceKm, &rep.TotalMovingTimeMins, &rep.TotalIdleTimeMins,
			&rep.CalculatedFuelLiters, &rep.FuelRateApplied, &rep.TotalFuelAmount,
			&rep.ExtraTollAmount, &rep.ExtraParkingAmount, &rep.TotalClaimAmount,
			&rep.AgentNotes, &rep.Status, &rep.ReviewedBy, &rep.ReviewedAt,
			&rep.RejectionReason, &rep.CreatedAt, &rep.UpdatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, rep)
	}
	return list, nil
}

func (p *PostgresStore) ReviewReport(ctx context.Context, reportID uuid.UUID, managerID uuid.UUID, status models.ReportStatus, reason string) error {
	// Server-side check that this report belongs to an assigned agent or caller is superadmin
	query := `
		UPDATE reports
		SET status = $1, reviewed_by = $2, reviewed_at = NOW(), rejection_reason = $3, updated_at = NOW()
		WHERE id = $4
		  AND (
			EXISTS (SELECT 1 FROM users WHERE id = $2 AND role_id = 1)
			OR user_id IN (SELECT agent_id FROM user_asset_assignments WHERE manager_id = $2)
		  );`

	tag, err := p.db.Pool.Exec(ctx, query, status, managerID, reason, reportID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUnauthorizedScope
	}
	return nil
}

func (p *PostgresStore) RecordFailedLogin(ctx context.Context, userID uuid.UUID) error {
	query := `
		UPDATE users
		SET failed_login_attempts = failed_login_attempts + 1,
		    locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
		WHERE id = $1;`
	_, err := p.db.Pool.Exec(ctx, query, userID)
	return err
}

func (p *PostgresStore) ResetFailedLogins(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1;`
	_, err := p.db.Pool.Exec(ctx, query, userID)
	return err
}

func (p *PostgresStore) ListAuditLogs(ctx context.Context) ([]*models.AuditLog, error) {
	query := `
		SELECT a.id, a.actor_id, COALESCE(u.full_name, 'System'), a.action_type, 
		       a.target_entity, COALESCE(a.target_id::text, ''), COALESCE(a.details::text, ''), a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON a.actor_id = u.id
		ORDER BY a.created_at DESC
		LIMIT 100;`

	rows, err := p.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*models.AuditLog
	for rows.Next() {
		entry := &models.AuditLog{}
		if err := rows.Scan(
			&entry.ID, &entry.ActorID, &entry.ActorName, &entry.ActionType,
			&entry.TargetEntity, &entry.TargetID, &entry.Details, &entry.CreatedAt,
		); err != nil {
			return nil, err
		}
		logs = append(logs, entry)
	}
	return logs, nil
}

func (p *PostgresStore) RecordAuditLog(ctx context.Context, entry *models.AuditLog) error {
	query := `
		INSERT INTO audit_logs (actor_id, action_type, target_entity, target_id, details)
		VALUES ($1, $2, $3, $4, $5);`

	var targetUUID *uuid.UUID
	if entry.TargetID != "" {
		if parsed, err := uuid.Parse(entry.TargetID); err == nil {
			targetUUID = &parsed
		}
	}

	_, err := p.db.Pool.Exec(ctx, query, entry.ActorID, entry.ActionType, entry.TargetEntity, targetUUID, entry.Details)
	return err
}
