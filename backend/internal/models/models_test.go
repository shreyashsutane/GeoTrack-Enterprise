package models

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestReportValidation(t *testing.T) {
	// 1. Valid Report
	validReport := &Report{
		ID:                   uuid.New(),
		UserID:               uuid.New(),
		DeviceID:             uuid.New(),
		ReportDate:           "2026-11-01",
		StartTime:            time.Now().Add(-8 * time.Hour),
		EndTime:              time.Now(),
		TotalDistanceKm:      50.0,
		TotalMovingTimeMins:  120,
		TotalIdleTimeMins:    30,
		CalculatedFuelLiters: 1.43,
		FuelRateApplied:      105.00,
		TotalFuelAmount:      150.15,
		ExtraTollAmount:      50.00,
		ExtraParkingAmount:   20.00,
		TotalClaimAmount:     220.15, // 150.15 + 50.00 + 20.00
	}

	if err := validReport.Validate(); err != nil {
		t.Fatalf("expected valid report, got error: %v", err)
	}

	// 2. Imbalanced Claim Math (Promptbook: Prompt 37 - Financial integrity)
	imbalancedReport := *validReport
	imbalancedReport.TotalClaimAmount = 999.00 // Doesn't match sum
	if err := imbalancedReport.Validate(); err == nil {
		t.Fatal("expected validation failure on imbalanced claim sum, but got nil")
	}

	// 3. Negative Amount
	negativeReport := *validReport
	negativeReport.ExtraTollAmount = -25.0
	if err := negativeReport.Validate(); err == nil {
		t.Fatal("expected validation failure on negative toll amount, but got nil")
	}

	// 4. Invalid Date Format
	badDateReport := *validReport
	badDateReport.ReportDate = "01-11-2026"
	if err := badDateReport.Validate(); err == nil {
		t.Fatal("expected validation failure on non-ISO date format, but got nil")
	}
}

func TestUserValidation(t *testing.T) {
	validUser := &User{
		FullName:     "Priya Nair",
		Email:        "priya.nair@geotrack.com",
		EmployeeCode: "MGR-088",
	}

	if err := validUser.Validate(); err != nil {
		t.Fatalf("expected valid user, got error: %v", err)
	}

	// Bad email
	badEmailUser := &User{
		FullName:     "Priya Nair",
		Email:        "not-an-email",
		EmployeeCode: "MGR-088",
	}
	if err := badEmailUser.Validate(); err == nil {
		t.Fatal("expected error on invalid email, got nil")
	}

	// Bad employee code
	badCodeUser := &User{
		FullName:     "Priya Nair",
		Email:        "priya@geotrack.com",
		EmployeeCode: "!#$%",
	}
	if err := badCodeUser.Validate(); err == nil {
		t.Fatal("expected error on invalid employee code, got nil")
	}
}
