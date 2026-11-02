/**
 * GeoTrack Enterprise - Branch Manager Dashboard Controller
 * Enforces 5-10 asset supervisory boundary and authentic Google Maps telemetry tracking
 */

let assignedAgents = [];
let managerReports = [];
let isGoogleMapsActive = false;
let googleMap = null;
let googleMarkers = {};
let activeInfoWindow = null;
let leafletMap = null;
let leafletMarkers = {};

function logout() {
  api.clearSession();
  window.location.href = 'index.html';
}
window.logout = logout;

// Google Maps Dark Theme styling (identical to LocationTracker)
const darkThemeStyles = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#334e87" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#023e58" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d99" }] }
];

async function loadGoogleMapsScript(apiKey) {
  if (window.google && window.google.maps) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('google-maps-sdk');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'google-maps-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps SDK'));
    document.head.appendChild(script);
  });
}

async function initMap(apiKey = '') {
  const googleKey = apiKey || localStorage.getItem('geotrack_google_maps_key') || '';

  if (googleKey) {
    try {
      await loadGoogleMapsScript(googleKey);
      const container = document.getElementById('map');
      if (container && window.google && window.google.maps) {
        googleMap = new google.maps.Map(container, {
          center: { lat: 18.5204, lng: 73.8567 },
          zoom: 13,
          styles: darkThemeStyles,
          backgroundColor: '#0b0f17',
          gestureHandling: 'greedy',
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: true,
          scaleControl: true,
          streetViewControl: false,
          fullscreenControl: true
        });
        isGoogleMapsActive = true;
        updateMapMarkers();
        return;
      }
    } catch (e) {
      console.warn('[Map] Google Maps JavaScript API load failed; falling back to clean tiles:', e);
    }
  }

  initLeafletFallback();
}

function initLeafletFallback() {
  if (leafletMap || !window.L) return;

  const esriDark = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri',
    maxZoom: 16
  });

  const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19
  });

  leafletMap = L.map('map', { 
    zoomControl: false,
    layers: [esriDark]
  }).setView([18.5204, 73.8567], 13);

  L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
  L.control.layers({ "🌙 Dark Fleet": esriDark, "🌍 OpenStreetMap": osmLayer }, null, { position: 'topright' }).addTo(leafletMap);
}

function updateMapMarkers() {
  const onlineAgents = (assignedAgents || []).filter(a => a.is_online === true && a.lat != null && a.lng != null);
  const badge = document.getElementById('fleetCountBadge');
  if (badge) {
    badge.textContent = `${onlineAgents.length} Online / ${assignedAgents.length} Total`;
  }

  // 1. Google Maps Rendering (Native SDK)
  if (isGoogleMapsActive && googleMap) {
    Object.values(googleMarkers).forEach(m => m.marker.setMap(null));
    googleMarkers = {};

    if (onlineAgents.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    onlineAgents.forEach((agent, i) => {
      const pos = { lat: agent.lat, lng: agent.lng };
      bounds.extend(pos);

      const marker = new google.maps.Marker({
        position: pos,
        map: googleMap,
        title: agent.full_name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#00e5ff',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="color:#111; font-family:sans-serif; min-width:180px; padding:4px;">
            <h4 style="margin:0 0 4px 0; font-size:14px; font-weight:700;">${escapeHtml(agent.full_name)}</h4>
            <p style="margin:0 0 6px 0; font-size:12px; color:#555;">Code: <strong>${escapeHtml(agent.employee_code)}</strong></p>
            <div style="font-size:11px; color:#222; background:#f4f4f4; padding:6px; border-radius:4px; display:flex; flex-direction:column; gap:3px;">
              <div>Status: <span style="color:#00a86b; font-weight:700;">● LIVE TRANSMITTING</span></div>
              <div>Speed: <strong>${(agent.speed_kmh || 0).toFixed(1)} km/h</strong></div>
              <div>Battery: <strong>${agent.battery_pct != null ? agent.battery_pct + '%' : 'N/A'}</strong></div>
            </div>
          </div>
        `
      });

      marker.addListener('click', () => {
        if (activeInfoWindow) activeInfoWindow.close();
        infoWindow.open(googleMap, marker);
        activeInfoWindow = infoWindow;
      });

      googleMarkers[i] = { marker, pos, infoWindow };
    });

    if (onlineAgents.length === 1) {
      googleMap.setCenter({ lat: onlineAgents[0].lat, lng: onlineAgents[0].lng });
      googleMap.setZoom(15);
    } else if (onlineAgents.length > 1) {
      googleMap.fitBounds(bounds);
    }
    return;
  }

  // 2. Leaflet Fallback Rendering
  if (leafletMap) {
    Object.values(leafletMarkers).forEach(m => leafletMap.removeLayer(m.marker));
    leafletMarkers = {};

    if (onlineAgents.length === 0) return;

    const bounds = [];
    onlineAgents.forEach((agent, i) => {
      const lat = agent.lat;
      const lng = agent.lng;
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

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(leafletMap);
      marker.bindPopup(`
        <div style="color:#111; font-family:sans-serif; min-width:180px;">
          <h4 style="margin:0 0 4px 0; font-size:14px; font-weight:700;">${escapeHtml(agent.full_name)}</h4>
          <p style="margin:0 0 6px 0; font-size:12px; color:#555;">Code: <strong>${escapeHtml(agent.employee_code)}</strong></p>
          <div style="font-size:11px; color:#222; background:#f4f4f4; padding:6px; border-radius:4px; display:flex; flex-direction:column; gap:3px;">
            <div>Status: <span style="color:#00a86b; font-weight:700;">● LIVE TRANSMITTING</span></div>
            <div>Speed: <strong>${(agent.speed_kmh || 0).toFixed(1)} km/h</strong></div>
            <div>Battery: <strong>${agent.battery_pct != null ? agent.battery_pct + '%' : 'N/A'}</strong></div>
          </div>
        </div>
      `);

      leafletMarkers[i] = { marker, lat, lng };
    });

    if (bounds.length > 0) {
      leafletMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }
}

function focusAgent(idx) {
  if (isGoogleMapsActive && googleMap && googleMarkers[idx]) {
    const item = googleMarkers[idx];
    googleMap.panTo(item.pos);
    googleMap.setZoom(16);
    if (activeInfoWindow) activeInfoWindow.close();
    item.infoWindow.open(googleMap, item.marker);
    activeInfoWindow = item.infoWindow;
    return;
  }

  if (leafletMap && leafletMarkers[idx]) {
    const item = leafletMarkers[idx];
    leafletMap.setView([item.lat, item.lng], 16, { animate: true });
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

  try {
    assignedAgents = await api.getManagerAssets();
    const onlineCount = (assignedAgents || []).filter(a => a.is_online === true).length;
    document.getElementById('fleetCountBadge').textContent = `${onlineCount} Online / ${assignedAgents.length} Total`;
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
      const isOnline = agent.is_online === true;
      const statusBadge = isOnline 
        ? `<span class="badge badge-approved" style="font-size:0.68rem;"><i class="fa-solid fa-circle fa-beat" style="font-size:7px; color:var(--accent-green); margin-right:4px;"></i> LIVE</span>`
        : `<span class="badge" style="font-size:0.68rem; background:rgba(255,255,255,0.06); color:var(--text-muted); border:1px solid var(--border-color);">OFFLINE</span>`;

      const telemetrySub = isOnline
        ? `<span><i class="fa-solid fa-battery-three-quarters" style="color:var(--accent-green);"></i> ${agent.battery_pct != null ? agent.battery_pct + '%' : '--'}</span>
           <span><i class="fa-solid fa-gauge" style="color:var(--accent-orange);"></i> ${(agent.speed_kmh || 0).toFixed(0)} km/h</span>`
        : `<span><i class="fa-solid fa-mobile-screen" style="color:var(--text-muted);"></i> Mobile App Not Connected</span>`;

      return `
        <div style="background:var(--bg-surface-elevated); border:1px solid var(--border-color); border-radius:10px; padding:12px; transition:border-color 0.2s; cursor:pointer;" onclick="focusAgent(${idx})">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-weight:700; color:var(--text-main); font-size:0.92rem;">${escapeHtml(agent.full_name)}</span>
            ${statusBadge}
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-secondary);">
            <span><i class="fa-solid fa-id-badge" style="color:var(--accent-cyan);"></i> ${agent.employee_code}</span>
            ${telemetrySub}
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

// Auth Guard & Dynamic Auto-Refresh
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = await api.getCurrentUser();
    if (!user || (user.role_name !== 'BRANCH_MANAGER' && user.role_name !== 'SUPER_ADMIN')) {
      alert('Access Denied: Branch Manager role required.');
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('navUserName').textContent = user.full_name;
    const cfg = await api.getPublicConfig();
    await initMap(cfg ? cfg.google_maps_key : '');
    await loadAssignedFleet();
    await loadManagerReports();

    // Auto-refresh fleet telemetry every 5 seconds
    setInterval(loadAssignedFleet, 5000);
  } catch (e) {
    window.location.href = 'index.html';
  }
});
