/**
 * GeoTrack Enterprise - Admin Portal Controller
 */

let allUsers = [];

function logout() {
  api.clearSession();
  window.location.href = 'index.html';
}

function openCreateUserModal() {
  document.getElementById('formCreateUser').reset();
  document.getElementById('modalAlert').style.display = 'none';
  document.getElementById('modalCreateUser').classList.add('open');
}

function openAssignModal() {
  populateAssignDropdowns();
  document.getElementById('modalAssignAssets').classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function toggleAgentFields() {
  const role = document.getElementById('selectNewRole').value;
  const section = document.getElementById('agentVehicleSection');
  section.style.display = role === 'FIELD_AGENT' ? 'block' : 'none';
}

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-secondary);"><i class="fa-solid fa-circle-notch fa-spin"></i> Fetching users...</td></tr>`;

  try {
    const users = await api.listUsers();
    allUsers = users || [];
    renderUsersTable();
    updateStats();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--accent-red); padding:20px;">Failed to load users: ${err.message}</td></tr>`;
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  const search = document.getElementById('inputSearchUser').value.toLowerCase().trim();
  const roleFilter = document.getElementById('selectRoleFilter').value;

  const filtered = allUsers.filter(u => {
    const matchesSearch = !search ||
      u.full_name.toLowerCase().includes(search) ||
      u.employee_code.toLowerCase().includes(search) ||
      u.email.toLowerCase().includes(search);
    const matchesRole = !roleFilter || u.role_name === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-secondary);">No user accounts found matching query.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    let roleClass = 'role-agent';
    let roleLabel = 'Field Agent';
    if (u.role_name === 'SUPER_ADMIN') {
      roleClass = 'role-admin';
      roleLabel = 'Super Admin';
    } else if (u.role_name === 'BRANCH_MANAGER') {
      roleClass = 'role-manager';
      roleLabel = 'Branch Manager';
    }

    const created = new Date(u.created_at).toLocaleDateString();

    return `
      <tr>
        <td style="font-weight:700; color:var(--accent-cyan); font-family:monospace;">${escapeHtml(u.employee_code)}</td>
        <td style="font-weight:600;">${escapeHtml(u.full_name)}</td>
        <td style="color:var(--text-secondary);">${escapeHtml(u.email)}</td>
        <td><span class="role-pill ${roleClass}">${roleLabel}</span></td>
        <td><span class="badge badge-approved" style="font-size:0.7rem;">Active</span></td>
        <td style="color:var(--text-muted); font-size:0.82rem;">${created}</td>
      </tr>
    `;
  }).join('');
}

function updateStats() {
  document.getElementById('statTotalUsers').textContent = allUsers.length;
  document.getElementById('statManagers').textContent = allUsers.filter(u => u.role_name === 'BRANCH_MANAGER').length;
  document.getElementById('statAgents').textContent = allUsers.filter(u => u.role_name === 'FIELD_AGENT').length;
}

function populateAssignDropdowns() {
  const mgrSelect = document.getElementById('selectAssignManager');
  const agentContainer = document.getElementById('agentCheckboxList');

  const managers = allUsers.filter(u => u.role_name === 'BRANCH_MANAGER');
  const agents = allUsers.filter(u => u.role_name === 'FIELD_AGENT');

  mgrSelect.innerHTML = managers.map(m => `<option value="${m.id}">${escapeHtml(m.full_name)} (${m.employee_code})</option>`).join('');

  if (agents.length === 0) {
    agentContainer.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted);">No field agents found. Create agents first.</p>`;
    return;
  }

  agentContainer.innerHTML = agents.map(a => `
    <label style="display:flex; align-items:center; gap:8px; padding:6px 4px; font-size:0.85rem; cursor:pointer;">
      <input type="checkbox" name="assignAgent" value="${a.id}">
      <span><strong>${escapeHtml(a.full_name)}</strong> (${a.employee_code})</span>
    </label>
  `).join('');
}

// Form Handlers
document.getElementById('formCreateUser').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById('modalAlert');
  alertBox.style.display = 'none';

  const payload = {
    full_name: document.getElementById('inputNewFullName').value.trim(),
    employee_code: document.getElementById('inputNewEmpCode').value.trim(),
    email: document.getElementById('inputNewEmail').value.trim(),
    role_name: document.getElementById('selectNewRole').value,
    password: document.getElementById('inputNewPassword').value,
    vehicle_registration: document.getElementById('inputNewVehicleReg').value.trim(),
    fuel_efficiency_km_l: parseFloat(document.getElementById('inputNewEfficiency').value) || 35.0,
    fuel_rate_per_liter: 105.0
  };

  try {
    await api.createUser(payload);
    closeModal('modalCreateUser');
    await loadUsers();
    await loadAuditLogs();
  } catch (err) {
    alertBox.textContent = err.message || 'Failed to create user account.';
    alertBox.style.display = 'block';
  }
});

document.getElementById('formAssignAssets').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mgrId = document.getElementById('selectAssignManager').value;
  const checkboxes = document.querySelectorAll('input[name="assignAgent"]:checked');
  const agentIds = Array.from(checkboxes).map(cb => cb.value);

  if (agentIds.length === 0) {
    alert('Please select at least 1 agent to assign.');
    return;
  }
  if (agentIds.length > 15) {
    alert('You cannot assign more than 15 assets to a single manager.');
    return;
  }

  try {
    await api.assignAssets(mgrId, agentIds);
    alert('Assets successfully assigned!');
    closeModal('modalAssignAssets');
    await loadAuditLogs();
  } catch (err) {
    alert('Failed to assign assets: ' + err.message);
  }
});

async function loadAuditLogs() {
  const tbody = document.getElementById('auditLogsTableBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-secondary);"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading audit logs...</td></tr>`;

  try {
    const logs = await api.listAuditLogs();
    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-secondary);">No audit log events recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      let actionBadge = 'badge-submitted';
      if (l.action_type.includes('CREATE')) actionBadge = 'badge-approved';
      if (l.action_type.includes('ASSIGN')) actionBadge = 'role-manager';
      if (l.action_type.includes('DELETE') || l.action_type.includes('REJECT')) actionBadge = 'badge-rejected';

      const timeStr = new Date(l.created_at).toLocaleString();

      return `
        <tr>
          <td style="color:var(--text-muted); font-size:0.82rem; white-space:nowrap;">${timeStr}</td>
          <td style="font-weight:600;">${escapeHtml(l.actor_name || 'System')}</td>
          <td><span class="badge ${actionBadge}" style="font-size:0.75rem;">${escapeHtml(l.action_type)}</span></td>
          <td style="color:var(--accent-cyan); font-family:monospace; font-size:0.85rem;">${escapeHtml(l.target_entity)}</td>
          <td style="color:var(--text-secondary); font-family:monospace; font-size:0.8rem;">${escapeHtml(l.target_id || '-')}</td>
          <td style="font-size:0.85rem; color:var(--text-primary);">${escapeHtml(l.details)}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--accent-red); padding:16px;">Failed to load audit trail: ${err.message}</td></tr>`;
  }
}

document.getElementById('inputSearchUser').addEventListener('input', renderUsersTable);
document.getElementById('selectRoleFilter').addEventListener('change', renderUsersTable);

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Auth Guard Check
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = await api.getCurrentUser();
    if (!user || user.role_name !== 'SUPER_ADMIN') {
      alert('Access Denied: Super Admin role required.');
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('navUserName').textContent = user.full_name;
    await loadUsers();
    await loadAuditLogs();
  } catch (e) {
    window.location.href = 'index.html';
  }
});
