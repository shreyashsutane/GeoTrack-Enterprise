/**
 * GeoTrack Enterprise - API Client
 * Production Hardened: Zero exposed secrets, token auto-injection, unified error handling
 */

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8080'
  : ''; // Relative in production when behind reverse proxy or Koyeb

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

  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = this.getToken();

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
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  },

  // Auth Endpoints
  async login(emailOrCode, password) {
    const res = await this.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email_or_code: emailOrCode, password }),
    });
    if (res && res.token && res.user) {
      this.setSession(res.token, res.user);
    }
    return res;
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
    const url = `${API_BASE_URL}/api/v1/reports/export`;
    const token = this.getToken();
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) {
      throw new Error(`Failed to export CSV: ${res.statusText}`);
    }
    const blob = await res.blob();
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
