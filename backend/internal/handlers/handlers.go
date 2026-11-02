package handlers

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"geotrack-backend/internal/auth"
	"geotrack-backend/internal/middleware"
	"geotrack-backend/internal/models"
	"geotrack-backend/internal/repository"
)

type LiveTelemetry struct {
	DeviceID   string    `json:"device_id"`
	AgentID    string    `json:"agent_id"`
	AgentName  string    `json:"agent_name"`
	Lat        float64   `json:"lat"`
	Lng        float64   `json:"lng"`
	SpeedKmh   float64   `json:"speed_kmh"`
	Bearing    float64   `json:"bearing"`
	Altitude   float64   `json:"altitude"`
	Accuracy   float64   `json:"accuracy"`
	BatteryPct int       `json:"battery_pct"`
	IsCharging bool      `json:"is_charging"`
	LastSeenAt time.Time `json:"last_seen_at"`
}

type Handler struct {
	store         repository.Store
	jwtSecret     string
	telemetryMu   sync.RWMutex
	liveTelemetry map[string]*LiveTelemetry
}

func NewHandler(store repository.Store, jwtSecret string) *Handler {
	return &Handler{
		store:         store,
		jwtSecret:     jwtSecret,
		liveTelemetry: make(map[string]*LiveTelemetry),
	}
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// ==============================================================================
// Health Checks & Environment Configuration (Promptbook: Prompt 66)
// ==============================================================================
func (h *Handler) GetPublicConfig(w http.ResponseWriter, r *http.Request) {
	mapsKey := os.Getenv("GOOGLE_MAPS_API_KEY")
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"google_maps_configured": mapsKey != "",
		"google_maps_key":        mapsKey,
		"version":                "1.0.0",
	})
}

func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"service":   "geotrack-enterprise-backend",
		"version":   "1.0.0",
	})
}

func (h *Handler) AuthDiagnostics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	diag := map[string]interface{}{
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"service":   "geotrack-enterprise-backend",
	}

	testUsers := []struct {
		Code string
		Pass string
	}{
		{"ADM-001", "AdminPass123!"},
		{"MGR-042", "ManagerPass123!"},
		{"EMP-104", "AgentPass123!"},
	}

	results := make([]map[string]interface{}, 0)
	for _, tu := range testUsers {
		u, err := h.store.GetUserByEmailOrCode(ctx, tu.Code)
		if err != nil {
			results = append(results, map[string]interface{}{
				"code":       tu.Code,
				"found":      false,
				"error":      err.Error(),
				"auth_check": "FAILED_USER_QUERY",
			})
			continue
		}

		valid, verifyErr := auth.VerifyPassword(tu.Pass, u.PasswordHash)
		verifyStatus := "OK"
		if verifyErr != nil || !valid {
			verifyStatus = fmt.Sprintf("PASSWORD_MISMATCH (err=%v)", verifyErr)
		}

		prefix := u.PasswordHash
		if len(prefix) > 16 {
			prefix = prefix[:16]
		}

		results = append(results, map[string]interface{}{
			"code":        u.EmployeeCode,
			"found":       true,
			"role":        string(u.RoleName),
			"email":       u.Email,
			"status":      u.Status,
			"auth_check":  verifyStatus,
			"hash_prefix": prefix,
		})
	}

	diag["test_accounts"] = results

	users, err := h.store.ListUsers(ctx)
	if err == nil {
		diag["total_users_count"] = len(users)
	} else {
		diag["total_users_error"] = err.Error()
	}

	writeJSON(w, http.StatusOK, diag)
}

// ==============================================================================
// Auth Handler (Argon2id + JWT) (Promptbook: Prompt 3)
// ==============================================================================
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if req.EmailOrCode == "" && req.EmailOrCodeCamel != "" {
		req.EmailOrCode = req.EmailOrCodeCamel
	}
	req.EmailOrCode = strings.TrimSpace(req.EmailOrCode)
	if req.EmailOrCode == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "employee code/email and password are required")
		return
	}

	user, err := h.store.GetUserByEmailOrCode(r.Context(), req.EmailOrCode)
	if err != nil {
		fmt.Printf("[Auth] GetUserByEmailOrCode failed for '%s': %v\n", req.EmailOrCode, err)
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Check account status and lockout
	if user.Status == "SUSPENDED" {
		writeError(w, http.StatusForbidden, "account is suspended; please contact administrator")
		return
	}

	if user.LockedUntil != nil && time.Now().Before(*user.LockedUntil) {
		writeError(w, http.StatusTooManyRequests, "account is temporarily locked due to multiple failed logins; try again later")
		return
	}

	// Verify Argon2id Hash
	valid, err := auth.VerifyPassword(req.Password, user.PasswordHash)
	if err != nil || !valid {
		fmt.Printf("[Auth] VerifyPassword failed for '%s': err=%v, valid=%v\n", req.EmailOrCode, err, valid)
		_ = h.store.RecordFailedLogin(r.Context(), user.ID)
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Reset failed attempts on success
	_ = h.store.ResetFailedLogins(r.Context(), user.ID)

	// Issue JWT Token (12 Hours)
	token, err := auth.GenerateToken(user.ID.String(), user.Email, string(user.RoleName), user.EmployeeCode, h.jwtSecret, 12*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate session token")
		return
	}

	// Set HTTP-Only Cookie for web clients (Promptbook: Prompt 3)
	http.SetCookie(w, &http.Cookie{
		Name:     "geotrack_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   false, // Set to true in HTTPS production
		SameSite: http.SameSiteLaxMode,
		MaxAge:   12 * 3600,
	})

	// Populate Android client compatibility aliases
	user.FullNameCamel = user.FullName
	user.RoleCamel = string(user.RoleName)
	user.EmployeeCodeCamel = user.EmployeeCode
	user.VehicleRegistration = "MH-02-CB-8842"
	user.VehicleType = "Motorcycle"
	user.FuelEfficiencyKmL = 35.0
	user.FuelRatePerLiter = 105.0

	writeJSON(w, http.StatusOK, models.LoginResponse{
		Success: true,
		Token:   token,
		User:    user,
		Message: "Authentication successful",
	})
}

func (h *Handler) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.UserContextKey).(*auth.CustomClaims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	userUUID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid user context")
		return
	}

	user, err := h.store.GetUserByID(r.Context(), userUUID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user profile not found")
		return
	}

	user.FullNameCamel = user.FullName
	user.RoleCamel = string(user.RoleName)
	user.EmployeeCodeCamel = user.EmployeeCode
	user.VehicleRegistration = "MH-02-CB-8842"
	user.VehicleType = "Motorcycle"
	user.FuelEfficiencyKmL = 35.0
	user.FuelRatePerLiter = 105.0

	writeJSON(w, http.StatusOK, user)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "geotrack_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "logged out successfully"})
}

// ==============================================================================
// Admin Handler (User Management & Asset Assignments) (Promptbook: Prompt 4)
// ==============================================================================
func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.store.ListUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserContextKey).(*auth.CustomClaims)
	creatorID, _ := uuid.Parse(claims.UserID)

	var req models.CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	newUser, err := h.store.CreateUser(r.Context(), &req, creatorID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	_ = h.store.RecordAuditLog(r.Context(), &models.AuditLog{
		ActorID:      creatorID,
		ActionType:   "USER_CREATED",
		TargetEntity: "users",
		TargetID:     newUser.ID.String(),
		Details:      fmt.Sprintf("Created user %s (%s) with role %s", newUser.FullName, newUser.EmployeeCode, newUser.RoleName),
	})

	writeJSON(w, http.StatusCreated, newUser)
}

func (h *Handler) AssignAssets(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserContextKey).(*auth.CustomClaims)
	actorID, _ := uuid.Parse(claims.UserID)

	var req models.AssignAssetsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	managerUUID, err := uuid.Parse(req.ManagerID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid manager id")
		return
	}

	agentUUIDs := make([]uuid.UUID, 0, len(req.AgentIDs))
	for _, idStr := range req.AgentIDs {
		u, err := uuid.Parse(idStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid agent id: "+idStr)
			return
		}
		agentUUIDs = append(agentUUIDs, u)
	}

	if err := h.store.AssignAssetsToManager(r.Context(), managerUUID, agentUUIDs); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	_ = h.store.RecordAuditLog(r.Context(), &models.AuditLog{
		ActorID:      actorID,
		ActionType:   "ASSETS_ASSIGNED",
		TargetEntity: "assignments",
		TargetID:     managerUUID.String(),
		Details:      fmt.Sprintf("Assigned %d field assets to Manager ID %s", len(agentUUIDs), managerUUID.String()),
	})

	writeJSON(w, http.StatusOK, map[string]string{"message": "assets successfully assigned to manager"})
}

func (h *Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := h.store.ListAuditLogs(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list audit logs")
		return
	}
	writeJSON(w, http.StatusOK, logs)
}

func (h *Handler) GetManagerAssets(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserContextKey).(*auth.CustomClaims)
	managerID, _ := uuid.Parse(claims.UserID)

	agents, err := h.store.GetAssignedAgentsForManager(r.Context(), managerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch assigned assets")
		return
	}

	type AssetWithTelemetry struct {
		*models.User
		IsOnline   bool       `json:"is_online"`
		LastSeenAt *time.Time `json:"last_seen_at,omitempty"`
		Lat        *float64   `json:"lat,omitempty"`
		Lng        *float64   `json:"lng,omitempty"`
		SpeedKmh   *float64   `json:"speed_kmh,omitempty"`
		BatteryPct *int       `json:"battery_pct,omitempty"`
		IsCharging bool       `json:"is_charging"`
	}

	h.telemetryMu.RLock()
	defer h.telemetryMu.RUnlock()

	result := make([]*AssetWithTelemetry, 0, len(agents))
	now := time.Now().UTC()

	for _, agent := range agents {
		item := &AssetWithTelemetry{
			User:     agent,
			IsOnline: false,
		}

		var matchedTelemetry *LiveTelemetry
		if t, ok := h.liveTelemetry[agent.ID.String()]; ok && t != nil {
			matchedTelemetry = t
		} else if t, ok := h.liveTelemetry[agent.EmployeeCode]; ok && t != nil {
			matchedTelemetry = t
		}

		if matchedTelemetry != nil && now.Sub(matchedTelemetry.LastSeenAt) <= 2*time.Minute {
			item.IsOnline = true
			item.LastSeenAt = &matchedTelemetry.LastSeenAt
			item.Lat = &matchedTelemetry.Lat
			item.Lng = &matchedTelemetry.Lng
			item.SpeedKmh = &matchedTelemetry.SpeedKmh
			item.BatteryPct = &matchedTelemetry.BatteryPct
			item.IsCharging = matchedTelemetry.IsCharging
		}

		result = append(result, item)
	}

	writeJSON(w, http.StatusOK, result)
}

// ==============================================================================
// Reports Handler (Submit, Review, List) (Promptbook: Prompts 10, 37)
// ==============================================================================
func (h *Handler) SubmitReport(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserContextKey).(*auth.CustomClaims)
	agentID, _ := uuid.Parse(claims.UserID)

	var report models.Report
	if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
		writeError(w, http.StatusBadRequest, "invalid report payload")
		return
	}

	// Map camelCase fields from Android APK client if present
	if report.ReportDate == "" && report.ReportDateCamel != "" {
		report.ReportDate = report.ReportDateCamel
	}
	if report.TotalDistanceKm == 0 && report.TotalDistanceKmCamel != nil {
		report.TotalDistanceKm = *report.TotalDistanceKmCamel
	}
	if report.TotalMovingTimeMins == 0 && report.TotalMovingTimeMinsCamel != nil {
		report.TotalMovingTimeMins = *report.TotalMovingTimeMinsCamel
	}
	if report.TotalIdleTimeMins == 0 && report.TotalIdleTimeMinsCamel != nil {
		report.TotalIdleTimeMins = *report.TotalIdleTimeMinsCamel
	}
	if report.CalculatedFuelLiters == 0 && report.CalculatedFuelLitersCamel != nil {
		report.CalculatedFuelLiters = *report.CalculatedFuelLitersCamel
	}
	if report.FuelRateApplied == 0 && report.FuelRateAppliedCamel != nil {
		report.FuelRateApplied = *report.FuelRateAppliedCamel
	}
	if report.TotalFuelAmount == 0 && report.TotalFuelAmountCamel != nil {
		report.TotalFuelAmount = *report.TotalFuelAmountCamel
	}
	if report.ExtraTollAmount == 0 && report.ExtraTollAmountCamel != nil {
		report.ExtraTollAmount = *report.ExtraTollAmountCamel
	}
	if report.ExtraParkingAmount == 0 && report.ExtraParkingAmountCamel != nil {
		report.ExtraParkingAmount = *report.ExtraParkingAmountCamel
	}
	if report.TotalClaimAmount == 0 && report.TotalClaimAmountCamel != nil {
		report.TotalClaimAmount = *report.TotalClaimAmountCamel
	}
	if report.AgentNotes == "" && report.AgentNotesCamel != "" {
		report.AgentNotes = report.AgentNotesCamel
	}

	report.UserID = agentID
	if report.DeviceID == uuid.Nil {
		report.DeviceID = uuid.New()
	}

	createdReport, err := h.store.SubmitReport(r.Context(), &report)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, createdReport)
}

func (h *Handler) ListMyReports(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserContextKey).(*auth.CustomClaims)
	agentID, _ := uuid.Parse(claims.UserID)

	reports, err := h.store.ListReportsForAgent(r.Context(), agentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch reports")
		return
	}
	writeJSON(w, http.StatusOK, reports)
}

func (h *Handler) ListManagerReports(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserContextKey).(*auth.CustomClaims)
	managerID, _ := uuid.Parse(claims.UserID)

	reports, err := h.store.ListReportsForManager(r.Context(), managerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch team reports")
		return
	}
	writeJSON(w, http.StatusOK, reports)
}

func (h *Handler) ReviewReport(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserContextKey).(*auth.CustomClaims)
	managerID, _ := uuid.Parse(claims.UserID)

	reportIDStr := r.PathValue("id")
	reportID, err := uuid.Parse(reportIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid report id format")
		return
	}

	var req models.ReviewReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid review payload")
		return
	}

	if req.Status != models.ReportStatusApproved && req.Status != models.ReportStatusRejected {
		writeError(w, http.StatusBadRequest, "status must be either APPROVED or REJECTED")
		return
	}

	if err := h.store.ReviewReport(r.Context(), reportID, managerID, req.Status, req.RejectionReason); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "report status updated to " + string(req.Status),
	})
}

func (h *Handler) ExportReportsCSV(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.UserContextKey).(*auth.CustomClaims)
	managerID, _ := uuid.Parse(claims.UserID)

	reports, err := h.store.ListReportsForManager(r.Context(), managerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch reports for export")
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"geotrack-reports-%s.csv\"", time.Now().Format("2006-01-02")))

	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Write CSV Header
	header := []string{
		"Report Number",
		"Date",
		"Agent Name",
		"Vehicle Reg",
		"Start Time",
		"End Time",
		"Distance (KM)",
		"Moving (Mins)",
		"Idle (Mins)",
		"Fuel (Liters)",
		"Fuel Rate ($)",
		"Fuel Amount ($)",
		"Toll ($)",
		"Parking ($)",
		"Total Claim ($)",
		"Status",
		"Rejection Reason",
		"Agent Notes",
	}
	if err := writer.Write(header); err != nil {
		return
	}

	for _, rep := range reports {
		row := []string{
			rep.ReportNumber,
			rep.ReportDate,
			rep.AgentName,
			rep.VehicleRegistration,
			rep.StartTime.Format("15:04:05"),
			rep.EndTime.Format("15:04:05"),
			fmt.Sprintf("%.2f", rep.TotalDistanceKm),
			fmt.Sprintf("%d", rep.TotalMovingTimeMins),
			fmt.Sprintf("%d", rep.TotalIdleTimeMins),
			fmt.Sprintf("%.2f", rep.CalculatedFuelLiters),
			fmt.Sprintf("%.2f", rep.FuelRateApplied),
			fmt.Sprintf("%.2f", rep.TotalFuelAmount),
			fmt.Sprintf("%.2f", rep.ExtraTollAmount),
			fmt.Sprintf("%.2f", rep.ExtraParkingAmount),
			fmt.Sprintf("%.2f", rep.TotalClaimAmount),
			string(rep.Status),
			rep.RejectionReason,
			rep.AgentNotes,
		}
		if err := writer.Write(row); err != nil {
			return
		}
	}
}

// Telematics Ingestion from Android Client
func (h *Handler) PingTelematics(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		DeviceID   string  `json:"deviceId"`
		AgentName  string  `json:"agentName"`
		Lat        float64 `json:"lat"`
		Lng        float64 `json:"lng"`
		SpeedKmh   float64 `json:"speedKmh"`
		Bearing    float64 `json:"bearing"`
		Altitude   float64 `json:"altitude"`
		Accuracy   float64 `json:"accuracy"`
		BatteryPct int     `json:"batteryPct"`
		IsCharging bool    `json:"isCharging"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid telemetry payload")
		return
	}

	var agentKey string
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := auth.ValidateToken(tokenStr, h.jwtSecret)
		if err == nil && claims != nil {
			agentKey = claims.UserID
		}
	}
	if agentKey == "" {
		agentKey = payload.DeviceID
	}

	h.telemetryMu.Lock()
	if h.liveTelemetry == nil {
		h.liveTelemetry = make(map[string]*LiveTelemetry)
	}
	t := &LiveTelemetry{
		DeviceID:   payload.DeviceID,
		AgentID:    agentKey,
		AgentName:  payload.AgentName,
		Lat:        payload.Lat,
		Lng:        payload.Lng,
		SpeedKmh:   payload.SpeedKmh,
		Bearing:    payload.Bearing,
		Altitude:   payload.Altitude,
		Accuracy:   payload.Accuracy,
		BatteryPct: payload.BatteryPct,
		IsCharging: payload.IsCharging,
		LastSeenAt: time.Now().UTC(),
	}
	h.liveTelemetry[agentKey] = t
	if payload.DeviceID != "" {
		h.liveTelemetry[payload.DeviceID] = t
	}
	h.telemetryMu.Unlock()

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "telemetry_received"})
}
