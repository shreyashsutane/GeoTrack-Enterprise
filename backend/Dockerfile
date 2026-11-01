# ==============================================================================
# Multi-Stage Production Hardened Dockerfile for Koyeb & Free Cloud Containers
# Adheres strictly to Production Hardening Promptbook: Prompt 28 (Container Hardening)
# ==============================================================================

# Build Stage
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Install security certificates & git
RUN apk add --no-cache ca-certificates git

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Compile optimized static binary (stripped debug symbols for tiny image size)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build \
    -ldflags="-s -w" \
    -o /app/bin/server ./cmd/server

# Production Runtime Stage (Distroless / Minimal Alpine)
FROM alpine:3.20

# Create unprivileged user to avoid root execution (Prompt 28)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /home/appuser

# Copy trusted certificates & compiled binary
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/bin/server /home/appuser/server

# Change ownership to non-root user
RUN chown -R appuser:appgroup /home/appuser
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/home/appuser/server"]
