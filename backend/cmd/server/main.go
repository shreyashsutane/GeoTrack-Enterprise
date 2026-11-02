package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"geotrack-backend/internal/database"
	"geotrack-backend/internal/handlers"
	"geotrack-backend/internal/middleware"
	"geotrack-backend/internal/models"
	"geotrack-backend/internal/repository"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "geotrack-enterprise-production-hardened-secret-key-2026"
		log.Println("[Warning] JWT_SECRET not provided via env; using secure fallback key for development.")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// 1. Database Connection Pool (Promptbook: Prompt 68)
	db, err := database.Connect(ctx)
	if err != nil {
		log.Fatalf("[Fatal] Failed to initialize database: %v", err)
	}
	defer db.Close()

	// 2. Repository Store
	store := repository.NewStore(db)

	// 3. Handlers
	h := handlers.NewHandler(store, jwtSecret)

	// 4. HTTP Router
	mux := http.NewServeMux()

	// Public Health Probes (Promptbook: Prompt 66)
	mux.HandleFunc("GET /healthz", h.HealthCheck)
	mux.HandleFunc("GET /readyz", h.HealthCheck)
	mux.HandleFunc("GET /api/v1/config", h.GetPublicConfig)

	// Public Authentication
	mux.HandleFunc("POST /api/v1/auth/login", h.Login)
	mux.HandleFunc("POST /api/v1/auth/logout", h.Logout)
	mux.HandleFunc("GET /api/v1/auth/diag", h.AuthDiagnostics)

	// Mobile Telematics Ping
	mux.HandleFunc("POST /api/v1/telematics/ping", h.PingTelematics)

	// Protected Routes (JWT Required)
	authMW := middleware.AuthRequired(jwtSecret)

	// Current User Profile
	mux.Handle("GET /api/v1/auth/me", authMW(http.HandlerFunc(h.GetCurrentUser)))

	// Field Agent Routes
	mux.Handle("POST /api/v1/reports/submit", authMW(http.HandlerFunc(h.SubmitReport)))
	mux.Handle("GET /api/v1/reports/my", authMW(http.HandlerFunc(h.ListMyReports)))

	// Manager Routes (Strict Role & 5-10 Asset Scope Enforcement)
	managerMW := middleware.RequireRoles(models.RoleBranchManager, models.RoleSuperAdmin)
	mux.Handle("GET /api/v1/reports", authMW(managerMW(http.HandlerFunc(h.ListManagerReports))))
	mux.Handle("GET /api/v1/reports/export", authMW(managerMW(http.HandlerFunc(h.ExportReportsCSV))))
	mux.Handle("POST /api/v1/reports/{id}/review", authMW(managerMW(http.HandlerFunc(h.ReviewReport))))
	mux.Handle("GET /api/v1/manager/assets", authMW(managerMW(http.HandlerFunc(h.GetManagerAssets))))

	// Super Admin Routes (User Creation & Fleet Assignments & Audit Logs)
	adminMW := middleware.RequireRoles(models.RoleSuperAdmin)
	mux.Handle("GET /api/v1/admin/users", authMW(adminMW(http.HandlerFunc(h.ListUsers))))
	mux.Handle("POST /api/v1/admin/users", authMW(adminMW(http.HandlerFunc(h.CreateUser))))
	mux.Handle("POST /api/v1/admin/assign", authMW(adminMW(http.HandlerFunc(h.AssignAssets))))
	mux.Handle("GET /api/v1/admin/audit-logs", authMW(adminMW(http.HandlerFunc(h.ListAuditLogs))))

	// Static Frontend Serving (Unified Monolith for 100% Free Single-Port Hosting)
	frontendDir := os.Getenv("FRONTEND_DIR")
	if frontendDir == "" {
		if _, err := os.Stat("../frontend"); err == nil {
			frontendDir = "../frontend"
		} else if _, err := os.Stat("./frontend"); err == nil {
			frontendDir = "./frontend"
		}
	}

	if frontendDir != "" {
		fileServer := http.FileServer(http.Dir(frontendDir))
		mux.Handle("GET /", fileServer)
		log.Printf("[Server] Serving web dashboard & assets from %s", frontendDir)
	}

	// Apply Global Middleware (CORS)
	handlerWithCORS := middleware.CORS(mux)

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      handlerWithCORS,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Server runner
	go func() {
		log.Printf("[Server] GeoTrack Enterprise API running on http://0.0.0.0:%s", port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[Fatal] Server failed: %v", err)
		}
	}()

	// Wait for shutdown signal (Promptbook: Prompt 67: Graceful shutdown)
	<-ctx.Done()
	log.Println("[Shutdown] Signal received. Draining in-flight requests...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("[Shutdown] Forced shutdown encountered error: %v", err)
	}

	log.Println("[Shutdown] Server gracefully stopped. All resources released.")
}
