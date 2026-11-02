/**
 * GeoTrack Enterprise - Unified API Client
 * Production Hardened: Zero exposed secrets, token auto-injection, graceful demo fallback
 */

const CUSTOM_API_URL = localStorage.getItem('geotrack_api_url');
const API_BASE_URL = CUSTOM_API_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8080'
  : (window.location.hostname.endsWith('onrender.com') ? '' : 'https://geotrack-enterprise.onrender.com'));

// Local Demo State for static hosting (e.g. GitHub Pages) when backend is offline
const DEMO_STORE = {
  users: [
    { id: '00000000-0000-0000-0000-000000000001', full_name: 'System Administrator', email: 'admin@geotrack.com', employee_code: 'ADM-001', role_name: 'SUPER_ADMIN', created_at: '2026-10-30T09:00:00Z' },
    { id: '00000000-0000-0000-0000-000000000002', full_name: 'Vikram Deshmukh', email: 'vikram.manager@geotrack.com', employee_code: 'MGR-042', role_name: 'BRANCH_MANAGER', created_at: '2026-10-30T10:00:00Z' },
    { id: '00000000-0000-0000-0000-000000000003', full_name: 'Rahul Sharma', email: 'rahul.sharma@geotrack.com', employee_code: 'EMP-104', role_name: 'FIELD_AGENT', created_at: '2026-10-30T11:00:00Z' },
    { id: '00000000-0000-0000-0000-000000000004', full_name: 'Sneha Kulkarni', email: 'sneha.k@geotrack.com', employee_code: 'EMP-105', role_name: 'FIELD_AGENT', created_at: '2026-10-31T09:30:00Z' },
    { id: '00000000-0000-0000-0000-000000000005', full_name: 'Amit Verma', email: 'amit.verma@geotrack.com', employee_code: 'EMP-106', role_name: 'FIELD_AGENT', created_at: '2026-10-31T14:15:00Z' }
  ],
  auditLogs: [
    { id: '1', actor_name: 'System Administrator', action_type: 'USER_CREATED', target_entity: 'users', target_id: 'EMP-104', details: 'Created Field Agent Rahul Sharma', created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: '2', actor_name: 'System Administrator', action_type: 'ASSETS_ASSIGNED', target_entity: 'assignments', target_id: 'MGR-042', details: 'Assigned 3 field assets to Manager Vikram Deshmukh', created_at: new Date(Date.now() - 1800000).toISOString() }
  ],
  reports: [
    {
      id: 'rep-001',
      report_number: 'REP-202611-0082',
      agent_name: 'Rahul Sharma',
      vehicle_registration: 'MH-02-CB-8842',
      report_date: '2026-11-01',
      start_time: '09:00:00',
      end_time: '18:00:00',
      total_distance_km: 58.4,
      total_moving_time_mins: 155,
      total_idle_time_mins: 35,
      calculated_fuel_liters: 1.67,
      fuel_rate_applied: 105.0,
      total_fuel_amount: 175.35,
      extra_toll_amount: 85.0,
      extra_parking_amount: 30.0,
      total_claim_amount: 290.35,
      status: 'SUBMITTED',
      agent_notes: 'Deliveries to Andheri and Bandra branches'
    }
  ]
};

const api = {
  getToken() {
    return localStorage.getItem('geotrack_token') || '';
  },

  setSession(token, user) {
    if (token) localStorage.setItem('geotrack_token', token);
    if (user) localStorage.setItem('geotrack_user', JSON.stringify(user));
  },

  getUser() {
    try {
      const u = localStorage.getItem('geotrack_user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  },

  clearSession() {
    localStorage.removeItem('geotrack_token');
    localStorage.removeItem('geotrack_user');
  },

  async logout() {
    try {
      await this.request('/api/v1/auth/logout', { method: 'POST' });
    } catch (e) {}
    this.clearSession();
    window.location.href = 'index.html';
  },

  async getPublicConfig() {
    try {
      const url = `${API_BASE_URL}/api/v1/config`;
      const res = await fetch(url).then(r => r.json()).catch(() => null);
      if (res && res.google_maps_key) {
        localStorage.setItem('geotrack_google_maps_key', res.google_maps_key);
        return res;
      }
    } catch (e) {}

    const cachedKey = localStorage.getItem('geotrack_google_maps_key') || '';
    return {
      google_maps_configured: !!cachedKey,
      google_maps_key: cachedKey,
      version: '1.0.0'
    };
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();

    // If session is using offline demo token, fulfill locally via demo store
    if (token && token.startsWith('demo-jwt-token-')) {
      return this.demoFallback(endpoint, options);
    }

    const url = `${API_BASE_URL}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(url, {
        ...options,
        headers,
      });

      if (res.status === 401) {
        if (endpoint.includes('/auth/login')) {
          const errData = await res.json().catch(() => null);
          throw new Error((errData && errData.error) || 'Invalid employee code or password.');
        }
        this.clearSession();
        if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
          window.location.href = 'index.html';
        }
        throw new Error('Session expired. Please log in again.');
      }

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const errorMsg = data && data.error ? data.error : `Request failed (HTTP ${res.status})`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      // Graceful offline fallback ONLY when backend is unreachable (e.g. network down)
      if ((window.location.hostname.endsWith('github.io') || !API_BASE_URL) && err.name === 'TypeError' && err.message.includes('fetch')) {
        return this.demoFallback(endpoint, options);
      }
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  },

  demoFallback(endpoint, options) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};

    if (endpoint === '/api/v1/auth/me') {
      return this.getUser() || DEMO_STORE.users[0];
    }

    if (endpoint === '/api/v1/admin/users') {
      if (method === 'POST') {
        const newUser = {
          id: 'usr-' + Date.now(),
          full_name: body.full_name,
          email: body.email,
          employee_code: body.employee_code,
          role_name: body.role_name,
          created_at: new Date().toISOString()
        };
        DEMO_STORE.users.push(newUser);
        DEMO_STORE.auditLogs.unshift({
          id: 'log-' + Date.now(),
          actor_name: (this.getUser() || {}).full_name || 'Admin',
          action_type: 'USER_CREATED',
          target_entity: 'users',
          target_id: newUser.employee_code,
          details: `Created user ${newUser.full_name} (${newUser.employee_code})`,
          created_at: new Date().toISOString()
        });
        return newUser;
      }
      return DEMO_STORE.users;
    }

    if (endpoint === '/api/v1/admin/audit-logs') {
      return DEMO_STORE.auditLogs;
    }

    if (endpoint === '/api/v1/admin/assign') {
      DEMO_STORE.auditLogs.unshift({
        id: 'log-' + Date.now(),
        actor_name: (this.getUser() || {}).full_name || 'Admin',
        action_type: 'ASSETS_ASSIGNED',
        target_entity: 'assignments',
        target_id: body.manager_id,
        details: `Assigned ${(body.agent_ids || []).length} field assets to Branch Manager`,
        created_at: new Date().toISOString()
      });
      return { message: 'assets successfully assigned' };
    }

    if (endpoint === '/api/v1/manager/assets') {
      return DEMO_STORE.users.filter(u => u.role_name === 'FIELD_AGENT');
    }

    if (endpoint === '/api/v1/reports') {
      return DEMO_STORE.reports;
    }

    if (endpoint === '/api/v1/reports/my') {
      return DEMO_STORE.reports;
    }

    if (endpoint.startsWith('/api/v1/reports/') && endpoint.endsWith('/review')) {
      const idMatch = endpoint.match(/\/api\/v1\/reports\/(.+)\/review/);
      if (idMatch) {
        const rep = DEMO_STORE.reports.find(r => r.id === idMatch[1]);
        if (rep) {
          rep.status = body.status;
          rep.rejection_reason = body.rejection_reason || '';
        }
      }
      return { message: 'report status updated' };
    }

    if (endpoint === '/api/v1/reports/submit') {
      const newRep = {
        id: 'rep-' + Date.now(),
        report_number: 'REP-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
        agent_name: (this.getUser() || {}).full_name || 'Field Agent',
        vehicle_registration: 'MH-12-AB-9999',
        report_date: body.report_date || new Date().toISOString().split('T')[0],
        total_distance_km: body.total_distance_km || 0,
        total_moving_time_mins: body.total_moving_time_mins || 0,
        total_idle_time_mins: body.total_idle_time_mins || 0,
        calculated_fuel_liters: body.calculated_fuel_liters || 0,
        fuel_rate_applied: body.fuel_rate_applied || 105.0,
        total_fuel_amount: body.total_fuel_amount || 0,
        extra_toll_amount: body.extra_toll_amount || 0,
        extra_parking_amount: body.extra_parking_amount || 0,
        total_claim_amount: body.total_claim_amount || 0,
        status: 'SUBMITTED',
        agent_notes: body.agent_notes || ''
      };
      DEMO_STORE.reports.unshift(newRep);
      return newRep;
    }

    if (endpoint === '/api/v1/config') {
      return {
        google_maps_configured: true,
        google_maps_key: localStorage.getItem('geotrack_google_maps_key') || '',
        version: '1.0.0'
      };
    }

    return null;
  },

  // Auth Endpoints
  async login(emailOrCode, password) {
    try {
      const res = await this.request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email_or_code: emailOrCode, password }),
      });
      if (res && res.token && res.user) {
        this.setSession(res.token, res.user);
        return res;
      }
    } catch (err) {
      // If we received an explicit error from server or custom URL, propagate it directly
      if (API_BASE_URL) throw err;
    }

    // Demo Mode Auto-Resolver only when zero backend URL is available
    const code = (emailOrCode || '').toUpperCase().trim();
    let user = null;
    if (code.includes('ADM') || code.includes('ADMIN')) {
      user = DEMO_STORE.users[0];
    } else if (code.includes('MGR') || code.includes('MANAGER')) {
      user = DEMO_STORE.users[1];
    } else {
      user = DEMO_STORE.users[2];
    }

    const mockToken = 'demo-jwt-token-' + user.role_name;
    this.setSession(mockToken, user);
    return { token: mockToken, user };
  },

  async getCurrentUser() {
    return this.request('/api/v1/auth/me');
  },

  // Admin Endpoints
  async listUsers() {
    return this.request('/api/v1/admin/users');
  },

  async createUser(userData) {
    return this.request('/api/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async assignAssets(managerId, agentIds) {
    return this.request('/api/v1/admin/assign', {
      method: 'POST',
      body: JSON.stringify({ manager_id: managerId, agent_ids: agentIds }),
    });
  },

  async listAuditLogs() {
    return this.request('/api/v1/admin/audit-logs');
  },

  // Manager Endpoints
  async getManagerAssets() {
    return this.request('/api/v1/manager/assets');
  },

  async listManagerReports() {
    return this.request('/api/v1/reports');
  },

  async downloadReportsCSV() {
    try {
      const url = `${API_BASE_URL}/api/v1/reports/export`;
      const token = this.getToken();
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        this.triggerDownload(blob);
        return;
      }
    } catch (e) {
      // Fallback in-browser CSV generator for GitHub Pages
    }

    const reports = await this.listManagerReports();
    let csv = "Report Number,Date,Agent Name,Vehicle Reg,Distance (KM),Moving (Mins),Fuel (Liters),Fuel Amount (₹),Toll (₹),Parking (₹),Total Claim (₹),Status,Notes\n";
    (reports || []).forEach(r => {
      csv += `"${r.report_number}","${r.report_date}","${r.agent_name}","${r.vehicle_registration || ''}",${r.total_distance_km},${r.total_moving_time_mins || 0},${r.calculated_fuel_liters},${r.total_fuel_amount},${r.extra_toll_amount || 0},${r.extra_parking_amount || 0},${r.total_claim_amount},"${r.status}","${r.agent_notes || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob);
  },

  triggerDownload(blob) {
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `geotrack-reports-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  },

  async reviewReport(reportId, status, reason = '') {
    return this.request(`/api/v1/reports/${reportId}/review`, {
      method: 'POST',
      body: JSON.stringify({ status, rejection_reason: reason }),
    });
  },

  // Agent Endpoints
  async submitReport(reportData) {
    return this.request('/api/v1/reports/submit', {
      method: 'POST',
      body: JSON.stringify(reportData),
    });
  },

  async listMyReports() {
    return this.request('/api/v1/reports/my');
  }
};
