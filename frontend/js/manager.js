/**
 * GeoTrack Enterprise - Branch Manager Dashboard Controller
 * Enforces 5-10 asset supervisory boundary, 3-View navigation hierarchy (Fleet All -> Agent Live -> Agent Timeline),
 * and GSAP-accelerated route playback animation with realistic simulation for Rahul Sharma (EMP-104).
 */

// Global Navigation & State
let currentNavView = 'FLEET_ALL'; // 'FLEET_ALL' | 'AGENT_LIVE' | 'AGENT_TIMELINE'
let assignedAgents = [];
let selectedAgent = null;
let selectedAgentIndex = -1;
let managerReports = [];

// Map Engines
let isGoogleMapsActive = false;
let googleMap = null;
let googleMarkers = {};
let activeInfoWindow = null;
let leafletMap = null;
let leafletMarkers = {};
let hasInitialFittedBounds = false;

// Timeline Playback State
let allDayTimelineWaypoints = [];
let activeRouteTitle = '';
let timelineWaypoints = [];
let timelineSegmentDurations = [];
let timelineCumulativeDurations = [0];
let timelineCumulativeDistancesKm = [0];
let timelineTotalVirtualMs = 0;
let timelineVirtualTimeMs = 0;
let timelineTotalDistanceKm = 0;
let timelineMaxSpeedKmh = 0;
let timelineTrailStyle = 'ghost'; // 'ghost' | 'dynamic' | 'full'
let timelineCameraMode = 'fit'; // 'fit' | 'follow' | 'free'
let isTimelinePlaying = false;
let playbackSpeed = 1;
let animFrameId = null;
let lastAnimTimestamp = null;
let autoCenterLive = true;

// Map Overlays for Timeline
let leafletTimelinePath = null;
let leafletTimelineTraveled = null;
let leafletTimelineFullSegments = [];
let leafletTimelineBikeMarker = null;
let leafletTimelineStopMarkers = [];
let googleTimelinePath = null;
let googleTimelineTraveled = null;
let googleTimelineFullSegments = [];
let googleTimelineBikeMarker = null;
let googleTimelineStopMarkers = [];

function getLocalDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initDateChips() {
  const fmtChip = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const todayEl = document.getElementById('chipToday');
  const yestEl = document.getElementById('chipYesterday');
  const dbEl = document.getElementById('chipDayBefore');
  if (todayEl) todayEl.textContent = `Today (${fmtChip(0)})`;
  if (yestEl) yestEl.textContent = fmtChip(-1);
  if (dbEl) dbEl.textContent = fmtChip(-2);
}

let currentSelectedDate = getLocalDateStr(0);

function logout() {
  api.clearSession();
  window.location.href = 'index.html';
}
window.logout = logout;

// Google Maps Dark Theme styling
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
  let googleKey = apiKey || localStorage.getItem('geotrack_google_maps_key') || '';
  if (!googleKey) {
    try {
      const cfg = await api.getPublicConfig();
      if (cfg && cfg.google_maps_key) {
        googleKey = cfg.google_maps_key;
      }
    } catch (e) {}
  }

  if (googleKey) {
    try {
      await loadGoogleMapsScript(googleKey);
      const container = document.getElementById('map');
      if (container && window.google && window.google.maps) {
        if (leafletMap) {
          try { leafletMap.remove(); } catch (e) {}
          leafletMap = null;
        }
        container.innerHTML = '';
        container.className = '';
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

  window.gm_authFailure = () => {
    console.warn('[Map] Google Maps authentication failed; falling back to OpenStreetMap.');
    initLeafletFallback();
  };

  initLeafletFallback();
}

function initLeafletFallback() {
  if (leafletMap) return;
  const container = document.getElementById('map');
  if (!container) return;
  container.innerHTML = '';

  leafletMap = L.map('map', { zoomControl: false }).setView([18.5204, 73.8567], 13);
  L.control.zoom({ position: 'topright' }).addTo(leafletMap);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(leafletMap);

  isGoogleMapsActive = false;
  updateMapMarkers();
}

// ==============================================================================
// 3-View Navigation Hierarchy Controller
// ==============================================================================

const VIEW_PANELS = '#fleetOverviewHeader, #fleetList, #agentDetailHeader, #agentLivePanel, #agentTimelinePanel, #timelinePlayerDock';

function killViewTweens() {
  if (window.gsap) gsap.killTweensOf(VIEW_PANELS);
}

function exitToFleetView() {
  stopTimelinePlayback();
  clearTimelineMapLayers();
  killViewTweens();

  currentNavView = 'FLEET_ALL';
  selectedAgent = null;
  selectedAgentIndex = -1;

  const showFleet = () => {
    document.getElementById('agentDetailHeader').style.display = 'none';
    document.getElementById('agentLivePanel').style.display = 'none';
    document.getElementById('agentTimelinePanel').style.display = 'none';
    document.getElementById('timelinePlayerDock').style.display = 'none';

    document.getElementById('fleetOverviewHeader').style.display = 'flex';
    document.getElementById('fleetList').style.display = 'flex';
    renderFleetList(true);
  };

  if (window.gsap) {
    gsap.to('#agentDetailHeader, #agentLivePanel, #agentTimelinePanel, #timelinePlayerDock', {
      opacity: 0,
      y: 10,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => {
        showFleet();
        gsap.fromTo('#fleetOverviewHeader, #fleetList', { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
      }
    });
  } else {
    showFleet();
  }

  updateMapHUD('All Fleet Overview', `${assignedAgents.length} assigned assets monitored`, false);
  updateMapMarkers(true);
}
window.exitToFleetView = exitToFleetView;

function selectAgent(idx, initialSubView = null) {
  if (idx < 0 || idx >= assignedAgents.length) return;
  killViewTweens();
  selectedAgentIndex = idx;
  selectedAgent = assignedAgents[idx];

  const isOnline = selectedAgent.is_online === true;
  // If agent is offline, default to TIMELINE so historical review is immediate
  const targetSubView = initialSubView || (isOnline ? 'LIVE' : 'TIMELINE');
  currentNavView = targetSubView === 'LIVE' ? 'AGENT_LIVE' : 'AGENT_TIMELINE';

  // Update Agent Detail Header Profile
  document.getElementById('selectedAgentName').textContent = selectedAgent.full_name;
  document.getElementById('selectedAgentCode').innerHTML = `<i class="fa-solid fa-id-badge"></i> ${selectedAgent.employee_code}`;
  document.getElementById('selectedAgentVehicle').innerHTML = `<i class="fa-solid fa-motorcycle"></i> ${selectedAgent.vehicle_registration || 'MH-12-FL-4400'}`;

  const badge = document.getElementById('selectedAgentStatusBadge');
  if (isOnline) {
    badge.className = 'badge badge-approved';
    badge.innerHTML = `<i class="fa-solid fa-circle fa-beat" style="font-size:6px; margin-right:3px;"></i> LIVE`;
  } else {
    badge.className = 'badge';
    badge.style.background = 'rgba(255,255,255,0.08)';
    badge.style.color = 'var(--text-muted)';
    badge.textContent = 'OFFLINE';
  }

  // Set default date input value to today & refresh chip dates
  initDateChips();
  const dateInput = document.getElementById('timelineDateInput');
  if (dateInput) dateInput.value = currentSelectedDate;

  const openDetail = () => {
    document.getElementById('fleetOverviewHeader').style.display = 'none';
    document.getElementById('fleetList').style.display = 'none';
    document.getElementById('agentDetailHeader').style.display = 'flex';
    if (window.gsap) {
      gsap.fromTo('#agentDetailHeader', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' });
    } else {
      document.getElementById('agentDetailHeader').style.opacity = '1';
    }
    switchAgentSubView(targetSubView);
  };

  if (window.gsap && document.getElementById('fleetList').style.display !== 'none') {
    gsap.to('#fleetOverviewHeader, #fleetList', {
      opacity: 0,
      y: -8,
      duration: 0.18,
      onComplete: openDetail
    });
  } else {
    openDetail();
  }
}
window.selectAgent = selectAgent;

function switchAgentSubView(subView) {
  if (!selectedAgent) return;
  const tabLive = document.getElementById('tabLiveLocation');
  const tabTimeline = document.getElementById('tabTimelineView');
  const livePanel = document.getElementById('agentLivePanel');
  const timelinePanel = document.getElementById('agentTimelinePanel');
  const playerDock = document.getElementById('timelinePlayerDock');
  if (window.gsap) gsap.killTweensOf([livePanel, timelinePanel, playerDock]);

  if (subView === 'LIVE') {
    currentNavView = 'AGENT_LIVE';
    stopTimelinePlayback();
    clearTimelineMapLayers();

    tabLive.classList.add('active');
    tabLive.setAttribute('aria-selected', 'true');
    tabTimeline.classList.remove('active');
    tabTimeline.setAttribute('aria-selected', 'false');

    timelinePanel.style.display = 'none';
    livePanel.style.display = 'flex';

    // Hide Timeline Dock with GSAP
    if (window.gsap) {
      gsap.to(playerDock, { xPercent: -50, x: 0, y: 60, opacity: 0, duration: 0.22, onComplete: () => { playerDock.style.display = 'none'; } });
      gsap.fromTo(livePanel, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.25 });
    } else {
      playerDock.style.display = 'none';
    }

    updateMapHUD(`Live: ${selectedAgent.full_name}`, `${selectedAgent.employee_code} • Real-time GPS Telematics`, selectedAgent.is_online === true);
    updateAgentLivePanelData();
    if (selectedAgent.is_online === true) {
      focusAgentLiveMarker();
    }

  } else if (subView === 'TIMELINE') {
    currentNavView = 'AGENT_TIMELINE';
    tabTimeline.classList.add('active');
    tabTimeline.setAttribute('aria-selected', 'true');
    tabLive.classList.remove('active');
    tabLive.setAttribute('aria-selected', 'false');

    livePanel.style.display = 'none';
    timelinePanel.style.display = 'flex';

    // Show Timeline Dock with GSAP Slide-Up (preserve horizontal -50% centering)
    playerDock.style.display = 'flex';
    if (window.gsap) {
      gsap.fromTo(playerDock, { xPercent: -50, x: 0, y: 80, opacity: 0, scale: 0.96 }, { xPercent: -50, x: 0, y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.2)' });
      gsap.fromTo(timelinePanel, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.25 });
    }

    updateMapHUD(`Timeline: ${selectedAgent.full_name}`, `Historical Date-Wise Route Inspection`, false);

    // Load selected date route
    loadShiftRouteForDate(currentSelectedDate);
  }
}
window.switchAgentSubView = switchAgentSubView;

function exitTimelineMode() {
  switchAgentSubView('LIVE');
}
window.exitTimelineMode = exitTimelineMode;

function selectShiftDate(type) {
  let dateStr = getLocalDateStr(0);
  document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));

  if (type === 'TODAY') {
    dateStr = getLocalDateStr(0);
    const chip = document.getElementById('chipToday');
    if (chip) chip.classList.add('active');
  } else if (type === 'YESTERDAY') {
    dateStr = getLocalDateStr(-1);
    const chip = document.getElementById('chipYesterday');
    if (chip) chip.classList.add('active');
  } else if (type === 'DAY_BEFORE') {
    dateStr = getLocalDateStr(-2);
    const chip = document.getElementById('chipDayBefore');
    if (chip) chip.classList.add('active');
  }

  currentSelectedDate = dateStr;
  const dateInput = document.getElementById('timelineDateInput');
  if (dateInput) dateInput.value = dateStr;

  loadShiftRouteForDate(dateStr);
}
window.selectShiftDate = selectShiftDate;

function onDatePickerChange(dateVal) {
  if (!dateVal) return;
  document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
  if (dateVal === getLocalDateStr(0)) {
    const chip = document.getElementById('chipToday');
    if (chip) chip.classList.add('active');
  } else if (dateVal === getLocalDateStr(-1)) {
    const chip = document.getElementById('chipYesterday');
    if (chip) chip.classList.add('active');
  } else if (dateVal === getLocalDateStr(-2)) {
    const chip = document.getElementById('chipDayBefore');
    if (chip) chip.classList.add('active');
  }

  currentSelectedDate = dateVal;
  loadShiftRouteForDate(dateVal);
}
window.onDatePickerChange = onDatePickerChange;

function formatDurationCompact(totalSecs) {
  const mins = Math.round(totalSecs / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function showEmptyTimelineState(dateStr, msg) {
  stopTimelinePlayback();
  clearTimelineMapLayers();
  allDayTimelineWaypoints = [];
  timelineWaypoints = [];
  timelineTotalVirtualMs = 0;
  timelineVirtualTimeMs = 0;
  timelineTotalDistanceKm = 0;
  timelineMaxSpeedKmh = 0;

  document.getElementById('timelineShiftTitle').innerHTML = `<i class="fa-regular fa-calendar-check" style="color:var(--accent-cyan); margin-right:6px;"></i> Shift Route: ${dateStr}`;
  document.getElementById('timelineDistanceVal').textContent = '0.0 km';
  document.getElementById('timelineMovingTimeVal').textContent = '0m';
  document.getElementById('timelineIdleTimeVal').textContent = '0m';
  document.getElementById('timelineFuelVal').textContent = '₹ 0.00';

  const statusBadge = document.getElementById('timelineShiftStatus');
  if (statusBadge) {
    statusBadge.textContent = 'NO DATA';
    statusBadge.className = 'badge badge-submitted';
  }

  document.getElementById('playerLegTitle').innerHTML = `<i class="fa-solid fa-route" style="color:var(--text-muted);"></i> No Recorded Route (${dateStr})`;
  document.getElementById('playerClock').textContent = '00:00:00';
  const endClockEl = document.getElementById('playerEndClock');
  if (endClockEl) endClockEl.textContent = '00:00:00';
  document.getElementById('scrubStart').textContent = '00:00:00';
  document.getElementById('scrubEnd').textContent = '00:00:00';
  document.getElementById('playerSpeed').textContent = '0.0 km/h';
  const maxSpdEl = document.getElementById('playerMaxSpeed');
  if (maxSpdEl) maxSpdEl.textContent = '0 km/h';
  document.getElementById('playerDistance').textContent = '0.0 / 0.0 km';
  document.getElementById('timelineScrubber').value = 0;
  document.getElementById('timelineProgressFill').style.width = '0%';

  const list = document.getElementById('timelineWaypointsList');
  if (list) {
    list.innerHTML = `
      <div style="text-align:center; padding:22px 14px; color:var(--text-secondary); font-size:0.82rem; border:1px dashed var(--border-color); border-radius:10px;">
        <i class="fa-solid fa-satellite-dish" style="font-size:1.4rem; color:var(--text-muted); margin-bottom:8px; display:block;"></i>
        ${escapeHtml(msg)}
      </div>
    `;
  }
}

async function loadShiftRouteForDate(dateStr) {
  if (!selectedAgent) return;

  const datePill = document.getElementById('playerDatePill');
  if (datePill) {
    datePill.innerHTML = `<i class="fa-solid fa-calendar-day" style="color:var(--accent-orange); margin-right:4px;"></i> ${dateStr}`;
  }

  const startMs = new Date(`${dateStr}T00:00:00`).getTime();
  const endMs = new Date(`${dateStr}T23:59:59.999`).getTime();

  try {
    const rawPoints = await api.getAgentTimeline(selectedAgent.id, dateStr, startMs, endMs);
    const points = (rawPoints || []).filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');

    if (points.length < 2) {
      const msg = points.length === 1
        ? `Only 1 GPS ping recorded on ${dateStr}. Keep tracking active to build a route.`
        : `No real GPS telemetry recorded for ${selectedAgent.full_name} on ${dateStr}. Start tracking in the mobile app or Agent portal.`;
      showEmptyTimelineState(dateStr, msg);
      return;
    }

    let totalDistKm = 0;
    let movingSecs = 0;
    let idleSecs = 0;
    const waypoints = points.map((p, idx) => {
      const ts = p.timestamp || (p.recorded_at ? new Date(p.recorded_at).getTime() : Date.now());
      const spd = Number(p.speed_kmh || 0);
      if (idx > 0) {
        const prev = points[idx - 1];
        const prevTs = prev.timestamp || (prev.recorded_at ? new Date(prev.recorded_at).getTime() : ts);
        const dtSec = Math.max(0, (ts - prevTs) / 1000);
        totalDistKm += haversineKm({ lat: prev.lat, lng: prev.lng }, { lat: p.lat, lng: p.lng });
        if (spd > 2.5) movingSecs += dtSec;
        else idleSecs += dtSec;
      }
      return {
        lat: p.lat,
        lng: p.lng,
        timestamp: ts,
        speed: spd,
        road: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
        stop: idx === 0 ? 'Shift Start Ping' : (idx === points.length - 1 ? 'Latest Ping' : '')
      };
    });

    const fuelAmount = (totalDistKm / 35.0) * 105.0;
    document.getElementById('timelineShiftTitle').innerHTML = `<i class="fa-regular fa-calendar-check" style="color:var(--accent-cyan); margin-right:6px;"></i> Shift Route: ${dateStr}`;
    document.getElementById('timelineDistanceVal').textContent = `${totalDistKm.toFixed(1)} km`;
    document.getElementById('timelineMovingTimeVal').textContent = formatDurationCompact(movingSecs);
    document.getElementById('timelineIdleTimeVal').textContent = formatDurationCompact(idleSecs);
    document.getElementById('timelineFuelVal').textContent = `₹ ${fuelAmount.toFixed(2)}`;

    const statusBadge = document.getElementById('timelineShiftStatus');
    if (statusBadge) {
      statusBadge.textContent = `${points.length} PINGS`;
      statusBadge.className = 'badge badge-approved';
    }

    loadTimelineRoute(waypoints, `${selectedAgent.full_name} [${dateStr}]`);
  } catch (err) {
    console.warn('Failed to load agent timeline:', err);
    showEmptyTimelineState(dateStr, `Unable to fetch timeline for ${dateStr}: ${err.message}`);
  }
}
window.loadShiftRouteForDate = loadShiftRouteForDate;

function updateMapHUD(title, sub, isLivePulse) {
  const dot = document.getElementById('hudStatusDot');
  const titleEl = document.getElementById('hudModeTitle');
  const subEl = document.getElementById('hudModeSub');
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
  if (dot) {
    dot.style.background = isLivePulse ? 'var(--accent-green)' : 'var(--accent-cyan)';
    dot.style.boxShadow = isLivePulse ? '0 0 10px var(--accent-green)' : '0 0 10px var(--accent-cyan)';
  }
}

function updateAgentLivePanelData() {
  if (!selectedAgent) return;
  const isOnline = selectedAgent.is_online === true;
  const notice = document.getElementById('agentOfflineNotice');
  const metrics = document.getElementById('agentOnlineMetrics');

  if (!isOnline) {
    if (notice) notice.style.display = 'flex';
    if (metrics) metrics.style.display = 'none';
    return;
  }

  if (notice) notice.style.display = 'none';
  if (metrics) metrics.style.display = 'block';

  const speed = selectedAgent.speed_kmh || 0;
  const battery = selectedAgent.battery_pct != null ? selectedAgent.battery_pct : 88;
  const isCharging = selectedAgent.is_charging === true;

  document.getElementById('liveSpeedVal').innerHTML = `${speed.toFixed(0)} <small>km/h</small>`;
  const speedPct = Math.min(100, Math.round((speed / 80) * 100));
  document.getElementById('liveSpeedBar').style.width = `${speedPct}%`;

  document.getElementById('liveBatteryVal').textContent = `${battery}%`;
  document.getElementById('liveChargingStatus').innerHTML = isCharging 
    ? `<i class="fa-solid fa-bolt" style="color:var(--accent-green);"></i> Charging (Fast)`
    : `<i class="fa-solid fa-battery-three-quarters" style="color:var(--accent-cyan);"></i> On Battery`;
}

function focusAgentLiveMarker() {
  if (!selectedAgent) return;
  const lat = selectedAgent.lat || 18.5204;
  const lng = selectedAgent.lng || 73.8567;

  if (isGoogleMapsActive && googleMap) {
    googleMap.panTo({ lat, lng });
    googleMap.setZoom(16);
  } else if (leafletMap) {
    leafletMap.setView([lat, lng], 16, { animate: true });
  }
}
window.focusAgentLiveMarker = focusAgentLiveMarker;

// ==============================================================================
// Timeline Route Engine & GSAP Interpolation
// ==============================================================================

function parseTimeToMs(timeStr, dateStr, fallbackMs) {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr) return fallbackMs;
  const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return fallbackMs;
  let hrs = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const secs = parseInt(m[3] || '0', 10);
  const ampm = (m[4] || '').toUpperCase();
  if (ampm === 'PM' && hrs < 12) hrs += 12;
  if (ampm === 'AM' && hrs === 12) hrs = 0;
  const base = new Date((dateStr || '2026-11-22') + 'T00:00:00');
  base.setHours(hrs, mins, secs, 0);
  return base.getTime();
}

function formatTimeHHMMSS(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function haversineKm(p1, p2) {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getSpeedColor(speed) {
  if (speed >= 40) return '#ff5252';
  if (speed >= 28) return '#ff9100';
  if (speed >= 10) return '#00e676';
  return '#00e5ff';
}

function loadTimelineRoute(waypoints, title, isFiltered = false) {
  const normalized = (waypoints || []).map((w, idx) => ({
    ...w,
    timestamp: w.timestamp || parseTimeToMs(w.time, currentSelectedDate, Date.now() + idx * 60000)
  })).sort((a, b) => a.timestamp - b.timestamp);

  if (!isFiltered) {
    allDayTimelineWaypoints = normalized;
    activeRouteTitle = title;
    const fromEl = document.getElementById('timelineTimeFrom');
    const toEl = document.getElementById('timelineTimeTo');
    if (normalized.length >= 2) {
      if (fromEl) fromEl.value = formatTimeHHMMSS(normalized[0].timestamp);
      if (toEl) toEl.value = formatTimeHHMMSS(normalized[normalized.length - 1].timestamp);
    }
  }

  renderTimelineWithPoints(normalized, title);
}

function applyTimelineTimeFilter() {
  if (!allDayTimelineWaypoints || allDayTimelineWaypoints.length < 2) return;
  const fromEl = document.getElementById('timelineTimeFrom');
  const toEl = document.getElementById('timelineTimeTo');
  const fromVal = fromEl ? fromEl.value : '';
  const toVal = toEl ? toEl.value : '';
  if (!fromVal || !toVal) {
    renderTimelineWithPoints(allDayTimelineWaypoints, activeRouteTitle);
    return;
  }
  const fromTs = parseTimeToMs(fromVal, currentSelectedDate, 0);
  const toTs = parseTimeToMs(toVal, currentSelectedDate, Infinity) + 999;
  const filtered = allDayTimelineWaypoints.filter(p => p.timestamp >= fromTs && p.timestamp <= toTs);
  if (filtered.length < 2) {
    alert(`No waypoints found between ${fromVal} and ${toVal}. Broaden the time range.`);
    return;
  }
  renderTimelineWithPoints(filtered, activeRouteTitle);
}
window.applyTimelineTimeFilter = applyTimelineTimeFilter;

function resetTimelineTimeRange() {
  if (!allDayTimelineWaypoints || allDayTimelineWaypoints.length < 2) return;
  const fromEl = document.getElementById('timelineTimeFrom');
  const toEl = document.getElementById('timelineTimeTo');
  if (fromEl) fromEl.value = formatTimeHHMMSS(allDayTimelineWaypoints[0].timestamp);
  if (toEl) toEl.value = formatTimeHHMMSS(allDayTimelineWaypoints[allDayTimelineWaypoints.length - 1].timestamp);
  renderTimelineWithPoints(allDayTimelineWaypoints, activeRouteTitle);
}
window.resetTimelineTimeRange = resetTimelineTimeRange;

function onTrailStyleChange(style) {
  timelineTrailStyle = style || 'ghost';
  const ratio = timelineTotalVirtualMs > 0 ? (timelineVirtualTimeMs / timelineTotalVirtualMs) : 0;
  drawTimelineMapLayers(ratio);
}
window.onTrailStyleChange = onTrailStyleChange;

function onCameraModeChange(mode) {
  timelineCameraMode = mode || 'fit';
  if (timelineCameraMode === 'fit' && timelineWaypoints.length >= 2) {
    fitTimelineBounds();
  } else if (timelineCameraMode === 'follow') {
    const ratio = timelineTotalVirtualMs > 0 ? (timelineVirtualTimeMs / timelineTotalVirtualMs) : 0;
    updatePlaybackVisuals(ratio);
  }
}
window.onCameraModeChange = onCameraModeChange;

function fitTimelineBounds() {
  if (!timelineWaypoints || timelineWaypoints.length < 2) return;
  if (isGoogleMapsActive && googleMap) {
    const bounds = new google.maps.LatLngBounds();
    timelineWaypoints.forEach(w => bounds.extend({ lat: w.lat, lng: w.lng }));
    googleMap.fitBounds(bounds, { top: 50, bottom: 160, left: 50, right: 50 });
  } else if (leafletMap) {
    leafletMap.fitBounds(timelineWaypoints.map(w => [w.lat, w.lng]), { padding: [50, 50], maxZoom: 16 });
  }
}

function renderTimelineWithPoints(waypoints, title) {
  stopTimelinePlayback();
  clearTimelineMapLayers();

  timelineWaypoints = waypoints || [];
  if (timelineWaypoints.length < 2) return;

  // Build compressed virtual timeline durations + cumulative distance + max speed
  timelineSegmentDurations = [];
  timelineCumulativeDurations = [0];
  timelineCumulativeDistancesKm = [0];
  let runningMs = 0;
  let runningKm = 0;
  let maxSpd = 0;

  for (let i = 0; i < timelineWaypoints.length - 1; i++) {
    const p1 = timelineWaypoints[i];
    const p2 = timelineWaypoints[i + 1];
    const realGapMs = Math.max(200, (p2.timestamp || 0) - (p1.timestamp || 0));
    let segMs = Math.min(1200, Math.max(400, realGapMs / 600));
    if ((p1.speed || 0) < 1.0 && (p2.speed || 0) < 1.0) {
      segMs = Math.min(segMs, 600);
    }
    timelineSegmentDurations.push(segMs);
    runningMs += segMs;
    timelineCumulativeDurations.push(runningMs);

    runningKm += haversineKm(p1, p2);
    timelineCumulativeDistancesKm.push(runningKm);
    maxSpd = Math.max(maxSpd, p1.speed || 0, p2.speed || 0);
  }

  timelineTotalVirtualMs = Math.max(1, runningMs);
  timelineVirtualTimeMs = 0;
  timelineTotalDistanceKm = runningKm;
  timelineMaxSpeedKmh = maxSpd;

  const startStr = formatTimeHHMMSS(timelineWaypoints[0].timestamp);
  const endStr = formatTimeHHMMSS(timelineWaypoints[timelineWaypoints.length - 1].timestamp);

  document.getElementById('playerLegTitle').innerHTML = `<i class="fa-solid fa-route" style="color:var(--accent-cyan);"></i> ${escapeHtml(title)}`;
  document.getElementById('scrubStart').textContent = startStr;
  document.getElementById('scrubEnd').textContent = endStr;
  const endClockEl = document.getElementById('playerEndClock');
  if (endClockEl) endClockEl.textContent = endStr;
  const maxSpdEl = document.getElementById('playerMaxSpeed');
  if (maxSpdEl) maxSpdEl.textContent = `${timelineMaxSpeedKmh.toFixed(0)} km/h`;
  const sideDistEl = document.getElementById('timelineDistanceVal');
  if (sideDistEl) sideDistEl.textContent = `${timelineTotalDistanceKm.toFixed(1)} km`;
  document.getElementById('timelineScrubber').value = 0;
  document.getElementById('timelineProgressFill').style.width = '0%';

  renderTimelineWaypointsList();
  drawTimelineMapLayers(0);
}

function drawTimelineMapLayers(initialRatio = 0) {
  clearTimelineMapLayers();
  if (!timelineWaypoints || timelineWaypoints.length < 2) return;

  const latLngs = timelineWaypoints.map(w => [w.lat, w.lng]);
  const gLatLngs = timelineWaypoints.map(w => ({ lat: w.lat, lng: w.lng }));

  if (isGoogleMapsActive && googleMap) {
    if (timelineTrailStyle === 'full') {
      for (let i = 0; i < timelineWaypoints.length - 1; i++) {
        const avg = ((timelineWaypoints[i].speed || 0) + (timelineWaypoints[i + 1].speed || 0)) / 2;
        googleTimelineFullSegments.push(new google.maps.Polyline({
          path: [gLatLngs[i], gLatLngs[i + 1]],
          geodesic: true,
          strokeColor: getSpeedColor(avg),
          strokeOpacity: 0.9,
          strokeWeight: 5,
          map: googleMap
        }));
      }
    } else if (timelineTrailStyle === 'ghost') {
      googleTimelinePath = new google.maps.Polyline({
        path: gLatLngs,
        geodesic: true,
        strokeColor: "#6c8299",
        strokeOpacity: 0.3,
        strokeWeight: 4,
        map: googleMap
      });
    }

    if (timelineTrailStyle === 'dynamic' || timelineTrailStyle === 'ghost') {
      googleTimelineTraveled = new google.maps.Polyline({
        path: [gLatLngs[0]],
        geodesic: true,
        strokeColor: "#00e5ff",
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map: googleMap
      });
    }

    googleTimelineBikeMarker = new google.maps.Marker({
      position: gLatLngs[0],
      map: googleMap,
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: "#00e5ff",
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: "#ffffff",
        rotation: 0
      }
    });

    timelineWaypoints.forEach((w) => {
      if (w.stop) {
        const marker = new google.maps.Marker({
          position: { lat: w.lat, lng: w.lng },
          map: googleMap,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#ff9100",
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: "#ffffff"
          },
          title: `${formatTimeHHMMSS(w.timestamp)} - ${w.stop}`
        });
        googleTimelineStopMarkers.push(marker);
      }
    });

    if (timelineCameraMode === 'fit') fitTimelineBounds();
  } else if (leafletMap) {
    if (timelineTrailStyle === 'full') {
      for (let i = 0; i < timelineWaypoints.length - 1; i++) {
        const avg = ((timelineWaypoints[i].speed || 0) + (timelineWaypoints[i + 1].speed || 0)) / 2;
        leafletTimelineFullSegments.push(L.polyline([latLngs[i], latLngs[i + 1]], {
          color: getSpeedColor(avg),
          weight: 5,
          opacity: 0.9
        }).addTo(leafletMap));
      }
    } else if (timelineTrailStyle === 'ghost') {
      leafletTimelinePath = L.polyline(latLngs, {
        color: 'rgba(0, 229, 255, 0.28)',
        weight: 4,
        dashArray: '4, 8'
      }).addTo(leafletMap);
    }

    if (timelineTrailStyle === 'dynamic' || timelineTrailStyle === 'ghost') {
      leafletTimelineTraveled = L.polyline([latLngs[0]], {
        color: '#00e5ff',
        weight: 5
      }).addTo(leafletMap);
    }

    const bikeIcon = L.divIcon({
      className: 'timeline-bike-marker',
      html: `
        <div id="timelineBikeIcon" style="background:var(--accent-cyan); color:#000; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 0 16px var(--accent-cyan); border:2px solid #fff; transition:transform 0.15s ease-out;">
          <i class="fa-solid fa-motorcycle" style="font-size:15px;"></i>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    leafletTimelineBikeMarker = L.marker(latLngs[0], { icon: bikeIcon }).addTo(leafletMap);

    timelineWaypoints.forEach((w) => {
      if (w.stop) {
        const stopIcon = L.divIcon({
          className: 'timeline-stop-marker',
          html: `
            <div style="background:var(--accent-orange); color:#000; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #fff; box-shadow:0 0 10px var(--accent-orange); font-size:10px; font-weight:800;">
              <i class="fa-solid fa-location-dot"></i>
            </div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        const m = L.marker([w.lat, w.lng], { icon: stopIcon }).addTo(leafletMap);
        m.bindPopup(`<strong style="color:#111;">${formatTimeHHMMSS(w.timestamp)}</strong><br><span style="color:#444;">${escapeHtml(w.stop)}</span>`);
        leafletTimelineStopMarkers.push(m);
      }
    });

    if (timelineCameraMode === 'fit') fitTimelineBounds();
  }

  updatePlaybackVisuals(initialRatio);
}

function clearTimelineMapLayers() {
  if (googleTimelinePath) { googleTimelinePath.setMap(null); googleTimelinePath = null; }
  if (googleTimelineTraveled) { googleTimelineTraveled.setMap(null); googleTimelineTraveled = null; }
  if (googleTimelineBikeMarker) { googleTimelineBikeMarker.setMap(null); googleTimelineBikeMarker = null; }
  googleTimelineFullSegments.forEach(s => s.setMap(null));
  googleTimelineFullSegments = [];
  googleTimelineStopMarkers.forEach(m => m.setMap(null));
  googleTimelineStopMarkers = [];

  if (leafletMap) {
    if (leafletTimelinePath) { leafletMap.removeLayer(leafletTimelinePath); leafletTimelinePath = null; }
    if (leafletTimelineTraveled) { leafletMap.removeLayer(leafletTimelineTraveled); leafletTimelineTraveled = null; }
    if (leafletTimelineBikeMarker) { leafletMap.removeLayer(leafletTimelineBikeMarker); leafletTimelineBikeMarker = null; }
    leafletTimelineFullSegments.forEach(s => leafletMap.removeLayer(s));
    leafletTimelineFullSegments = [];
    leafletTimelineStopMarkers.forEach(m => leafletMap.removeLayer(m));
    leafletTimelineStopMarkers = [];
  }
}

function renderTimelineWaypointsList() {
  const container = document.getElementById('timelineWaypointsList');
  if (!container) return;

  container.innerHTML = timelineWaypoints.map((w, i) => {
    const isStop = Boolean(w.stop);
    const timeFormatted = formatTimeHHMMSS(w.timestamp);
    return `
      <div class="waypoint-item ${isStop ? 'is-stop' : ''}" onclick="jumpToWaypoint(${i})">
        <div style="min-width:66px; font-family:monospace; color:${isStop ? 'var(--accent-orange)' : 'var(--text-secondary)'}; font-weight:700;">
          ${timeFormatted}
        </div>
        <div style="flex:1;">
          <div style="font-weight:600; color:#fff;">${escapeHtml(w.road)}</div>
          ${isStop ? `<div style="color:var(--accent-orange); font-size:0.72rem; margin-top:2px;"><i class="fa-solid fa-flag"></i> ${escapeHtml(w.stop)}</div>` : ''}
        </div>
        <div style="font-size:0.7rem; color:var(--text-muted);">${w.speed} km/h</div>
      </div>
    `;
  }).join('');
}

function jumpToWaypoint(index) {
  if (!timelineWaypoints.length || timelineTotalVirtualMs <= 0) return;
  const clamped = Math.max(0, Math.min(timelineWaypoints.length - 1, index));
  const ratio = (timelineCumulativeDurations[clamped] || 0) / timelineTotalVirtualMs;
  timelineVirtualTimeMs = ratio * timelineTotalVirtualMs;
  updatePlaybackVisuals(ratio);
}
window.jumpToWaypoint = jumpToWaypoint;

function togglePlayPause(forcePlay = null) {
  if (forcePlay !== null) {
    isTimelinePlaying = forcePlay;
  } else {
    isTimelinePlaying = !isTimelinePlaying;
  }

  const icon = document.getElementById('playPauseIcon');
  if (isTimelinePlaying) {
    if (timelineVirtualTimeMs >= timelineTotalVirtualMs - 10) {
      timelineVirtualTimeMs = 0;
    }
    if (icon) icon.className = 'fa-solid fa-pause';
    lastAnimTimestamp = performance.now();
    animFrameId = requestAnimationFrame(timelineAnimationTick);
  } else {
    if (icon) icon.className = 'fa-solid fa-play';
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}
window.togglePlayPause = togglePlayPause;

function stopTimelinePlayback() {
  isTimelinePlaying = false;
  const icon = document.getElementById('playPauseIcon');
  if (icon) icon.className = 'fa-solid fa-play';
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = null;
}

function setPlaySpeed(multiplier) {
  playbackSpeed = Math.max(1, multiplier);
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.getAttribute('data-speed'), 10) === playbackSpeed);
  });
}
window.setPlaySpeed = setPlaySpeed;

function stepTimeline(fractionDelta) {
  if (!timelineWaypoints.length || timelineTotalVirtualMs <= 0) return;
  const currentRatio = timelineVirtualTimeMs / timelineTotalVirtualMs;
  const newRatio = Math.max(0, Math.min(1, currentRatio + fractionDelta));
  timelineVirtualTimeMs = newRatio * timelineTotalVirtualMs;
  updatePlaybackVisuals(newRatio);
}
window.stepTimeline = stepTimeline;

function onScrubInput(val) {
  const ratio = Math.max(0, Math.min(1, parseFloat(val) / 1000));
  timelineVirtualTimeMs = ratio * timelineTotalVirtualMs;
  updatePlaybackVisuals(ratio);
}
window.onScrubInput = onScrubInput;

function timelineAnimationTick(timestamp) {
  if (!isTimelinePlaying) return;

  const dtMs = timestamp - (lastAnimTimestamp || timestamp);
  lastAnimTimestamp = timestamp;

  timelineVirtualTimeMs += dtMs * playbackSpeed;

  if (timelineVirtualTimeMs >= timelineTotalVirtualMs) {
    timelineVirtualTimeMs = timelineTotalVirtualMs;
    updatePlaybackVisuals(1.0);
    togglePlayPause(false);
    return;
  }

  updatePlaybackVisuals(timelineVirtualTimeMs / timelineTotalVirtualMs);
  animFrameId = requestAnimationFrame(timelineAnimationTick);
}

function updatePlaybackVisuals(ratio) {
  if (!timelineWaypoints || timelineWaypoints.length < 2) return;
  const clampedRatio = Math.max(0, Math.min(1, ratio));

  // Update Scrubber Range (0..1000) & Fill Bar
  const scrubber = document.getElementById('timelineScrubber');
  const fillBar = document.getElementById('timelineProgressFill');
  if (scrubber) scrubber.value = Math.round(clampedRatio * 1000);
  if (fillBar) fillBar.style.width = `${(clampedRatio * 100).toFixed(1)}%`;

  // Locate current segment via virtual duration lookup
  const targetMs = clampedRatio * timelineTotalVirtualMs;
  let segIdx = 0;
  for (let i = 0; i < timelineCumulativeDurations.length - 1; i++) {
    if (targetMs >= timelineCumulativeDurations[i] && targetMs <= timelineCumulativeDurations[i + 1]) {
      segIdx = i;
      break;
    }
    if (i === timelineCumulativeDurations.length - 2) segIdx = i;
  }

  const segStart = timelineCumulativeDurations[segIdx] || 0;
  const segEnd = timelineCumulativeDurations[segIdx + 1] || 1;
  const segSpan = Math.max(1, segEnd - segStart);
  const segFraction = Math.max(0, Math.min(1, (targetMs - segStart) / segSpan));

  const p1 = timelineWaypoints[segIdx];
  const p2 = timelineWaypoints[segIdx + 1];

  const currentLat = p1.lat + (p2.lat - p1.lat) * segFraction;
  const currentLng = p1.lng + (p2.lng - p1.lng) * segFraction;
  const currentSpeed = p1.speed + (p2.speed - p1.speed) * segFraction;
  const currentTs = Math.round(p1.timestamp + (p2.timestamp - p1.timestamp) * segFraction);
  const bearing = calculateBearing(p1.lat, p1.lng, p2.lat, p2.lng);

  const segDistStart = timelineCumulativeDistancesKm[segIdx] || 0;
  const segDistEnd = timelineCumulativeDistancesKm[segIdx + 1] || segDistStart;
  const traveledKm = segDistStart + (segDistEnd - segDistStart) * segFraction;

  // Update HH:MM:SS Clock, Speed & Dynamic Distance HUD
  document.getElementById('playerClock').textContent = formatTimeHHMMSS(currentTs);
  document.getElementById('playerSpeed').textContent = `${currentSpeed.toFixed(1)} km/h`;
  document.getElementById('playerDistance').textContent = `${traveledKm.toFixed(1)} / ${timelineTotalDistanceKm.toFixed(1)} km`;

  // Update Map Traveled Polyline, Marker & Camera Follow
  if (isGoogleMapsActive && googleMap) {
    if (googleTimelineTraveled) {
      const traveledPath = [];
      for (let i = 0; i <= segIdx; i++) {
        traveledPath.push({ lat: timelineWaypoints[i].lat, lng: timelineWaypoints[i].lng });
      }
      traveledPath.push({ lat: currentLat, lng: currentLng });
      googleTimelineTraveled.setPath(traveledPath);
    }
    if (googleTimelineBikeMarker) {
      googleTimelineBikeMarker.setPosition({ lat: currentLat, lng: currentLng });
      const icon = googleTimelineBikeMarker.getIcon();
      if (icon) {
        icon.rotation = bearing;
        googleTimelineBikeMarker.setIcon(icon);
      }
    }
    if (timelineCameraMode === 'follow') {
      googleMap.panTo({ lat: currentLat, lng: currentLng });
    }
  } else if (leafletMap) {
    if (leafletTimelineTraveled) {
      const traveledPoints = [];
      for (let i = 0; i <= segIdx; i++) {
        traveledPoints.push([timelineWaypoints[i].lat, timelineWaypoints[i].lng]);
      }
      traveledPoints.push([currentLat, currentLng]);
      leafletTimelineTraveled.setLatLngs(traveledPoints);
    }
    if (leafletTimelineBikeMarker) {
      leafletTimelineBikeMarker.setLatLng([currentLat, currentLng]);
      const bikeEl = document.getElementById('timelineBikeIcon');
      if (bikeEl) {
        bikeEl.style.transform = `rotate(${bearing}deg)`;
      }
    }
    if (timelineCameraMode === 'follow') {
      leafletMap.panTo([currentLat, currentLng], { animate: false });
    }
  }
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// ==============================================================================
// Live Fleet Markers & Realtime Updates
// ==============================================================================

let lastFleetSignature = '';

function buildMarkerPopupHtml(agent, agentIdx) {
  return `
    <div style="color:#111; font-family:sans-serif; min-width:200px;">
      <h4 style="margin:0 0 4px 0; font-size:14px; font-weight:700;">${escapeHtml(agent.full_name)}</h4>
      <p style="margin:0 0 6px 0; font-size:12px; color:#555;">Code: <strong>${escapeHtml(agent.employee_code)}</strong></p>
      <div style="font-size:11px; color:#222; background:#f4f4f4; padding:6px; border-radius:4px; display:flex; flex-direction:column; gap:3px; margin-bottom:8px;">
        <div>Status: <span style="color:#00a86b; font-weight:700;">● LIVE TRANSMITTING</span></div>
        <div>Speed: <strong>${(agent.speed_kmh || 0).toFixed(1)} km/h</strong></div>
        <div>Battery: <strong>${agent.battery_pct != null ? agent.battery_pct + '%' : 'N/A'}</strong></div>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" onclick="selectAgent(${agentIdx}, 'LIVE')" style="flex:1; padding:5px 8px; border:none; border-radius:6px; background:#0091ea; color:#fff; font-size:11px; font-weight:700; cursor:pointer;">Live Location</button>
        <button type="button" onclick="selectAgent(${agentIdx}, 'TIMELINE')" style="flex:1; padding:5px 8px; border:1px solid #0091ea; border-radius:6px; background:#fff; color:#0069c0; font-size:11px; font-weight:700; cursor:pointer;">Timeline View</button>
      </div>
    </div>
  `;
}

function updateMapMarkers(reFit = false) {
  // If user is currently inspecting a timeline replay, suppress live fleet marker overrides
  if (currentNavView === 'AGENT_TIMELINE') return;

  const onlineAgents = (assignedAgents || [])
    .map((agent, idx) => ({ agent, idx }))
    .filter(({ agent }) => agent.lat != null && agent.lng != null);

  // 1. Google Maps Engine
  if (isGoogleMapsActive && googleMap) {
    const activeIds = new Set();
    const bounds = new google.maps.LatLngBounds();

    onlineAgents.forEach(({ agent, idx }) => {
      const markerKey = agent.id || agent.employee_code || idx;
      activeIds.add(markerKey);
      const pos = { lat: agent.lat, lng: agent.lng };
      bounds.extend(pos);
      const contentString = buildMarkerPopupHtml(agent, idx);

      if (googleMarkers[markerKey]) {
        googleMarkers[markerKey].marker.setPosition(pos);
        googleMarkers[markerKey].infoWindow.setContent(contentString);
        googleMarkers[markerKey].pos = pos;
        googleMarkers[markerKey].idx = idx;
      } else {
        const marker = new google.maps.Marker({
          position: pos,
          map: googleMap,
          title: agent.full_name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#00e5ff",
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: "#ffffff"
          }
        });
        const infoWindow = new google.maps.InfoWindow({ content: contentString });
        const entry = { marker, infoWindow, pos, idx };
        marker.addListener("click", () => {
          if (activeInfoWindow) activeInfoWindow.close();
          infoWindow.open(googleMap, marker);
          activeInfoWindow = infoWindow;
          selectAgent(entry.idx, 'LIVE');
        });
        googleMarkers[markerKey] = entry;
      }
    });

    Object.keys(googleMarkers).forEach(k => {
      if (!activeIds.has(k)) {
        googleMarkers[k].marker.setMap(null);
        delete googleMarkers[k];
      }
    });

    if ((!hasInitialFittedBounds || reFit) && onlineAgents.length > 0) {
      hasInitialFittedBounds = true;
      if (onlineAgents.length === 1) {
        googleMap.setCenter({ lat: onlineAgents[0].agent.lat, lng: onlineAgents[0].agent.lng });
        googleMap.setZoom(16);
      } else {
        googleMap.fitBounds(bounds);
      }
    }
    return;
  }

  // 2. Leaflet Fallback Engine
  if (leafletMap) {
    const activeIds = new Set();
    const bounds = [];

    onlineAgents.forEach(({ agent, idx }) => {
      const markerKey = agent.id || agent.employee_code || idx;
      activeIds.add(markerKey);
      const lat = agent.lat;
      const lng = agent.lng;
      bounds.push([lat, lng]);
      const popupHtml = buildMarkerPopupHtml(agent, idx);

      if (leafletMarkers[markerKey]) {
        leafletMarkers[markerKey].marker.setLatLng([lat, lng]);
        leafletMarkers[markerKey].marker.setPopupContent(popupHtml);
        leafletMarkers[markerKey].lat = lat;
        leafletMarkers[markerKey].lng = lng;
        leafletMarkers[markerKey].idx = idx;
      } else {
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
        marker.bindPopup(popupHtml);
        const entry = { marker, lat, lng, idx };
        marker.on('click', () => selectAgent(entry.idx, 'LIVE'));
        leafletMarkers[markerKey] = entry;
      }
    });

    Object.keys(leafletMarkers).forEach(k => {
      if (!activeIds.has(k)) {
        leafletMap.removeLayer(leafletMarkers[k].marker);
        delete leafletMarkers[k];
      }
    });

    if ((!hasInitialFittedBounds || reFit) && bounds.length > 0) {
      hasInitialFittedBounds = true;
      if (bounds.length === 1) {
        leafletMap.setView(bounds[0], 16);
      } else {
        leafletMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    }
  }
}

async function loadAssignedFleet() {
  try {
    assignedAgents = await api.getManagerAssets();
    const onlineCount = (assignedAgents || []).filter(a => a.is_online === true).length;
    
    const countBadge = document.getElementById('fleetCountBadge');
    if (countBadge) countBadge.textContent = `${onlineCount} Online / ${assignedAgents.length} Total`;
    
    // If an agent is selected in View 2, update their live metrics smoothly
    if (currentNavView === 'AGENT_LIVE' && selectedAgentIndex >= 0) {
      selectedAgent = assignedAgents[selectedAgentIndex];
      updateAgentLivePanelData();
      if (autoCenterLive) focusAgentLiveMarker();
    }

    // Refresh markers if in fleet view
    if (currentNavView === 'FLEET_ALL') {
      updateMapHUD('All Fleet Overview', `${assignedAgents.length} assigned assets monitored`, onlineCount > 0);
      updateMapMarkers();
    }

    renderFleetList();
  } catch (err) {
    console.error('Failed to load fleet:', err);
  }
}

function renderFleetList(force = false) {
  const listContainer = document.getElementById('fleetList');
  if (!listContainer) return;

  const signature = JSON.stringify((assignedAgents || []).map(a => [a.id || a.employee_code, !!a.is_online, a.battery_pct, Math.round(a.speed_kmh || 0)]));
  if (!force && signature === lastFleetSignature) return;
  lastFleetSignature = signature;

  if (assignedAgents.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align:center; padding:30px; color:var(--text-muted); font-size:0.85rem;">
        <i class="fa-solid fa-circle-info" style="font-size:1.8rem; margin-bottom:8px; display:block;"></i>
        No field assets assigned to your account yet.
      </div>
    `;
    return;
  }

  listContainer.innerHTML = assignedAgents.map((agent, idx) => {
    const isOnline = agent.is_online === true;
    const statusBadge = isOnline 
      ? `<span class="badge badge-approved" style="font-size:0.68rem;"><i class="fa-solid fa-circle fa-beat" style="font-size:6px; margin-right:3px;"></i> LIVE</span>`
      : `<span class="badge" style="font-size:0.68rem; background:rgba(255,255,255,0.06); color:var(--text-muted);">OFFLINE</span>`;

    const telemetrySub = isOnline
      ? `<span><i class="fa-solid fa-battery-three-quarters" style="color:var(--accent-green);"></i> ${agent.battery_pct != null ? agent.battery_pct + '%' : '--'}</span>
         <span><i class="fa-solid fa-gauge" style="color:var(--accent-orange);"></i> ${(agent.speed_kmh || 0).toFixed(0)} km/h</span>`
      : `<span><i class="fa-solid fa-mobile-screen" style="color:var(--text-muted);"></i> Shift Inactive</span>`;

    return `
      <div class="fleet-card ${isOnline ? 'is-online' : ''}" onclick="selectAgent(${idx}, '${isOnline ? 'LIVE' : 'TIMELINE'}')">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-weight:700; color:#fff; font-size:0.92rem;">${escapeHtml(agent.full_name)}</span>
          ${statusBadge}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-secondary); margin-bottom:8px;">
          <span><i class="fa-solid fa-id-badge" style="color:var(--accent-cyan);"></i> ${agent.employee_code}</span>
          ${telemetrySub}
        </div>
        <div style="display:flex; gap:8px; margin-top:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
          <button type="button" class="btn btn-secondary" style="flex:1; padding:4px 8px; font-size:0.72rem; justify-content:center;" onclick="event.stopPropagation(); selectAgent(${idx}, 'LIVE')">
            <i class="fa-solid fa-satellite-dish" style="color:var(--accent-cyan);"></i> Live
          </button>
          <button type="button" class="btn btn-secondary" style="flex:1; padding:4px 8px; font-size:0.72rem; justify-content:center;" onclick="event.stopPropagation(); selectAgent(${idx}, 'TIMELINE')">
            <i class="fa-solid fa-film" style="color:var(--accent-orange);"></i> Timeline
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==============================================================================
// Claims & Reports Controller
// ==============================================================================

async function exportCSV() {
  try {
    await api.downloadReportsCSV();
  } catch (err) {
    alert('Failed to export CSV: ' + err.message);
  }
}
window.exportCSV = exportCSV;

function toggleReportsModal() {
  const modal = document.getElementById('modalReports');
  modal.classList.toggle('open');
  if (modal.classList.contains('open')) {
    loadManagerReports();
  }
}
window.toggleReportsModal = toggleReportsModal;

async function loadManagerReports() {
  const tbody = document.getElementById('reportsTableBody');
  if (!tbody) return;

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
window.loadManagerReports = loadManagerReports;

async function reviewReport(reportId, status, reason = '') {
  try {
    await api.reviewReport(reportId, status, reason);
    await loadManagerReports();
  } catch (err) {
    alert('Failed to update report: ' + err.message);
  }
}
window.reviewReport = reviewReport;

function promptRejectReport(reportId) {
  const reason = prompt('Please enter the rejection reason for this expense claim:');
  if (reason && reason.trim()) {
    reviewReport(reportId, 'REJECTED', reason.trim());
  }
}
window.promptRejectReport = promptRejectReport;

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Setup Auto-Center Toggle
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'autoCenterToggle') {
    autoCenterLive = e.target.checked;
  }
});

// App Startup & Polling
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

    // 1.5s Realtime fleet polling
    setInterval(loadAssignedFleet, 1500);
  } catch (e) {
    window.location.href = 'index.html';
  }
});
