# GeoTrack Enterprise — Stack A (100% Free Production Architecture)

Production-hardened field telematics, live fleet monitoring, and automated travel expense reimbursement platform built strictly adhering to the **Vibe-Coded App Production Hardening Promptbook** and **SOLID Principles**.

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GeoTrack Enterprise (Stack A)                   │
│                                                                        │
│  [ Mobile Client ]      Android (Kotlin / Jetpack Compose)             │
│                         • Foreground Service + Kalman GPS Filter       │
│                         • Daily Trip & Fuel Claim Submission           │
│                                                                        │
│  [ Web Dashboard ]      Cloudflare Pages (100% Free Global CDN)        │
│                         • Admin Portal (Create Users, Assign 5-10)     │
│                         • Manager Portal (Assigned 5-10 Map & Review)  │
│                         • Agent Web Portal (Claim File & Status)       │
│                                                                        │
│  [ Backend API ]        Go 1.26 Microservice (Koyeb Free Container)    │
│                         • Argon2id PHC Password Hashing ($m=65536)     │
│                         • JWT Auth + Token Version Revocation          │
│                         • Server-Side 5-10 Asset Scope Enforcement     │
│                                                                        │
│  [ Database ]           PostgreSQL 16+ (Supabase / Neon Free Tier)     │
│                         • Multi-Tenant Schema + Audit Trails           │
│                         • Invariant Money Math (NUMERIC 10,2)          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Free Deployment Guide (Step-by-Step)

### 1. Database Setup (Supabase / Neon — Free Forever)
1. Create a free account at [Supabase.com](https://supabase.com) or [Neon.tech](https://neon.tech).
2. Open the **SQL Editor** in your database dashboard.
3. Paste and run the schema file:
   [`backend/migrations/001_init_schema.sql`](backend/migrations/001_init_schema.sql).
4. Copy your PostgreSQL Connection String (e.g. `postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres`).

---

### 2. Backend Deployment (Koyeb — Free Container)
1. Push this repository to GitHub.
2. Sign in to [Koyeb.com](https://koyeb.com) (100% Free Eco Tier, no sleep).
3. Create a **New Web Service**:
   - Select your repository $\to$ Point to `/backend` directory.
   - Build Type: **Dockerfile** (uses the production-hardened multi-stage Dockerfile).
   - Set Environment Variables:
     - `PORT`: `8080`
     - `JWT_SECRET`: `your-secure-random-32-char-secret-key`
     - `DATABASE_URL`: Your Supabase connection string.
4. Deploy! Koyeb gives you a public HTTPS URL (e.g. `https://geotrack-api.koyeb.app`).

---

### 3. Frontend Deployment (Cloudflare Pages — Free Unlimited Bandwidth)
1. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com) $\to$ **Workers & Pages** $\to$ **Pages**.
2. Connect your GitHub repository or directly drag-and-drop the `frontend/` folder.
3. Output directory: `frontend/`.
4. Deploy! Your dashboard is instantly live globally with free SSL and zero bandwidth limits.

---

### 4. Android Mobile App Installation
- The compiled APK is available directly on your Desktop:
  📦 **[`GeoTrack-Enterprise.apk`](../GeoTrack-Enterprise.apk)** (17 MB)
- Install on any Android device (Android 8.0 to Android 15).
- Works with live server or in **Instant Offline Demo Mode**.

---

## 🔑 Default Test Credentials (Argon2id)

| Role | Employee Code / Email | Password | Allowed Access |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `ADM-001` or `admin@geotrack.com` | `AdminPass123!` | Admin Portal (`admin.html`): Create users, assign 5–10 assets, audit logs. |
| **Branch Manager** | `MGR-042` or `vikram.manager@geotrack.com` | `ManagerPass123!` | Manager Portal (`manager.html`): View assigned 5–10 assets, approve/reject expense claims. |
| **Field Agent** | `EMP-104` or `rahul.sharma@geotrack.com` | `AgentPass123!` | Android App & Web Agent Portal: Shift tracking, submit trip mileage & fuel claims. |

---

## 🛡️ Production Hardening Audit Checklist (Completed)

- [x] **Prompt 3 (Authentication)**: Argon2id with 64 MB memory cost, 3 iterations, 4 parallelism.
- [x] **Prompt 4 (Authorization & Tenant Isolation)**: Server-side SQL scope checks (`WHERE a.manager_id = $1`). Managers cannot inspect unassigned vehicles.
- [x] **Prompt 5 (Secrets Management)**: Zero secrets in source files or git history.
- [x] **Prompt 10 (Idempotency)**: Enforces `UNIQUE(user_id, report_date)` to prevent duplicate report claims.
- [x] **Prompt 37 (Money & Financial Arithmetic)**: Strict balance invariant: $\text{Total Claim} = \text{Fuel} + \text{Tolls} + \text{Parking}$ rounded to 2 decimal places.
- [x] **Prompt 66 (Health Checks)**: `/healthz` and `/readyz` probes implemented.
- [x] **Prompt 67 (Graceful Shutdown)**: Handles `SIGINT` / `SIGTERM` and drains in-flight requests cleanly.
