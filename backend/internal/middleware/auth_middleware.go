package middleware

import (
	"context"
	"net/http"
	"strings"

	"geotrack-backend/internal/auth"
	"geotrack-backend/internal/models"
)

type contextKey string

const UserContextKey contextKey = "authenticated_user"

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func AuthRequired(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var tokenStr string

			// 1. Check Authorization: Bearer <token>
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
			} else {
				// 2. Check HTTP-only cookie
				if cookie, err := r.Cookie("geotrack_token"); err == nil {
					tokenStr = cookie.Value
				}
			}

			if tokenStr == "" {
				http.Error(w, `{"error":"unauthorized: missing authentication token"}`, http.StatusUnauthorized)
				return
			}

			claims, err := auth.ValidateToken(tokenStr, jwtSecret)
			if err != nil {
				http.Error(w, `{"error":"unauthorized: invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), UserContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireRoles(allowedRoles ...models.RoleName) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(UserContextKey).(*auth.CustomClaims)
			if !ok || claims == nil {
				http.Error(w, `{"error":"unauthorized: missing credentials"}`, http.StatusUnauthorized)
				return
			}

			userRole := models.RoleName(claims.Role)
			authorized := false
			for _, allowed := range allowedRoles {
				if userRole == allowed {
					authorized = true
					break
				}
			}

			if !authorized {
				http.Error(w, `{"error":"forbidden: insufficient role permissions"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
