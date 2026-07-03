(() => {
  "use strict";

  const CITY_ID = "690388c7ad28bbbf340407e0";
  const MANAGERS_URL = `https://managers-map.gojet.app/?city_id=${CITY_ID}`;
  const BASE = "https://logistic.gojet.app/api/v0/urent";
  const CARTO = { version: 8, sources: { carto: { type: "raster", tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png", "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png", "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png", "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"], tileSize: 256, attribution: "© CARTO © OpenStreetMap contributors" } }, layers: [{ id: "carto-dark", type: "raster", source: "carto" }] };
  const CENTER = [-43.9378, -19.9208];
  const state = { parkings: [], bikes: [], rules: [], schedule: null, idle48: [], counts: new Map(), error: null, at: null };
  let map = null;
  let mapReady = false;

  document.addEventListener("DOMContentLoaded", boot);

  function boot() {
    injectUi();
    bindUi();
    initMap();
    render();
    setInterval(() => { renderMonitorCandidates(); updateMap(); }, 3500);
  }

  function injectUi() {
    const tools = document.querySelector(".tools-panel");
    if (tools && !document.querySelector("#liveFullBtn")) {
      tools.insertAdjacentHTML("afterbegin", `
        <button id="liveFullBtn" type="button"><i data-lucide="radio-tower"></i><span>Live full</span></button>
        <a class="tool-link" href="${MANAGERS_URL}" target="_blank" rel="noreferrer"><i data-lucide="map"></i><span>Managers map</span></a>
      `);
    }
    const plan = document.querySelector(".plan-panel");
    if (plan && !document.querySelector("#liveOpsPanel")) {
      plan.insertAdjacentHTML("afterend", `
        <section class="panel live-ops" id="liveOpsPanel">
          <div class="panel-head"><div><h2>Managers Map live</h2><span id="liveOpsSubtext">parkings · rules · schedule · bikes · idle 48h+</span></div></div>
          <div class="live-kpis">
            <div><strong id="liveParkingsCount">0</strong><span>parkings</span></div>
            <div><strong id="liveMonitorCount">0</strong><span>monitor</span></div>
            <div><strong id="liveBikesCount">0</strong><span>bikes</span></div>
            <div><strong id="liveIdleCount">0</strong><span>idle 48h+</span></div>
          </div>
          <div class="live-status" id="liveStatusBox">CARTO map подключена. Нажми Live full, чтобы попытаться вытянуть Managers Map service.</div>
          <div class="live-map-wrap"><div id="liveOpsMap"></div><div class="live-map-legend"><span><b class="dot rec"></b>brain</span><span><b class="dot mon"></b>monitor</span><span><b class="dot park"></b>non-monitor</span><span><b class="dot bike"></b>bike</span><span><b class="dot idle"></b>48h+</span></div></div>
          <div class="live-panels">
            <div><h3>Monitor / non-monitor</h3><div id="liveParkingList" class="compact-list"></div></div>
            <div><h3>Самокаты 48+ часов</h3><div id="liveIdleList" class="compact-list"></div></div>
            <div><h3>Статусы самокатов</h3><div id="liveStatusList" class="compact-list"></div></div>
          </div>
        </section>
      `);
    }
    if (!document.querySelector("#liveOpsStyle")) {
      const style = document.createElement("style");
      style.id = "liveOpsStyle";
      style.textContent = `
        .tool-link{min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font-size:12px;font-weight:750;text-decoration:none}.tool-link svg{width:17px;height:17px}.live-ops{margin-top:12px}.live-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.live-kpis div{padding:10px;border:1px solid #dce6ee;border-radius:8px;background:#f8fbfc}.live-kpis strong,.live-kpis span{display:block}.live-kpis strong{font-size:24px;line-height:1.1}.live-kpis span{margin-top:4px;color:var(--muted);font-size:12px}.live-status{margin-top:10px;padding:10px;border:1px solid #dbeafe;border-radius:8px;background:#eff6ff;color:#1e3a8a;font-size:12px;line-height:1.35}.live-status.error{border-color:#fed7aa;background:#fff7ed;color:#9a3412}.live-map-wrap{position:relative;height:min(55vh,520px);min-height:360px;margin-top:12px;overflow:hidden;border:1px solid #1f2f40;border-radius:8px;background:#0b1118}#liveOpsMap{width:100%;height:100%}.live-map-legend{position:absolute;left:12px;bottom:12px;z-index:2;display:flex;flex-wrap:wrap;gap:10px;max-width:calc(100% - 24px);padding:8px 10px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(13,20,30,.84);color:#dce7f3;font-size:12px}.dot{display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:999px}.dot.rec{background:#f59e0b}.dot.mon{background:#22c55e}.dot.park{background:#38bdf8}.dot.bike{background:#a78bfa}.dot.idle{background:#ef4444}.live-panels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}.live-panels h3{margin-bottom:10px}@media(max-width:1120px){.live-panels{grid-template-columns:1fr}.live-kpis{grid-template-columns:1fr 1fr}}@media(max-width:760px){.live-kpis{grid-template-columns:1fr}.live-map-wrap{min-height:320px}}
      `;
      document.head.appendChild(style);
    }
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function bindUi() {
    document.querySelector("#liveFullBtn")?.addEventListener("click", loadManagersMapService);
  }

  async function loadManagersMapService() {
    status("loading Managers Map service...");
    try {
      const [parkingsRaw, bikesRaw, rulesRaw, schedule] = await Promise.all([
        fetchPaged("parkings", 6),
        fetchPaged("bikes", 10),
        fetchRows(`${BASE}/parking_rules?city_id=${encodeURIComponent(CITY_ID)}`),
        fetchJson(`${BASE}/schedule?city_id=${encodeURIComponent(CITY_ID)}`),
      ]);
      buildLive(parkingsRaw, bikesRaw, rulesRaw, schedule);
      render();
      updateMap();
      status(`Live загружен: ${state.parkings.length} parkings, ${state.bikes.length} bikes, ${state.idle48.length} idle 48h+.`);
    } catch (err) {
      state.error = err.message;
      status(`API logistic.gojet.app заблокирован для GitHub Pages: ${err.message}. Открой Managers map или нужен proxy/backend для полного pull.`, true);
      render();
    }
  }

  async function fetchPaged(kind, pages) {
    const out = [];
    for (let page = 1; page <= pages; page += 1) {
      const rows = await fetchRows(`${BASE}/${kind}?city_id=${encodeURIComponent(CITY_ID)}&page=${page}&limit=1000`);
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }

  async function fetchRows(url) {
    return rowsFrom(await fetchJson(url));
  }

  async function fetchJson(url) {
    const proxy = localStorage.getItem("bh_live_proxy_url") || "";
    const finalUrl = proxy ? `${proxy}${proxy.includes("?") ? "&" : "?"}url=${encodeURIComponent(url)}` : url;
    const res = await fetch(finalUrl, { mode: "cors", credentials: "omit", headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText || "API error"}`);
    return res.json();
  }

  function rowsFrom(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    for (const key of ["data", "items", "results", "parkings", "bikes", "rules"]) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
      if (value && Array.isArray(value.data)) return value.data;
      if (value && Array.isArray(value.items)) return value.items;
      if (value && Array.isArray(value.results)) return value.results;
    }
    return [];
  }

  function buildLive(parkingsRaw, bikesRaw, rulesRaw, schedule) {
    const rules = rulesRaw.map(ruleNorm).filter(Boolean);
    const monitorKeys = new Set(rules.filter((r) => r.monitor).map((r) => r.key));
    state.rules = rules;
    state.parkings = parkingsRaw.map((p) => parkingNorm(p, monitorKeys)).filter(Boolean);
    state.bikes = bikesRaw.map(bikeNorm).filter(Boolean);
    state.schedule = schedule;
    state.counts = new Map();
    state.bikes.forEach((b) => state.counts.set(b.state || "unknown", (state.counts.get(b.state || "unknown") || 0) + 1));
    state.idle48 = state.bikes.filter((b) => b.idleHours >= 48).sort((a, b) => b.idleHours - a.idleHours);
    state.at = Date.now();
    state.error = null;
  }

  function ruleNorm(x) {
    const name = txt(x.name || x.title || x.parking_name || x.parkingName || x.address || x.id);
    const key = norm(name || x.parking_id || x.parkingId || x.id);
    if (!key) return null;
    return { id: txt(x.id || x._id || x.parking_id || x.parkingId || name), name, key, monitor: bool(x.monitor ?? x.is_monitor ?? x.isMonitor ?? x.monitored ?? x.priority ?? x.is_priority ?? x.top), raw: x };
  }

  function parkingNorm(x, monitorKeys) {
    const pt = point(x);
    const name = txt(x.name || x.title || x.shortName || x.address || x.id);
    if (!pt || !name) return null;
    const key = norm(name);
    const directMonitor = bool(x.monitor ?? x.is_monitor ?? x.isMonitor ?? x.monitored ?? x.priority ?? x.is_priority ?? x.top);
    return { id: txt(x.id || x._id || x.parking_id || x.uuid || name), name, key, lat: pt.lat, lng: pt.lng, current: num(x.current ?? x.currentVehicles ?? x.available ?? x.availableVehicles ?? x.count), target: num(x.target ?? x.objective ?? x.capacity ?? x.maxVehicles ?? x.limit), monitor: directMonitor || monitorKeys.has(key), raw: x };
  }

  function bikeNorm(x) {
    const pt = point(x);
    if (!pt) return null;
    const idleHours = idleH(x);
    return { id: txt(x.id || x._id || x.bike_id || x.qr || x.number || x.identifier), name: txt(x.name || x.number || x.qr || x.identifier || x.id || "bike"), lat: pt.lat, lng: pt.lng, state: txt(x.state || x.status || x.bike_state || x.vehicle_state || "unknown"), battery: num(x.battery ?? x.batteryCharge ?? x.batteryChargePct ?? x.charge), idleHours, idle48: idleHours >= 48, raw: x };
  }

  function render() {
    setText("liveParkingsCount", fmt(state.parkings.length));
    setText("liveBikesCount", fmt(state.bikes.length));
    setText("liveMonitorCount", fmt(state.parkings.filter((p) => p.monitor).length));
    setText("liveIdleCount", fmt(state.idle48.length));
    renderMonitorCandidates();
    renderIdle();
    renderStatuses();
  }

  function renderMonitorCandidates() {
    const el = document.querySelector("#liveParkingList");
    if (!el) return;
    const analysis = window.ParkingBrain?.getState?.().analysis;
    const liveByKey = new Map(state.parkings.map((p) => [p.key, p]));
    const rows = (analysis?.stations || []).map((s) => {
      const live = liveByKey.get(norm(s.name)) || nearestParking(s);
      const monitor = live ? !!live.monitor : s.monitor === true;
      const monitorKnown = !!live || typeof s.monitor === "boolean";
      const reasonScore = (s.last24 || 0) * 3 + (s.last7d || 0) + Math.max(0, s.net || 0) * 2 + (s.peakDemand || 0) * 2 + (s.starts || 0) * 0.25;
      return { s, live, monitor, monitorKnown, reasonScore };
    }).filter((x) => !x.monitor && (x.s.starts || 0) >= 3).sort((a, b) => b.reasonScore - a.reasonScore).slice(0, 10);

    if (!rows.length) {
      el.innerHTML = `<div class="compact-item"><strong>Кандидаты появятся после Excel</strong><span>Загрузки аренды достаточно даже без live API. Если live загрузится, monitor/non-monitor будет точнее.</span></div>`;
      return;
    }
    el.innerHTML = rows.map(({ s, live, monitorKnown }, idx) => `
      <div class="compact-item">
        <strong>${idx + 1}. ${esc(s.name)}</strong>
        <span>Добавить в monitor: стартов ${s.starts}, 24ч ${s.last24}, 7д ${s.last7d}, net ${signed(s.net)} · ${live ? "live non-monitor" : monitorKnown ? "catalog non-monitor" : "monitor status unknown"}</span>
      </div>
    `).join("");
  }

  function renderIdle() {
    const el = document.querySelector("#liveIdleList");
    if (!el) return;
    el.innerHTML = state.idle48.length ? state.idle48.slice(0, 10).map((b) => `
      <div class="compact-item"><strong>${esc(b.name)}</strong><span>${esc(b.state)} · простой ${b.idleHours.toFixed(1)} ч · батарея ${b.battery || "N/D"}%</span></div>
    `).join("") : `<div class="compact-item"><strong>48+ пока нет</strong><span>Если API заблокирован, тут будет пусто до proxy/backend.</span></div>`;
  }

  function renderStatuses() {
    const el = document.querySelector("#liveStatusList");
    if (!el) return;
    const rows = [...state.counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    el.innerHTML = rows.length ? rows.map(([k, v]) => `<div class="compact-item"><strong>${esc(k)}</strong><span>${fmt(v)} самокатов</span></div>`).join("") : `<div class="compact-item"><strong>Статусы не загружены</strong><span>Нажми Live full. Если будет blocked, нужен proxy.</span></div>`;
  }

  function initMap() {
    if (!window.L || !document.querySelector("#liveOpsMap")) return;
    map = window.L.map("liveOpsMap", { zoomControl: true }).setView([-19.9208, -43.9378], 12);
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 20,
      attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
    }).addTo(map);
    map.brain = window.L.layerGroup().addTo(map);
    map.parkings = window.L.layerGroup().addTo(map);
    map.bikes = window.L.layerGroup().addTo(map);
    mapReady = true;
    updateMap();
  }

  function updateMap() {
    if (!mapReady || !map) return;
    map.brain.clearLayers();
    map.parkings.clearLayers();
    map.bikes.clearLayers();
    const bounds = [];
    const analysis = window.ParkingBrain?.getState?.().analysis;
    (analysis?.filteredStations || []).filter((s) => s.lat != null && s.lng != null).forEach((s, i) => {
      const color = s.priority === "urgent" ? "#ef4444" : s.priority === "high" ? "#f59e0b" : "#22c55e";
      circle(s.lat, s.lng, { radius: 8, color, pane: map.brain, title: `${i + 1}. ${s.name}`, kind: "brain recommendation", details: `fill ${s.fillBy}, keep ${s.keepScooters}, starts ${s.starts}, net ${signed(s.net)}` });
      bounds.push([s.lat, s.lng]);
    });
    state.parkings.forEach((p) => {
      circle(p.lat, p.lng, { radius: p.monitor ? 7 : 5, color: p.monitor ? "#22c55e" : "#38bdf8", pane: map.parkings, title: p.name, kind: p.monitor ? "monitor parking" : "non-monitor parking", details: `live ${p.current || "N/D"}/${p.target || "N/D"}` });
      bounds.push([p.lat, p.lng]);
    });
    state.bikes.slice(0, 1800).forEach((b) => {
      circle(b.lat, b.lng, { radius: b.idle48 ? 5 : 3, color: b.idle48 ? "#ef4444" : "#a78bfa", opacity: b.idle48 ? .85 : .45, pane: map.bikes, title: b.name, kind: b.idle48 ? "bike idle 48h+" : "bike", details: `${b.state} · idle ${b.idleHours ? b.idleHours.toFixed(1) : "N/D"}h · battery ${b.battery || "N/D"}%` });
    });
    if (bounds.length && !map.__fitDone) { map.fitBounds(bounds.slice(0, 40), { padding: [42, 42], maxZoom: 14 }); map.__fitDone = true; }
  }

  function circle(lat, lng, cfg) {
    const marker = window.L.circleMarker([lat, lng], {
      radius: cfg.radius,
      color: "#ffffff",
      weight: cfg.title?.includes(".") ? 2 : 1,
      fillColor: cfg.color,
      fillOpacity: cfg.opacity ?? .82,
    }).bindPopup(`<strong>${esc(cfg.title)}</strong><span>${esc(cfg.kind || "")}</span><small>${esc(cfg.details || "")}</small>`);
    marker.addTo(cfg.pane);
    return marker;
  }
  function nearestParking(station) {
    if (station.lat == null || station.lng == null || !state.parkings.length) return null;
    let best = null, bestD = Infinity;
    for (const p of state.parkings) { const d = hav(station.lat, station.lng, p.lat, p.lng); if (d < bestD) { bestD = d; best = p; } }
    return bestD <= 80 ? best : null;
  }

  function point(x) {
    const lat = Number(x.lat ?? x.latitude), lng = Number(x.lng ?? x.lon ?? x.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    for (const c of [x.position, x.location, x.coordinates, x.coord, x.point, x.geo, x.last_position]) {
      if (!c) continue;
      if (Array.isArray(c) && c.length >= 2) { const a = Number(c[0]), b = Number(c[1]); if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a) <= 90 ? { lat: a, lng: b } : { lat: b, lng: a }; }
      if (Array.isArray(c.coordinates)) { const lng2 = Number(c.coordinates[0]), lat2 = Number(c.coordinates[1]); if (Number.isFinite(lat2) && Number.isFinite(lng2)) return { lat: lat2, lng: lng2 }; }
      const lat2 = Number(c.lat ?? c.latitude), lng2 = Number(c.lng ?? c.lon ?? c.longitude); if (Number.isFinite(lat2) && Number.isFinite(lng2)) return { lat: lat2, lng: lng2 };
    }
    return null;
  }

  function idleH(x) {
    const direct = num(x.idleHours ?? x.idle_hours ?? x.downtimeHours ?? x.downtime_hours ?? x.simple_hours ?? x.parkingHours); if (direct > 0) return direct;
    const sec = num(x.idleSeconds ?? x.idle_seconds ?? x.downtimeSeconds ?? x.downtime_seconds ?? x.simple ?? x.idle); if (sec > 0) return sec > 1000 ? sec / 3600 : sec;
    for (const k of ["lastRideAt", "last_ride_at", "lastTripAt", "last_trip_at", "lastMovementAt", "last_movement_at", "updatedAt", "updated_at", "positionAt", "position_at"]) { const v = x[k]; if (!v) continue; const d = new Date(v); if (!Number.isNaN(d.getTime())) return Math.max(0, (Date.now() - d.getTime()) / 36e5); }
    return 0;
  }

  function feat(lng, lat, props) { return { type: "Feature", geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] }, properties: props }; }
  function fc(features) { return { type: "FeatureCollection", features }; }
  function src(id, features) { const s = map.getSource(id); if (s) s.setData(fc(features)); }
  function popup(e) { const f = e.features?.[0]; if (!f) return; new window.maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<strong>${esc(f.properties.title)}</strong><span>${esc(f.properties.kind || "")}</span><small>${esc(f.properties.details || "")}</small>`).addTo(map); }
  function fitOnce(features) { if (!features.length || map.__fitDone) return; const b = new window.maplibregl.LngLatBounds(); features.slice(0, 30).forEach((f) => b.extend(f.geometry.coordinates)); if (!b.isEmpty()) { map.fitBounds(b, { padding: 58, maxZoom: 13.8, duration: 0 }); map.__fitDone = true; } }
  function status(text, error = false) { const el = document.querySelector("#liveStatusBox"); if (el) { el.textContent = text; el.classList.toggle("error", error); } }
  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function txt(v) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
  function norm(v) { return txt(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
  function num(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
  function bool(v) { return v === true || v === 1 || /^(true|1|yes|y|si|sí|monitor|priority|top)$/i.test(String(v ?? "").trim()); }
  function fmt(v) { return new Intl.NumberFormat("ru-RU").format(Number(v || 0)); }
  function signed(v) { return v > 0 ? `+${v}` : String(v || 0); }
  function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function hav(lat1, lng1, lat2, lng2) { const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r; const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2; return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
})();
