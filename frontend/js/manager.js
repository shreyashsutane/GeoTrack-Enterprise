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
let timelineWaypoints = [];
let timelineCurrentIndex = 0;
let timelineProgressRatio = 0; // 0.0 to 1.0
let isTimelinePlaying = false;
let playbackSpeed = 1;
let animFrameId = null;
let lastAnimTimestamp = null;
let autoCenterLive = true;

// Map Overlays for Timeline
let leafletTimelinePath = null;
let leafletTimelineTraveled = null;
let leafletTimelineBikeMarker = null;
let leafletTimelineStopMarkers = [];
let googleTimelinePath = null;
let googleTimelineTraveled = null;
let googleTimelineBikeMarker = null;
let googleTimelineStopMarkers = [];

// 52-Point Realistic Pune Delivery Route Circuit for Rahul Sharma (EMP-104)
const RAHUL_SHARMA_PUNE_ROUTE = [
  { lat: 18.5018, lng: 73.8580, time: "09:00 AM", speed: 0, road: "Swargate Hub (Shift Start)", stop: "Shift Began • Vehicle Checked" },
  { lat: 18.5032, lng: 73.8568, time: "09:04 AM", speed: 24, road: "Swargate Chowk" },
  { lat: 18.5050, lng: 73.8545, time: "09:08 AM", speed: 32, road: "Shivaji Road South" },
  { lat: 18.5072, lng: 73.8518, time: "09:14 AM", speed: 36, road: "Tilak Road" },
  { lat: 18.5098, lng: 73.8488, time: "09:21 AM", speed: 38, road: "SP College / Tilak Road" },
  { lat: 18.5122, lng: 73.8458, time: "09:28 AM", speed: 28, road: "Hirabaug Chowk" },
  { lat: 18.5140, lng: 73.8440, time: "09:34 AM", speed: 30, road: "Alka Talkies Chowk" },
  { lat: 18.5165, lng: 73.8428, time: "09:41 AM", speed: 26, road: "Lakshmi Road Crossing" },
  { lat: 18.5185, lng: 73.8420, time: "09:48 AM", speed: 22, road: "FC Road South Entry" },
  { lat: 18.5204, lng: 73.8415, time: "09:55 AM", speed: 0, road: "Hotel Vaishali, FC Road", stop: "Delivery #1: Morning Cafe Consignment" },
  { lat: 18.5204, lng: 73.8415, time: "10:12 AM", speed: 0, road: "FC Road Customer Bay", stop: "Completed (Duration: 17 mins)" },
  { lat: 18.5228, lng: 73.8420, time: "10:18 AM", speed: 28, road: "Goodluck Chowk" },
  { lat: 18.5255, lng: 73.8432, time: "10:25 AM", speed: 35, road: "Fergusson College Main Gate" },
  { lat: 18.5285, lng: 73.8440, time: "10:32 AM", speed: 38, road: "Dnyaneshwar Paduka Chowk" },
  { lat: 18.5314, lng: 73.8446, time: "10:40 AM", speed: 42, road: "Shivajinagar Station Flyover" },
  { lat: 18.5342, lng: 73.8418, time: "10:48 AM", speed: 44, road: "College of Agriculture Gate" },
  { lat: 18.5365, lng: 73.8385, time: "10:55 AM", speed: 40, road: "University Road Flyover" },
  { lat: 18.5340, lng: 73.8348, time: "11:03 AM", speed: 35, road: "Ganeshkhind Crossing" },
  { lat: 18.5305, lng: 73.8310, time: "11:12 AM", speed: 0, road: "ICC Tech Park, SB Road", stop: "Delivery #2: Corporate Dispatch" },
  { lat: 18.5305, lng: 73.8310, time: "11:38 AM", speed: 0, road: "ICC Tech Tower B", stop: "Completed (Duration: 26 mins)" },
  { lat: 18.5275, lng: 73.8306, time: "11:45 AM", speed: 30, road: "Senapati Bapat Road South" },
  { lat: 18.5240, lng: 73.8304, time: "11:52 AM", speed: 34, road: "Symbiosis Institute Junction" },
  { lat: 18.5205, lng: 73.8302, time: "12:00 PM", speed: 31, road: "Law College Road" },
  { lat: 18.5170, lng: 73.8298, time: "12:08 PM", speed: 36, road: "FTII / Film Institute" },
  { lat: 18.5135, lng: 73.8282, time: "12:16 PM", speed: 32, road: "Kanchan Galli Junction" },
  { lat: 18.5100, lng: 73.8258, time: "12:25 PM", speed: 38, road: "Erandwane Bridge" },
  { lat: 18.5080, lng: 73.8240, time: "12:35 PM", speed: 42, road: "Karve Road Flyover" },
  { lat: 18.5065, lng: 73.8205, time: "12:45 PM", speed: 45, road: "Nal Stop Chowk" },
  { lat: 18.5055, lng: 73.8160, time: "12:56 PM", speed: 39, road: "Paud Phata Road" },
  { lat: 18.5048, lng: 73.8120, time: "01:08 PM", speed: 35, road: "Ideal Colony / Kothrud" },
  { lat: 18.5040, lng: 73.8080, time: "01:20 PM", speed: 0, road: "Kothrud Depot Transit Hub", stop: "Delivery #3: Wholesale Handover & Lunch" },
  { lat: 18.5040, lng: 73.8080, time: "01:45 PM", speed: 0, road: "Kothrud Depot Bay 4", stop: "Completed (Duration: 25 mins)" },
  { lat: 18.5015, lng: 73.8095, time: "01:54 PM", speed: 28, road: "Vanaz Metro Station" },
  { lat: 18.4985, lng: 73.8125, time: "02:04 PM", speed: 34, road: "Karve Nagar Canal Link" },
  { lat: 18.4950, lng: 73.8165, time: "02:15 PM", speed: 36, road: "Dnyaneshwar Colony" },
  { lat: 18.4920, lng: 73.8190, time: "02:26 PM", speed: 30, road: "Cummins College Road" },
  { lat: 18.4910, lng: 73.8200, time: "02:38 PM", speed: 25, road: "Karve Nagar Chowk" },
  { lat: 18.4930, lng: 73.8250, time: "02:50 PM", speed: 34, road: "Hingne Khurd" },
  { lat: 18.4952, lng: 73.8310, time: "03:05 PM", speed: 38, road: "Sinhagad Road Crossing" },
  { lat: 18.4975, lng: 73.8390, time: "03:22 PM", speed: 37, road: "Dandekar Bridge Flyover" },
  { lat: 18.4995, lng: 73.8450, time: "03:38 PM", speed: 32, road: "Mitramandal Chowk" },
  { lat: 18.5005, lng: 73.8490, time: "03:52 PM", speed: 29, road: "Sarasbaug Ring Road" },
  { lat: 18.5012, lng: 73.8540, time: "04:10 PM", speed: 24, road: "Jedhe Chowk" },
  { lat: 18.5018, lng: 73.8580, time: "04:25 PM", speed: 0, road: "Swargate Hub Return", stop: "Shift Closed • Fuel Claim Submitted" }
];

// Date-Indexed Historical Routes for Rahul Sharma (EMP-104)
const RAHUL_SHARMA_ROUTES_BY_DATE = {
  '2026-11-22': {
    title: "Pune Urban Delivery Circuit (FC Road & Kothrud)",
    distance: "42.8 km",
    movingTime: "2h 45m",
    idleTime: "45m",
    fuelAmount: "₹ 128.40",
    status: "LOGGED",
    waypoints: RAHUL_SHARMA_PUNE_ROUTE
  },
  '2026-11-21': {
    title: "East Pune Tech Corridor (Camp & Viman Nagar)",
    distance: "54.2 km",
    movingTime: "3h 20m",
    idleTime: "55m",
    fuelAmount: "₹ 162.60",
    status: "APPROVED",
    waypoints: [
      { lat: 18.5018, lng: 73.8580, time: "09:15 AM", speed: 0, road: "Swargate Hub (Shift Start)", stop: "Shift Started" },
      { lat: 18.5085, lng: 73.8680, time: "09:30 AM", speed: 32, road: "Shankarsheth Road" },
      { lat: 18.5140, lng: 73.8760, time: "09:50 AM", speed: 28, road: "Camp / MG Road Hub", stop: "Delivery #1: Commercial Parcel Drop" },
      { lat: 18.5140, lng: 73.8760, time: "10:10 AM", speed: 0, road: "MG Road Customer Bay", stop: "Completed (20 mins)" },
      { lat: 18.5240, lng: 73.8880, time: "10:35 AM", speed: 36, road: "Koregaon Park North Main Road" },
      { lat: 18.5360, lng: 73.8990, time: "11:05 AM", speed: 42, road: "Kalyani Nagar Bridge" },
      { lat: 18.5580, lng: 73.9140, time: "11:45 AM", speed: 0, road: "Viman Nagar / Phoenix Marketcity", stop: "Delivery #2: Retail Consignment" },
      { lat: 18.5580, lng: 73.9140, time: "12:15 PM", speed: 0, road: "Phoenix Loading Dock", stop: "Completed (30 mins)" },
      { lat: 18.5510, lng: 73.8920, time: "01:00 PM", speed: 38, road: "Yerawada Golf Club Road" },
      { lat: 18.5280, lng: 73.8750, time: "02:15 PM", speed: 34, road: "Pune Railway Station Junction" },
      { lat: 18.5110, lng: 73.8640, time: "03:40 PM", speed: 26, road: "Timber Market Road" },
      { lat: 18.5018, lng: 73.8580, time: "04:45 PM", speed: 0, road: "Swargate Hub Return", stop: "Shift Concluded • Approved" }
    ]
  },
  '2026-11-20': {
    title: "North-West Logistics Track (Aundh & Hinjewadi)",
    distance: "48.5 km",
    movingTime: "3h 05m",
    idleTime: "40m",
    fuelAmount: "₹ 145.50",
    status: "APPROVED",
    waypoints: [
      { lat: 18.5018, lng: 73.8580, time: "09:00 AM", speed: 0, road: "Swargate Hub (Shift Start)", stop: "Shift Started" },
      { lat: 18.5314, lng: 73.8446, time: "09:40 AM", speed: 35, road: "Shivajinagar" },
      { lat: 18.5600, lng: 73.8050, time: "10:20 AM", speed: 44, road: "Aundh Parihar Chowk", stop: "Delivery #1: Express Package" },
      { lat: 18.5600, lng: 73.8050, time: "10:40 AM", speed: 0, road: "Aundh Distribution Bay", stop: "Completed (20 mins)" },
      { lat: 18.5590, lng: 73.7800, time: "11:15 AM", speed: 48, road: "Baner Road Expressway" },
      { lat: 18.5910, lng: 73.7380, time: "12:00 PM", speed: 0, road: "Hinjewadi Phase 1 Tech Hub", stop: "Delivery #2: IT Hardware Supply" },
      { lat: 18.5910, lng: 73.7380, time: "12:35 PM", speed: 0, road: "Hinjewadi Phase 1 Gate 2", stop: "Completed (35 mins)" },
      { lat: 18.5980, lng: 73.7650, time: "01:30 PM", speed: 42, road: "Wakad Chowk" },
      { lat: 18.5410, lng: 73.7920, time: "02:45 PM", speed: 36, road: "Pashan Circle" },
      { lat: 18.5018, lng: 73.8580, time: "04:15 PM", speed: 0, road: "Swargate Hub Return", stop: "Shift Closed" }
    ]
  }
};

let currentSelectedDate = '2026-11-22';

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

  initLeafletFallback();
}

function initLeafletFallback() {
  if (leafletMap) return;
  const container = document.getElementById('map');
  if (!container) return;
  container.innerHTML = '';

  leafletMap = L.map('map', { zoomControl: true }).setView([18.5204, 73.8567], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
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

  // Check if Rahul Sharma (EMP-104) -> enable simulate button
  const isRahul = selectedAgent.employee_code === 'EMP-104';
  const rahulBtnBox = document.getElementById('rahulSimulateContainer');
  if (rahulBtnBox) rahulBtnBox.style.display = isRahul ? 'block' : 'none';

  // Set default date input value to today
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
  let dateStr = '2026-11-22';
  document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));

  if (type === 'TODAY') {
    dateStr = '2026-11-22';
    const chip = document.getElementById('chipToday');
    if (chip) chip.classList.add('active');
  } else if (type === 'YESTERDAY') {
    dateStr = '2026-11-21';
    const chip = document.getElementById('chipYesterday');
    if (chip) chip.classList.add('active');
  } else if (type === 'DAY_BEFORE') {
    dateStr = '2026-11-20';
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
  if (dateVal === '2026-11-22') {
    const chip = document.getElementById('chipToday');
    if (chip) chip.classList.add('active');
  } else if (dateVal === '2026-11-21') {
    const chip = document.getElementById('chipYesterday');
    if (chip) chip.classList.add('active');
  } else if (dateVal === '2026-11-20') {
    const chip = document.getElementById('chipDayBefore');
    if (chip) chip.classList.add('active');
  }

  currentSelectedDate = dateVal;
  loadShiftRouteForDate(dateVal);
}
window.onDatePickerChange = onDatePickerChange;

function loadShiftRouteForDate(dateStr) {
  if (!selectedAgent) return;

  const datePill = document.getElementById('playerDatePill');
  if (datePill) {
    datePill.innerHTML = `<i class="fa-solid fa-calendar-day" style="color:var(--accent-orange); margin-right:4px;"></i> ${dateStr}`;
  }

  // Rahul Sharma specific historical routes
  if (selectedAgent.employee_code === 'EMP-104') {
    const routeObj = RAHUL_SHARMA_ROUTES_BY_DATE[dateStr] || {
      title: `Pune Central Shift (${dateStr})`,
      distance: "40.5 km",
      movingTime: "2h 35m",
      idleTime: "30m",
      fuelAmount: "₹ 121.50",
      status: "LOGGED",
      waypoints: RAHUL_SHARMA_PUNE_ROUTE
    };

    document.getElementById('timelineShiftTitle').innerHTML = `<i class="fa-regular fa-calendar-check" style="color:var(--accent-cyan); margin-right:6px;"></i> Shift Route: ${dateStr}`;
    document.getElementById('timelineDistanceVal').textContent = routeObj.distance;
    document.getElementById('timelineMovingTimeVal').textContent = routeObj.movingTime;
    document.getElementById('timelineIdleTimeVal').textContent = routeObj.idleTime;
    document.getElementById('timelineFuelVal').textContent = routeObj.fuelAmount;
    
    const statusBadge = document.getElementById('timelineShiftStatus');
    if (statusBadge) {
      statusBadge.textContent = routeObj.status;
      statusBadge.className = routeObj.status === 'APPROVED' ? 'badge badge-approved' : 'badge badge-submitted';
    }

    loadTimelineRoute(routeObj.waypoints, `${routeObj.title} [${dateStr}]`);
    return;
  }

  // Other Field Agents (EMP-105 to EMP-109)
  const agentTrack = generateSynthesizedRouteForAgentAndDate(selectedAgent, dateStr);
  document.getElementById('timelineShiftTitle').innerHTML = `<i class="fa-regular fa-calendar-check" style="color:var(--accent-cyan); margin-right:6px;"></i> Shift Route: ${dateStr}`;
  document.getElementById('timelineDistanceVal').textContent = agentTrack.distance;
  document.getElementById('timelineMovingTimeVal').textContent = agentTrack.movingTime;
  document.getElementById('timelineIdleTimeVal').textContent = agentTrack.idleTime;
  document.getElementById('timelineFuelVal').textContent = agentTrack.fuelAmount;

  loadTimelineRoute(agentTrack.waypoints, `${selectedAgent.full_name} [${dateStr}]`);
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

function runRahulSimulation() {
  if (selectedAgent && selectedAgent.employee_code === 'EMP-104') {
    selectShiftDate('TODAY');
    togglePlayPause(true); // Auto-start
  }
}
window.runRahulSimulation = runRahulSimulation;

function generateSynthesizedRouteForAgentAndDate(agent, dateStr) {
  const baseLat = agent.lat || 18.5204;
  const baseLng = agent.lng || 73.8567;

  // Pseudo-seed based on date
  const dayOffset = dateStr.endsWith('21') ? 0.015 : dateStr.endsWith('20') ? -0.012 : 0;
  const distanceKm = (38.5 + (dateStr.charCodeAt(dateStr.length - 1) % 15)).toFixed(1);
  const fuel = (distanceKm * 3.0).toFixed(2);

  return {
    distance: `${distanceKm} km`,
    movingTime: "2h 30m",
    idleTime: "40m",
    fuelAmount: `₹ ${fuel}`,
    waypoints: [
      { lat: baseLat - 0.02 + dayOffset, lng: baseLng - 0.02 + dayOffset, time: "09:15 AM", speed: 0, road: "District Base Logistics Hub", stop: "Shift Began" },
      { lat: baseLat - 0.012 + dayOffset, lng: baseLng - 0.010 + dayOffset, time: "09:45 AM", speed: 32, road: "Main Arterial Avenue" },
      { lat: baseLat - 0.005 + dayOffset, lng: baseLng - 0.003 + dayOffset, time: "10:30 AM", speed: 28, road: "Commercial Zone Hub", stop: "Delivery #1: Client Dispatch" },
      { lat: baseLat - 0.005 + dayOffset, lng: baseLng - 0.003 + dayOffset, time: "10:55 AM", speed: 0, road: "Client Dock", stop: "Stop Duration: 25 mins" },
      { lat: baseLat + 0.008 + dayOffset, lng: baseLng + 0.006 + dayOffset, time: "11:45 AM", speed: 38, road: "Express Transit Ring" },
      { lat: baseLat + 0.018 + dayOffset, lng: baseLng + 0.015 + dayOffset, time: "01:20 PM", speed: 0, road: "Regional Fulfillment Center", stop: "Delivery #2: Wholesale Handover" },
      { lat: baseLat + 0.018 + dayOffset, lng: baseLng + 0.015 + dayOffset, time: "01:50 PM", speed: 0, road: "Center Bay 2", stop: "Stop Duration: 30 mins" },
      { lat: baseLat + 0.010 + dayOffset, lng: baseLng + 0.008 + dayOffset, time: "03:10 PM", speed: 35, road: "Industrial Connector Highway" },
      { lat: baseLat - 0.02 + dayOffset, lng: baseLng - 0.02 + dayOffset, time: "04:30 PM", speed: 0, road: "District Base Logistics Hub Return", stop: "Shift Concluded" }
    ]
  };
}

function loadTimelineRoute(waypoints, title) {
  stopTimelinePlayback();
  clearTimelineMapLayers();

  timelineWaypoints = waypoints || [];
  if (timelineWaypoints.length < 2) return;

  timelineCurrentIndex = 0;
  timelineProgressRatio = 0;

  document.getElementById('playerLegTitle').innerHTML = `<i class="fa-solid fa-route" style="color:var(--accent-cyan);"></i> ${title}`;
  document.getElementById('scrubStart').textContent = timelineWaypoints[0].time;
  document.getElementById('scrubEnd').textContent = timelineWaypoints[timelineWaypoints.length - 1].time;
  document.getElementById('timelineScrubber').value = 0;
  document.getElementById('timelineProgressFill').style.width = '0%';

  // Render Waypoint checkpoints in Sidebar
  renderTimelineWaypointsList();

  // Draw Map Polyline
  const latLngs = timelineWaypoints.map(w => [w.lat, w.lng]);
  const gLatLngs = timelineWaypoints.map(w => ({ lat: w.lat, lng: w.lng }));

  if (isGoogleMapsActive && googleMap) {
    googleTimelinePath = new google.maps.Polyline({
      path: gLatLngs,
      geodesic: true,
      strokeColor: "#334e87",
      strokeOpacity: 0.5,
      strokeWeight: 4,
      map: googleMap
    });

    googleTimelineTraveled = new google.maps.Polyline({
      path: [gLatLngs[0]],
      geodesic: true,
      strokeColor: "#00e5ff",
      strokeOpacity: 0.95,
      strokeWeight: 5,
      map: googleMap
    });

    // Custom Moving Bike Marker
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

    // Stop Pins
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
          title: `${w.time} - ${w.stop}`
        });
        googleTimelineStopMarkers.push(marker);
      }
    });

    // Fit map bounds
    const bounds = new google.maps.LatLngBounds();
    gLatLngs.forEach(pt => bounds.extend(pt));
    googleMap.fitBounds(bounds, { top: 50, bottom: 120, left: 50, right: 50 });

  } else if (leafletMap) {
    // Full Planned Route (faint dark line)
    leafletTimelinePath = L.polyline(latLngs, {
      color: 'rgba(0, 229, 255, 0.25)',
      weight: 4,
      dashArray: '4, 8'
    }).addTo(leafletMap);

    // Traveled Progress Route (solid bright cyan)
    leafletTimelineTraveled = L.polyline([latLngs[0]], {
      color: '#00e5ff',
      weight: 5
    }).addTo(leafletMap);

    // Rotating Motorcycle Marker
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

    // Stop Pin Markers
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
        m.bindPopup(`<strong style="color:#111;">${w.time}</strong><br><span style="color:#444;">${w.stop}</span>`);
        leafletTimelineStopMarkers.push(m);
      }
    });

    leafletMap.fitBounds(latLngs, { padding: [50, 50], maxZoom: 16 });
  }

  updatePlaybackVisuals(0);
}

function clearTimelineMapLayers() {
  if (googleTimelinePath) { googleTimelinePath.setMap(null); googleTimelinePath = null; }
  if (googleTimelineTraveled) { googleTimelineTraveled.setMap(null); googleTimelineTraveled = null; }
  if (googleTimelineBikeMarker) { googleTimelineBikeMarker.setMap(null); googleTimelineBikeMarker = null; }
  googleTimelineStopMarkers.forEach(m => m.setMap(null));
  googleTimelineStopMarkers = [];

  if (leafletMap) {
    if (leafletTimelinePath) { leafletMap.removeLayer(leafletTimelinePath); leafletTimelinePath = null; }
    if (leafletTimelineTraveled) { leafletMap.removeLayer(leafletTimelineTraveled); leafletTimelineTraveled = null; }
    if (leafletTimelineBikeMarker) { leafletMap.removeLayer(leafletTimelineBikeMarker); leafletTimelineBikeMarker = null; }
    leafletTimelineStopMarkers.forEach(m => leafletMap.removeLayer(m));
    leafletTimelineStopMarkers = [];
  }
}

function renderTimelineWaypointsList() {
  const container = document.getElementById('timelineWaypointsList');
  if (!container) return;

  container.innerHTML = timelineWaypoints.map((w, i) => {
    const isStop = Boolean(w.stop);
    return `
      <div class="waypoint-item ${isStop ? 'is-stop' : ''}" onclick="jumpToWaypoint(${i})">
        <div style="min-width:60px; font-family:monospace; color:${isStop ? 'var(--accent-orange)' : 'var(--text-secondary)'}; font-weight:700;">
          ${w.time}
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
  if (!timelineWaypoints.length) return;
  const ratio = index / (timelineWaypoints.length - 1);
  onScrubInput(ratio * 100);
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
    icon.className = 'fa-solid fa-pause';
    lastAnimTimestamp = performance.now();
    animFrameId = requestAnimationFrame(timelineAnimationTick);
  } else {
    icon.className = 'fa-solid fa-play';
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
  playbackSpeed = multiplier;
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.getAttribute('data-speed'), 10) === multiplier);
  });
}
window.setPlaySpeed = setPlaySpeed;

function stepTimeline(secondsDelta) {
  if (!timelineWaypoints.length) return;
  const totalSeconds = 8 * 3600; // 8-hour shift approximation
  const stepRatio = (secondsDelta * 30) / totalSeconds;
  let newRatio = timelineProgressRatio + stepRatio;
  newRatio = Math.max(0, Math.min(1, newRatio));
  onScrubInput(newRatio * 100);
}
window.stepTimeline = stepTimeline;

function onScrubInput(val) {
  timelineProgressRatio = parseFloat(val) / 100;
  updatePlaybackVisuals(timelineProgressRatio);
}
window.onScrubInput = onScrubInput;

function timelineAnimationTick(timestamp) {
  if (!isTimelinePlaying) return;

  const dt = (timestamp - (lastAnimTimestamp || timestamp)) / 1000;
  lastAnimTimestamp = timestamp;

  // Base progress: complete entire circuit in 40s at 1x speed
  const baseRate = 1 / 40;
  timelineProgressRatio += baseRate * playbackSpeed * dt;

  if (timelineProgressRatio >= 1.0) {
    timelineProgressRatio = 1.0;
    updatePlaybackVisuals(1.0);
    togglePlayPause(false); // Stop at end
    return;
  }

  updatePlaybackVisuals(timelineProgressRatio);
  animFrameId = requestAnimationFrame(timelineAnimationTick);
}

function updatePlaybackVisuals(ratio) {
  if (!timelineWaypoints || timelineWaypoints.length < 2) return;

  // Update Scrubber Range & Fill Bar
  const pct = (ratio * 100).toFixed(1);
  const scrubber = document.getElementById('timelineScrubber');
  const fillBar = document.getElementById('timelineProgressFill');
  if (scrubber) scrubber.value = pct;
  if (fillBar) fillBar.style.width = `${pct}%`;

  // Compute interpolated point along the sequence
  const totalSegments = timelineWaypoints.length - 1;
  const exactSegment = ratio * totalSegments;
  const segIdx = Math.min(Math.floor(exactSegment), totalSegments - 1);
  const segFraction = exactSegment - segIdx;

  const p1 = timelineWaypoints[segIdx];
  const p2 = timelineWaypoints[segIdx + 1];

  const currentLat = p1.lat + (p2.lat - p1.lat) * segFraction;
  const currentLng = p1.lng + (p2.lng - p1.lng) * segFraction;
  const currentSpeed = p1.speed + (p2.speed - p1.speed) * segFraction;
  const bearing = calculateBearing(p1.lat, p1.lng, p2.lat, p2.lng);

  // Update Clock & HUD
  document.getElementById('playerClock').textContent = p1.time;
  document.getElementById('playerSpeed').textContent = `${currentSpeed.toFixed(0)} km/h`;
  const dist = (ratio * 42.8).toFixed(1);
  document.getElementById('playerDistance').textContent = `${dist} / 42.8 km`;

  // Update Map Traveled Polyline & Marker
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
