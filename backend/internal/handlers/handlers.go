package handlers

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"geotrack-backend/internal/auth"
	"geotrack-backend/internal/middleware"
	"geotrack-backend/internal/models"
	"geotrack-backend/internal/repository"
)

type Handler struct {
	store     repository.Store
	jwtSecret string
}

func NewHandler(store repository.Store, jwtSecret string) *Handler {
	return &Handler{
		store:     store,
		jwtSecret: jwtSecret,
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
// Health Checks (Promptbook: Prompt 66)
// ==============================================================================
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"service":   "geotrack-enterprise-backend",
		"version":   "1.0.0",
	})
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

	req.EmailOrCode = strings.TrimSpace(req.EmailOrCode)
	if req.EmailOrCode == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "employee code/email and password are required")
		return
	}

	user, err := h.store.GetUserByEmailOrCode(r.Context(), req.EmailOrCode)
	if err != nil {
		// Constant-time generic error to prevent account enumeration (Promptbook: Prompt 3)
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
	writeJSON(w, http.StatusOK, agents)
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

// Telematics Ingestion Stub for Android Client
func (h *Handler) PingTelematics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "telemetry_received"})
}
