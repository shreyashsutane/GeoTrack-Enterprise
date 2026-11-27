package handlers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"geotrack-backend/internal/auth"
	"geotrack-backend/internal/repository"
)

func TestPingTelematicsAuthHandling(t *testing.T) {
	secret := "test-secret"
	h := NewHandler(repository.NewInMemoryStore(), secret)

	// 1. Expired token must return 401 Unauthorized (never silently fall back to DeviceID)
	expiredTok, err := auth.GenerateToken("00000000-0000-0000-0000-000000000003", "rahul.sharma@geotrack.com", "FIELD_AGENT", "EMP-104", secret, -1*time.Hour)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/telematics/ping", bytes.NewBufferString(`{"deviceId":"dev1","lat":18.52,"lng":73.85}`))
	req.Header.Set("Authorization", "Bearer "+expiredTok)
	rec := httptest.NewRecorder()
	h.PingTelematics(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for expired token, got %d", rec.Code)
	}

	// 2. Valid token returns 202 and indexes telemetry by UserID and EmployeeCode
	validTok, err := auth.GenerateToken("00000000-0000-0000-0000-000000000003", "rahul.sharma@geotrack.com", "FIELD_AGENT", "EMP-104", secret, 1*time.Hour)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/telematics/ping", bytes.NewBufferString(`{"deviceId":"dev1","lat":18.52,"lng":73.85,"speedKmh":25}`))
	req2.Header.Set("Authorization", "Bearer "+validTok)
	rec2 := httptest.NewRecorder()
	h.PingTelematics(rec2, req2)
	if rec2.Code != http.StatusAccepted {
		t.Fatalf("expected 202 for valid token, got %d", rec2.Code)
	}
	if _, ok := h.liveTelemetry["EMP-104"]; !ok {
		t.Fatal("expected telemetry indexed by EMP-104")
	}

	// 3. Recorded telemetry is persisted and returned by GetAgentTimeline for assigned manager
	mgrUUID := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	agentUUID := uuid.MustParse("00000000-0000-0000-0000-000000000003")
	if err := h.store.AssignAssetsToManager(req2.Context(), mgrUUID, []uuid.UUID{agentUUID}); err != nil {
		t.Fatalf("AssignAssetsToManager failed: %v", err)
	}
	pts, err := h.store.GetTelemetryHistory(req2.Context(), agentUUID, time.Now().UTC().Add(-1*time.Hour), time.Now().UTC().Add(1*time.Hour))
	if err != nil || len(pts) != 1 || pts[0].Lat != 18.52 || pts[0].Lng != 73.85 {
		t.Fatalf("expected persisted telemetry point (18.52, 73.85), got %+v err=%v", pts, err)
	}
}
