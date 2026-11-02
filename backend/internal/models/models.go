package models

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrInvalidEmail       = errors.New("invalid email address format")
	ErrInvalidEmployeeCode = errors.New("employee code must be alphanumeric and between 3-20 characters")
	ErrPasswordTooShort   = errors.New("password must be at least 8 characters with letters, numbers, and symbols")
	ErrNegativeAmount     = errors.New("monetary and distance values cannot be negative")
	ErrInvalidDate        = errors.New("date must be in YYYY-MM-DD format")
)

var (
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	codeRegex  = regexp.MustCompile(`^[A-Za-z0-9\-_]{3,20}$`)
)

type RoleName string

const (
	RoleSuperAdmin    RoleName = "SUPER_ADMIN"
	RoleBranchManager RoleName = "BRANCH_MANAGER"
	RoleFieldAgent    RoleName = "FIELD_AGENT"
)

type ReportStatus string

const (
	ReportStatusDraft     ReportStatus = "DRAFT"
	ReportStatusSubmitted ReportStatus = "SUBMITTED"
	ReportStatusApproved  ReportStatus = "APPROVED"
	ReportStatusRejected  ReportStatus = "REJECTED"
	ReportStatusPaid      ReportStatus = "PAID"
)

// User represents an authenticated identity
type User struct {
	ID                  uuid.UUID `json:"id"`
	RoleID              int       `json:"role_id"`
	RoleName            RoleName  `json:"role_name"`
	TeamID              *uuid.UUID `json:"team_id,omitempty"`
	FullName            string    `json:"full_name"`
	Email               string    `json:"email"`
	PhoneNumber         string    `json:"phone_number,omitempty"`
	EmployeeCode        string    `json:"employee_code"`
	PasswordHash        string    `json:"-"` // Never serialized to JSON
	Status              string    `json:"status"`
	FailedLoginAttempts int       `json:"-"`
	LockedUntil         *time.Time `json:"-"`
	TokenVersion        int       `json:"-"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`

	// Compatibility aliases for Android Gson client (camelCase)
	FullNameCamel       string  `json:"fullName,omitempty"`
	RoleCamel           string  `json:"role,omitempty"`
	EmployeeCodeCamel   string  `json:"employeeCode,omitempty"`
	VehicleRegistration string  `json:"vehicleRegistration,omitempty"`
	VehicleType         string  `json:"vehicleType,omitempty"`
	FuelEfficiencyKmL   float64 `json:"fuelEfficiencyKmL,omitempty"`
	FuelRatePerLiter    float64 `json:"fuelRatePerLiter,omitempty"`
}

func (u *User) Validate() error {
	u.Email = strings.TrimSpace(strings.ToLower(u.Email))
	if !emailRegex.MatchString(u.Email) {
		return ErrInvalidEmail
	}

	u.EmployeeCode = strings.TrimSpace(strings.ToUpper(u.EmployeeCode))
	if !codeRegex.MatchString(u.EmployeeCode) {
		return ErrInvalidEmployeeCode
	}

	u.FullName = strings.TrimSpace(u.FullName)
	if len(u.FullName) < 2 {
		return errors.New("full name must be at least 2 characters")
	}

	return nil
}

// Device represents a fleet telematics hardware unit
type Device struct {
	ID                  uuid.UUID `json:"id"`
	HardwareDeviceID    string    `json:"hardware_device_id"`
	AssignedUserID      *uuid.UUID `json:"assigned_user_id,omitempty"`
	VehicleRegistration string    `json:"vehicle_registration"`
	VehicleType         string    `json:"vehicle_type"`
	FuelEfficiencyKmL   float64   `json:"fuel_efficiency_km_l"`
	FuelRatePerLiter    float64   `json:"fuel_rate_per_liter"`
	IsActive            bool      `json:"is_active"`
	LastSeenAt          *time.Time `json:"last_seen_at,omitempty"`
}

// Report represents a daily travel and fuel expense claim
type Report struct {
	ID                   uuid.UUID    `json:"id"`
	ReportNumber         string       `json:"report_number"`
	UserID               uuid.UUID    `json:"user_id"`
	AgentName            string       `json:"agent_name,omitempty"`
	DeviceID             uuid.UUID    `json:"device_id"`
	VehicleRegistration  string       `json:"vehicle_registration,omitempty"`
	ReportDate           string       `json:"report_date"` // YYYY-MM-DD
	StartTime            time.Time    `json:"start_time"`
	EndTime              time.Time    `json:"end_time"`
	TotalDistanceKm      float64      `json:"total_distance_km"`
	TotalMovingTimeMins  int          `json:"total_moving_time_mins"`
	TotalIdleTimeMins    int          `json:"total_idle_time_mins"`
	CalculatedFuelLiters float64      `json:"calculated_fuel_liters"`
	FuelRateApplied      float64      `json:"fuel_rate_applied"`
	TotalFuelAmount      float64      `json:"total_fuel_amount"`
	ExtraTollAmount      float64      `json:"extra_toll_amount"`
	ExtraParkingAmount   float64      `json:"extra_parking_amount"`
	TotalClaimAmount     float64      `json:"total_claim_amount"`
	AgentNotes           string       `json:"agent_notes"`
	Status               ReportStatus `json:"status"`
	ReviewedBy           *uuid.UUID   `json:"reviewed_by,omitempty"`
	ReviewedAt           *time.Time   `json:"reviewed_at,omitempty"`
	RejectionReason      string       `json:"rejection_reason,omitempty"`
	CreatedAt            time.Time    `json:"created_at"`
	UpdatedAt            time.Time    `json:"updated_at"`

	// Compatibility aliases for Android Gson client (camelCase)
	ReportDateCamel           string   `json:"reportDate,omitempty"`
	TotalDistanceKmCamel      *float64 `json:"totalDistanceKm,omitempty"`
	TotalMovingTimeMinsCamel  *int     `json:"totalMovingTimeMins,omitempty"`
	TotalIdleTimeMinsCamel    *int     `json:"totalIdleTimeMins,omitempty"`
	CalculatedFuelLitersCamel *float64 `json:"calculatedFuelLiters,omitempty"`
	FuelRateAppliedCamel      *float64 `json:"fuelRateApplied,omitempty"`
	TotalFuelAmountCamel      *float64 `json:"totalFuelAmount,omitempty"`
	ExtraTollAmountCamel      *float64 `json:"extraTollAmount,omitempty"`
	ExtraParkingAmountCamel   *float64 `json:"extraParkingAmount,omitempty"`
	TotalClaimAmountCamel     *float64 `json:"totalClaimAmount,omitempty"`
	AgentNotesCamel           string   `json:"agentNotes,omitempty"`
}

// Validate ensures positive financial values and correct date formats (Prompt 37: Money arithmetic)
func (r *Report) Validate() error {
	if r.TotalDistanceKm < 0 || r.CalculatedFuelLiters < 0 || r.TotalFuelAmount < 0 ||
		r.ExtraTollAmount < 0 || r.ExtraParkingAmount < 0 || r.TotalClaimAmount < 0 {
		return ErrNegativeAmount
	}

	if _, err := time.Parse("2006-01-02", r.ReportDate); err != nil {
		return ErrInvalidDate
	}

	// Invariant: Total claim must match sum of fuel + tolls + parking (rounded to 2 decimal places)
	expectedClaim := round2(r.TotalFuelAmount + r.ExtraTollAmount + r.ExtraParkingAmount)
	actualClaim := round2(r.TotalClaimAmount)
	if expectedClaim != actualClaim {
		return errors.New("total claim amount does not balance with fuel, toll, and parking sum")
	}

	return nil
}

func round2(val float64) float64 {
	return float64(int(val*100+0.5)) / 100
}

// AuditLog represents a tamper-evident system event (Promptbook: Prompt 75)
type AuditLog struct {
	ID           uuid.UUID `json:"id"`
	ActorID      uuid.UUID `json:"actor_id"`
	ActorName    string    `json:"actor_name,omitempty"`
	ActionType   string    `json:"action_type"`
	TargetEntity string    `json:"target_entity"`
	TargetID     string    `json:"target_id,omitempty"`
	Details      string    `json:"details,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// Request and Response DTOs
type LoginRequest struct {
	EmailOrCode      string `json:"email_or_code"`
	EmailOrCodeCamel string `json:"emailOrCode,omitempty"`
	Password         string `json:"password"`
}

type LoginResponse struct {
	Success bool   `json:"success"`
	Token   string `json:"token,omitempty"`
	User    *User  `json:"user,omitempty"`
	Message string `json:"message,omitempty"`
}

type CreateUserRequest struct {
	FullName            string   `json:"full_name"`
	Email               string   `json:"email"`
	EmployeeCode        string   `json:"employee_code"`
	Password            string   `json:"password"`
	RoleName            RoleName `json:"role_name"`
	TeamID              *string  `json:"team_id,omitempty"`
	VehicleRegistration string   `json:"vehicle_registration,omitempty"`
	VehicleType         string   `json:"vehicle_type,omitempty"`
	FuelEfficiencyKmL   float64  `json:"fuel_efficiency_km_l,omitempty"`
	FuelRatePerLiter    float64  `json:"fuel_rate_per_liter,omitempty"`
}

type AssignAssetsRequest struct {
	ManagerID string   `json:"manager_id"`
	AgentIDs  []string `json:"agent_ids"`
}

type ReviewReportRequest struct {
	Status          ReportStatus `json:"status"` // APPROVED or REJECTED
	RejectionReason string       `json:"rejection_reason,omitempty"`
}
