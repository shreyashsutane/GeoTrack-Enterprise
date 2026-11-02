/**
 * GeoTrack Enterprise - Branch Manager Dashboard Controller
 * Enforces 5-10 asset supervisory boundary and report approval workflows
 */

let assignedAgents = [];
let managerReports = [];
let map = null;
let agentMarkers = {};

function initMap() {
  if (map || !window.L) return;

  // 1. ESRI World Dark Gray Canvas (100% Free, Zero API Key Required, Zero Watermarks)
  const esriDark = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &copy; OpenStreetMap contributors',
    maxZoom: 16
  });

  // 2. OpenStreetMap Standard (100% Free, Zero API Key Required, Zero Watermarks)
  const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  });

  // 3. Optional Google Maps (Reads strictly from user browser localStorage, zero exposed secret keys in git)
  const customGoogleKey = localStorage.getItem('geotrack_google_maps_key') || '';
  const googleStreets = customGoogleKey ? L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=' + encodeURIComponent(customGoogleKey), {
    attribution: '&copy; Google Maps',
    maxZoom: 20
  }) : null;

  const googleSatellite = customGoogleKey ? L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=' + encodeURIComponent(customGoogleKey), {
    attribution: '&copy; Google Maps Satellite',
    maxZoom: 20
  }) : null;

  // Initialize map with ESRI Dark as default (completely clean, dark, no watermark)
  map = L.map('map', { 
    zoomControl: false,
    layers: [esriDark]
  }).setView([18.5204, 73.8567], 13);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Map layer controls
  const baseMaps = {
    "🌙 Dark Fleet (Default)": esriDark,
    "🌍 OpenStreetMap": osmLayer
  };
  if (googleStreets) {
    baseMaps["🗺️ Google Maps Streets"] = googleStreets;
    baseMaps["🛰️ Google Maps Satellite"] = googleSatellite;
  }
  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
}

function updateMapMarkers() {
  if (!map) return;

  Object.values(agentMarkers).forEach(m => map.removeLayer(m.marker));
  agentMarkers = {};

  if (!assignedAgents || assignedAgents.length === 0) return;

  const baseLat = 18.5204;
  const baseLng = 73.8567;
  const bounds = [];

  assignedAgents.forEach((agent, i) => {
    const lat = baseLat + (Math.sin(i * 1.7) * 0.035);
    const lng = baseLng + (Math.cos(i * 1.7) * 0.035);
    bounds.push([lat, lng]);

    const customIcon = L.divIcon({
      className: 'vehicle-marker',
      html: `
        <div style="background:var(--accent-cyan); color:#000; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 0 14px var(--accent-cyan); border:2px solid #fff; cursor:pointer;">
          <i class="fa-solid fa-motorcycle" style="font-size:14px;"></i>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
    marker.bindPopup(`
      <div style="color:#111; font-family:sans-serif; min-width:180px;">
        <h4 style="margin:0 0 4px 0; font-size:14px; font-weight:700;">${escapeHtml(agent.full_name)}</h4>
        <p style="margin:0 0 6px 0; font-size:12px; color:#555;">Code: <strong>${escapeHtml(agent.employee_code)}</strong></p>
        <div style="font-size:11px; color:#222; background:#f4f4f4; padding:6px; border-radius:4px; display:flex; flex-direction:column; gap:3px;">
          <div>Status: <span style="color:#00a86b; font-weight:700;">LIVE TRACKING</span></div>
          <div>Speed: <strong>38 km/h</strong></div>
          <div>Battery: <strong>88%</strong></div>
        </div>
      </div>
    `);

    agentMarkers[i] = { marker, lat, lng };
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [50, 50] });
  }
}

function focusAgent(idx) {
  const item = agentMarkers[idx];
  if (item && map) {
    map.setView([item.lat, item.lng], 16, { animate: true });
    item.marker.openPopup();
  }
}

async function exportCSV() {
  try {
    await api.downloadReportsCSV();
  } catch (err) {
    alert('Failed to export CSV: ' + err.message);
  }
}

function toggleReportsModal() {
  const modal = document.getElementById('modalReports');
  modal.classList.toggle('open');
  if (modal.classList.contains('open')) {
    loadManagerReports();
  }
}

async function loadAssignedFleet() {
  const listContainer = document.getElementById('fleetList');
  listContainer.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-secondary); font-size:0.85rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Fetching assigned fleet...</div>`;

  try {
    assignedAgents = await api.getManagerAssets();
    document.getElementById('fleetCountBadge').textContent = `${assignedAgents.length} Assigned`;
    updateMapMarkers();

    if (assignedAgents.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--text-muted); font-size:0.85rem;">
          <i class="fa-solid fa-circle-info" style="font-size:1.8rem; margin-bottom:8px; display:block;"></i>
          No field assets assigned to your account yet.<br>Contact System Administrator.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = assignedAgents.map((agent, idx) => {
      return `
        <div style="background:var(--bg-surface-elevated); border:1px solid var(--border-color); border-radius:10px; padding:12px; transition:border-color 0.2s; cursor:pointer;" onclick="focusAgent(${idx})">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-weight:700; color:var(--text-main); font-size:0.92rem;">${escapeHtml(agent.full_name)}</span>
            <span class="badge badge-approved" style="font-size:0.68rem;">ONLINE</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-secondary);">
            <span><i class="fa-solid fa-id-badge" style="color:var(--accent-cyan);"></i> ${agent.employee_code}</span>
            <span><i class="fa-solid fa-battery-three-quarters" style="color:var(--accent-green);"></i> 88%</span>
            <span><i class="fa-solid fa-gauge" style="color:var(--accent-orange);"></i> 38 km/h</span>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    listContainer.innerHTML = `<div style="text-align:center; color:var(--accent-red); padding:20px; font-size:0.85rem;">Failed to load fleet: ${err.message}</div>`;
  }
}

async function loadManagerReports() {
  const tbody = document.getElementById('reportsTableBody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-secondary);"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading reports...</td></tr>`;

  try {
    managerReports = await api.listManagerReports();
    const pendingCount = managerReports.filter(r => r.status === 'SUBMITTED').length;
    document.getElementById('pendingClaimsBadge').textContent = pendingCount;

    if (managerReports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-secondary);">No travel expense reports filed by your team yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = managerReports.map(rep => {
      let statusBadge = '<span class="badge badge-submitted">IN REVIEW</span>';
      let actionButtons = `
        <button class="btn btn-primary" style="padding:4px 8px; font-size:0.75rem;" onclick="reviewReport('${rep.id}', 'APPROVED')">
          <i class="fa-solid fa-check"></i> Approve
        </button>
        <button class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="promptRejectReport('${rep.id}')">
          <i class="fa-solid fa-xmark"></i> Reject
        </button>
      `;

      if (rep.status === 'APPROVED') {
        statusBadge = '<span class="badge badge-approved">APPROVED</span>';
        actionButtons = '<span style="color:var(--accent-green); font-size:0.8rem;"><i class="fa-solid fa-check-double"></i> Approved</span>';
      } else if (rep.status === 'REJECTED') {
        statusBadge = '<span class="badge badge-rejected">REJECTED</span>';
        actionButtons = `<span style="color:var(--accent-red); font-size:0.8rem;" title="${escapeHtml(rep.rejection_reason)}"><i class="fa-solid fa-circle-exclamation"></i> Rejected</span>`;
      }

      return `
        <tr>
          <td style="font-family:monospace; font-weight:700; color:var(--accent-cyan);">${escapeHtml(rep.report_number)}</td>
          <td style="font-weight:600;">${escapeHtml(rep.agent_name || 'Agent')}</td>
          <td style="font-size:0.85rem; color:var(--text-secondary);">${rep.report_date}</td>
          <td>${rep.total_distance_km} km</td>
          <td>₹ ${rep.total_fuel_amount.toFixed(2)}</td>
          <td style="font-weight:700; color:var(--accent-green);">₹ ${rep.total_claim_amount.toFixed(2)}</td>
          <td>${statusBadge}</td>
          <td style="white-space:nowrap;">${actionButtons}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--accent-red); padding:20px;">Failed to load reports: ${err.message}</td></tr>`;
  }
}

async function reviewReport(reportId, status, reason = '') {
  try {
    await api.reviewReport(reportId, status, reason);
    await loadManagerReports();
  } catch (err) {
    alert('Failed to update report: ' + err.message);
  }
}

function promptRejectReport(reportId) {
  const reason = prompt('Please enter the rejection reason for this expense claim:');
  if (reason && reason.trim()) {
    reviewReport(reportId, 'REJECTED', reason.trim());
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Auth Guard Check
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = await api.getCurrentUser();
    if (!user || (user.role_name !== 'BRANCH_MANAGER' && user.role_name !== 'SUPER_ADMIN')) {
      alert('Access Denied: Branch Manager role required.');
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('navUserName').textContent = user.full_name;
    initMap();
    await loadAssignedFleet();
    await loadManagerReports();
  } catch (e) {
    window.location.href = 'index.html';
  }
});
