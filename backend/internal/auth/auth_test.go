package auth

import (
	"testing"
	"time"
)

func TestArgon2idPasswordHashing(t *testing.T) {
	password := "SecretPassw0rd!2026"

	// 1. Hash password
	encodedHash, err := HashPassword(password, nil)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if encodedHash == "" {
		t.Fatal("encodedHash is empty")
	}

	// 2. Positive verification
	valid, err := VerifyPassword(password, encodedHash)
	if err != nil {
		t.Fatalf("VerifyPassword error: %v", err)
	}
	if !valid {
		t.Fatal("expected password to match hash, got invalid")
	}

	// 3. Negative verification (wrong password must fail)
	invalidMatch, err := VerifyPassword("WrongPassword123", encodedHash)
	if err != nil {
		t.Fatalf("unexpected error on wrong password verification: %v", err)
	}
	if invalidMatch {
		t.Fatal("wrong password unexpectedly validated successfully")
	}
}

func TestJWTTokenGenerationAndValidation(t *testing.T) {
	secret := "test-secret-key-1234567890"
	userID := "00000000-0000-0000-0000-000000000001"
	email := "admin@geotrack.com"
	role := "SUPER_ADMIN"
	code := "ADM-001"

	// 1. Generate token
	token, err := GenerateToken(userID, email, role, code, secret, 1*time.Hour)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	// 2. Validate token
	claims, err := ValidateToken(token, secret)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != userID || claims.Email != email || claims.Role != role || claims.EmployeeCode != code {
		t.Fatalf("token claims do not match: %+v", claims)
	}

	// 3. Test tampered / invalid secret
	_, err = ValidateToken(token, "wrong-secret-key")
	if err == nil {
		t.Fatal("expected token validation to fail with wrong secret, but succeeded")
	}
}
