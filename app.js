(() => {
  "use strict";

  const CITY = "Belo Horizonte";
  const DB_NAME = "bh-parking-brain";
  const DB_VERSION = 1;
  const STORE_RIDES = "rides";
  const STORE_UPLOADS = "uploads";
  const STORE_META = "meta";
  const SETTINGS_KEY = "settings";
  const BH_BOUNDS = { minLat: -20.0231, maxLat: -19.8637, minLng: -44.0366, maxLng: -43.8691 };
  // Coordinate-only (GPS report) rentals from the ClickHouse export cover all of Brazil,
  // so acceptance is a country-wide box and each ride is labelled by the nearest city.
  const BRAZIL_BOUNDS = { minLat: -34.0, maxLat: 6.0, minLng: -74.5, maxLng: -33.0 };
  const BR_CITIES = [
    { n: "Belo Horizonte", lat: -19.92, lng: -43.94 }, { n: "São Paulo", lat: -23.55, lng: -46.63 },
    { n: "Campinas", lat: -22.90, lng: -47.06 }, { n: "Jundiaí", lat: -23.19, lng: -46.88 },
    { n: "Santos", lat: -23.96, lng: -46.33 }, { n: "Caraguatatuba", lat: -23.62, lng: -45.41 },
    { n: "Curitiba", lat: -25.43, lng: -49.27 }, { n: "Londrina", lat: -23.31, lng: -51.16 },
    { n: "Maringá", lat: -23.42, lng: -51.94 }, { n: "Ponta Grossa", lat: -25.09, lng: -50.16 },
    { n: "Belém", lat: -1.46, lng: -48.49 }, { n: "Salvador", lat: -12.97, lng: -38.51 },
    { n: "Ilhéus", lat: -14.79, lng: -39.03 }, { n: "Feira de Santana", lat: -12.27, lng: -38.97 },
    { n: "Porto Alegre", lat: -30.03, lng: -51.23 }, { n: "Natal", lat: -5.79, lng: -35.21 },
    { n: "Fortaleza", lat: -3.73, lng: -38.52 }, { n: "Aracaju", lat: -10.95, lng: -37.07 },
    { n: "Recife", lat: -8.05, lng: -34.88 }, { n: "Maceió", lat: -9.67, lng: -35.74 },
    { n: "Brasília", lat: -15.79, lng: -47.88 }, { n: "Vitória", lat: -20.32, lng: -40.34 },
    { n: "Itajaí", lat: -26.91, lng: -48.66 }, { n: "Balneário Camboriú", lat: -26.99, lng: -48.63 },
    { n: "Florianópolis", lat: -27.60, lng: -48.55 }, { n: "Campo Grande", lat: -20.46, lng: -54.62 },
  ];
  function pointInBrazil(point) {
    return Boolean(point
      && point.lat >= BRAZIL_BOUNDS.minLat && point.lat <= BRAZIL_BOUNDS.maxLat
      && point.lng >= BRAZIL_BOUNDS.minLng && point.lng <= BRAZIL_BOUNDS.maxLng);
  }
  function brazilCityForPoint(point) {
    if (!point) return "";
    let best = null, bestM = Infinity;
    for (const c of BR_CITIES) {
      const d = haversineMeters(point.lat, point.lng, c.lat, c.lng);
      if (d < bestM) { bestM = d; best = c; }
    }
    if (best && bestM <= 80000) return best.n;
    return `BR ${point.lat.toFixed(1)}, ${point.lng.toFixed(1)}`;
  }
  const PARKING_MATCH_RADIUS_M = 90;
  const RESOLVER_CELL_DEG = 0.001;
  const RESOLVER_CELL_RANGE = 2;
  const RIDE_WRITE_CHUNK_SIZE = 4000;
  const DEFAULT_WRITE_CHUNK_SIZE = 500;
  const MANAGERS_CATALOG_CSV_URL = "https://docs.google.com/spreadsheets/d/1_N_bOuh-EsrPBOa_MPG3_sWmscYsCthIlanZB49UDMc/gviz/tq?tqx=out:csv&sheet=Belo%20Horizonte";
  const LOCAL_CATALOG_URL = "./parking_catalog_bh.json";
  const CATALOG_FETCH_TIMEOUT_MS = 8000;
  const CAPACITY_MATCH_THRESHOLD = 0.84;
  const CAPACITY_LOW_CONFIDENCE_THRESHOLD = 0.68;
  const CAPACITY_DAY_SCHEDULE = "weekday-morning";
  const CAPACITY_EVENING_SCHEDULE = "weekday-evening";
  const CAPACITY_FRIDAY_DAY_SCHEDULE = "weekday-morning-friday";
  const CAPACITY_FRIDAY_EVENING_SCHEDULE = "weekday-evening-friday";
  const CAPACITY_WEEKEND_SCHEDULE = "weekend";
  const CAPACITY_OUTPUT_SCHEDULES = [
    CAPACITY_DAY_SCHEDULE,
    CAPACITY_EVENING_SCHEDULE,
    CAPACITY_FRIDAY_DAY_SCHEDULE,
    CAPACITY_FRIDAY_EVENING_SCHEDULE,
    CAPACITY_WEEKEND_SCHEDULE,
  ];

  const CAPACITY_CITY_OPTIONS = [
    { key: "maceio", name: "Maceio", uf: "AL", id: "66faae66cd18349215c90187" },
    { key: "belo-horizonte", name: "Belo Horizonte", uf: "MG", id: "690388c7ad28bbbf340407e0" },
    { key: "recife", name: "Recife", uf: "PE", id: "66faadb8cd18349215c874c4" },
    { key: "natal", name: "Natal", uf: "RN", id: "68b04f07be72115f4f51278a" },
    { key: "aracaju", name: "Aracaju", uf: "SE", id: "67d2d76c77471d68d3c4be6e" },
    { key: "ilheus", name: "Ilheus", uf: "BA", id: "694937516237fb6f62b7bdf5" },
    { key: "anchieta", name: "Anchieta", uf: "ES", id: "692aff853460cff7c27b1cc4" },
    { key: "salvador", name: "Salvador", uf: "BA", id: "6763d2ab7e6826ba04f4cafa" },
    { key: "guarapari", name: "Guarapari", uf: "ES", id: "68427ddd6a7c4e0a60fe3303" },
    { key: "vila-velha", name: "Vila Velha", uf: "ES", id: "661d34656172ab96d2cfb8a3" },
    { key: "belem", name: "Belem", uf: "PA", id: "68878e516923b6b7474e7bad" },
    { key: "fortaleza", name: "Fortaleza", uf: "CE", id: "66ee85c1a70885bbb9a4787a" },
    { key: "serra", name: "Serra", uf: "ES", id: "695fc08a2479703707152316" },
    { key: "curitiba", name: "Curitiba", uf: "PR", id: "655636e16e2c3042b5abbc9e" },
  ];
  const CAPACITY_CITY_STORAGE_KEY = "parkingBrainCapacityCities";
  const LOGISTIC_BASE = "https://logistic.gojet.app/api/v0/urent";
  const BUNDLED_PARKINGS_INDEX_URL = "./parkings/index.json";
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwI4vWqnNW4icATzMh1JLkeLGJg2mQNXSVGIAK_sRzmjO2DLV_Ba3QWB0V7QpCmxsVPtw/exec";
  const APPS_SCRIPT_PROXY_URL = "/.netlify/functions/apps-script";
  const APPS_SCRIPT_TOKEN_KEY = "parkingBrainAppsScriptToken";
  const APPS_SCRIPT_USER_KEY = "parkingBrainAppsScriptUser";
  const CAPACITY_PARKINGS_CACHE_PREFIX = "parkingBrainAllParkings:";
  let goJetCityMapPromise = null;
  let goJetCityMap = new Map();

  const CAPACITY_PERIOD_LIMIT_FIELDS = {
    weekdayDay: "limitWeekdayDay",
    weekdayEvening: "limitWeekdayEvening",
    fridayDay: "limitFridayDay",
    fridayEvening: "limitFridayEvening",
    weekend: "limitWeekend",
  };
  // Which parking capacity field each period ranks/limits on.
  const CAPACITY_PERIOD_TARGET_FIELDS = {
    weekdayDay: "targetDay",
    weekdayEvening: "targetEvening",
    fridayDay: "targetFridayDay",
    fridayEvening: "targetFridayEvening",
    weekend: "targetWeekend",
  };

  const defaults = {
    lookbackDays: 21,
    leadMinutes: 45,
    minRides: 3,
    topLimit: 24,
    capacityWindow: 12,
    capacityCeiling: 15,
    monitorParkingLimit: "all",
    monitorPeriodLimits: {
      weekdayDay: "same",
      weekdayEvening: "same",
      fridayDay: "same",
      fridayEvening: "same",
      weekend: "same",
    },
    planMode: "now",
  };

  const state = {
    db: null,
    rides: [],
    uploads: [],
    settings: { ...defaults },
    catalogPoints: [],
    analysis: null,
    search: "",
    capacity: {
      sourceRows: [],
      sourceFileName: "",
      monitorRows: [],
      monitorFile: null,
      monitorFileName: "",
      weekendRows: [],
      weekendFileName: "",
      comparison: null,
      generated: null,
      selectedCityKey: "belo-horizonte",
      selectedCityId: "690388c7ad28bbbf340407e0",
      selectedCityName: "Belo Horizonte",
      allParkings: [],
      allParkingsSource: "",
      monitorRulesSource: "",
      autoRental: null,
      manualCaps: loadManualCaps(),
    },
  };

  // Manual capacity overrides per parking (name-key -> capacity). Persisted so
  // they survive reloads; applied in buildRentalCapacityRows and the export.
  function loadManualCaps() {
    try { return JSON.parse(localStorage.getItem("capacityManualCaps") || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveManualCaps() {
    try { localStorage.setItem("capacityManualCaps", JSON.stringify(state.capacity.manualCaps || {})); }
    catch (e) {}
  }
  // Overrides are keyed by the normalized parking NAME so the preview row and the
  // internal build row always resolve to the same slot (internal parking keys can
  // differ between start/end events, which broke a key-based match).
  function manualCapFor(name) {
    const m = state.capacity && state.capacity.manualCaps;
    if (!m || !name) return undefined;
    const v = m[capacityNameKey(name)];
    return (Number.isFinite(v) && v >= 0) ? v : undefined;
  }

  const monthMap = new Map([
    ["янв", 0], ["январ", 0],
    ["фев", 1], ["феврал", 1],
    ["мар", 2], ["март", 2],
    ["апр", 3], ["апрел", 3],
    ["май", 4], ["мая", 4],
    ["июн", 5], ["июн", 5],
    ["июл", 6], ["июл", 6],
    ["авг", 7], ["август", 7],
    ["сен", 8], ["сент", 8], ["сентябр", 8],
    ["окт", 9], ["октябр", 9],
    ["ноя", 10], ["ноябр", 10],
    ["дек", 11], ["декабр", 11],
  ]);

  const els = {};
  let saveQueue = Promise.resolve();

  document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    bindElements();
    bindEvents();
    initCapacityCities();
    void loadBundledCityIndex().catch((err) => console.warn("Bundled parking index load failed", err));
    setStatus("warn", "Загрузка истории");
    try {
      const catalogPromise = loadManagersParkingCatalog().catch((err) => {
        console.warn("Managers Map catalog load failed", err);
        return [];
      });
      state.db = await openDatabase();
      await loadState();
      state.catalogPoints = await catalogPromise;
      renderSettings();
      recompute();
      const catalogText = state.catalogPoints.length ? ` · ${state.catalogPoints.length} парковок` : "";
      setStatus(state.rides.length ? "ok" : "warn", `${state.rides.length ? "Мозг готов" : "История пустая"}${catalogText}`);
    } catch (err) {
      console.error(err);
      setStatus("bad", "Ошибка базы");
      toast(`Ошибка базы браузера: ${err.message}`, true);
    }
    renderIcons();
  }

  function bindElements() {
    [
      "statusPill", "statusText", "refreshBtn", "dropZone", "fileInput", "uploadBtn",
      "lastUploadText", "lookbackDays", "leadMinutes", "minRides", "topLimit", "monitorParkingLimit",
      "limitWeekdayDay", "limitWeekdayEvening", "limitFridayDay", "limitFridayEvening", "limitWeekend", "capacityZoneFilter",
      "capacityWindow", "capacityWindowValue", "capacityCeiling",
      "lookbackValue", "leadValue", "minRidesValue", "topLimitValue",
      "exportHistoryBtn", "importHistoryBtn", "historyInput", "exportCsvBtn", "clearBtn",
      "uploadCount", "uploadList", "kpiRides", "kpiParkings", "kpiDays", "kpiConfidence",
      "planSubtext", "planList", "topSubtext", "topTable", "searchInput", "hourChart", "donorList",
      "capacityCitySelect", "capacityCityId", "allParkingsBtn", "monitorRulesBtn", "gojetParkingsBtn", "gojetParkingsInput", "appsScriptUser", "appsScriptPass", "appsScriptLoginBtn", "appsScriptStatus",
      "capacityUploadBtn", "capacityInput", "monitorCapacityBtn", "monitorCapacityInput", "weekendCapacityBtn", "weekendCapacityInput",
      "capacityExportBtn", "monitorUpdateExportBtn", "capacityStatusText", "capacityKpiSource", "capacityKpiMatched",
      "capacityKpiMissing", "capacityKpiProblems", "capacityKpiGenerated", "capacityMissingList", "capacityMismatchTable",
      "rentalAutoCapacityBtn", "autoCapacitySummary", "monitorSuggestionList",
      "capacityPreview", "capacityPreviewInfo", "capacityPreviewSearch", "capacityPreviewSort",
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els.uploadBtn.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (files.length) await importRentalFiles(files);
    });

    ["dragenter", "dragover"].forEach((type) => {
      els.dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        els.dropZone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((type) => {
      els.dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove("dragover");
      });
    });
    els.dropZone.addEventListener("drop", async (event) => {
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length) await importRentalFiles(files);
    });

    [
      ["lookbackDays", "lookbackDays", "lookbackValue"],
      ["leadMinutes", "leadMinutes", "leadValue"],
      ["minRides", "minRides", "minRidesValue"],
      ["topLimit", "topLimit", "topLimitValue"],
    ].forEach(([id, key, valueId]) => {
      els[id].addEventListener("input", () => {
        state.settings[key] = Number(els[id].value);
        els[valueId].textContent = state.settings[key];
        persistSettingsSoon();
        recompute();
      });
    });

    document.querySelectorAll("[data-plan-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.settings.planMode = button.dataset.planMode;
        document.querySelectorAll("[data-plan-mode]").forEach((b) => b.classList.toggle("active", b === button));
        persistSettingsSoon();
        renderPlan();
      });
    });

    els.searchInput.addEventListener("input", () => {
      state.search = normalizeSearch(els.searchInput.value);
      renderTopTable();
    });

    els.refreshBtn.addEventListener("click", () => {
      recompute();
      toast("Расчет обновлен");
    });
    els.exportHistoryBtn.addEventListener("click", exportHistory);
    els.importHistoryBtn.addEventListener("click", () => els.historyInput.click());
    els.historyInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) await importHistory(file);
    });
    els.exportCsvBtn.addEventListener("click", exportPlanCsv);

    els.capacityCitySelect?.addEventListener("change", () => {
      const option = capacityCityByKey(els.capacityCitySelect.value) || CAPACITY_CITY_OPTIONS[1];
      setSelectedCapacityCity(option, { clearLoaded: true });
      recomputeCapacityCompare();
      renderCapacityCompare();
    });
    els.capacityCityId?.addEventListener("change", () => {
      state.capacity.selectedCityId = cleanText(els.capacityCityId.value);
      rememberCityId(state.capacity.selectedCityKey, state.capacity.selectedCityId);
      renderCapacityCompare();
    });
    els.allParkingsBtn?.addEventListener("click", loadSelectedCityParkings);
    els.monitorRulesBtn?.addEventListener("click", loadSelectedCityMonitorRules);
    els.gojetParkingsBtn?.addEventListener("click", () => els.gojetParkingsInput?.click());
    els.gojetParkingsInput?.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) await importGoJetParkingsFile(file);
    });
    els.monitorParkingLimit?.addEventListener("change", () => {
      state.settings.monitorParkingLimit = cleanText(els.monitorParkingLimit.value) || "all";
      persistSettingsSoon();
      rebuildRentalCapacityRows();
    });
    Object.entries(CAPACITY_PERIOD_LIMIT_FIELDS).forEach(([period, id]) => {
      els[id]?.addEventListener("change", () => {
        state.settings.monitorPeriodLimits = { ...defaults.monitorPeriodLimits, ...(state.settings.monitorPeriodLimits || {}) };
        state.settings.monitorPeriodLimits[period] = cleanText(els[id].value) || "same";
        persistSettingsSoon();
        rebuildRentalCapacityRows();
      });
    });
    els.capacityZoneFilter?.addEventListener("change", () => {
      state.capacity.zoneFilter = Array.from(els.capacityZoneFilter.selectedOptions).map((o) => o.value);
      rebuildRentalCapacityRows();
    });
    els.capacityWindow?.addEventListener("input", () => {
      state.settings.capacityWindow = clamp(Number(els.capacityWindow.value) || 12, 2, 12);
      if (els.capacityWindowValue) els.capacityWindowValue.textContent = state.settings.capacityWindow;
      persistSettingsSoon();
      rebuildRentalCapacityRows();
    });
    els.capacityCeiling?.addEventListener("change", () => {
      const raw = els.capacityCeiling.value.trim();
      state.settings.capacityCeiling = raw === "" ? null : Math.max(0, Math.round(Number(raw)) || 0);
      persistSettingsSoon();
      rebuildRentalCapacityRows();
    });
    els.capacityPreviewSearch?.addEventListener("input", (e) => { capPreviewSearch = e.target.value; renderCapacityPreview(); });
    els.capacityPreviewSort?.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-sort]");
      if (!b) return;
      capPreviewSort = b.dataset.sort;
      els.capacityPreviewSort.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      renderCapacityPreview();
    });
    // Manual capacity override typed straight into the preview table.
    els.capacityPreview?.addEventListener("change", (e) => {
      const inp = e.target.closest("input.capman");
      if (!inp) return;
      const key = inp.dataset.key;
      if (!key) return;
      state.capacity.manualCaps = state.capacity.manualCaps || {};
      const raw = inp.value.trim();
      if (raw === "") {
        delete state.capacity.manualCaps[key];
      } else {
        const v = Math.max(0, Math.round(Number(raw)));
        if (!Number.isFinite(v)) { inp.value = ""; return; }
        state.capacity.manualCaps[key] = v;
      }
      saveManualCaps();
      rebuildRentalCapacityRows();
      toast(raw === "" ? "Ручной capacity снят" : `Ручной capacity: ${Math.max(0, Math.round(Number(raw)))}`);
    });
    els.appsScriptLoginBtn?.addEventListener("click", loginAppsScriptBridge);

    els.capacityUploadBtn?.addEventListener("click", () => els.capacityInput.click());
    els.capacityInput?.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) await importCapacityCsv(file);
    });
    els.monitorCapacityBtn?.addEventListener("click", () => els.monitorCapacityInput.click());
    els.monitorCapacityInput?.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) await importMonitorCapacityCsv(file);
    });
    els.weekendCapacityBtn?.addEventListener("click", () => els.weekendCapacityInput.click());
    els.weekendCapacityInput?.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) await importWeekendCapacityCsv(file);
    });
    els.capacityExportBtn?.addEventListener("click", exportCapacityCompareCsv);
    els.monitorUpdateExportBtn?.addEventListener("click", exportUpdatedMonitorCsv);
    els.rentalAutoCapacityBtn?.addEventListener("click", () => prepareMonitorFromRentalHistory({ auto: false }));
    window.addEventListener("bh-live-monitor-updated", () => {
      recomputeCapacityCompare();
      renderCapacityCompare();
    });
    els.clearBtn.addEventListener("click", clearHistory);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_RIDES)) {
          const rides = db.createObjectStore(STORE_RIDES, { keyPath: "id" });
          rides.createIndex("dateKey", "dateKey", { unique: false });
          rides.createIndex("parkingKey", "parkingKey", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_UPLOADS)) {
          db.createObjectStore(STORE_UPLOADS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      };
    });
  }

  function tx(storeName, mode = "readonly") {
    return state.db.transaction(storeName, mode).objectStore(storeName);
  }

  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const request = tx(storeName).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  function getMeta(key) {
    return new Promise((resolve, reject) => {
      const request = tx(STORE_META).get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
    });
  }

  function putMeta(key, value) {
    return new Promise((resolve, reject) => {
      const request = tx(STORE_META, "readwrite").put({ key, value });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async function putMany(storeName, items) {
    if (!items.length) return;
    const chunkSize = storeName === STORE_RIDES ? RIDE_WRITE_CHUNK_SIZE : DEFAULT_WRITE_CHUNK_SIZE;
    for (let index = 0; index < items.length; index += chunkSize) {
      const chunk = items.slice(index, index + chunkSize);
      await putManyChunk(storeName, chunk);
      if (storeName === STORE_RIDES && items.length > chunkSize) {
        setStatus("warn", `\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u044e ${fmtInt(Math.min(index + chunk.length, items.length))}/${fmtInt(items.length)}`);
      }
      await yieldToBrowser();
    }
  }

  function putManyChunk(storeName, items) {
    return new Promise((resolve, reject) => {
      const transaction = state.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      items.forEach((item) => store.put(item));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const request = tx(storeName, "readwrite").clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  function normalizeSettings(incoming) {
    const src = incoming || {};
    return {
      ...defaults,
      ...src,
      monitorPeriodLimits: { ...defaults.monitorPeriodLimits, ...(src.monitorPeriodLimits || {}) },
    };
  }

  async function loadState() {
    const [rides, uploads, settings] = await Promise.all([
      getAll(STORE_RIDES),
      getAll(STORE_UPLOADS),
      getMeta(SETTINGS_KEY),
    ]);
    state.rides = rides;
    state.uploads = uploads.sort((a, b) => b.importedAt - a.importedAt);
    state.settings = normalizeSettings(settings);
  }

  let settingsTimer = null;
  function persistSettingsSoon() {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => putMeta(SETTINGS_KEY, state.settings).catch(console.error), 180);
  }

  function renderSettings() {
    els.lookbackDays.value = state.settings.lookbackDays;
    els.leadMinutes.value = state.settings.leadMinutes;
    els.minRides.value = state.settings.minRides;
    els.topLimit.value = state.settings.topLimit;
    els.lookbackValue.textContent = state.settings.lookbackDays;
    els.leadValue.textContent = state.settings.leadMinutes;
    els.minRidesValue.textContent = state.settings.minRides;
    els.topLimitValue.textContent = state.settings.topLimit;
    if (els.monitorParkingLimit) els.monitorParkingLimit.value = state.settings.monitorParkingLimit || "all";
    Object.entries(CAPACITY_PERIOD_LIMIT_FIELDS).forEach(([period, id]) => {
      if (els[id]) els[id].value = state.settings.monitorPeriodLimits?.[period] || "same";
    });
    if (els.capacityWindow) els.capacityWindow.value = state.settings.capacityWindow || 12;
    if (els.capacityWindowValue) els.capacityWindowValue.textContent = state.settings.capacityWindow || 12;
    if (els.capacityCeiling) els.capacityCeiling.value = (state.settings.capacityCeiling == null ? "" : state.settings.capacityCeiling);
    document.querySelectorAll("[data-plan-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.planMode === state.settings.planMode);
    });
  }

  async function importRentalFiles(files) {
    if (!window.XLSX) {
      toast("XLSX parser не загрузился. Открой сайт с интернетом или обнови страницу.", true);
      setStatus("bad", "Нет XLSX parser");
      return;
    }

    setStatus("warn", "Читаю файл");
    const existing = new Set(state.rides.map((ride) => ride.id));
    const allNew = [];
    const uploadRows = [];

    for (const file of files) {
      try {
        const parsed = await parseRentalFile(file, existing);
        parsed.rides.forEach((ride) => existing.add(ride.id));
        for (const r of parsed.rides) allNew.push(r);
        uploadRows.push(parsed.upload);
        toast(`${file.name}: добавлено ${parsed.upload.newRides}, ${parsed.upload.cityName || activeCityName()} строк ${parsed.upload.cityRows}`);
      } catch (err) {
        console.error(err);
        toast(`${file.name}: ${err.message}`, true);
      }
    }

    if (allNew.length || uploadRows.length) {
      for (const r of allNew) state.rides.push(r);
      state.uploads = [...uploadRows, ...state.uploads].sort((a, b) => b.importedAt - a.importedAt);
      recompute();
      setStatus("warn", `\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u043e ${fmtInt(allNew.length)} \u00b7 \u0441\u0447\u0438\u0442\u0430\u044e capacity`);
      void saveImportedRows(allNew, uploadRows);
      void prepareMonitorFromRentalHistory({ auto: true });
    } else {
      setStatus(state.rides.length ? "ok" : "warn", state.rides.length ? "Мозг готов" : "История пустая");
    }
  }

  function saveImportedRows(rides, uploads) {
    saveQueue = saveQueue.then(async () => {
      try {
        await putMany(STORE_RIDES, rides);
        await putMany(STORE_UPLOADS, uploads);
        setStatus("ok", `\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e ${fmtInt(rides.length)}`);
      } catch (err) {
        console.error(err);
        toast(`\u041d\u0435 \u0441\u043c\u043e\u0433 \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u0441\u0442\u043e\u0440\u0438\u044e: ${err.message}`, true);
        setStatus("bad", "\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f");
      }
    });
    return saveQueue;
  }

  async function parseRentalFile(file, existingIds) {
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = pickSheet(workbook);
    if (!sheetName) throw new Error("sheet not found");
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    const normalizedRows = rows.map((row) => normalizeRow(row));
    const importCityName = detectImportCityName(normalizedRows);
    const importCity = ensureCapacityCityOption(importCityName);
    setSelectedCapacityCity(importCity, { clearLoaded: true });

    const rides = [];
    let cityRows = 0;
    let ignoredRows = 0;
    let duplicateRows = 0;
    let parkingRows = 0;

    normalizedRows.forEach((normalized, rowIndex) => {
      const city = cleanText(normalized["\u0413\u043e\u0440\u043e\u0434"] || normalized.City || normalized.city);
      const gpsReport = isGpsReportRow(normalized);
      if (city && !sameCity(city, importCity.name)) return;
      if (!city && !gpsReport) return;
      cityRows += 1;

      const ride = extractRide(normalized, file.name, rowIndex + 2, importCity.name);
      if (!ride) {
        ignoredRows += 1;
        return;
      }
      if (ride.isParkingSignal) parkingRows += 1;
      if (existingIds.has(ride.id)) {
        duplicateRows += 1;
        return;
      }
      rides.push(ride);
    });

    // A coordinate-only file spans many cities: register every city found and land
    // the operator on the busiest one so data shows up immediately after import.
    const cityCounts = new Map();
    rides.forEach((r) => { if (r.city) cityCounts.set(r.city, (cityCounts.get(r.city) || 0) + 1); });
    if (cityCounts.size > 1) {
      cityCounts.forEach((_cnt, name) => ensureCapacityCityOption(name));
      let topCity = importCity.name, topN = -1;
      cityCounts.forEach((cnt, name) => { if (cnt > topN) { topN = cnt; topCity = name; } });
      setSelectedCapacityCity(ensureCapacityCityOption(topCity), { clearLoaded: false });
    }

    const importedAt = Date.now();
    const upload = {
      id: `${importedAt}-${hashText(file.name)}-${Math.random().toString(16).slice(2)}`,
      fileName: file.name,
      sheetName,
      importedAt,
      totalRows: rows.length,
      cityName: importCity.name,
      cityRows,
      parkingRows,
      newRides: rides.length,
      duplicateRows,
      ignoredRows,
    };

    return { rides, upload };
  }

  function pickSheet(workbook) {
    return workbook.SheetNames.find((name) => normalizeSearch(name).includes("аренд"))
      || workbook.SheetNames[0];
  }

  function normalizeRow(row) {
    const out = {};
    Object.entries(row).forEach(([key, value]) => {
      out[cleanText(key)] = value;
    });
    return out;
  }


  function isGpsReportRow(row) {
    const start = coordsFromLatLng(row["Start_Latitude"], row["Start_Longitude"]);
    const end = coordsFromLatLng(row["End_Latitude"], row["End_Longitude"]);
    return Boolean(row["OrderId"] && row["QR"] && row["\u0414\u0430\u0442\u0430 \u0438 \u0432\u0440\u0435\u043c\u044f \u0441\u0442\u0430\u0440\u0442\u0430"] && start && end && (pointInBrazil(start) || pointInBrazil(end)));
  }

  function extractGpsReportRide(row, fileName, rowNumber, fallbackCity = activeCityName()) {
    const startCoords = coordsFromLatLng(row["Start_Latitude"], row["Start_Longitude"]);
    const endCoords = coordsFromLatLng(row["End_Latitude"], row["End_Longitude"]);
    if (!startCoords || !endCoords || (!pointInBrazil(startCoords) && !pointInBrazil(endCoords))) return null;

    const startAt = parseReportDateTime(row["\u0414\u0430\u0442\u0430 \u0438 \u0432\u0440\u0435\u043c\u044f \u0441\u0442\u0430\u0440\u0442\u0430"]);
    if (!startAt) return null;
    const endAt = parseReportDateTime(row["\u0414\u0430\u0442\u0430 \u0438 \u0432\u0440\u0435\u043c\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f"]);
    const scooter = cleanText(row["QR"]);
    const idRaw = cleanText(row["OrderId"]);
    const fallbackId = hashText(`${fileName}|${rowNumber}|${startAt.getTime()}|${scooter}|${startCoords.lat}|${startCoords.lng}`);
    const parkingName = fallbackGpsName(startCoords);
    const endName = fallbackGpsName(endCoords);

    return {
      id: idRaw || `gps-${fallbackId}`,
      city: brazilCityForPoint(startCoords) || brazilCityForPoint(endCoords) || fallbackCity || activeCityName(),
      fileName,
      rowNumber,
      sourceType: "gps-report",
      needsNameResolution: true,
      ts: startAt.getTime(),
      dateKey: toDateKey(startAt),
      weekday: startAt.getDay(),
      hour: startAt.getHours(),
      parkingName,
      parkingKey: normalizeSearch(parkingName),
      endName,
      endKey: normalizeSearch(endName),
      isParkingSignal: true,
      scooter,
      qr: scooter,
      tariff: "GPS report",
      durationSec: toNumber(row["\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u0432 \u043c\u0438\u043d\u0443\u0442\u0430\u0445"]) * 60,
      distanceM: toNumber(row["\u0414\u0438\u0441\u0442\u0430\u043d\u0446\u0438\u044f"]) * 1000,
      revenue: 0,
      startLat: startCoords.lat,
      startLng: startCoords.lng,
      endLat: endCoords.lat,
      endLng: endCoords.lng,
      endTs: endAt ? endAt.getTime() : null,
      endDateKey: endAt ? toDateKey(endAt) : null,
      endWeekday: endAt ? endAt.getDay() : null,
      endHour: endAt ? endAt.getHours() : null,
    };
  }

  function coordsFromLatLng(latValue, lngValue) {
    const lat = toNumber(latValue);
    const lng = toNumber(lngValue);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;
    return { lat, lng };
  }

  function pointInBh(point) {
    return Boolean(point
      && point.lat >= BH_BOUNDS.minLat && point.lat <= BH_BOUNDS.maxLat
      && point.lng >= BH_BOUNDS.minLng && point.lng <= BH_BOUNDS.maxLng);
  }

  function fallbackGpsName(point) {
    return `GPS ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
  }

  function parseReportDateTime(value) {
    const text = cleanText(value);
    if (!text) return null;
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const utcHour = Number(match[4]) - 6; // report is +03:00; Belo Horizonte is UTC-3.
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), utcHour, Number(match[5]), Number(match[6] || 0), 0);
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  async function loadManagersParkingCatalog() {
    const exact = await loadCatalogFromJsonUrl(LOCAL_CATALOG_URL).catch((err) => {
      console.warn("Local parking catalog unavailable", err);
      return [];
    });
    if (exact.length) return exact;

    return loadCatalogFromCsvUrl(MANAGERS_CATALOG_CSV_URL).catch((err) => {
      console.warn("Managers Map CSV unavailable", err);
      return [];
    });
  }

  async function loadCatalogFromCsvUrl(url) {
    const text = await fetchTextWithTimeout(url, CATALOG_FETCH_TIMEOUT_MS);
    return normalizeCatalogRows(parseCsvRows(text));
  }

  async function loadCatalogFromJsonUrl(url) {
    const text = await fetchTextWithTimeout(url, CATALOG_FETCH_TIMEOUT_MS);
    const data = JSON.parse(text);
    return normalizeCatalogRows(Array.isArray(data) ? data : data.parkings || data.entries || []);
  }

  async function fetchTextWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeCatalogRows(rows) {
    const byPoint = new Map();
    rows.forEach((row) => {
      const name = cleanText(row.hotspot_name || row.name || row.parkingName || row.title);
      const lat = toNumber(row.lat ?? row.latitude);
      const lng = toNumber(row.lon ?? row.lng ?? row.longitude);
      const point = { lat, lng };
      if (!isUsableParking(name) || !pointInBh(point)) return;

      const catalogPoint = {
        id: cleanText(row.id),
        name,
        key: normalizeSearch(name),
        lat,
        lng,
        radius: toNumber(row.radius),
        customRadius: toNumber(row.customRadius ?? row.custom_radius),
        monitor: typeof row.monitor === "boolean" ? row.monitor : null,
        bikesCount: toNumber(row.bikesCount ?? row.bikes_count),
        expectedBikesCount: toNumber(row.expectedBikesCount ?? row.expected_bikes_count),
        targetBikesCount: toNumber(row.targetBikesCount ?? row.target_bikes_count),
        capacity: row.capacity ?? null,
        pins: toNumber(row.pins),
        starts: toNumber(row.starts),
        delta: toNumber(row.delta),
        dayType: cleanText(row.day_type || row.dayType),
        method: cleanText(row.match_method || row.method),
        source: cleanText(row.source) || "managers-map",
      };
      const id = catalogPoint.id || `${catalogPoint.key}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
      const current = byPoint.get(id);
      const currentWeight = current ? (current.pins || current.bikesCount || 0) : -1;
      const nextWeight = catalogPoint.pins || catalogPoint.bikesCount || 0;
      if (!current || nextWeight >= currentWeight) byPoint.set(id, catalogPoint);
    });
    return [...byPoint.values()];
  }

  function parseCsvRows(text) {
    const matrix = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell);
        matrix.push(row);
        row = [];
        cell = "";
      } else if (char !== "\r") {
        cell += char;
      }
    }

    if (cell || row.length) {
      row.push(cell);
      matrix.push(row);
    }

    const headers = (matrix.shift() || []).map((header) => cleanText(header));
    return matrix
      .filter((items) => items.some((item) => cleanText(item)))
      .map((items) => {
        const out = {};
        headers.forEach((header, index) => {
          out[header] = items[index] ?? "";
        });
        return out;
      });
  }
  function buildParkingResolver(rides) {
    const points = [];
    const seen = new Set();
    const addPoint = (name, lat, lng, extra = {}) => {
      if (lat == null || lng == null) return;
      if (!isUsableParking(name)) return;
      const key = normalizeSearch(name);
      const pointKey = `${extra.id || key}|${Number(lat).toFixed(5)}|${Number(lng).toFixed(5)}`;
      if (seen.has(pointKey)) return;
      seen.add(pointKey);
      points.push({ name, key, lat: Number(lat), lng: Number(lng), ...extra });
    };

    (state.catalogPoints || []).forEach((point) => {
      addPoint(point.name, point.lat, point.lng, point);
    });

    rides.forEach((ride) => {
      if (!ride) return;
      // Seed from any endpoint that already carries a real parking name. Manual files
      // name the START but leave the END as a zone/coords — without this the named
      // start parkings never enter the resolver, so end coordinates can't snap back to
      // them and every parking shows 0 returns. addPoint ignores GPS-fallback names and
      // null coords, so coordinate-only (GPS report) rides are unaffected.
      addPoint(ride.parkingName, ride.startLat, ride.startLng);
      addPoint(ride.endName, ride.endLat, ride.endLng);
    });
    return buildResolverIndex(points);
  }

  function buildResolverIndex(points) {
    const grid = new Map();
    points.forEach((point) => {
      const gx = Math.floor(point.lat / RESOLVER_CELL_DEG);
      const gy = Math.floor(point.lng / RESOLVER_CELL_DEG);
      const cellKey = `${gx}|${gy}`;
      if (!grid.has(cellKey)) grid.set(cellKey, []);
      grid.get(cellKey).push(point);
    });
    return {
      points,
      grid,
      length: points.length,
      cellDeg: RESOLVER_CELL_DEG,
      cache: new Map(),
    };
  }

  function resolveRideParking(ride, resolver) {
    if (!ride || !ride.needsNameResolution || ride.startLat == null || ride.startLng == null || !resolver.length) return ride;
    const nearest = nearestParkingPoint(Number(ride.startLat), Number(ride.startLng), resolver);
    if (!nearest) return ride;
    return {
      ...ride,
      parkingName: nearest.name,
      parkingKey: nearest.key,
      resolvedParkingName: nearest.name,
      resolvedDistanceM: Math.round(nearest.distanceM),
      catalogId: nearest.id || null,
      monitor: typeof nearest.monitor === "boolean" ? nearest.monitor : null,
    };
  }

  function resolveRideEndParking(ride, resolver) {
    if (!ride || !ride.needsNameResolution || ride.endLat == null || ride.endLng == null || !resolver.length) return ride;
    const nearest = nearestParkingPoint(Number(ride.endLat), Number(ride.endLng), resolver);
    if (!nearest) return ride;
    return {
      ...ride,
      endName: nearest.name,
      endKey: nearest.key,
      resolvedEndName: nearest.name,
      resolvedEndDistanceM: Math.round(nearest.distanceM),
      endCatalogId: nearest.id || null,
    };
  }

  function haversineMeters(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function nearestParkingPoint(lat, lng, resolver) {
    const points = Array.isArray(resolver) ? resolver : resolver?.points || [];
    if (!points.length) return null;
    const cacheKey = !Array.isArray(resolver) && resolver.cache ? `${lat.toFixed(5)}|${lng.toFixed(5)}` : "";
    if (cacheKey && resolver.cache.has(cacheKey)) return resolver.cache.get(cacheKey);
    const candidates = resolverCandidates(lat, lng, resolver);
    let best = null;
    let bestDistance = Infinity;
    candidates.forEach((point) => {
      const distance = haversineMeters(lat, lng, point.lat, point.lng);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    });
    const result = best && bestDistance <= PARKING_MATCH_RADIUS_M ? { ...best, distanceM: bestDistance } : null;
    if (cacheKey) resolver.cache.set(cacheKey, result);
    return result;
  }

  function resolverCandidates(lat, lng, resolver) {
    if (Array.isArray(resolver) || !resolver?.grid) return Array.isArray(resolver) ? resolver : resolver?.points || [];
    const gx = Math.floor(lat / resolver.cellDeg);
    const gy = Math.floor(lng / resolver.cellDeg);
    const candidates = [];
    for (let dx = -RESOLVER_CELL_RANGE; dx <= RESOLVER_CELL_RANGE; dx += 1) {
      for (let dy = -RESOLVER_CELL_RANGE; dy <= RESOLVER_CELL_RANGE; dy += 1) {
        const cell = resolver.grid.get(`${gx + dx}|${gy + dy}`);
        if (cell) candidates.push(...cell);
      }
    }
    return candidates;
  }



  function firstCoords(row, keys) {
    for (const key of keys) {
      const coords = parseCoords(row[key]);
      if (coords && pointInBh(coords)) return coords;
    }
    return null;
  }

  function parseCombinedDateTime(value) {
    const text = cleanText(value);
    if (!text) return null;
    let match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\D+)(\d{1,2})[:.](\d{2})(?::(\d{2}))?/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      return new Date(year, month, day, Number(match[4]), Number(match[5]), Number(match[6] || 0), 0);
    }
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D+)(\d{1,2})[:.](\d{2})(?::(\d{2}))?/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0), 0);
    }
    return null;
  }

  function parseDurationSeconds(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    const text = cleanText(value);
    if (!text) return 0;
    const hms = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3] || 0);
    return Math.round(toNumber(text));
  }

  function rideRevenue(row) {
    const direct = toMoneyNumber(firstValue(row, ["\u0418\u0442\u043e\u0433", "\u0418\u0442\u043e\u0433\u043e"]));
    if (direct) return direct;
    return toMoneyNumber(row["\u0421\u043f\u0438\u0441\u0430\u043d\u043e \u0431\u0430\u043b\u043b\u043e\u0432"])
      + toMoneyNumber(row["\u0421\u043f\u0438\u0441\u0430\u043d\u043e \u043d\u0430\u043b\u0438\u0447\u043d\u044b\u043c\u0438"])
      + toMoneyNumber(row["\u0410\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u044f"])
      + toMoneyNumber(row["\u0421\u0442\u0440\u0430\u0445\u043e\u0432\u043a\u0430"]);
  }

  function toMoneyNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = cleanText(value).replace(/[^\d,.-]/g, "").replace(",", ".");
    if (!text) return 0;
    const num = Number(text);
    return Number.isFinite(num) ? num : 0;
  }

  function extractRide(row, fileName, rowNumber, fallbackCity = activeCityName()) {
    if (isGpsReportRow(row)) return extractGpsReportRide(row, fileName, rowNumber, fallbackCity);
    const startNameRaw = firstValue(row, [
      "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043f\u0430\u0432\u0435\u0440\u0441\u0442\u0430\u043d\u0446\u0438\u0438 \u043d\u0430\u0447\u0430\u043b\u0430",
      "\u0417\u043e\u043d\u0430 \u043d\u0430\u0447\u0430\u043b\u0430 \u0430\u0440\u0435\u043d\u0434\u044b",
      "\u0422\u0430\u0440\u0438\u0444\u043d\u0430\u044f \u0437\u043e\u043d\u0430 \u0430\u0440\u0435\u043d\u0434\u044b",
      "\u041d\u0430\u0447\u0430\u043b\u043e \u0430\u0440\u0435\u043d\u0434\u044b",
    ]);
    const endNameRaw = firstValue(row, [
      "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043f\u0430\u0432\u0435\u0440\u0441\u0442\u0430\u043d\u0446\u0438\u0438 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f",
      "\u0417\u043e\u043d\u044b \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f \u0430\u0440\u0435\u043d\u0434\u044b",
      "\u0417\u043e\u043d\u044b \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f",
      "\u0422\u0435\u0445. \u0437\u043e\u043d\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f",
      "\u0422\u0435\u0445.\u0437\u043e\u043d\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f",
    ]);
    const startAt = parseDateTime(
      firstValue(row, ["\u0414\u0430\u0442\u0430 \u043d\u0430\u0447\u0430\u043b\u0430 \u0430\u0440\u0435\u043d\u0434\u044b", "\u0414\u0430\u0442\u0430 \u043d\u0430\u0447\u0430\u043b\u0430"]),
      firstValue(row, ["\u0412\u0440\u0435\u043c\u044f \u043d\u0430\u0447\u0430\u043b\u0430 \u0430\u0440\u0435\u043d\u0434\u044b", "\u0412\u0440\u0435\u043c\u044f \u043d\u0430\u0447\u0430\u043b\u0430"])
    );
    if (!startAt) return null;
    const endAt = parseDateTime(
      firstValue(row, ["\u0414\u0430\u0442\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f \u0430\u0440\u0435\u043d\u0434\u044b", "\u0414\u0430\u0442\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f", "\u0414\u0430\u0442\u0430 \u043a\u043e\u043d\u0446\u0430"]),
      firstValue(row, ["\u0412\u0440\u0435\u043c\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f \u0430\u0440\u0435\u043d\u0434\u044b", "\u0412\u0440\u0435\u043c\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f", "\u0412\u0440\u0435\u043c\u044f \u043a\u043e\u043d\u0446\u0430"])
    );

    const startCoords = firstCoords(row, [
      "\u041c\u0435\u0441\u0442\u043e\u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0442\u0440\u0430\u043d\u0441\u043f\u043e\u0440\u0442\u0430 (\u043d\u0430\u0447\u0430\u043b\u043e \u0430\u0440\u0435\u043d\u0434\u044b)",
      "\u041c\u0435\u0441\u0442\u043e\u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043a\u043b\u0438\u0435\u043d\u0442\u0430, \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0430",
    ]);
    const endCoords = firstCoords(row, [
      "\u041c\u0435\u0441\u0442\u043e\u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0442\u0440\u0430\u043d\u0441\u043f\u043e\u0440\u0442\u0430 (\u043a\u043e\u043d\u0435\u0446 \u0430\u0440\u0435\u043d\u0434\u044b)",
      "\u041c\u0435\u0441\u0442\u043e\u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0442\u0440\u0430\u043d\u0441\u043f\u043e\u0440\u0442\u0430 \u043f\u0440\u0438 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0438, \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0430",
      "\u041c\u0435\u0441\u0442\u043e\u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f/\u0437\u0430\u043a\u0440\u044b\u0442\u0438\u044f \u0442\u0440\u0430\u043d\u0441\u043f\u043e\u0440\u0442\u0430, \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0430",
    ]);

    const rawParkingName = normalizeParkingName(startNameRaw);
    const rawEndName = normalizeParkingName(endNameRaw);
    const parkingName = isUsableParking(rawParkingName) ? rawParkingName : (startCoords ? fallbackGpsName(startCoords) : rawParkingName);
    const endName = isUsableParking(rawEndName) ? rawEndName : (endCoords ? fallbackGpsName(endCoords) : rawEndName);
    const needsNameResolution = Boolean((!isUsableParking(rawParkingName) && startCoords) || (!isUsableParking(rawEndName) && endCoords));
    const idRaw = cleanText(row["ID \u0430\u0440\u0435\u043d\u0434\u044b"]);
    const scooter = cleanText(row["\u0418\u0434\u0435\u043d\u0442\u0438\u0444\u0438\u043a\u0430\u0442\u043e\u0440"] || row["QR-\u043d\u043e\u043c\u0435\u0440"] || row["\u0422\u0440\u0430\u043d\u0441\u043f\u043e\u0440\u0442"]);
    const fallbackId = hashText(`${fileName}|${rowNumber}|${parkingName}|${startAt.getTime()}|${scooter}`);
    const id = idRaw || `row-${fallbackId}`;
    const dateKey = toDateKey(startAt);
    const hour = startAt.getHours();
    const cityName = cleanText(row["\u0413\u043e\u0440\u043e\u0434"] || row.City || row.city) || fallbackCity || activeCityName();

    return {
      id,
      city: cityName,
      fileName,
      rowNumber,
      ts: startAt.getTime(),
      dateKey,
      weekday: startAt.getDay(),
      hour,
      parkingName: parkingName || "No zone",
      parkingKey: normalizeSearch(parkingName || "No zone"),
      endName: endName || "",
      endKey: normalizeSearch(endName || ""),
      zone: techZoneList(firstValue(row, ["Тех. зона начала", "Тех.зона начала"])),
      endZone: techZoneList(firstValue(row, ["Тех. зона завершения", "Тех.зона завершения"])),
      isParkingSignal: isUsableParking(rawParkingName) || Boolean(startCoords && pointInBh(startCoords)),
      needsNameResolution,
      scooter,
      qr: cleanText(row["QR-\u043d\u043e\u043c\u0435\u0440"]),
      tariff: cleanText(firstValue(row, ["\u0422\u0430\u0440\u0438\u0444. \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435", "\u0422\u0430\u0440\u0438\u0444"])),
      durationSec: parseDurationSeconds(firstValue(row, ["\u0414\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c", "\u0412\u0440\u0435\u043c\u044f \u0432 \u043f\u0443\u0442\u0438"])),
      distanceM: toNumber(firstValue(row, ["\u0420\u0430\u0441\u0441\u0442\u043e\u044f\u043d\u0438\u0435", "\u0414\u0438\u0441\u0442\u0430\u043d\u0446\u0438\u044f"])),
      revenue: rideRevenue(row),
      startLat: startCoords ? startCoords.lat : null,
      startLng: startCoords ? startCoords.lng : null,
      endLat: endCoords ? endCoords.lat : null,
      endLng: endCoords ? endCoords.lng : null,
      endTs: endAt ? endAt.getTime() : null,
      endDateKey: endAt ? toDateKey(endAt) : null,
      endWeekday: endAt ? endAt.getDay() : null,
      endHour: endAt ? endAt.getHours() : null,
    };
  }

  function recompute() {
    state.analysis = analyze(state.rides, state.settings);
    populateZoneFilter();
    renderAll();
  }

  // Fill the tech-zone selector from zones present in the loaded rentals (start+end).
  function populateZoneFilter() {
    const sel = els.capacityZoneFilter;
    if (!sel) return;
    const zones = new Set();
    (state.rides || []).forEach((ride) => {
      zoneListOf(ride.zone).forEach((z) => zones.add(z));
      zoneListOf(ride.endZone).forEach((z) => zones.add(z));
    });
    const currentSel = new Set(zoneListOf(state.capacity?.zoneFilter).filter((z) => z && z !== "all"));
    const sorted = [...zones].filter(Boolean).sort((a, b) => a.localeCompare(b));
    sel.innerHTML = sorted
      .map((z) => `<option value="${esc(z)}"${currentSel.has(z) ? " selected" : ""}>${esc(z)}</option>`)
      .join("");
    if (state.capacity) state.capacity.zoneFilter = sorted.filter((z) => currentSel.has(z));
  }

  function analyze(rides, settings) {
    const usable = rides.filter((ride) => sameCity(ride.city));
    const dates = [...new Set(usable.map((ride) => ride.dateKey))].sort();
    const latestTs = usable.reduce((max, ride) => Math.max(max, ride.ts || 0), 0);
    const latestDate = latestTs ? new Date(latestTs) : null;
    const cutoffTs = latestTs - settings.lookbackDays * 86400000;
    const resolver = buildParkingResolver(usable);
    const recent = usable
      .filter((ride) => ride.ts >= cutoffTs)
      .map((ride) => resolveRideEndParking(resolveRideParking(ride, resolver), resolver));

    const hourTotals = Array.from({ length: 24 }, () => 0);
    const parkingMap = new Map();
    const endMap = new Map();
    const observedDays = Math.max(1, new Set(recent.map((ride) => ride.dateKey)).size);

    recent.forEach((ride) => {
      hourTotals[ride.hour] += 1;
      if (ride.isParkingSignal) addParkingStart(parkingMap, ride, latestTs);
      if (isUsableParking(ride.endName)) addParkingEnd(endMap, ride);
    });

    const stations = [];
    for (const station of parkingMap.values()) {
      const end = endMap.get(station.key);
      station.ends = end ? end.ends : 0;
      station.net = station.starts - station.ends;
      station.uniqueDays = station.days.size;
      station.avgPerActiveDay = station.starts / Math.max(1, station.uniqueDays);
      station.consistency = station.uniqueDays / observedDays;
      station.peakHour = indexOfMax(station.hourly);
      station.peakDemand = station.hourly[station.peakHour] || 0;
      station.bestHour = weightedBestHour(station);
      station.bestWindow = `${pad2(station.bestHour)}:00-${pad2((station.bestHour + 1) % 24)}:00`;
      station.fillBy = fillByText(station.bestHour, settings.leadMinutes);
      station.keepScooters = estimateScooters(station, observedDays);
      station.confidence = confidenceScore(station, dates.length);
      station.priority = priorityLabel(station);
      station.score = scoreStation(station, observedDays);
      station.mapsUrl = station.lat != null && station.lng != null
        ? `https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}`
        : "";
      stations.push(station);
    }

    stations.sort((a, b) => b.score - a.score);
    const filteredStations = stations
      .filter((station) => station.starts >= settings.minRides)
      .slice(0, settings.topLimit);

    const planNow = buildPlan(stations, settings, latestDate, "now");
    const planDay = buildPlan(stations, settings, latestDate, "day");
    const donors = buildDonors(endMap, parkingMap);
    const confidence = Math.min(100, Math.round((dates.length / 14) * 65 + Math.min(35, usable.length / 250)));

    return {
      rides: usable.length,
      dates,
      latestDate,
      recentCount: recent.length,
      totalParkings: stations.length,
      stations,
      filteredStations,
      planNow,
      planDay,
      hourTotals,
      donors,
      confidence,
    };
  }

  function addParkingStart(map, ride, latestTs) {
    const key = ride.parkingKey;
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: ride.parkingName,
        starts: 0,
        ends: 0,
        net: 0,
        weightedStarts: 0,
        last24: 0,
        last7d: 0,
        hourly: Array.from({ length: 24 }, () => 0),
        hourlyWeighted: Array.from({ length: 24 }, () => 0),
        weekdayHourly: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
        revenue: 0,
        durationSec: 0,
        distanceM: 0,
        days: new Set(),
        lat: null,
        lng: null,
        catalogId: null,
        monitor: null,
      });
    }
    const station = map.get(key);
    const ageDays = Math.max(0, (latestTs - ride.ts) / 86400000);
    const weight = Math.exp(-ageDays / 10);
    station.starts += 1;
    station.weightedStarts += weight;
    station.hourly[ride.hour] += 1;
    station.hourlyWeighted[ride.hour] += weight;
    station.weekdayHourly[ride.weekday][ride.hour] += 1;
    station.revenue += ride.revenue || 0;
    station.durationSec += ride.durationSec || 0;
    station.distanceM += ride.distanceM || 0;
    station.days.add(ride.dateKey);
    if (ride.catalogId) station.catalogId = ride.catalogId;
    if (typeof ride.monitor === "boolean") station.monitor = ride.monitor;
    if (latestTs - ride.ts <= 86400000) station.last24 += 1;
    if (latestTs - ride.ts <= 7 * 86400000) station.last7d += 1;
    if (station.lat == null && ride.startLat != null && ride.startLng != null) {
      station.lat = roundCoord(ride.startLat);
      station.lng = roundCoord(ride.startLng);
    }
  }

  function addParkingEnd(map, ride) {
    const key = normalizeSearch(ride.endName);
    if (!map.has(key)) {
      map.set(key, { key, name: ride.endName, ends: 0, lat: null, lng: null });
    }
    const station = map.get(key);
    station.ends += 1;
    if (station.lat == null && ride.endLat != null && ride.endLng != null) {
      station.lat = roundCoord(ride.endLat);
      station.lng = roundCoord(ride.endLng);
    }
  }

  function weightedBestHour(station) {
    let bestHour = 0;
    let bestScore = -Infinity;
    for (let hour = 0; hour < 24; hour += 1) {
      const prev = station.hourlyWeighted[(hour + 23) % 24] * 0.35;
      const current = station.hourlyWeighted[hour];
      const next = station.hourlyWeighted[(hour + 1) % 24] * 0.45;
      const score = current + prev + next;
      if (score > bestScore) {
        bestScore = score;
        bestHour = hour;
      }
    }
    return bestHour;
  }

  function estimateScooters(station, observedDays) {
    const peakRate = station.peakDemand / Math.max(1, station.uniqueDays);
    const dailyRate = station.starts / Math.max(1, observedDays);
    const netBoost = Math.max(0, station.net) / Math.max(1, observedDays) * 0.35;
    return clamp(Math.ceil((peakRate * 1.4) + (dailyRate * 0.35) + netBoost), 1, 12);
  }

  function confidenceScore(station, totalDays) {
    const volume = Math.min(1, station.starts / 20);
    const days = Math.min(1, station.uniqueDays / Math.max(3, Math.min(10, totalDays)));
    const consistency = Math.min(1, station.consistency * 1.4);
    return Math.round((volume * 40 + days * 35 + consistency * 25));
  }

  function priorityLabel(station) {
    if (station.last24 >= 8 || station.peakDemand >= 8 || station.net >= 8) return "urgent";
    if (station.last7d >= 12 || station.starts >= 15 || station.net >= 4) return "high";
    return "normal";
  }

  function scoreStation(station, observedDays) {
    const dailyRate = station.starts / Math.max(1, observedDays);
    const peak = station.peakDemand;
    const recent = station.last24 * 2.8 + station.last7d * 1.1;
    const netNeed = Math.max(0, station.net) * 1.35;
    const consistency = station.consistency * 16;
    const revenue = Math.log10(Math.max(1, station.revenue + 1)) * 1.8;
    const lowSignalPenalty = station.starts < 3 ? 8 : 0;
    return recent + peak * 2.2 + dailyRate * 7 + netNeed + consistency + revenue - lowSignalPenalty;
  }

  function buildPlan(stations, settings, latestDate, mode) {
    if (!latestDate) return [];
    const nowHour = latestDate.getHours();
    const hours = mode === "now"
      ? Array.from({ length: 8 }, (_, idx) => (nowHour + idx) % 24)
      : Array.from({ length: 24 }, (_, idx) => idx);

    const candidates = [];
    stations
      .filter((station) => station.starts >= settings.minRides)
      .forEach((station) => {
        hours.forEach((hour, slotIndex) => {
          const direct = station.hourlyWeighted[hour] || 0;
          const shoulder = (station.hourlyWeighted[(hour + 23) % 24] || 0) * 0.28
            + (station.hourlyWeighted[(hour + 1) % 24] || 0) * 0.38;
          const demand = direct + shoulder;
          if (demand <= 0.35) return;
          const slotPenalty = mode === "now" ? slotIndex * 0.42 : 0;
          const score = demand * 8 + station.score * 0.18 + Math.max(0, station.net) * 0.45 - slotPenalty;
          candidates.push({
            station,
            hour,
            score,
            demand,
            fillBy: fillByText(hour, settings.leadMinutes),
          });
        });
      });

    candidates.sort((a, b) => b.score - a.score);
    const seen = new Set();
    const plan = [];
    for (const candidate of candidates) {
      const key = `${candidate.station.key}|${candidate.hour}`;
      if (seen.has(candidate.station.key) && mode === "now") continue;
      if (seen.has(key)) continue;
      seen.add(mode === "now" ? candidate.station.key : key);
      plan.push(candidate);
      if (plan.length >= (mode === "now" ? 9 : 18)) break;
    }
    return plan;
  }

  function buildDonors(endMap, startMap) {
    const donors = [];
    for (const end of endMap.values()) {
      const start = startMap.get(end.key);
      const starts = start ? start.starts : 0;
      const surplus = end.ends - starts;
      if (surplus <= 1) continue;
      donors.push({
        name: end.name,
        starts,
        ends: end.ends,
        surplus,
      });
    }
    donors.sort((a, b) => b.surplus - a.surplus);
    return donors.slice(0, 8);
  }

  function renderAll() {
    renderKpis();
    renderUploads();
    renderPlan();
    renderTopTable();
    renderHourChart();
    renderDonors();
    recomputeCapacityCompare();
    renderCapacityCompare();
    renderAutoCapacitySummary();
    renderIcons();
  }

  function renderKpis() {
    const analysis = state.analysis;
    els.kpiRides.textContent = fmtInt(analysis.rides);
    els.kpiParkings.textContent = fmtInt(analysis.totalParkings);
    els.kpiDays.textContent = fmtInt(analysis.dates.length);
    els.kpiConfidence.textContent = `${analysis.confidence}%`;
    els.topSubtext.textContent = `${fmtInt(analysis.recentCount)} аренд в окне ${state.settings.lookbackDays} дн.`;
  }

  function renderUploads() {
    els.uploadCount.textContent = state.uploads.length;
    if (state.uploads[0]) {
      els.lastUploadText.textContent = `${state.uploads[0].fileName} · ${fmtDateTime(state.uploads[0].importedAt)}`;
    } else {
      els.lastUploadText.textContent = "Файлы еще не добавлены";
    }
    if (!state.uploads.length) {
      els.uploadList.innerHTML = `<div class="upload-item"><strong>Пусто</strong><span>Нет ежедневных файлов</span></div>`;
      return;
    }
    els.uploadList.innerHTML = state.uploads.slice(0, 8).map((upload) => `
      <div class="upload-item">
        <strong>${esc(upload.fileName)}</strong>
        <span>${fmtDateTime(upload.importedAt)} · ${esc(upload.cityName || activeCityName())} ${fmtInt(upload.cityRows)} · новых ${fmtInt(upload.newRides)}</span>
      </div>
    `).join("");
  }

  function renderPlan() {
    const analysis = state.analysis;
    const mode = state.settings.planMode;
    const plan = mode === "day" ? analysis.planDay : analysis.planNow;
    els.planSubtext.textContent = plan.length
      ? `${mode === "day" ? "План на 24 часа" : "Ближайшие 8 часов"} · ${fmtDateTime(analysis.latestDate)}`
      : "Нет данных для расчета";

    if (!plan.length) {
      els.planList.innerHTML = emptyStateHtml();
      return;
    }

    els.planList.innerHTML = plan.map(({ station, hour, demand, fillBy }) => `
      <article class="plan-card ${esc(station.priority)}">
        <div class="plan-topline">
          <span class="time-pill"><i data-lucide="clock"></i>${esc(fillBy)}</span>
          <span class="priority">${priorityText(station.priority)}</span>
        </div>
        <h3>${esc(station.name)}</h3>
        <div class="plan-meta">
          <span class="chip">${station.keepScooters} сам.</span>
          <span class="chip">${pad2(hour)}:00 спрос</span>
          <span class="chip">${Math.round(station.confidence)}% сигнал</span>
        </div>
        <div class="why">Спрос ${demand.toFixed(1)}, стартов ${station.starts}, финишей ${station.ends}, net ${signed(station.net)}.</div>
      </article>
    `).join("");
    renderIcons();
  }

  function renderTopTable() {
    const analysis = state.analysis;
    const stations = analysis.filteredStations.filter((station) => {
      if (!state.search) return true;
      return normalizeSearch(station.name).includes(state.search);
    });

    if (!stations.length) {
      els.topTable.innerHTML = `<tr><td colspan="6">${emptyStateHtml()}</td></tr>`;
      return;
    }

    const maxScore = stations.reduce((m, station) => Math.max(m, station.score), 1);
    els.topTable.innerHTML = stations.map((station, index) => `
      <tr>
        <td class="rank">${index + 1}</td>
        <td>
          <span class="parking-name">${esc(station.name)}</span>
          <span class="subline">${station.mapsUrl ? `<a href="${esc(station.mapsUrl)}" target="_blank" rel="noreferrer">Google Maps</a>` : "GPS нет"} · ${station.uniqueDays} дн.</span>
        </td>
        <td>
          <span class="strong-num">${esc(station.fillBy)}</span>
          <span class="subline">держать ${station.keepScooters} сам. · ${station.bestWindow}</span>
        </td>
        <td>
          <span class="strong-num">${station.starts}</span>
          <span class="subline">24ч ${station.last24} · 7д ${station.last7d}</span>
        </td>
        <td>
          <span class="strong-num">${station.starts}/${station.ends}</span>
          <span class="subline">net ${signed(station.net)}</span>
        </td>
        <td>
          <div class="bar" title="${station.score.toFixed(1)}"><span style="width:${Math.max(4, Math.round(station.score / maxScore * 100))}%"></span></div>
          <span class="subline">${Math.round(station.confidence)}% · ${priorityText(station.priority)}</span>
        </td>
      </tr>
    `).join("");
  }

  function renderHourChart() {
    const totals = state.analysis.hourTotals;
    const max = Math.max(...totals, 1);
    els.hourChart.innerHTML = totals.map((value, hour) => `
      <div class="hour-bar" title="${pad2(hour)}:00 · ${fmtInt(value)} аренд">
        <div class="hour-fill" style="height:${Math.max(4, Math.round(value / max * 132))}px"></div>
        <div class="hour-label">${hour % 3 === 0 ? pad2(hour) : ""}</div>
      </div>
    `).join("");
  }

  function renderDonors() {
    const donors = state.analysis.donors;
    if (!donors.length) {
      els.donorList.innerHTML = `<div class="compact-item"><strong>Нет сильных доноров</strong><span>По завершениям не видно явного избытка.</span></div>`;
      return;
    }
    els.donorList.innerHTML = donors.map((donor) => `
      <div class="compact-item">
        <strong>${esc(donor.name)}</strong>
        <span>Финишей ${donor.ends}, стартов ${donor.starts}, избыток ${donor.surplus}</span>
      </div>
    `).join("");
  }

  function emptyStateHtml() {
    const template = document.getElementById("emptyStateTemplate");
    return template.innerHTML;
  }

  async function exportHistory() {
    const payload = {
      version: 1,
      city: activeCityName(),
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      uploads: state.uploads,
      rides: state.rides,
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `bh-parking-brain-history-${toDateKey(new Date())}.json`,
      "application/json;charset=utf-8",
    );
  }

  async function importHistory(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (!Array.isArray(payload.rides)) throw new Error("в JSON нет rides");
      const existing = new Set(state.rides.map((ride) => ride.id));
      const rides = payload.rides.filter((ride) => ride && ride.id && !existing.has(ride.id));
      const uploads = Array.isArray(payload.uploads) ? payload.uploads : [];
      await putMany(STORE_RIDES, rides);
      await putMany(STORE_UPLOADS, uploads);
      if (payload.settings) {
        state.settings = normalizeSettings(payload.settings);
        await putMeta(SETTINGS_KEY, state.settings);
        renderSettings();
      }
      await loadState();
      recompute();
      toast(`Импортировано ${rides.length} аренд`);
    } catch (err) {
      console.error(err);
      toast(`Ошибка импорта истории: ${err.message}`, true);
    }
  }



  async function loadBundledCityIndex() {
    const res = await fetch(BUNDLED_PARKINGS_INDEX_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`parkings index ${res.status}`);
    const payload = await res.json();
    const entries = Array.isArray(payload)
      ? payload
      : Object.entries(payload || {}).map(([key, value]) => ({ key, ...(value || {}) }));
    let changed = false;
    entries.forEach((entry) => {
      const fileId = cleanText(String(entry.file || "").replace(/\.json$/i, ""));
      const id = cleanText(entry.areaId || entry.city_id || entry.cityId || entry.id || fileId);
      const name = cleanText(entry.city || entry.name || entry.cidade || entry.key || "");
      if (!id || !name) return;
      changed = Boolean(upsertCapacityCityOption({
        key: capacityCityKeyFromName(name),
        name,
        uf: cleanText(entry.uf || entry.state || ""),
        id,
      })) || changed;
    });
    if (changed && els.capacityCitySelect) initCapacityCities();
  }

  function upsertCapacityCityOption(city) {
    const id = cleanText(city?.id || "");
    const name = cleanText(city?.name || "");
    const key = cleanText(city?.key || "") || capacityCityKeyFromName(name || id);
    const existing = (id && CAPACITY_CITY_OPTIONS.find((item) => cleanText(item.id) === id))
      || capacityCityByName(name)
      || capacityCityByKey(key);
    if (existing) {
      existing.id = cleanText(existing.id || id);
      existing.name = cleanText(existing.name || name || key);
      existing.uf = cleanText(existing.uf || city?.uf || "");
      return existing;
    }
    const option = { key, name: name || key, uf: cleanText(city?.uf || ""), id };
    CAPACITY_CITY_OPTIONS.push(option);
    CAPACITY_CITY_OPTIONS.sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name), "pt-BR"));
    return option;
  }
  function initCapacityCities() {
    if (!els.capacityCitySelect) return;
    els.capacityCitySelect.innerHTML = CAPACITY_CITY_OPTIONS.map((city) => `<option value="${esc(city.key)}">${esc(city.name)}</option>`).join("");
    const current = capacityCityByKey(state.capacity.selectedCityKey) || CAPACITY_CITY_OPTIONS[1];
    els.capacityCitySelect.value = current.key;
    state.capacity.selectedCityName = current.name;
    state.capacity.selectedCityId = storedCityId(current.key) || current.id || state.capacity.selectedCityId || "";
    if (els.capacityCityId) els.capacityCityId.value = state.capacity.selectedCityId;
  }

  function capacityCityByKey(key) {
    return CAPACITY_CITY_OPTIONS.find((city) => city.key === key) || null;
  }

  function storedCityIds() {
    try { return JSON.parse(localStorage.getItem(CAPACITY_CITY_STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }

  function storedCityId(key) {
    return cleanText(storedCityIds()[key]);
  }

  function rememberCityId(key, id) {
    if (!key || !id) return;
    const ids = storedCityIds();
    ids[key] = id;
    localStorage.setItem(CAPACITY_CITY_STORAGE_KEY, JSON.stringify(ids));
  }

  function selectedCapacityCity() {
    const key = state.capacity?.selectedCityKey || "belo-horizonte";
    const option = capacityCityByKey(key) || CAPACITY_CITY_OPTIONS[1];
    return {
      key,
      name: state.capacity?.selectedCityName || option.name || CITY,
      uf: option.uf || "",
      id: cleanText(state.capacity?.selectedCityId || storedCityId(key) || option.id || ""),
      fullName: option.uf ? `${option.name}/${option.uf}` : option.name,
    };
  }


  function capacityCityKeyFromName(name) {
    const normalized = normalizeGoJetCityName(name) || normalizeSearch(name);
    return normalized ? normalized.replace(/\s+/g, "-") : `city-${hashText(name || Date.now())}`;
  }

  function capacityCityByName(name) {
    const target = normalizeGoJetCityName(name);
    if (!target) return null;
    return CAPACITY_CITY_OPTIONS.find((city) => normalizeGoJetCityName(city.name) === target) || null;
  }

  function ensureCapacityCityOption(name) {
    const label = cleanText(name);
    const existing = capacityCityByName(label);
    if (existing) return existing;

    const key = capacityCityKeyFromName(label);
    const option = { key, name: label || key, uf: "", id: storedCityId(key) || "" };
    CAPACITY_CITY_OPTIONS.push(option);

    if (els.capacityCitySelect) {
      const item = document.createElement("option");
      item.value = option.key;
      item.textContent = option.name;
      els.capacityCitySelect.appendChild(item);
    }
    return option;
  }

  function setSelectedCapacityCity(cityOrName, options = {}) {
    const option = typeof cityOrName === "string" ? ensureCapacityCityOption(cityOrName) : cityOrName;
    if (!option) return selectedCapacityCity();
    const changed = state.capacity.selectedCityKey !== option.key;
    state.capacity.selectedCityKey = option.key;
    state.capacity.selectedCityName = option.name;
    state.capacity.selectedCityId = option.id || storedCityId(option.key) || "";

    if (els.capacityCitySelect) els.capacityCitySelect.value = option.key;
    if (els.capacityCityId) els.capacityCityId.value = state.capacity.selectedCityId;
    if (changed && options.clearLoaded !== false) {
      state.capacity.allParkings = [];
      state.capacity.allParkingsSource = "";
      state.capacity.monitorRows = [];
      state.capacity.monitorFile = null;
      state.capacity.monitorFileName = "";
      state.capacity.monitorRulesSource = "";
      state.capacity.sourceRows = [];
      state.capacity.sourceFileName = "";
      state.capacity.weekendRows = [];
      state.capacity.weekendFileName = "";
      state.capacity.comparison = null;
      state.capacity.generated = null;
    }
    return selectedCapacityCity();
  }

  function activeCityName() {
    return cleanText(selectedCapacityCity().name || CITY);
  }

  function detectImportCityName(rows) {
    const counts = new Map();
    const labels = new Map();
    rows.forEach((row) => {
      const raw = cleanText(row["\u0413\u043e\u0440\u043e\u0434"] || row.City || row.city);
      const city = normalizeGoJetCityName(raw);
      if (!city) return;
      counts.set(city, (counts.get(city) || 0) + 1);
      if (!labels.has(city)) labels.set(city, raw);
    });

    const active = normalizeGoJetCityName(activeCityName());
    if (counts.has(active)) return activeCityName();

    let best = "";
    let bestCount = 0;
    counts.forEach((count, city) => {
      if (count > bestCount) {
        best = city;
        bestCount = count;
      }
    });
    return labels.get(best) || best || activeCityName();
  }
  function initAppsScriptBridge() {
    if (els.appsScriptUser) els.appsScriptUser.value = localStorage.getItem(APPS_SCRIPT_USER_KEY) || "";
    updateAppsScriptStatus(appsScriptToken() ? "manual conectado" : "auto Netlify", appsScriptToken() ? "ok" : "");
  }

  function appsScriptToken() {
    return cleanText(localStorage.getItem(APPS_SCRIPT_TOKEN_KEY) || "");
  }

  function updateAppsScriptStatus(text, status = "") {
    if (!els.appsScriptStatus) return;
    els.appsScriptStatus.textContent = text;
    els.appsScriptStatus.classList.toggle("ok", status === "ok");
    els.appsScriptStatus.classList.toggle("bad", status === "bad");
  }

  async function loginAppsScriptBridge() {
    const user = cleanText(els.appsScriptUser?.value || "");
    const senha = els.appsScriptPass?.value || "";
    if (!user || !senha) {
      toast("Digite usuario e senha do Apps Script dashboard", true);
      return;
    }
    try {
      if (els.appsScriptLoginBtn) els.appsScriptLoginBtn.disabled = true;
      updateAppsScriptStatus("conectando...", "");
      const data = await fetchAppsScript({ acao: "login", usuario: user, senha }, { auth: false });
      if (!data.token) throw new Error("token vazio");
      localStorage.setItem(APPS_SCRIPT_TOKEN_KEY, data.token);
      localStorage.setItem(APPS_SCRIPT_USER_KEY, data.usuario || user);
      if (els.appsScriptPass) els.appsScriptPass.value = "";
      updateAppsScriptStatus(`conectado: ${data.usuario || user}`, "ok");
      toast("Apps Script conectado");
    } catch (err) {
      console.error(err);
      localStorage.removeItem(APPS_SCRIPT_TOKEN_KEY);
      updateAppsScriptStatus("erro login", "bad");
      toast(`Apps Script: ${err.message}`, true);
    } finally {
      if (els.appsScriptLoginBtn) els.appsScriptLoginBtn.disabled = false;
    }
  }

  async function fetchAppsScript(payload, { auth = true } = {}) {
    if (auth) {
      try {
        const data = await fetchAppsScriptProxy(payload);
        updateAppsScriptStatus("auto Netlify ok", "ok");
        return data;
      } catch (proxyErr) {
        console.warn("Apps Script proxy failed, trying manual token", proxyErr);
      }
    }

    const body = { ...payload };
    if (auth) {
      const token = appsScriptToken();
      if (!token) {
        updateAppsScriptStatus("proxy/manual offline", "bad");
        throw new Error("Netlify auto login unavailable; use manual Apps Script login");
      }
      body._token = token;
    }
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}`);
    const data = await res.json();
    if (data?.authError) {
      localStorage.removeItem(APPS_SCRIPT_TOKEN_KEY);
      updateAppsScriptStatus("sessao expirada", "bad");
      throw new Error(data.msg || "Sessao expirada");
    }
    if (data?.ok === false) throw new Error(data.msg || "Apps Script error");
    return data;
  }

  async function fetchAppsScriptProxy(payload) {
    const res = await fetch(APPS_SCRIPT_PROXY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = `Netlify function ${res.status}`;
      try {
        const data = await res.json();
        msg = data?.msg || msg;
      } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    if (data?.ok === false || data?.authError) throw new Error(data.msg || "Apps Script proxy error");
    return data;
  }

  const CAPACITY_DEFAULT_SCHEDULE_IDS = {
    [CAPACITY_DAY_SCHEDULE]: "d1369e80-d2d3-4f95-8972-b790faec6a57",
    [CAPACITY_EVENING_SCHEDULE]: "08aff426-c04a-46b7-9505-4434a19c3387",
    [CAPACITY_FRIDAY_DAY_SCHEDULE]: "9b4f3567-db4d-432c-a6c6-3a57f1aac5b7",
    [CAPACITY_FRIDAY_EVENING_SCHEDULE]: "5ae37917-ef6d-40ca-8f87-3482ede360e4",
    [CAPACITY_WEEKEND_SCHEDULE]: "8b35b8e3-0a76-4066-acaa-3aed47ea6fdf",
  };

  const CAPACITY_SCHEDULE_IDS_BY_CITY = {
    "belo-horizonte": CAPACITY_DEFAULT_SCHEDULE_IDS,
  };

  function capacityScheduleId(city, schedule) {
    return CAPACITY_SCHEDULE_IDS_BY_CITY[city?.key || ""]?.[schedule] || CAPACITY_DEFAULT_SCHEDULE_IDS[schedule] || "";
  }

  function isKnownForeignScheduleId(city, scheduleId) {
    return false;
  }

  function isValidScheduleIdForCity(city, scheduleId) {
    return Boolean(cleanText(scheduleId));
  }
  function collectScheduleIdsForOutputCity(records, indices, selectedCity) {
    const out = new Map();
    (records || []).forEach((record) => {
      const cells = record.cells || [];
      const rowCityName = indices.cityName >= 0 ? cellAt(cells, indices.cityName) : "";
      const rowCityId = indices.cityId >= 0 ? cellAt(cells, indices.cityId) : "";
      if (rowCityName && !sameCity(rowCityName, selectedCity.name)) return;
      if (rowCityId && selectedCity.id && rowCityId !== selectedCity.id) return;
      const schedule = normalizeCapacitySchedule(cellAt(cells, indices.scheduleName));
      const scheduleId = cleanText(cellAt(cells, indices.scheduleId));
      if (schedule && isValidScheduleIdForCity(selectedCity, scheduleId)) out.set(schedule, scheduleId);
    });
    return out;
  }

  function appsScriptCityName(city) {
    return city?.name || CITY;
  }

  function appsScriptRows(payload) {
    const seen = new Set();
    const scan = (value) => {
      if (!value || typeof value !== "object" || seen.has(value)) return [];
      if (Array.isArray(value)) return value;
      seen.add(value);
      for (const key of ["rows", "pontos", "points", "items", "entries", "results", "data", "dados", "todos", "monitores", "parkings"]) {
        const nested = value[key];
        if (Array.isArray(nested)) return nested;
        const nestedRows = scan(nested);
        if (nestedRows.length) return nestedRows;
      }
      return [];
    };
    return scan(payload);
  }


  function appsScriptMonitorRows(payload) {
    const rows = [];
    const add = (key, schedule) => {
      const items = Array.isArray(payload?.[key]) ? payload[key] : [];
      items.forEach((item) => rows.push({ ...item, schedule: item.schedule || schedule }));
    };
    add("dia", CAPACITY_DAY_SCHEDULE);
    add("manha", CAPACITY_DAY_SCHEDULE);
    add("noite", CAPACITY_EVENING_SCHEDULE);
    add("sextaDia", CAPACITY_FRIDAY_DAY_SCHEDULE);
    add("sexta_dia", CAPACITY_FRIDAY_DAY_SCHEDULE);
    add("sextaNoite", CAPACITY_FRIDAY_EVENING_SCHEDULE);
    add("sexta_noite", CAPACITY_FRIDAY_EVENING_SCHEDULE);
    add("fds", CAPACITY_WEEKEND_SCHEDULE);
    add("weekend", CAPACITY_WEEKEND_SCHEDULE);
    return rows.length ? rows : appsScriptRows(payload);
  }

  async function loadAppsScriptAllParkings(city) {
    updateAppsScriptStatus("lendo pontos...", appsScriptToken() ? "ok" : "");
    const data = await fetchAppsScript({ acao: "carregarTodosPontos", cidade: appsScriptCityName(city) });
    const rows = appsScriptRows(data);
    if (!rows.length) throw new Error("Apps Script nao retornou Todos os Pontos para esta cidade");
    return rows;
  }

  // Bundled catalog: parkings with real id/name/coords collected once from the JET
  // admin API and shipped with the site (parkings/<cityId>.json). No Cloudflare, no
  // token, works offline — the primary source of parking_id for every city.
  async function loadBundledCityParkings(cityId) {
    if (!cityId) throw new Error("no cityId for bundled catalog");
    const res = await fetch(`parkings/${encodeURIComponent(cityId)}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`catálogo local ${res.status}`);
    const rows = rowsFromPayload(await res.json());
    if (!rows.length) throw new Error("catálogo local vazio");
    return rows;
  }

  // Apps Script buscarPontosGoJet fetches GoJet live from Google servers (bypasses
  // Cloudflare that blocks browser/proxy) and returns each parking WITH gojet_id.
  // This is the reliable id-complete source for the monitor CSV.
  async function loadAppsScriptGoJetParkings(city, cityId) {
    updateAppsScriptStatus("buscando GoJet com id...", appsScriptToken() ? "ok" : "");
    const data = await fetchAppsScript({
      acao: "buscarPontosGoJet",
      cidade: appsScriptCityName(city),
      gojetCityId: cityId || "",
    });
    const rows = rowsFromPayload(data);
    if (!rows.length) throw new Error("buscarPontosGoJet nao retornou pontos");
    return rows;
  }

  async function loadAppsScriptMonitorFile(city) {
    updateAppsScriptStatus("lendo monitor...", appsScriptToken() ? "ok" : "");
    const data = await fetchAppsScript({ acao: "carregarPontos", cidade: appsScriptCityName(city) });
    const rows = appsScriptMonitorRows(data);
    if (!rows.length) throw new Error("Apps Script nao retornou Pontos Monitores para esta cidade");
    return parseMonitorCapacityRows(rows, `${city.name} Apps Script monitor`);
  }

  function parseMonitorCapacityRows(rows, sourceName) {
    const city = selectedCapacityCity();
    const headersRaw = ["city_id", "city_name", "schedule_id", "schedule_name", "parking_id", "parking_name", "parking_latitude", "parking_longitude", "capacity"];
    const headers = headersRaw.map(headerKey);
    const catalogItems = buildCatalogCapacityItems();
    const normalized = normalizeMonitorCapacityRows(rows || [])
      .map((row) => enrichCapacityParkingWithCatalog(row, catalogItems));
    if (!normalized.length) throw new Error(`${sourceName}: nao encontrei nome/bloco/capacidade`);
    const records = normalized.map((row) => ({
      row,
      cells: [
        city.id || "",
        city.name || CITY,
        capacityScheduleId(city, row.schedule),
        row.schedule,
        row.id || "",
        row.name,
        validCoordinatePair(row) ? row.lat : "",
        validCoordinatePair(row) ? row.lng : "",
        row.capacity,
      ],
      headersRaw,
      headers,
    }));
    normalized.forEach((row, index) => { row.sourceRecord = records[index]; });
    return { delimiter: ";", headersRaw, headers, records, rows: normalized };
  }

  function capacityParkingsCacheKey(city) {
    return `${CAPACITY_PARKINGS_CACHE_PREFIX}${city?.key || city?.name || CITY}`;
  }

  function cachedAllParkings(city) {
    try {
      const payload = JSON.parse(localStorage.getItem(capacityParkingsCacheKey(city)) || "null");
      if (payload && Array.isArray(payload.rows)) return payload;
    } catch {}
    return null;
  }

  function saveCachedAllParkings(city, rows, source) {
    try {
      localStorage.setItem(capacityParkingsCacheKey(city), JSON.stringify({ rows, source, savedAt: new Date().toISOString() }));
    } catch (err) {
      console.warn("All parkings cache failed", err);
    }
  }

  async function fetchGoJetAllParkingsForCity(city) {
    const cityId = await resolveGoJetCityId(city);
    if (!cityId) throw new Error(`city_id not found for ${city.name}`);
    state.capacity.selectedCityId = cityId;
    if (els.capacityCityId) els.capacityCityId.value = cityId;
    rememberCityId(city.key, cityId);
    els.capacityStatusText.textContent = `Loading GoJet parkings for ${city.name}...`;
    return fetchGoJetParkings(cityId, (loaded, total) => {
      els.capacityStatusText.textContent = `Loading GoJet parkings for ${city.name}: ${fmtInt(loaded)}${total ? `/${fmtInt(total)}` : ""}`;
    });
  }

  async function loadSelectedCityParkings() {
    const city = selectedCapacityCity();
    let rows = [];
    let source = "";
    let firstError = null;

    const cityId = await resolveGoJetCityId(city).catch(() => "");
    if (cityId) {
      state.capacity.selectedCityId = cityId;
      if (els.capacityCityId) els.capacityCityId.value = cityId;
      rememberCityId(city.key, cityId);
    }

    // Ordered sources by reliability of a real parking_id:
    // 1) Apps Script buscarPontosGoJet — id-complete AND Cloudflare-safe (Google server).
    // 2) Direct browser GoJet fetch — opportunistic (usually CORS/Cloudflare-blocked).
    // 3) Apps Script carregarTodosPontos — live but WITHOUT parking_id (flagged).
    const sources = [];
    if (cityId) {
      sources.push({
        label: `Catálogo local com id: ${city.name}`,
        run: () => loadBundledCityParkings(cityId),
      });
      sources.push({
        label: `Apps Script GoJet com id: ${city.name}`,
        run: () => loadAppsScriptGoJetParkings(city, cityId),
      });
      sources.push({
        label: `GoJet all parkings: ${city.name}`,
        run: () => fetchGoJetParkings(cityId, (loaded, total) => {
          els.capacityStatusText.textContent = `GoJet parkings ${city.name}: ${fmtInt(loaded)}${total ? `/${fmtInt(total)}` : ""}`;
        }),
      });
    }
    sources.push({
      label: `Apps Script Todos os Pontos (sem id): ${city.name}`,
      run: () => loadAppsScriptAllParkings(city),
    });

    for (const src of sources) {
      try {
        els.capacityStatusText.textContent = `Carregando ${src.label}...`;
        const got = await src.run();
        if (got && got.length) { rows = got; source = src.label; break; }
      } catch (err) {
        firstError = firstError || err;
        console.warn(`${src.label} falhou`, err);
      }
    }

    if (!rows.length) {
      const cached = cachedAllParkings(city);
      if (cached?.rows?.length) {
        rows = cached.rows;
        source = `${cached.source || "cache"} (cache)`;
      }
    }

    if (!rows.length) {
      renderCapacityCompare();
      const msg = firstError?.message || "all parkings unavailable";
      if (els.capacityStatusText) els.capacityStatusText.textContent = `All parkings: ${msg}`;
      toast(`All parkings: ${msg}`, true);
      return;
    }

    applyAllParkingsRows(city, rows, source);
  }

  // Shared tail: normalize raw parking rows into state.capacity.allParkings + status.
  function applyAllParkingsRows(city, rows, source) {
    try {
      let normalized = normalizeCapacityParkings(rows);
      if (!normalized.length) throw new Error("all parkings list is empty after parsing");
      normalized = enrichCapacityParkingsWithCatalog(normalized);
      state.capacity.allParkings = normalized;
      state.capacity.allParkingsSource = source;
      saveCachedAllParkings(city, normalized, source);
      const withId = normalized.filter((point) => point.id).length;
      const hasParkingIds = withId > 0;
      state.catalogPoints = city.name === CITY && hasParkingIds ? state.capacity.allParkings : [];
      recomputeCapacityCompare();
      renderCapacityCompare();
      if (els.capacityStatusText) {
        const flag = withId === normalized.length ? "" : (hasParkingIds ? " · atencao: alguns sem id" : " · SEM parking_id");
        els.capacityStatusText.textContent = `${source}: ${fmtInt(normalized.length)} parkings · com parking_id ${fmtInt(withId)}/${fmtInt(normalized.length)}${flag}`;
      }
      toast(`${city.name}: ${fmtInt(normalized.length)} parkings, com id ${fmtInt(withId)}/${fmtInt(normalized.length)}`, !hasParkingIds);
    } catch (err) {
      console.error(err);
      toast(`All parkings: ${err.message}`, true);
      renderCapacityCompare();
    }
  }

  function arrayFromPayloadKeys(payload, keys) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    for (const key of keys) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
      if (value && Array.isArray(value.entries)) return value.entries;
      if (value && Array.isArray(value.rows)) return value.rows;
      if (value && Array.isArray(value.items)) return value.items;
      if (value && Array.isArray(value.results)) return value.results;
      if (value && Array.isArray(value.data)) return value.data;
    }
    return [];
  }

  function looksLikeCapacityRule(row) {
    if (!row || typeof row !== "object") return false;
    return Boolean(row.schedule_id || row.scheduleId || row.schedule || row.schedule_name || row.scheduleName || row.capacity || row.capacidade || row.expected_bikes_count || row.expectedBikesCount || row.target_bikes_count || row.targetBikesCount);
  }

  function looksLikeParkingRow(row) {
    if (!row || typeof row !== "object" || looksLikeCapacityRule(row)) return false;
    const point = objectPoint(row);
    const name = cleanText(row.name || row.nome || row.title || row.parking_name || row.parkingName || row.address || row.endereco);
    return Boolean(name && point);
  }

  // Reliable fallback when GoJet is Cloudflare-blocked server-side: import a
  // GoJet JSON captured from the user's logged-in GoJet browser tab. It accepts
  // old parkings-only JSON and the new combined {parkings, rules, schedules} JSON.
  async function importGoJetParkingsFile(file) {
    const city = selectedCapacityCity();
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const rawParkings = arrayFromPayloadKeys(payload, ["parkings", "pontos", "points", "parkingEntries", "allParkings", "entries", "items", "rows"])
        .filter(looksLikeParkingRow);
      const rawRules = arrayFromPayloadKeys(payload, ["rules", "parking_rules", "parkingRules", "monitorRules", "monitores"])
        .filter(looksLikeCapacityRule);
      const rawSchedules = payload?.schedules || payload?.schedule || payload?.scheduleRaw || payload?.schedulesRaw || null;

      if (!rawParkings.length && !rawRules.length) throw new Error("JSON sem parkings/rules do GoJet");
      if (rawParkings.length) applyAllParkingsRows(city, rawParkings, `Import GoJet parkings: ${file.name}`);

      if (rawRules.length) {
        const parsed = createMonitorCapacityFileFromRules(rawRules, rawSchedules, city, state.capacity.allParkings || []);
        state.capacity.monitorFile = parsed;
        state.capacity.monitorRows = parsed.rows;
        state.capacity.monitorFileName = `Import GoJet rules: ${file.name}`;
        state.capacity.monitorRulesSource = state.capacity.monitorFileName;
        recomputeCapacityCompare();
        renderCapacityCompare();
        const withScheduleId = parsed.records.filter((record) => cellAt(record.cells, 2)).length;
        toast(`${city.name}: rules ${fmtInt(parsed.rows.length)}, schedule_id ${fmtInt(withScheduleId)}/${fmtInt(parsed.records.length)}`, withScheduleId === 0);
      }
    } catch (err) {
      console.error(err);
      toast(`Import GoJet JSON: ${err.message}`, true);
    }
  }
  async function loadSelectedCityMonitorRules() {
    const city = selectedCapacityCity();
    let parsed = null;
    let source = "";
    let firstError = null;
    try {
      const cityId = await resolveGoJetCityId(city);
      if (!cityId) throw new Error(`city_id not found for ${city.name}`);
      state.capacity.selectedCityId = cityId;
      if (els.capacityCityId) els.capacityCityId.value = cityId;
      rememberCityId(city.key, cityId);
      els.capacityStatusText.textContent = `Loading monitor rules for ${city.name}...`;
      const [rulesRaw, scheduleRaw] = await Promise.all([
        fetchLogisticRows(`${LOGISTIC_BASE}/parking_rules?city_id=${encodeURIComponent(cityId)}`),
        fetchLogisticJson(`${LOGISTIC_BASE}/schedule?city_id=${encodeURIComponent(cityId)}`).catch(() => null),
      ]);
      parsed = createMonitorCapacityFileFromRules(rulesRaw, scheduleRaw, city, state.capacity.allParkings || []);
      source = `GoJet monitor rules: ${city.name}`;
    } catch (gojetErr) {
      firstError = gojetErr;
      console.warn("GoJet monitor failed, trying Apps Script", gojetErr);
      try {
        els.capacityStatusText.textContent = `Lendo Apps Script monitor para ${city.name}...`;
        parsed = await loadAppsScriptMonitorFile(city);
        source = `Apps Script monitor: ${city.name}`;
      } catch (appsErr) {
        console.error(appsErr);
        toast(`Monitor rules: ${appsErr.message || firstError?.message}`, true);
        renderCapacityCompare();
        return;
      }
    }

    state.capacity.monitorFile = parsed;
    state.capacity.monitorRows = parsed.rows;
    state.capacity.monitorFileName = source;
    state.capacity.monitorRulesSource = source;
    recomputeCapacityCompare();
    renderCapacityCompare();
    toast(`${city.name}: monitor ${fmtInt(parsed.rows.length)} linhas`);
  }
  async function resolveGoJetCityId(city) {
    const manual = cleanText(state.capacity?.selectedCityId || els.capacityCityId?.value || "");
    if (manual) return manual;
    const stored = storedCityId(city.key);
    if (stored) return stored;
    if (city.id) return city.id;
    const map = await loadGoJetCityMap();
    const direct = findGoJetCityId(city.name, map) || findGoJetCityId(city.fullName, map);
    return direct || "";
  }

  async function loadGoJetCityMap() {
    if (goJetCityMap.size) return goJetCityMap;
    if (!goJetCityMapPromise) {
      goJetCityMapPromise = (async () => {
        let citiesPayload = null;
        try {
          const data = await fetchAppsScript({ acao: "listarCidadesGoJet" });
          citiesPayload = data?.cidades || data?.rows || data?.data || data;
        } catch (appsErr) {
          console.warn("Apps Script city list failed, trying GoJet cities", appsErr);
          citiesPayload = await fetchLogisticJson(`${LOGISTIC_BASE}/cities`);
        }

        goJetCityMap = new Map();
        rowsFromPayload(citiesPayload).forEach((city) => {
          const name = cleanText(city.name || city.nome || city.title || city.city || "");
          const id = cleanText(city.id || city._id || city.city_id || city.cityId || "");
          if (!name || !id) return;
          goJetCityMap.set(normalizeGoJetCityName(name), id);
          goJetCityMap.set(normalizeGoJetCityName(name.split("/")[0]), id);
        });
        return goJetCityMap;
      })().catch((err) => {
        goJetCityMapPromise = null;
        throw err;
      });
    }
    return goJetCityMapPromise;
  }
  function findGoJetCityId(name, map) {
    const target = normalizeGoJetCityName(name);
    if (!target) return "";
    if (map.has(target)) return map.get(target);
    for (const [key, id] of map.entries()) {
      if (key.includes(target) || target.includes(key)) return id;
    }
    return "";
  }

  function normalizeGoJetCityName(value) {
    return cleanText(value)
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\bmg\b|\bal\b|\bpe\b|\brn\b|\bse\b|\bba\b|\bes\b|\bpa\b|\bce\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  async function fetchGoJetParkings(cityId, onProgress) {
    const out = [];
    let totalPages = 1;
    let totalItems = 0;
    for (let page = 1; page <= totalPages && page <= 30; page += 1) {
      let data = null;
      const query = `city_id=${encodeURIComponent(cityId)}&limit=500&page=${page}`;
      try {
        data = await fetchLogisticJson(`${LOGISTIC_BASE}/parkings?${query}`);
      } catch (firstErr) {
        data = await fetchLogisticJson(`${LOGISTIC_BASE}/parkings/?${query}`);
      }
      const rows = rowsFromPayload(data);
      out.push(...rows);
      totalItems = Number(data?.total_items || data?.totalItems || data?.total || totalItems || out.length);
      totalPages = Number(data?.total_pages || data?.totalPages || totalPages || 1);
      if (onProgress) onProgress(out.length, totalItems);
      if (!rows.length || rows.length < 500) break;
    }
    return out;
  }
  async function fetchLogisticPaged(kind, cityId, maxPages = 10) {
    const out = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const rows = await fetchLogisticRows(`${LOGISTIC_BASE}/${kind}?city_id=${encodeURIComponent(cityId)}&page=${page}&limit=1000`);
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }

  async function fetchLogisticRows(url) {
    return rowsFromPayload(await fetchLogisticJson(url));
  }

  async function fetchLogisticJson(url) {
    const proxy = localStorage.getItem("bh_live_proxy_url") || "";
    const finalUrl = proxy ? `${proxy}${proxy.includes("?") ? "&" : "?"}url=${encodeURIComponent(url)}` : url;
    const res = await fetch(finalUrl, { mode: "cors", credentials: "omit", headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText || "API error"}`);
    return res.json();
  }

  function rowsFromPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    for (const key of ["rows", "pontos", "points", "cidades", "data", "items", "entries", "results", "parkings", "bikes", "rules", "schedules", "monitores", "todos"]) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
      if (value && Array.isArray(value.data)) return value.data;
      if (value && Array.isArray(value.items)) return value.items;
      if (value && Array.isArray(value.results)) return value.results;
    }
    return [];
  }

  function normalizeCapacityParkings(rows) {
    return (rows || []).map((row) => {
      const point = objectPoint(row);
      const name = cleanText(row.name || row.nome || row.Nome || row.title || row.shortName || row.address || row.endereco || row.estacionamento || row.ponto || row.parking_name || row.parkingName || row.id);
      const rawId = row.id ?? row.parking_id ?? row.parkingId ?? row.gojet_id ?? row.gojetId ?? row.uuid ?? row.id_parking ?? row.parking?.id ?? row.parking?._id ?? row._id?.$oid ?? row._id?.oid ?? (typeof row._id === "string" ? row._id : "");
      const id = cleanText(rawId);
      if (!name) return null;
      return {
        id,
        name,
        key: capacityNameKey(name),
        lat: point?.lat ?? null,
        lng: point?.lng ?? null,
        monitor: Boolean(row.monitor || row.is_monitor || row.isMonitor || row.monitored),
        bikesCount: toNumber(row.bikes_count ?? row.bikesCount ?? row.current ?? row.available),
        source: id ? "GoJet parkings" : "parkings without id",
      };
    }).filter(Boolean);
  }
  function createMonitorCapacityFileFromRules(rulesRaw, scheduleRaw, city, allParkings) {
    const headersRaw = ["city_id", "city_name", "schedule_id", "schedule_name", "parking_id", "parking_name", "parking_latitude", "parking_longitude", "capacity"];
    const scheduleNames = buildScheduleNameMap(scheduleRaw);
    const scheduleIdsByName = buildScheduleIdByNameMap(scheduleRaw);
    const parkingsById = new Map((allParkings || []).map((p) => [p.id, p]));
    const cellsRows = (rulesRaw || []).map((rule) => {
      const parkingId = cleanText(rule.parking_id || rule.parkingId || rule.parking?.id || rule.parking?._id || rule.id_parking || "");
      const parking = parkingId ? parkingsById.get(parkingId) : null;
      const point = objectPoint(rule) || objectPoint(rule.parking || {}) || (parking ? { lat: parking.lat, lng: parking.lng } : null);
      let scheduleId = cleanText(rule.schedule_id || rule.scheduleId || rule.schedule?.id || rule.schedule?._id || "");
      const scheduleName = normalizeCapacitySchedule(rule.schedule_name || rule.scheduleName || rule.schedule?.name || scheduleNames.get(scheduleId) || rule.period || rule.block || rule.rule_name || rule.name);
      if (!scheduleId && scheduleName) scheduleId = scheduleIdsByName.get(scheduleName) || "";
      const parkingName = cleanText(rule.parking_name || rule.parkingName || rule.parking?.name || rule.name || parking?.name || parkingId);
      const capacity = Math.round(toNumber(rule.capacity ?? rule.target ?? rule.expected_bikes_count ?? rule.expectedBikesCount ?? rule.target_bikes_count ?? rule.targetBikesCount));
      if (!parkingName || !scheduleName || !Number.isFinite(capacity)) return null;
      return [city.id, city.name, scheduleId, scheduleName, parkingId, parkingName, point?.lat ?? "", point?.lng ?? "", capacity];
    }).filter(Boolean);
    const parsed = parseMonitorCapacityFile(serializeMonitorFile(headersRaw, cellsRows, ";"));
    parsed.records.forEach((record) => { record.cells = padCells(record.cells, headersRaw.length); });
    return parsed;
  }

  function buildScheduleNameMap(payload) {
    const rows = rowsFromPayload(payload);
    const out = new Map();
    rows.forEach((row) => {
      const id = cleanText(row.id || row._id || row.schedule_id || row.scheduleId || "");
      const name = cleanText(row.name || row.title || row.schedule_name || row.scheduleName || row.period || row.block || "");
      if (id && name) out.set(id, name);
    });
    return out;
  }

  function buildScheduleIdByNameMap(payload) {
    const rows = rowsFromPayload(payload);
    const out = new Map();
    rows.forEach((row) => {
      const id = cleanText(row.id || row._id || row.schedule_id || row.scheduleId || "");
      const name = normalizeCapacitySchedule(row.name || row.title || row.schedule_name || row.scheduleName || row.period || row.block || "");
      if (id && name) out.set(name, id);
    });
    return out;
  }

  function objectPoint(row) {
    if (!row || typeof row !== "object") return null;
    const directLat = toNumber(row.lat ?? row.latitude);
    const directLng = toNumber(row.lng ?? row.lon ?? row.longitude);
    if (directLat && directLng) return { lat: directLat, lng: directLng };
    for (const value of [row.position, row.location, row.coordinates, row.coord, row.point, row.geo]) {
      if (!value) continue;
      if (Array.isArray(value) && value.length >= 2) {
        const a = Number(value[0]);
        const b = Number(value[1]);
        if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a) <= 90 ? { lat: a, lng: b } : { lat: b, lng: a };
      }
      if (Array.isArray(value.coordinates)) {
        const lng = Number(value.coordinates[0]);
        const lat = Number(value.coordinates[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
      const lat = toNumber(value.lat ?? value.latitude);
      const lng = toNumber(value.lng ?? value.lon ?? value.longitude);
      if (lat && lng) return { lat, lng };
    }
    return null;
  }


  async function prepareMonitorFromRentalHistory({ auto = false } = {}) {
    if (!state.rides.length) {
      renderAutoCapacitySummary();
      if (!auto) {
        setStatus("warn", "\u0412\u044b\u0431\u0435\u0440\u0438 XLSX \u0430\u0440\u0435\u043d\u0434\u044b");
        toast("\u0412\u044b\u0431\u0435\u0440\u0438 \u0444\u0430\u0439\u043b \u0430\u0440\u0435\u043d\u0434\u044b XLSX");
        els.fileInput?.click();
      }
      return null;
    }
    try {
      setStatus("warn", "JET Brain: \u0441\u0447\u0438\u0442\u0430\u044e capacity \u043f\u043e \u0430\u0440\u0435\u043d\u0434\u0430\u043c");
      // Load the city catalog FIRST so rides snap to real GoJet parkings during the
      // capacity build (otherwise flows fragment by name and capacity inflates).
      if (!state.capacity.allParkings.length || state.capacity.allParkings.some((point) => !point.id)) {
        await loadSelectedCityParkings();
      }
      if (!state.capacity.monitorRows.length) {
        await loadSelectedCityMonitorRules();
      }
      const built = buildRentalCapacityRows(state.rides);
      if (!built.sourceRows.length && !built.weekendRows.length) {
        toast("\u0412 \u0430\u0440\u0435\u043d\u0434\u0430\u0445 \u043d\u0435 \u043d\u0430\u0448\u0435\u043b \u043f\u0430\u0440\u043a\u043e\u0432\u043a\u0438 \u0441 capacity 2+", true);
        state.capacity.autoRental = built.summary;
        renderAutoCapacitySummary();
        return null;
      }
      state.capacity.sourceRows = built.sourceRows;
      state.capacity.weekendRows = built.weekendRows;
      state.capacity.sourceFileName = "auto: rentals weekday/friday";
      state.capacity.weekendFileName = "auto: rentals weekend";
      state.capacity.autoRental = built.summary;
      recomputeCapacityCompare();
      renderCapacityCompare();
      renderAutoCapacitySummary();
      setStatus("ok", `Monitor CSV \u0433\u043e\u0442\u043e\u0432: ${fmtInt(state.capacity.generated?.outputRecords?.length || 0)} \u0441\u0442\u0440\u043e\u043a`);
      if (!auto) toast(`\u0413\u043e\u0442\u043e\u0432\u043e: capacity \u0441\u043e\u0431\u0440\u0430\u043d \u043f\u043e \u0430\u0440\u0435\u043d\u0434\u0430\u043c, \u043c\u043e\u0436\u043d\u043e \u0441\u043a\u0430\u0447\u0430\u0442\u044c ${selectedCapacityCity().name}.csv`);
      return built;
    } catch (err) {
      console.error(err);
      setStatus("bad", "\u041e\u0448\u0438\u0431\u043a\u0430 auto capacity");
      toast(`Auto capacity: ${err.message}`, true);
      renderAutoCapacitySummary();
      return null;
    }
  }

  function monitorParkingLimitValue() {
    const value = cleanText(state.settings.monitorParkingLimit || "all");
    if (!value || value === "all") return Infinity;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : Infinity;
  }

  function applyMonitorParkingLimit(rows) {
    const limit = monitorParkingLimitValue();
    const sliced = Number.isFinite(limit) ? rows.slice(0, limit) : rows;
    return sliced.map((row, index) => ({ ...row, rank: index + 1 }));
  }

  // Resolve a period selector value to a numeric Top-N (Infinity = all, 0 = none,
  // "same" = fall back to the general Qtd. no monitor limit).
  function periodLimitValue(period) {
    const raw = cleanText(state.settings.monitorPeriodLimits?.[period] || "same");
    if (raw === "same" || raw === "") return monitorParkingLimitValue();
    if (raw === "all") return Infinity;
    if (raw === "0") return 0;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : Infinity;
  }

  // Starts/day for a period (friday periods prefer friday starts when present).
  function periodStarts(row, period) {
    const isFriday = period === "fridayDay" || period === "fridayEvening";
    const raw = isFriday ? (row.fridayStartsPerDay ?? row.startsPerDay) : row.startsPerDay;
    return Number.parseFloat(raw) || 0;
  }

  // Independent Top-N per period. Priority = biggest capacity first, then biggest
  // starts/day, so a limited quota always keeps the strongest parkings and only
  // then the rest. Rows outside the top-N get this period's field zeroed (dropped
  // from the period), while still able to qualify in other periods.
  function applyPeriodTopN(rows, period) {
    const field = CAPACITY_PERIOD_TARGET_FIELDS[period];
    const limit = periodLimitValue(period);
    if (limit === Infinity) return;
    const ranked = rows
      .filter((row) => (Number(row[field]) || 0) >= 2)
      .sort((a, b) => ((Number(b[field]) || 0) - (Number(a[field]) || 0))
        || (periodStarts(b, period) - periodStarts(a, period)));
    const keep = new Set(ranked.slice(0, limit).map((row) => row.key));
    rows.forEach((row) => { if (row.manual) return; if (!keep.has(row.key)) row[field] = 0; });
  }

  function buildRentalCapacityRows(rides) {
    const usable = (rides || []).filter((ride) => sameCity(ride.city) && ride.ts);
    const latestTs = usable.reduce((max, ride) => Math.max(max, ride.ts || 0), 0);
    const cutoffTs = latestTs ? latestTs - state.settings.lookbackDays * 86400000 : 0;
    const resolver = buildParkingResolver(usable);
    const recent = usable
      .filter((ride) => !cutoffTs || ride.ts >= cutoffTs)
      .map((ride) => resolveRideEndParking(resolveRideParking(ride, resolver), resolver));

    const groups = {
      weekday: createRentalCapacityGroup("\u0411\u0443\u0434\u043d\u0438"),
      friday: createRentalCapacityGroup("\u041f\u044f\u0442\u043d\u0438\u0446\u0430"),
      weekend: createRentalCapacityGroup("\u0412\u044b\u0445\u043e\u0434\u043d\u044b\u0435"),
    };

    const selectedZones = zoneListOf(state.capacity?.zoneFilter).filter((z) => z && z !== "all");
    const zoneSet = new Set(selectedZones);
    const zoneOn = zoneSet.size > 0;
    const inZone = (list) => zoneListOf(list).some((z) => zoneSet.has(z));
    recent.forEach((ride) => {
      if (ride.isParkingSignal && isUsableParking(ride.parkingName) && (!zoneOn || inZone(ride.zone))) {
        addRentalCapacityEvent(groups, ride.weekday, ride.dateKey, ride.hour, ride.parkingName, ride.parkingKey, "start", ride);
      }
      if (isUsableParking(ride.endName) && (!zoneOn || inZone(ride.endZone))) {
        const endMeta = rentalEndMeta(ride);
        addRentalCapacityEvent(groups, endMeta.weekday, endMeta.dateKey, endMeta.hour, ride.endName, ride.endKey || normalizeSearch(ride.endName), "end", ride);
      }
    });

    const weekdayRows = summarizeRentalCapacityGroup(groups.weekday);
    const fridayRows = summarizeRentalCapacityGroup(groups.friday);
    const weekendRowsRaw = summarizeRentalCapacityGroup(groups.weekend);
    const merged = new Map();

    weekdayRows.forEach((row) => {
      merged.set(row.key, {
        ...row,
        targetFridayDay: 0,
        targetFridayEvening: 0,
        targetWeekend: 0,
        blockSummary: `\u0411\u0443\u0434\u043d\u0438 ${row.targetDay}/${row.targetEvening}`,
      });
    });
    fridayRows.forEach((row) => {
      const base = merged.get(row.key) || {
        ...row,
        targetDay: 0,
        targetEvening: 0,
        capTotal: 0,
        targetWeekend: 0,
        startsPerDay: "0.0",
        finishesPerDay: "0.0",
        balance: "0.0",
        zoneType: row.zoneType,
      };
      base.targetFridayDay = row.targetDay;
      base.targetFridayEvening = row.targetEvening;
      base.fridayStartsPerDay = row.startsPerDay;
      base.blockSummary = [
        base.targetDay || base.targetEvening ? `\u0411\u0443\u0434\u043d\u0438 ${base.targetDay}/${base.targetEvening}` : "",
        `\u041f\u0442 ${row.targetDay}/${row.targetEvening}`,
      ].filter(Boolean).join(" | ");
      merged.set(row.key, base);
    });

    // Low-sample guard: friday/weekend computed from fewer than 2 days is unreliable
    // and a single busy day inflates the monitor. Fall back to the weekday capacity
    // for those blocks until enough friday/weekend days accumulate.
    if ((groups.friday.days.size || 0) < 2) {
      merged.forEach((row) => { row.targetFridayDay = row.targetDay || 0; row.targetFridayEvening = row.targetEvening || 0; });
    }
    if ((groups.weekend.days.size || 0) < 2) {
      const wkAll = new Map([...merged.values()].map((r) => [r.key, Math.max(r.targetDay || 0, r.targetEvening || 0)]));
      weekendRowsRaw.forEach((row) => { const w = wkAll.get(row.key); if (w != null && (row.targetWeekend || 0) > w) row.targetWeekend = w; });
    }

    // Global ceiling: 55 scooters on one spot is neither tidy nor profitable, so
    // every computed block is capped at the teto (default 15). Manual overrides
    // below run AFTER this, so a hand-typed value may deliberately exceed it.
    const ceilRaw = state.settings?.capacityCeiling;
    const ceiling = (ceilRaw == null || ceilRaw === "") ? Infinity : Math.max(0, Number(ceilRaw) || 0);
    if (Number.isFinite(ceiling)) {
      const capField = (row, f) => { if ((row[f] || 0) > ceiling) row[f] = ceiling; };
      merged.forEach((row) => { capField(row, "targetDay"); capField(row, "targetEvening"); capField(row, "targetFridayDay"); capField(row, "targetFridayEvening"); capField(row, "targetWeekend"); });
      weekendRowsRaw.forEach((row) => capField(row, "targetWeekend"));
    }

    // Manual overrides: a capacity typed by hand wins over the computed value.
    // It is applied to every block of that parking and marked so Top-N and the
    // >=2 threshold never drop it \u2014 the operator decided this number goes to the
    // monitor.
    const applyManual = (row) => {
      const v = manualCapFor(row.name);
      if (v === undefined) return;
      row.manual = true;
      row.targetDay = row.targetEvening = v;
      row.targetFridayDay = row.targetFridayEvening = v;
      row.targetWeekend = v;
    };
    merged.forEach(applyManual);
    weekendRowsRaw.forEach((row) => { const v = manualCapFor(row.name); if (v !== undefined) { row.manual = true; row.targetWeekend = v; } });

    // Independent Top-N per period: each period keeps its own strongest parkings by
    // its own demand. The same parking can qualify in several periods at once
    // (e.g. sexta noite \u0438 \u0431\u0443\u0434\u043d\u0438), depending on rental starts/returns in each period.
    const candidates = [...merged.values()];
    ["weekdayDay", "weekdayEvening", "fridayDay", "fridayEvening"].forEach((period) => applyPeriodTopN(candidates, period));
    const sourceRows = candidates
      .filter((row) => row.manual || Math.max(row.targetDay || 0, row.targetEvening || 0, row.targetFridayDay || 0, row.targetFridayEvening || 0) >= 2)
      .sort((a, b) => Math.max(b.targetDay || 0, b.targetEvening || 0, b.targetFridayDay || 0, b.targetFridayEvening || 0) - Math.max(a.targetDay || 0, a.targetEvening || 0, a.targetFridayDay || 0, a.targetFridayEvening || 0))
      .map((row, index) => ({ ...row, rank: index + 1 }));

    const weekendCandidates = weekendRowsRaw
      .filter((row) => row.manual || row.targetWeekend >= 2)
      .map((row) => ({ ...row, blockSummary: `\u0412\u044b\u0445\u043e\u0434\u043d\u044b\u0435 ${row.targetWeekend}` }));
    applyPeriodTopN(weekendCandidates, "weekend");
    const weekendRows = weekendCandidates
      .filter((row) => row.manual || (row.targetWeekend || 0) >= 2)
      .sort((a, b) => (b.targetWeekend || 0) - (a.targetWeekend || 0))
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return {
      sourceRows,
      weekendRows,
      summary: {
        at: Date.now(),
        rides: recent.length,
        days: new Set(recent.map((ride) => ride.dateKey)).size,
        lookbackDays: state.settings.lookbackDays,
        weekdayDays: groups.weekday.days.size,
        fridayDays: groups.friday.days.size,
        weekendDays: groups.weekend.days.size,
        weekdayRows: sourceRows.length,
        weekendRows: weekendRows.length,
      },
    };
  }

  function createRentalCapacityGroup(label) {
    return { label, days: new Set(), parkings: new Map() };
  }

  function addRentalCapacityEvent(groups, weekday, dateKey, hour, name, key, type, ride) {
    const block = rentalCapacityBlock(weekday);
    const group = groups[block];
    if (!group || !dateKey || !Number.isFinite(Number(hour))) return;
    const parkingKey = key || normalizeSearch(name);
    if (!parkingKey || !name) return;
    group.days.add(dateKey);
    if (!group.parkings.has(parkingKey)) {
      group.parkings.set(parkingKey, {
        key: parkingKey,
        name,
        days: new Map(),
        starts: 0,
        ends: 0,
        lat: ride.startLat ?? ride.endLat ?? null,
        lng: ride.startLng ?? ride.endLng ?? null,
      });
    }
    const item = group.parkings.get(parkingKey);
    item.name = item.name || name;
    if (item.lat == null && (ride.startLat != null || ride.endLat != null)) item.lat = ride.startLat ?? ride.endLat;
    if (item.lng == null && (ride.startLng != null || ride.endLng != null)) item.lng = ride.startLng ?? ride.endLng;
    if (!item.days.has(dateKey)) item.days.set(dateKey, Array.from({ length: 24 }, () => ({ dep: 0, arr: 0 })));
    const bucket = item.days.get(dateKey)[clamp(Number(hour), 0, 23)];
    if (type === "start") {
      bucket.dep += 1;
      item.starts += 1;
    } else {
      bucket.arr += 1;
      item.ends += 1;
    }
  }

  function rentalCapacityBlock(weekday) {
    if (weekday === 5) return "friday";
    if (weekday === 0 || weekday === 6) return "weekend";
    return "weekday";
  }

  function rentalEndMeta(ride) {
    if (ride.endTs) {
      const dt = new Date(ride.endTs);
      return { dateKey: ride.endDateKey || toDateKey(dt), weekday: ride.endWeekday ?? dt.getDay(), hour: ride.endHour ?? dt.getHours() };
    }
    if (ride.durationSec && ride.ts) {
      const dt = new Date(ride.ts + ride.durationSec * 1000);
      return { dateKey: toDateKey(dt), weekday: dt.getDay(), hour: dt.getHours() };
    }
    return { dateKey: ride.dateKey, weekday: ride.weekday, hour: ride.hour };
  }

  function summarizeRentalCapacityGroup(group) {
    const days = [...group.days].sort();
    if (!days.length) return [];
    const rows = [];
    group.parkings.forEach((item) => {
      const capsAll = [];
      const capsDay = [];
      const capsEvening = [];
      const winH = clamp(Number(state.settings.capacityWindow) || 12, 2, 12);
      const dayHours = Array.from({ length: 12 }, (_, hour) => hour);
      const eveningHours = Array.from({ length: 12 }, (_, hour) => hour + 12);
      const allHours = Array.from({ length: 24 }, (_, hour) => hour);
      days.forEach((day) => {
        const matrix = item.days.get(day) || emptyRentalDayMatrix();
        capsAll.push(rentalMaxDeficit(matrix, allHours, 24));
        capsDay.push(rentalMaxDeficit(matrix, dayHours, winH));
        capsEvening.push(rentalMaxDeficit(matrix, eveningHours, winH));
      });
      const rawAll = Math.ceil(avg(capsAll));
      const rawDay = Math.ceil(avg(capsDay));
      const rawEvening = Math.ceil(avg(capsEvening));
      const targetDay = capacityExportMinimum(rawDay);
      const targetEvening = capacityExportMinimum(rawEvening);
      const targetWeekend = capacityExportMinimum(rawAll || Math.max(rawDay, rawEvening));
      if (Math.max(targetDay, targetEvening, targetWeekend) < 2) return;
      const startsPerDay = item.starts / Math.max(1, days.length);
      const finishesPerDay = item.ends / Math.max(1, days.length);
      rows.push({
        rank: 0,
        name: item.name,
        key: capacityNameKey(item.name),
        startsPerDay: startsPerDay.toFixed(1),
        finishesPerDay: finishesPerDay.toFixed(1),
        balance: (startsPerDay - finishesPerDay).toFixed(1),
        zoneType: startsPerDay > finishesPerDay * 1.35 ? "\u0441\u0442\u0430\u0440\u0442\u043e\u0432\u0430\u044f" : finishesPerDay > startsPerDay * 1.35 ? "\u0444\u0438\u043d\u0438\u0448\u043d\u0430\u044f" : "\u0440\u043e\u0432\u043d\u0430\u044f",
        capTotal: targetWeekend,
        targetDay,
        targetEvening,
        targetWeekend,
        lat: item.lat,
        lng: item.lng,
      });
    });
    return rows.sort((a, b) => Math.max(b.capTotal, b.targetDay, b.targetEvening) - Math.max(a.capTotal, a.targetDay, a.targetEvening));
  }

  function emptyRentalDayMatrix() {
    return Array.from({ length: 24 }, () => ({ dep: 0, arr: 0 }));
  }

  // Peak cumulative net deficit (departures - arrivals) inside the worst winH-hour
  // window whose start is in startHours (hours wrap past midnight). Matches the
  // sliding-window method used by the reference dashboard.
  // Peak cumulative net deficit (departures - arrivals) inside the worst window of
  // length winH that fits ENTIRELY within the given block hours (no crossing into
  // another block). With winH >= block length it's the whole block (default),
  // which prevents a half-day block from inflating with the other half's demand.
  function rentalMaxDeficit(matrix, hours, winH) {
    const n = hours.length;
    const w = Math.min(winH || n, n);
    let best = 0;
    for (let i = 0; i + w <= n; i += 1) {
      let cumulative = 0;
      let peak = 0;
      for (let j = i; j < i + w; j += 1) {
        const bucket = matrix[hours[j]] || {};
        cumulative += (bucket.dep || 0) - (bucket.arr || 0);
        if (cumulative > peak) peak = cumulative;
      }
      if (peak > best) best = peak;
    }
    return best;
  }

  function capacityExportMinimum(value) {
    const rounded = Math.round(Number(value) || 0);
    return rounded >= 2 ? rounded : 0;
  }

  function avg(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function capacityRowTargetLabel(row) {
    const parts = [];
    if (row.targetDay || row.targetEvening) parts.push(`\u0411\u0443\u0434\u043d\u0438 ${fmtInt(row.targetDay || 0)}/${fmtInt(row.targetEvening || 0)}`);
    if (row.targetFridayDay || row.targetFridayEvening) parts.push(`\u041f\u0442 ${fmtInt(row.targetFridayDay || 0)}/${fmtInt(row.targetFridayEvening || 0)}`);
    if (row.targetWeekend) parts.push(`\u0412\u044b\u0445\u043e\u0434\u043d\u044b\u0435 ${fmtInt(row.targetWeekend)}`);
    return parts.join(" | ");
  }

  function renderAutoCapacitySummary() {
    if (!els.autoCapacitySummary) return;
    const auto = state.capacity?.autoRental;
    const generated = state.capacity?.generated;
    if (!auto) {
      els.autoCapacitySummary.innerHTML = `
        <div class="auto-empty"><strong>\u0417\u0430\u0433\u0440\u0443\u0437\u0438 \u0430\u0440\u0435\u043d\u0434\u044b XLSX</strong><span>JET Brain \u0441\u0430\u043c \u0440\u0430\u0437\u043b\u043e\u0436\u0438\u0442 \u0431\u0443\u0434\u043d\u0438, \u043f\u044f\u0442\u043d\u0438\u0446\u0443 \u0438 \u0432\u044b\u0445\u043e\u0434\u043d\u044b\u0435, \u043f\u043e\u0442\u043e\u043c \u0441\u043e\u0431\u0435\u0440\u0435\u0442 monitor CSV.</span></div>
      `;
    } else {
      els.autoCapacitySummary.innerHTML = `
        <div class="auto-metrics">
          <div><strong>${fmtInt(auto.rides)}</strong><span>\u0430\u0440\u0435\u043d\u0434 \u0432 \u0440\u0430\u0441\u0447\u0435\u0442\u0435</span></div>
          <div><strong>${fmtInt(auto.weekdayDays)}</strong><span>\u0431\u0443\u0434\u043d\u0438\u0445 \u0434\u043d\u0435\u0439</span></div>
          <div><strong>${fmtInt(auto.fridayDays)}</strong><span>\u043f\u044f\u0442\u043d\u0438\u0446</span></div>
          <div><strong>${fmtInt(auto.weekendDays)}</strong><span>\u0432\u044b\u0445\u043e\u0434\u043d\u044b\u0445 \u0434\u043d\u0435\u0439</span></div>
          <div><strong>${fmtInt(generated?.outputRecords?.length || 0)}</strong><span>\u0441\u0442\u0440\u043e\u043a CSV</span></div>
        </div>
      `;
    }
    renderMonitorSuggestions();
  }

  function renderMonitorSuggestions() {
    if (!els.monitorSuggestionList) return;
    const cmp = state.capacity?.comparison;
    const rows = [
      ...(cmp?.missing || []).map((row) => ({ ...row, kind: "\u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0432 monitor" })),
      ...(cmp?.possible || []).map((row) => ({ ...row, kind: "\u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435" })),
    ];
    if (!rows.length) {
      els.monitorSuggestionList.innerHTML = `<div class="compact-item"><strong>\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043d\u043e\u0432\u044b\u0445 \u043f\u0430\u0440\u043a\u043e\u0432\u043e\u043a</strong><span>\u041f\u043e\u0441\u043b\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0430\u0440\u0435\u043d\u0434\u044b \u0437\u0434\u0435\u0441\u044c \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u0442\u043e\u0447\u043a\u0438, \u043a\u043e\u0442\u043e\u0440\u044b\u0445 \u043d\u0435\u0442 \u0432 monitor.</span></div>`;
      return;
    }
    els.monitorSuggestionList.innerHTML = rows.slice(0, 10).map((row, index) => `
      <div class="compact-item monitor-add-item">
        <strong>${index + 1}. ${esc(row.parking)}</strong>
        <span>${esc(row.kind)} | ${esc(row.targetLabel || "capacity 2+")} | score ${esc(row.matchScore || 0)}</span>
      </div>
    `).join("");
  }

  // Preview of what will go into the monitor: one row per parking with starts/
  // finishes/balance/return%, overall capacity, day/evening capacity, block
  // breakdown and type. Mirrors the competitor's ranking view.
  let capPreviewSort = "priority";
  let capPreviewSearch = "";
  const CAP_TYPE_LABEL = { "стартовая": "Источник", "финишная": "Накопитель", "ровная": "Баланс" };

  function renderCapacityPreview() {
    if (!els.capacityPreview) return;
    const src = state.capacity?.sourceRows || [];
    const wknd = state.capacity?.weekendRows || [];
    const byKey = new Map();
    const merge = (r) => {
      const k = r.key || capacityNameKey(r.name);
      if (!byKey.has(k)) byKey.set(k, { key: k, name: r.name, starts: 0, finishes: 0, zoneType: r.zoneType || "", td: 0, te: 0, tfd: 0, tfe: 0, tw: 0 });
      const o = byKey.get(k);
      const s = parseFloat(r.startsPerDay) || 0, f = parseFloat(r.finishesPerDay) || 0;
      if (s > o.starts) o.starts = s;
      if (f > o.finishes) o.finishes = f;
      if (r.zoneType && !o.zoneType) o.zoneType = r.zoneType;
      o.td = Math.max(o.td, r.targetDay || 0); o.te = Math.max(o.te, r.targetEvening || 0);
      o.tfd = Math.max(o.tfd, r.targetFridayDay || 0); o.tfe = Math.max(o.tfe, r.targetFridayEvening || 0);
      o.tw = Math.max(o.tw, r.targetWeekend || 0);
    };
    src.forEach(merge); wknd.forEach(merge);
    // Mirror the build: cap every block at the teto for display too, so the
    // preview never shows a number the exported CSV would not. Manual overrides
    // may exceed the ceiling (operator's call).
    const ceilRaw = state.settings?.capacityCeiling;
    const ceiling = (ceilRaw == null || ceilRaw === "") ? Infinity : Math.max(0, Number(ceilRaw) || 0);
    let rows = [...byKey.values()].map((o) => {
      const mc = manualCapFor(o.name);
      const lim = (mc !== undefined) ? Infinity : ceiling;
      if (Number.isFinite(lim)) {
        o.td = Math.min(o.td, lim); o.te = Math.min(o.te, lim);
        o.tfd = Math.min(o.tfd, lim); o.tfe = Math.min(o.tfe, lim);
        o.tw = Math.min(o.tw, lim);
      }
      const moon = Math.max(o.td, o.tfd), sun = Math.max(o.te, o.tfe);
      const cap = Math.max(moon, sun, o.tw);
      const ret = o.starts > 0 ? o.finishes / o.starts : 0;
      const blocks = [
        (o.td || o.te) ? `Будни ${o.td}/${o.te}` : "",
        (o.tfd || o.tfe) ? `Пт ${o.tfd}/${o.tfe}` : "",
        o.tw ? `Вых ${o.tw}` : "",
      ].filter(Boolean).join(" · ");
      // Fill priority: demand that leaves and is NOT replenished on-site.
      // High starts + low return => empties fast => must stay full. Accumulators
      // (return >= 1) score 0 — they refill themselves.
      const retC = Math.max(0, Math.min(1, ret));
      const pri = o.starts * (1 - retC);
      return { ...o, cap, moon, sun, ret, balance: o.finishes - o.starts, blocks, pri };
    });
    const f = (capPreviewSearch || "").toLowerCase();
    if (f) rows = rows.filter((r) => (r.name || "").toLowerCase().includes(f) || (r.blocks || "").toLowerCase().includes(f));
    const cmp = { priority: (a, b) => b.pri - a.pri, cap: (a, b) => b.cap - a.cap, starts: (a, b) => b.starts - a.starts, balance: (a, b) => a.balance - b.balance };
    rows.sort(cmp[capPreviewSort] || cmp.cap);

    if (els.capacityPreviewInfo) {
      const city = selectedCapacityCity();
      const cityRides = (state.rides || []).filter((r) => sameCity(r.city));
      const ts = cityRides.map((r) => r.ts).filter(Boolean).sort((a, b) => a - b);
      const days = new Set(cityRides.map((r) => r.dateKey)).size;
      const per = ts.length ? `${new Date(ts[0]).toLocaleDateString("pt-BR")} – ${new Date(ts[ts.length - 1]).toLocaleDateString("pt-BR")}` : "—";
      els.capacityPreviewInfo.textContent = `${city.name} · ${per} · ${fmtInt(days)} дней · ${fmtInt(cityRides.length)} аренд · ${fmtInt(rows.length)} парковок`;
    }
    if (!rows.length) { els.capacityPreview.innerHTML = `<div class="preview-empty">Загрузи аренды и нажми «Собрать» — здесь появится, что пойдёт в монитор.</div>`; return; }
    const head = `<tr><th>#</th><th class="l">Parking</th><th>Starts/dia</th><th>Fins/dia</th><th>Balanço</th><th>Retorno%</th><th>CAPACITY</th><th title="Что делать: 🔴 держать полной (источник, высокий спрос) · 🟡 частично · 🟢 не пополнять (накопитель)">🎯</th><th title="Ручной capacity — перебивает расчёт и идёт в монитор">✍ Manual</th><th class="l">Blocos</th><th>Tipo</th></tr>`;
    const body = rows.map((r, i) => {
      const t = CAP_TYPE_LABEL[r.zoneType] || "Баланс";
      const tc = t === "Источник" ? "src" : t === "Накопитель" ? "acc" : "bal";
      const mv = manualCapFor(r.name);
      const hasMan = mv !== undefined;
      const shownCap = hasMan ? mv : r.cap;
      let rec = "🟡 50%", recCls = "rec-mid";
      if (r.balance < -0.5) { rec = "🔴 100%"; recCls = "rec-fill"; }
      else if (r.balance > 0.5) { rec = "🟢 0%"; recCls = "rec-no"; }
      return `<tr${hasMan ? ' class="man-row"' : ""}><td>${i + 1}</td><td class="l">${esc(r.name)}</td><td>${r.starts.toFixed(1)}</td><td>${r.finishes.toFixed(1)}</td>`
        + `<td class="${r.balance < 0 ? "neg" : "pos"}">${r.balance > 0 ? "+" : ""}${r.balance.toFixed(1)}</td>`
        + `<td>${(r.ret * 100).toFixed(0)}%</td><td class="cap">${fmtInt(shownCap)}</td>`
        + `<td><span class="rec ${recCls}">${rec}</span></td>`
        + `<td><input class="capman" type="number" min="0" step="1" inputmode="numeric" data-key="${esc(capacityNameKey(r.name))}" value="${hasMan ? mv : ""}" placeholder="авто"></td>`
        + `<td class="l blocks">${esc(r.blocks)}</td><td><span class="ztype ${tc}">${t}</span></td></tr>`;
    }).join("");
    els.capacityPreview.innerHTML = `<div class="preview-table-wrap"><table class="preview-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  async function importCapacityCsv(file) {
    try {
      const text = await file.text();
      const rows = parseCapacityTopRows(text);
      state.capacity.sourceRows = rows;
      state.capacity.sourceFileName = file.name;
      recomputeCapacityCompare();
      renderCapacityCompare();
      toast(`${file.name}: capacity 2+ ${fmtInt(rows.length)}`);
    } catch (err) {
      console.error(err);
      toast(`${file.name}: ${err.message}`, true);
    }
  }

  async function importMonitorCapacityCsv(file) {
    try {
      const text = await file.text();
      const parsed = parseMonitorCapacityFile(text);
      state.capacity.monitorRows = parsed.rows;
      state.capacity.monitorFile = parsed;
      state.capacity.monitorFileName = file.name;
      recomputeCapacityCompare();
      renderCapacityCompare();
      toast(`${file.name}: monitor rules ${fmtInt(parsed.rows.length)}`);
    } catch (err) {
      console.error(err);
      toast(`${file.name}: ${err.message}`, true);
    }
  }

  async function importWeekendCapacityCsv(file) {
    try {
      const text = await file.text();
      const rows = parseCapacityTopRows(text);
      state.capacity.weekendRows = rows;
      state.capacity.weekendFileName = file.name;
      recomputeCapacityCompare();
      renderCapacityCompare();
      toast(`${file.name}: weekend capacity ${fmtInt(rows.length)}`);
    } catch (err) {
      console.error(err);
      toast(`${file.name}: ${err.message}`, true);
    }
  }

  // Recompute capacity rows from already-loaded rides (no network). Used when a
  // period limit / window / zone filter changes so gating re-applies instantly.
  function rebuildRentalCapacityRows() {
    if (!state.rides?.length) { recomputeCapacityCompare(); renderCapacityCompare(); return; }
    const built = buildRentalCapacityRows(state.rides);
    state.capacity.sourceRows = built.sourceRows;
    state.capacity.weekendRows = built.weekendRows;
    state.capacity.autoRental = built.summary;
    recomputeCapacityCompare();
    renderCapacityCompare();
    renderAutoCapacitySummary();
  }

  function recomputeCapacityCompare() {
    if (!state.capacity) return;
    const monitorInfo = getMonitorCapacityRows();
    const sourceRows = getCapacityComparisonRows();
    if (!sourceRows.length) {
      state.capacity.comparison = emptyCapacityComparison(monitorInfo);
      state.capacity.generated = null;
      return;
    }
    state.capacity.comparison = compareCapacityRows(sourceRows, monitorInfo.rows, monitorInfo.source);
    state.capacity.generated = buildUpdatedMonitorFile({ preview: true });
  }

  function getCapacityComparisonRows() {
    const merged = new Map();
    const put = (row, type) => {
      if (!row?.name) return;
      const key = row.key || capacityNameKey(row.name);
      if (!key) return;
      const existing = merged.get(key) || {
        ...row,
        key,
        targetDay: 0,
        targetEvening: 0,
        targetFridayDay: 0,
        targetFridayEvening: 0,
        targetWeekend: 0,
      };
      if (type === "regular") {
        existing.rank = existing.rank || row.rank;
        existing.name = existing.name || row.name;
        existing.targetDay = Math.max(existing.targetDay || 0, row.targetDay || 0);
        existing.targetEvening = Math.max(existing.targetEvening || 0, row.targetEvening || 0);
        existing.targetFridayDay = Math.max(existing.targetFridayDay || 0, row.targetFridayDay || 0);
        existing.targetFridayEvening = Math.max(existing.targetFridayEvening || 0, row.targetFridayEvening || 0);
        existing.startsPerDay = row.startsPerDay || existing.startsPerDay;
        existing.zoneType = row.zoneType || existing.zoneType;
      } else if (type === "weekend") {
        existing.rank = existing.rank || row.rank;
        existing.name = existing.name || row.name;
        existing.targetWeekend = Math.max(existing.targetWeekend || 0, row.targetWeekend || row.capTotal || 0);
        existing.weekendStartsPerDay = row.startsPerDay || existing.weekendStartsPerDay;
        existing.zoneType = existing.zoneType || row.zoneType;
      }
      merged.set(key, existing);
    };
    (state.capacity.sourceRows || []).forEach((row) => put(row, "regular"));
    (state.capacity.weekendRows || []).forEach((row) => put(row, "weekend"));
    return [...merged.values()]
      .filter((row) => Math.max(row.targetDay || 0, row.targetEvening || 0, row.targetFridayDay || 0, row.targetFridayEvening || 0, row.targetWeekend || 0) >= 2)
      .sort((a, b) => Math.max(b.targetDay || 0, b.targetEvening || 0, b.targetFridayDay || 0, b.targetFridayEvening || 0, b.targetWeekend || 0) - Math.max(a.targetDay || 0, a.targetEvening || 0, a.targetFridayDay || 0, a.targetFridayEvening || 0, a.targetWeekend || 0));
  }

  function emptyCapacityComparison(monitorInfo) {
    return {
      sourceCount: (state.capacity?.sourceRows?.length || 0) + (state.capacity?.weekendRows?.length || 0),
      monitorCount: monitorInfo.rows.length,
      monitorSource: monitorInfo.source,
      matchedCount: 0,
      missing: [],
      possible: [],
      mismatches: [],
      mismatchGroups: [],
      capacityDiffCount: 0,
      missingScheduleCount: 0,
    };
  }

  function getMonitorCapacityRows() {
    if (state.capacity?.monitorRows?.length) {
      return { rows: state.capacity.monitorRows, source: `CSV monitor: ${state.capacity.monitorFileName}` };
    }
    const liveState = window.BHLiveMonitor?.getState?.();
    const liveRows = normalizeMonitorCapacityRows(liveState?.rules || []);
    if (liveRows.length) return { rows: liveRows, source: "Live Managers Map" };
    return { rows: [], source: "monitor не загружен" };
  }

  function parseCapacityTopRows(text) {
    const matrix = parseDelimitedMatrix(text, detectDelimiter(text));
    if (!matrix.length) throw new Error("CSV пустой");
    matrix.shift();
    const rows = matrix.map((row) => {
      const name = cleanText(row[1]);
      const capTotal = Math.round(toNumber(row[6]));
      const capDayRaw = Math.round(toNumber(row[7]));
      const capEveningRaw = Math.round(toNumber(row[8]));
      if (!name || Math.max(capTotal, capDayRaw, capEveningRaw) < 2) return null;
      return {
        rank: cleanText(row[0]),
        name,
        key: capacityNameKey(name),
        startsPerDay: cleanText(row[2]),
        finishesPerDay: cleanText(row[3]),
        balance: cleanText(row[4]),
        zoneType: cleanText(row[9]),
        capTotal,
        targetDay: capDayRaw >= 2 ? capDayRaw : 0,
        targetEvening: capEveningRaw >= 2 ? capEveningRaw : 0,
        targetWeekend: (capTotal || capDayRaw || capEveningRaw) >= 2 ? (capTotal || capDayRaw || capEveningRaw) : 0,
      };
    }).filter(Boolean);
    if (!rows.length) throw new Error("не нашел строк capacity 2+");
    return rows;
  }


  function parseMonitorCapacityFile(text) {
    const delimiter = detectDelimiter(text);
    const matrix = parseDelimitedMatrix(text, delimiter);
    if (!matrix.length) throw new Error("Monitor CSV empty");
    const headersRaw = matrix.shift();
    const headers = headersRaw.map(headerKey);
    const records = matrix.map((items) => {
      const row = {};
      headers.forEach((header, index) => { row[header] = items[index] ?? ""; });
      return { row, cells: items.slice(), headersRaw, headers };
    });
    const rows = records.map((record) => {
      const row = record.row;
      const name = firstField(row, ["parking name", "parking", "name", "nome", "endereco", "estacionamento", "ponto", "title", "hotspot name"]);
      const schedule = firstField(row, ["schedule name", "schedule", "period", "periodo", "block", "bloco", "turno", "rule name"]);
      const capacity = Math.round(toNumber(firstField(row, ["capacity", "capacidade", "cap", "target", "meta", "expected bikes count", "target bikes count"])));
      return {
        name,
        schedule,
        capacity,
        id: firstField(row, ["parking id", "id"]),
        lat: firstField(row, ["parking latitude", "latitude", "lat"]),
        lng: firstField(row, ["parking longitude", "longitude", "lng", "lon"]),
        raw: row,
        sourceRecord: record,
      };
    });
    const normalized = normalizeMonitorCapacityRows(rows);
    if (!normalized.length) throw new Error("parking_name/schedule_name/capacity not found in monitor CSV");
    return { delimiter, headersRaw, headers, records, rows: normalized };
  }


  function normalizeMonitorCapacityRows(rows) {
    return (rows || []).map((row) => {
      const raw = row.raw || row;
      const name = cleanText(row.name || row.nome || row.Nome || row.parkingName || row.parking || raw.parking_name || raw.parkingName || raw.name || raw.nome || raw.Nome || raw.endereco || raw.estacionamento || raw.ponto || raw.title || raw.hotspot_name || raw.address || raw.endereco);
      const schedule = normalizeCapacitySchedule(row.schedule || row.scheduleName || row.bloco || row.turno || row.periodo || row["per\u00edodo"] || raw.schedule_name || raw.scheduleName || raw.schedule || raw.period || raw.periodo || raw["per\u00edodo"] || raw.block || raw.bloco || raw.turno || raw.rule_name);
      const capacity = Math.round(toNumber(row.capacity ?? row.capacidade ?? row.cap ?? raw.capacity ?? raw.capacidade ?? raw.cap ?? raw.target ?? raw.meta ?? raw.expected_bikes_count ?? raw.expectedBikesCount ?? raw.target_bikes_count ?? raw.targetBikesCount));
      if (!name || !schedule || !Number.isFinite(capacity)) return null;
      return {
        id: cleanText(row.id || row.parkingId || raw.parking_id || raw.parkingId || raw.id),
        name,
        key: capacityNameKey(name),
        schedule,
        capacity,
        lat: toNumber(row.lat ?? row.latitude ?? raw.parking_latitude ?? raw.latitude ?? raw.lat),
        lng: toNumber(row.lng ?? row.lon ?? row.longitude ?? raw.parking_longitude ?? raw.longitude ?? raw.lng ?? raw.lon),
        sourceRecord: row.sourceRecord || raw.sourceRecord || null,
      };
    }).filter(Boolean);
  }

  function compareCapacityRows(sourceRows, monitorRows, monitorSource) {
    const monitorIndex = buildMonitorCapacityIndex(monitorRows);
    const missing = [];
    const possible = [];
    const matched = [];
    const mismatches = [];

    sourceRows.forEach((row) => {
      const best = bestMonitorCapacityMatch(row, monitorIndex.items);
      const base = {
        rank: row.rank,
        parking: row.name,
        targetDay: row.targetDay,
        targetEvening: row.targetEvening,
        targetFridayDay: row.targetFridayDay,
        targetFridayEvening: row.targetFridayEvening,
        targetWeekend: row.targetWeekend,
        startsPerDay: row.startsPerDay,
        zoneType: row.zoneType,
        targetLabel: capacityRowTargetLabel(row),
        bestMonitor: best?.item?.name || "",
        matchScore: best ? Number(best.score.toFixed(3)) : 0,
      };
      if (!best || best.score < CAPACITY_MATCH_THRESHOLD) {
        if (best && best.score >= CAPACITY_LOW_CONFIDENCE_THRESHOLD) possible.push({ ...base, kind: "check name" });
        else missing.push({ ...base, kind: "missing" });
        return;
      }

      const item = best.item;
      matched.push({ row, item, score: best.score });
      [
        { schedule: CAPACITY_DAY_SCHEDULE, expected: row.targetDay, label: "weekday morning" },
        { schedule: CAPACITY_EVENING_SCHEDULE, expected: row.targetEvening, label: "weekday evening" },
        { schedule: CAPACITY_FRIDAY_DAY_SCHEDULE, expected: row.targetFridayDay, label: "friday day" },
        { schedule: CAPACITY_FRIDAY_EVENING_SCHEDULE, expected: row.targetFridayEvening, label: "friday evening" },
        { schedule: CAPACITY_WEEKEND_SCHEDULE, expected: row.targetWeekend, label: "weekend" },
      ].forEach(({ schedule, expected, label }) => {
        if (!expected || Number(expected) < 2) return;
        const actual = item.capacities[schedule];
        if (actual == null) {
          mismatches.push({ ...base, monitorParking: item.name, schedule, label, expected, actual: "", difference: "", problem: "missing schedule" });
        } else if (Number(actual) !== Number(expected)) {
          mismatches.push({ ...base, monitorParking: item.name, schedule, label, expected, actual, difference: Number(actual) - Number(expected), problem: "capacity differs" });
        }
      });
    });

    const groups = groupCapacityMismatches(mismatches);
    return {
      sourceCount: sourceRows.length,
      monitorCount: monitorRows.length,
      monitorSource,
      matchedCount: matched.length,
      missing,
      possible,
      mismatches,
      mismatchGroups: groups,
      capacityDiffCount: mismatches.filter((row) => row.problem === "capacity differs").length,
      missingScheduleCount: mismatches.filter((row) => row.problem === "missing schedule").length,
    };
  }

  function buildMonitorCapacityIndex(rows) {
    const byKey = new Map();
    rows.forEach((row) => {
      if (!row.key || !row.schedule) return;
      const item = byKey.get(row.key) || { key: row.key, name: row.name, id: row.id, capacities: {}, rows: [] };
      item.name = item.name || row.name;
      item.capacities[row.schedule] = row.capacity;
      item.rows.push(row);
      byKey.set(row.key, item);
    });
    const items = [...byKey.values()];
    items.byKey = byKey;
    return { items };
  }

  function bestMonitorCapacityMatch(sourceRow, monitorItems) {
    const exact = monitorItems.byKey?.get(sourceRow.key);
    if (exact) return { item: exact, score: 1 };
    let best = null;
    for (const item of monitorItems) {
      const score = capacityNameScore(sourceRow.key, item.key);
      if (!best || score > best.score) best = { item, score };
    }
    return best && best.score > 0 ? best : null;
  }

  function groupCapacityMismatches(rows) {
    const byParking = new Map();
    rows.forEach((row) => {
      const key = `${row.rank}|${row.monitorParking || row.parking}`;
      const group = byParking.get(key) || {
        rank: row.rank,
        parking: row.monitorParking || row.parking,
        sourceParking: row.parking,
        matchScore: row.matchScore,
        day: null,
        evening: null,
      };
      if (row.schedule === CAPACITY_DAY_SCHEDULE) group.day = row;
      if (row.schedule === CAPACITY_EVENING_SCHEDULE) group.evening = row;
      byParking.set(key, group);
    });
    return [...byParking.values()].sort((a, b) => Number(a.rank || 9999) - Number(b.rank || 9999));
  }



  function renderCapacityCompare() {
    if (!els.capacityStatusText) return;
    renderCapacityPreview();
    const cmp = state.capacity?.comparison || emptyCapacityComparison(getMonitorCapacityRows());
    const sourceRows = state.capacity?.sourceRows || [];
    const generated = state.capacity?.generated;
    els.capacityKpiSource.textContent = fmtInt(cmp.sourceCount || sourceRows.length);
    els.capacityKpiMatched.textContent = fmtInt(cmp.matchedCount || 0);
    els.capacityKpiMissing.textContent = fmtInt((cmp.missing?.length || 0) + (cmp.possible?.length || 0));
    els.capacityKpiProblems.textContent = fmtInt(cmp.mismatches?.length || 0);
    if (els.capacityKpiGenerated) {
      els.capacityKpiGenerated.textContent = fmtInt(generated?.outputRecords?.length || state.capacity?.monitorRows?.length || 0);
    }

    if (!sourceRows.length) {
      const city = selectedCapacityCity();
      const parkingText = state.capacity.allParkings.length ? `all parkings ${fmtInt(state.capacity.allParkings.length)}` : "all parkings not loaded";
      const monitorText = cmp.monitorCount ? `monitor ${fmtInt(cmp.monitorCount)}` : "monitor not loaded";
      const weekendText = state.capacity.weekendRows.length ? `weekend ${fmtInt(state.capacity.weekendRows.length)}` : "weekend not loaded";
      els.capacityStatusText.textContent = `${city.name} / ${parkingText} / ${monitorText} / ${weekendText} / upload weekday Capacity CSV`;
      els.capacityMissingList.innerHTML = `
        <div class="compact-item"><strong>1. All parkings</strong><span>${esc(parkingText)}</span></div>
        <div class="compact-item"><strong>2. Monitor parkings</strong><span>${esc(monitorText)}</span></div>
        <div class="compact-item"><strong>3. Capacity</strong><span>Upload weekday Capacity CSV and optional Weekend CSV, then export ${esc(city.name)}.csv.</span></div>
      `;
      els.capacityMismatchTable.innerHTML = `<tr><td colspan="4">Waiting for weekday Capacity CSV. Loaded parkings stay cached.</td></tr>`;
      return;
    }
    if (!cmp.monitorCount) {
      const generatedText = generated ? `new CSV ready: ${fmtInt(generated.outputRecords.length)} rows` : "new CSV is not ready";
      els.capacityStatusText.textContent = `${state.capacity.sourceFileName}: monitor not loaded; file will be created from all parkings/capacity. ${generatedText}`;
      els.capacityMissingList.innerHTML = `<div class="compact-item warning-item"><strong>Monitor CSV is optional</strong><span>Upload it if you want to update existing rows. Without it, the site creates a new file from all parkings + weekday/weekend capacity.</span></div>`;
      els.capacityMismatchTable.innerHTML = `<tr><td colspan="4">No monitor comparison. Export will still include weekday morning/evening, Friday morning/evening and weekend.</td></tr>`;
      return;
    }

    const cityText = `${selectedCapacityCity().name}${selectedCapacityCity().id ? "" : " (set city_id)"}`;
    const parkingText = state.capacity.allParkings.length ? `all parkings ${fmtInt(state.capacity.allParkings.length)}` : "all parkings not loaded";
    const weekendText = state.capacity.weekendRows.length ? `weekend ${fmtInt(state.capacity.weekendRows.length)}` : "weekend not loaded";
    const generatedText = generated ? `new CSV: ${fmtInt(generated.outputRecords.length)} rows, +${fmtInt(generated.added)}, updated ${fmtInt(generated.updated)}, skipped ${fmtInt(generated.skipped.length)}` : "new CSV is not ready";
    els.capacityStatusText.textContent = `${cityText} / ${parkingText} / ${state.capacity.sourceFileName} / ${cmp.monitorSource} / ${weekendText} / ${generatedText}`;
    renderCapacityMissing(cmp);
    renderCapacityMismatches(cmp);
  }

  function renderCapacityMissing(cmp) {
    const generated = state.capacity?.generated;
    const rows = [
      ...(cmp.missing || []).map((row) => ({ ...row, title: "Missing in monitor" })),
      ...(cmp.possible || []).map((row) => ({ ...row, title: "Check name" })),
    ];
    const skipped = generated?.skipped || [];
    if (!rows.length && !skipped.length) {
      els.capacityMissingList.innerHTML = `<div class="compact-item"><strong>All top capacity rows found</strong><span>No uncertain matches. The updated CSV can be exported.</span></div>`;
      return;
    }
    const html = [];
    rows.slice(0, 14).forEach((row) => {
      html.push(`
        <div class="compact-item">
          <strong>${esc(row.rank ? `${row.rank}. ` : "")}${esc(row.parking)}</strong>
          <span>${esc(row.title)} / ${esc(row.targetLabel || `morning ${fmtInt(row.targetDay)} / evening ${fmtInt(row.targetEvening)}`)} / starts/day ${esc(row.startsPerDay || "N/D")}</span>
          ${row.bestMonitor ? `<span>Closest: ${esc(row.bestMonitor)} / score ${row.matchScore}</span>` : ""}
        </div>
      `);
    });
    skipped.slice(0, 6).forEach((row) => {
      html.push(`
        <div class="compact-item warning-item">
          <strong>${esc(row.name)}</strong>
          <span>Not added to the updated CSV: ${esc(row.reason)}.</span>
        </div>
      `);
    });
    els.capacityMissingList.innerHTML = html.join("");
  }

  function renderCapacityMismatches(cmp) {
    const groups = cmp.mismatchGroups || [];
    if (!groups.length) {
      els.capacityMismatchTable.innerHTML = `<tr><td colspan="4">Capacity matches weekday blocks</td></tr>`;
      return;
    }
    els.capacityMismatchTable.innerHTML = groups.slice(0, 80).map((group) => `
      <tr>
        <td class="rank">${esc(group.rank)}</td>
        <td><strong class="parking-name">${esc(group.parking)}</strong><span class="subline">source: ${esc(group.sourceParking)}</span></td>
        <td>${capacityProblemCell(group.day)}</td>
        <td>${capacityProblemCell(group.evening)}</td>
      </tr>
    `).join("");
  }


  function capacityProblemCell(row) {
    if (!row) return `<span class="capacity-ok">OK</span>`;
    const missing = row.problem === "missing schedule";
    const cls = missing ? "capacity-missing" : "capacity-diff";
    const text = missing ? `no block -> ${row.expected}` : `${row.actual} -> ${row.expected}`;
    const note = missing ? "add block" : "current -> target";
    return `<span class="${cls}">${esc(text)}</span><span class="subline">${esc(note)}</span>`;
  }

  function exportCapacityCompareCsv() {
    const cmp = state.capacity?.comparison;
    if (!cmp || !state.capacity.sourceRows.length) {
      toast("Сначала загрузи capacity CSV", true);
      return;
    }
    const rows = [["type", "rank", "parking", "monitor_parking", "schedule", "expected", "monitor", "difference", "starts_per_day", "match_score", "problem"]];
    (cmp.missing || []).forEach((row) => rows.push(["missing", row.rank, row.parking, row.bestMonitor, "", row.targetDay + "/" + row.targetEvening, "", "", row.startsPerDay, row.matchScore, "not found"]));
    (cmp.possible || []).forEach((row) => rows.push(["check_name", row.rank, row.parking, row.bestMonitor, "", row.targetDay + "/" + row.targetEvening, "", "", row.startsPerDay, row.matchScore, "low confidence"]));
    (cmp.mismatches || []).forEach((row) => rows.push(["mismatch", row.rank, row.parking, row.monitorParking, row.schedule, row.expected, row.actual, row.difference, row.startsPerDay, row.matchScore, row.problem]));
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadBlob(csv, `bh-capacity-compare-${toDateKey(new Date())}.csv`, "text/csv;charset=utf-8");
  }


  function exportUpdatedMonitorCsv() {
    const result = buildUpdatedMonitorFile({ preview: false });
    if (!result) return;
    const csv = serializeMonitorFile(result.headersRaw, result.outputRecords.map((record) => record.cells), result.delimiter || ";");
    const name = `${selectedCapacityCity().name || "city"}.csv`;
    downloadBlob(`\ufeff${csv}`, name, "text/csv;charset=utf-8");
    const missingIds = result.skipped.filter((row) => String(row.reason || "").includes("parking_id missing")).length;
    const scheduleIdIndex = result.headersRaw.map(headerKey).indexOf("schedule id");
    const missingSchedules = scheduleIdIndex >= 0 ? result.outputRecords.filter((record) => !cellAt(record.cells, scheduleIdIndex)).length : 0;
    const missingCoords = result.skipped.filter((row) => String(row.reason || "").includes("coordinates missing")).length;
    toast(`Ready CSV: ${fmtInt(result.outputRecords.length)} rows / updated ${fmtInt(result.updated)} / added ${fmtInt(result.added)} / sem schedule_id ${fmtInt(missingSchedules)} / sem parking_id ${fmtInt(missingIds)} / sem coords ${fmtInt(missingCoords)}`);
  }

  function createBlankMonitorFile() {
    const city = selectedCapacityCity();
    const headersRaw = ["city_id", "city_name", "schedule_id", "schedule_name", "parking_id", "parking_name", "parking_latitude", "parking_longitude", "capacity"];
    return {
      delimiter: ";",
      headersRaw,
      headers: headersRaw.map(headerKey),
      records: [],
      rows: [],
      synthetic: true,
      cityId: city.id || "",
      cityName: city.name || CITY,
    };
  }

  function buildUpdatedMonitorFile({ preview = false } = {}) {
    const file = state.capacity?.monitorFile || createBlankMonitorFile();
    const weekdayRows = state.capacity?.sourceRows || [];
    const weekendRows = state.capacity?.weekendRows || [];
    if (!weekdayRows.length && !weekendRows.length) {
      if (!preview) toast("Load weekday or weekend Capacity CSV first", true);
      return null;
    }

    const headers = file.headers || file.headersRaw.map(headerKey);
    const headerMap = new Map(headers.map((header, index) => [header, index]));
    const col = (...names) => {
      for (const name of names) {
        const index = headerMap.get(headerKey(name));
        if (index !== undefined) return index;
      }
      return -1;
    };
    const indices = {
      cityId: col("city id", "city_id"),
      cityName: col("city name", "city_name"),
      scheduleId: col("schedule id", "schedule_id"),
      scheduleName: col("schedule name", "schedule_name", "schedule", "period", "periodo", "block", "bloco", "turno"),
      parkingId: col("parking id", "parking_id", "id"),
      parkingName: col("parking name", "parking_name", "parking", "name", "nome", "endereco", "estacionamento", "ponto"),
      lat: col("parking latitude", "parking_latitude", "latitude", "lat"),
      lng: col("parking longitude", "parking_longitude", "longitude", "lng", "lon"),
      capacity: col("capacity", "capacidade", "cap", "target", "meta"),
    };
    if ([indices.scheduleName, indices.parkingName, indices.capacity].some((index) => index < 0)) {
      if (!preview) toast("Monitor CSV must contain parking_name, schedule_name and capacity", true);
      return null;
    }

    const selectedCity = selectedCapacityCity();
    let defaultCityId = selectedCity.id || "";
    let defaultCityName = selectedCity.name || CITY;
    const outputRecords = file.records
      .map((record) => ({ row: record.row, cells: padCells(record.cells, file.headersRaw.length) }))
      .filter((record) => {
        const rowCityName = indices.cityName >= 0 ? cellAt(record.cells, indices.cityName) : "";
        const rowCityId = indices.cityId >= 0 ? cellAt(record.cells, indices.cityId) : "";
        if (rowCityName && !sameCity(rowCityName, selectedCity.name)) return false;
        if (rowCityId && selectedCity.id && rowCityId !== selectedCity.id) return false;
        return true;
      });
    const scheduleIds = collectScheduleIdsForOutputCity(outputRecords, indices, selectedCity);
    const byParkingSchedule = new Map();
    const parkingDirectory = new Map();

    outputRecords.forEach((record, index) => {
      const cells = record.cells;
      const schedule = normalizeCapacitySchedule(cellAt(cells, indices.scheduleName));
      const scheduleId = cellAt(cells, indices.scheduleId);
      const parkingId = cellAt(cells, indices.parkingId);
      const parkingName = cellAt(cells, indices.parkingName);
      const rowCityName = indices.cityName >= 0 ? cellAt(cells, indices.cityName) : "";
      const sameOutputCity = !rowCityName || sameCity(rowCityName, selectedCity.name);
      if (!defaultCityId && sameOutputCity && indices.cityId >= 0) defaultCityId = cellAt(cells, indices.cityId);
      if (!defaultCityName && sameOutputCity && rowCityName) defaultCityName = rowCityName;
      if (schedule && isValidScheduleIdForCity(selectedCity, scheduleId)) scheduleIds.set(schedule, scheduleId);
      const parkingKey = parkingId || capacityNameKey(parkingName);
      if (parkingKey && schedule) byParkingSchedule.set(`${parkingKey}|${schedule}`, index);
      if (parkingKey && !parkingDirectory.has(parkingKey)) {
        parkingDirectory.set(parkingKey, {
          id: parkingId,
          name: parkingName,
          lat: cellAt(cells, indices.lat),
          lng: cellAt(cells, indices.lng),
        });
      }
    });

    const monitorIndex = buildMonitorCapacityIndex(file.rows);
    const catalogItems = buildCatalogCapacityItems();
    const targets = [];
    weekdayRows.forEach((row) => {
      const fridayDay = row.targetFridayDay == null ? row.targetDay : row.targetFridayDay;
      const fridayEvening = row.targetFridayEvening == null ? row.targetEvening : row.targetFridayEvening;
      targets.push({ row, schedule: CAPACITY_DAY_SCHEDULE, capacity: row.targetDay, source: "weekday" });
      targets.push({ row, schedule: CAPACITY_EVENING_SCHEDULE, capacity: row.targetEvening, source: "weekday" });
      targets.push({ row, schedule: CAPACITY_FRIDAY_DAY_SCHEDULE, capacity: fridayDay, source: "friday" });
      targets.push({ row, schedule: CAPACITY_FRIDAY_EVENING_SCHEDULE, capacity: fridayEvening, source: "friday" });
    });
    weekendRows.forEach((row) => {
      targets.push({ row, schedule: CAPACITY_WEEKEND_SCHEDULE, capacity: row.targetWeekend || row.capTotal || Math.max(row.targetDay || 0, row.targetEvening || 0), source: "weekend" });
    });

    let updated = 0;
    let unchanged = 0;
    let added = 0;
    const skipped = [];
    const seenTargets = new Set();
    const resolvedParkingCache = new Map();

    targets.forEach((target) => {
      if (!target.capacity || target.capacity < 2) return;
      const scheduleId = scheduleIds.get(target.schedule) || capacityScheduleId(selectedCity, target.schedule) || "";
      if (!scheduleId) {
        skipped.push({ name: target.row.name, schedule: target.schedule, reason: "schedule_id missing for selected city; exported with empty schedule_id" });
      }
      const resolveKey = target.row.key || capacityNameKey(target.row.name);
      let resolved = resolvedParkingCache.get(resolveKey);
      if (!resolvedParkingCache.has(resolveKey)) {
        resolved = resolveCapacityParking(target.row, monitorIndex.items, catalogItems, parkingDirectory);
        resolvedParkingCache.set(resolveKey, resolved || null);
      }
      const resolvedName = resolved?.name || target.row.name;
      const resolvedKey = resolved?.id || capacityNameKey(resolvedName);
      if (!resolvedKey || !resolvedName) {
        skipped.push({ name: target.row.name, schedule: target.schedule, reason: "parking not found in monitor CSV or catalog" });
        return;
      }
      const targetKey = `${resolvedKey}|${target.schedule}`;
      if (seenTargets.has(targetKey)) return;
      seenTargets.add(targetKey);
      const existingIndex = byParkingSchedule.get(targetKey);
      if (existingIndex !== undefined) {
        const record = outputRecords[existingIndex];
        const oldValue = Number(cellAt(record.cells, indices.capacity));
        setCell(record.cells, indices.cityId, defaultCityId);
        setCell(record.cells, indices.cityName, defaultCityName);
        if (resolved?.id) setCell(record.cells, indices.parkingId, resolved.id);
        if (!cellAt(record.cells, indices.parkingName) && resolvedName) setCell(record.cells, indices.parkingName, resolvedName);
        if (!cellAt(record.cells, indices.lat) && validCoordinatePair(resolved)) setCell(record.cells, indices.lat, resolved.lat);
        if (!cellAt(record.cells, indices.lng) && validCoordinatePair(resolved)) setCell(record.cells, indices.lng, resolved.lng);
        if (scheduleId) setCell(record.cells, indices.scheduleId, scheduleId);
        setCell(record.cells, indices.capacity, target.capacity);
        if (oldValue === Number(target.capacity)) unchanged += 1;
        else updated += 1;
        return;
      }

      const cells = Array(file.headersRaw.length).fill("");
      setCell(cells, indices.cityId, defaultCityId);
      setCell(cells, indices.cityName, defaultCityName);
      setCell(cells, indices.scheduleId, scheduleId);
      setCell(cells, indices.scheduleName, target.schedule);
      setCell(cells, indices.parkingId, resolved?.id || "");
      setCell(cells, indices.parkingName, resolvedName);
      setCell(cells, indices.lat, resolved?.lat || "");
      setCell(cells, indices.lng, resolved?.lng || "");
      setCell(cells, indices.capacity, target.capacity);
      outputRecords.push({ row: null, cells });
      byParkingSchedule.set(targetKey, outputRecords.length - 1);
      added += 1;
    });

    const finalizedRecords = finalizeMonitorOutputRecords({
      outputRecords,
      indices,
      selectedCity,
      monitorItems: monitorIndex.items,
      catalogItems,
      parkingDirectory,
      skipped,
    });

    return {
      delimiter: file.delimiter || ";",
      headersRaw: file.headersRaw,
      outputRecords: finalizedRecords,
      updated,
      unchanged,
      added,
      skipped,
    };
  }

  function finalizeMonitorOutputRecords({ outputRecords, indices, selectedCity, monitorItems, catalogItems, parkingDirectory, skipped }) {
    const finalized = [];
    outputRecords.forEach((record) => {
      const cells = record.cells;
      const schedule = normalizeCapacitySchedule(cellAt(cells, indices.scheduleName));
      const parkingName = cellAt(cells, indices.parkingName);
      const currentScheduleId = cellAt(cells, indices.scheduleId);
      if (isKnownForeignScheduleId(selectedCity, currentScheduleId)) setCell(cells, indices.scheduleId, "");
      if (schedule && !cellAt(cells, indices.scheduleId)) setCell(cells, indices.scheduleId, capacityScheduleId(selectedCity, schedule));
      if (schedule && !cellAt(cells, indices.scheduleId)) skipped.push({ name: parkingName || "unknown", schedule, reason: "schedule_id missing for selected city" });

      if (!cellAt(cells, indices.parkingId)) {
        const candidate = {
          name: parkingName,
          key: capacityNameKey(parkingName),
          lat: toNumber(cellAt(cells, indices.lat)),
          lng: toNumber(cellAt(cells, indices.lng)),
        };
        const resolved = resolveCapacityParking(candidate, monitorItems, catalogItems, parkingDirectory);
        if (resolved?.id) {
          setCell(cells, indices.parkingId, resolved.id);
          if (!parkingName && resolved.name) setCell(cells, indices.parkingName, resolved.name);
          if (!cellAt(cells, indices.lat) && validCoordinatePair(resolved)) setCell(cells, indices.lat, resolved.lat);
          if (!cellAt(cells, indices.lng) && validCoordinatePair(resolved)) setCell(cells, indices.lng, resolved.lng);
        }
      }

      const finalParkingName = cellAt(cells, indices.parkingName);
      const finalParkingId = cellAt(cells, indices.parkingId);
      const finalScheduleId = cellAt(cells, indices.scheduleId);
      const finalLat = toNumber(cellAt(cells, indices.lat));
      const finalLng = toNumber(cellAt(cells, indices.lng));
      const completeCoords = Number.isFinite(finalLat) && Number.isFinite(finalLng) && Math.abs(finalLat) > 0.000001 && Math.abs(finalLng) > 0.000001;

      if (!finalParkingName || !isUsableParking(finalParkingName) || sameCity(finalParkingName, selectedCity.name)) {
        skipped.push({ name: finalParkingName || parkingName || "unknown", schedule, reason: "parking_name invalid or equals city name" });
        return;
      }
      if (!finalScheduleId) {
        skipped.push({ name: finalParkingName, schedule, reason: "schedule_id missing for selected city; exported with empty schedule_id" });
      }
      if (!finalParkingId) {
        skipped.push({ name: finalParkingName, schedule, reason: "parking_id missing" });
        return;
      }
      if (!completeCoords) {
        skipped.push({ name: finalParkingName, schedule, reason: "coordinates missing" });
        return;
      }
      finalized.push(record);
    });
    return finalized;
  }

  function resolveCapacityParking(sourceRow, monitorItems, catalogItems, parkingDirectory) {
    const monitorMatch = bestMonitorCapacityMatch(sourceRow, monitorItems);
    if (monitorMatch && monitorMatch.score >= CAPACITY_MATCH_THRESHOLD) {
      const item = monitorMatch.item;
      const withRecord = (item.rows || []).find((row) => row.id || row.sourceRecord || validCoordinatePair(row)) || item.rows?.[0];
      const fromDirectory = withRecord?.id ? parkingDirectory.get(withRecord.id) : null;
      const candidate = {
        id: item.id || withRecord?.id || fromDirectory?.id,
        name: item.name || withRecord?.name || fromDirectory?.name,
        key: item.key || withRecord?.key || capacityNameKey(item.name || withRecord?.name || fromDirectory?.name),
        lat: withRecord?.lat || fromDirectory?.lat,
        lng: withRecord?.lng || fromDirectory?.lng,
        source: "monitor",
        score: monitorMatch.score,
      };
      return enrichCapacityParkingWithCatalog(candidate, catalogItems, parkingDirectory);
    }
    const catalogMatch = bestCatalogCapacityMatch(sourceRow, catalogItems);
    if (catalogMatch && catalogMatch.score >= CAPACITY_MATCH_THRESHOLD) {
      return { ...catalogMatch.item, source: "catalog", score: catalogMatch.score };
    }
    const locationMatch = bestCatalogLocationMatch(sourceRow, catalogItems);
    if (locationMatch) return { ...locationMatch.item, source: "catalog", score: locationMatch.score };
    return null;
  }

  function enrichCapacityParkingsWithCatalog(rows) {
    const catalogItems = buildCatalogCapacityItems();
    if (!catalogItems.length) return rows;
    return (rows || []).map((row) => enrichCapacityParkingWithCatalog(row, catalogItems));
  }

  function enrichCapacityParkingWithCatalog(row, catalogItems = buildCatalogCapacityItems(), parkingDirectory = null) {
    if (!row) return row;
    const base = { ...row, key: row.key || capacityNameKey(row.name) };
    let match = null;
    if (base.id && parkingDirectory?.has(base.id)) {
      match = { item: parkingDirectory.get(base.id), score: 1 };
    }
    if (!match && validCoordinatePair(base)) {
      match = bestCatalogLocationMatch(base, catalogItems);
    }
    const nameMatch = bestCatalogCapacityMatch(base, catalogItems);
    if (!match && nameMatch && nameMatch.score >= CAPACITY_MATCH_THRESHOLD) match = nameMatch;
    if (!match && nameMatch && nameMatch.score >= CAPACITY_LOW_CONFIDENCE_THRESHOLD && !base.id) match = nameMatch;
    const item = match?.item || null;
    return {
      ...base,
      id: cleanText(base.id || item?.id || ""),
      name: cleanText(base.name || item?.name || ""),
      key: base.key || capacityNameKey(item?.name || ""),
      lat: validCoordinatePair(base) ? Number(base.lat) : (validCoordinatePair(item) ? Number(item.lat) : base.lat),
      lng: validCoordinatePair(base) ? Number(base.lng) : (validCoordinatePair(item) ? Number(item.lng) : base.lng),
    };
  }

  function bestCatalogLocationMatch(sourceRow, catalogItems, maxMeters = 65) {
    if (!validCoordinatePair(sourceRow)) return null;
    let best = null;
    catalogItems.forEach((item) => {
      if (!item.id || !validCoordinatePair(item)) return;
      const distanceM = haversineMeters(Number(sourceRow.lat), Number(sourceRow.lng), Number(item.lat), Number(item.lng));
      if (!Number.isFinite(distanceM) || distanceM > maxMeters) return;
      const nameScore = capacityNameScore(sourceRow.key || capacityNameKey(sourceRow.name), item.key);
      const score = Math.max(0.9, 1 - (distanceM / maxMeters) * 0.08, nameScore);
      if (!best || score > best.score || (score === best.score && distanceM < best.distanceM)) best = { item, score, distanceM };
    });
    return best;
  }

  function validCoordinatePair(row) {
    if (!row) return false;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.000001 && Math.abs(lng) > 0.000001;
  }

  function buildCatalogCapacityItems() {
    const selectedCity = selectedCapacityCity();
    const rows = [
      ...(selectedCity.name === CITY ? (state.catalogPoints || []) : []),
      ...(state.capacity?.allParkings || []),
    ];
    const byId = new Map();
    rows.forEach((point) => {
      const item = {
        id: cleanText(point.id),
        name: cleanText(point.name),
        key: capacityNameKey(point.name),
        lat: point.lat,
        lng: point.lng,
      };
      const mapKey = item.id || item.key;
      if (mapKey && item.key && !byId.has(mapKey)) byId.set(mapKey, item);
    });
    const items = [...byId.values()];
    items.byKey = new Map();
    items.forEach((item) => { if (item.key && !items.byKey.has(item.key)) items.byKey.set(item.key, item); });
    return items;
  }

  function bestCatalogCapacityMatch(sourceRow, catalogItems) {
    const direct = catalogItems.byKey?.get(sourceRow.key || capacityNameKey(sourceRow.name));
    if (direct) return { item: direct, score: 1 };
    let best = null;
    for (const item of catalogItems) {
      const score = capacityNameScore(sourceRow.key, item.key);
      if (!best || score > best.score) best = { item, score };
    }
    return best && best.score > 0 ? best : null;
  }

  function padCells(cells, length) {
    const copy = (cells || []).slice(0, length);
    while (copy.length < length) copy.push("");
    return copy;
  }

  function cellAt(cells, index) {
    return index >= 0 ? cleanText(cells[index]) : "";
  }

  function setCell(cells, index, value) {
    if (index >= 0) cells[index] = cleanText(value);
  }

  function serializeMonitorFile(headers, rows, delimiter = ";") {
    return [headers, ...rows]
      .map((row) => row.map((cell) => csvCellForDelimiter(cell, delimiter)).join(delimiter))
      .join("\r\n");
  }

  function csvCellForDelimiter(value, delimiter) {
    const text = String(value ?? "");
    const escaped = text.replace(/"/g, '""');
    if (text.includes(delimiter) || /["\r\n]/.test(text)) return `"${escaped}"`;
    return text;
  }

  function parseDelimitedMatrix(text, delimiter) {
    const clean = String(text || "").replace(/^\ufeff/, "");
    const matrix = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < clean.length; i += 1) {
      const char = clean[i];
      if (quoted) {
        if (char === '"' && clean[i + 1] === '"') { cell += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === delimiter) { row.push(cell); cell = ""; }
      else if (char === "\n") { row.push(cell); matrix.push(row); row = []; cell = ""; }
      else if (char !== "\r") cell += char;
    }
    if (cell || row.length) { row.push(cell); matrix.push(row); }
    return matrix.filter((items) => items.some((item) => cleanText(item)));
  }

  function detectDelimiter(text) {
    const firstLine = String(text || "").split(/\r?\n/).find((line) => cleanText(line)) || "";
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    return semicolons > commas ? ";" : ",";
  }

  function firstField(row, names) {
    for (const name of names) {
      const value = row[headerKey(name)];
      if (cleanText(value)) return cleanText(value);
    }
    return "";
  }

  function headerKey(value) {
    return normalizeSearch(value).replace(/_/g, " ");
  }

  function normalizeCapacitySchedule(value) {
    const text = normalizeSearch(value).replace(/_/g, " ");
    if (!text) return "";
    const friday = /\b(friday|sexta)\b/.test(text);
    const evening = /\b(evening|noite|tarde)\b/.test(text) || text.includes("12 00");
    if (/\b(weekend|fim de semana|sabado|domingo)\b/.test(text)) return "weekend";
    if (friday && evening) return "weekday-evening-friday";
    if (friday) return "weekday-morning-friday";
    if (evening) return "weekday-evening";
    if (/\b(morning|manha|day|dia)\b/.test(text) || text.includes("00 12")) return "weekday-morning";
    return cleanText(value);
  }

  function capacityNameKey(value) {
    return normalizeSearch(value)
      .replace(/\b30\d{3}\s?\d{3}\b/g, " ")
      .replace(/\bbelo horizonte\b|\bmg\b|\bs n\b/g, " ")
      .replace(/\br\b/g, " rua ")
      .replace(/\bav\b/g, " avenida ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function capacityNameScore(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const aTokens = capacityTokens(a);
    const bTokens = capacityTokens(b);
    if (!aTokens.length || !bTokens.length) return 0;
    const bSet = new Set(bTokens);
    const common = aTokens.filter((token) => bSet.has(token)).length;
    if (!common) return 0;
    const dice = (2 * common) / (aTokens.length + bTokens.length);
    const cover = common / Math.min(aTokens.length, bTokens.length);
    const aSet = new Set(aTokens);
    const sourceSubset = aTokens.every((token) => bSet.has(token));
    const targetSubset = bTokens.every((token) => aSet.has(token));
    let score = dice * 0.65 + cover * 0.35;
    if (sourceSubset || targetSubset) score = Math.max(score, common === 1 ? 0.86 : 0.9);
    if (a.includes(b) || b.includes(a)) {
      const penalty = Math.abs(a.length - b.length) / Math.max(a.length, b.length);
      score = Math.max(score, 0.92 - penalty * 0.12);
    }
    return Math.min(1, score);
  }

  function capacityTokens(value) {
    const stop = new Set(["rua", "avenida", "av", "r", "praca", "da", "de", "do", "dos", "das", "e", "centro", "funcionarios"]);
    return capacityNameKey(value).split(" ").filter((token) => token.length > 1 && !stop.has(token));
  }
  function exportPlanCsv() {
    const analysis = state.analysis;
    const rows = [
      ["rank", "parking", "fill_by", "best_window", "keep_scooters", "starts", "ends", "net", "last24", "last7d", "confidence", "priority", "maps_url"],
      ...analysis.filteredStations.map((station, index) => [
        index + 1,
        station.name,
        station.fillBy,
        station.bestWindow,
        station.keepScooters,
        station.starts,
        station.ends,
        station.net,
        station.last24,
        station.last7d,
        station.confidence,
        priorityText(station.priority),
        station.mapsUrl,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadBlob(csv, `bh-parking-plan-${toDateKey(new Date())}.csv`, "text/csv;charset=utf-8");
  }

  async function clearHistory() {
    const ok = window.confirm("Очистить всю историю Parking Brain в этом браузере?");
    if (!ok) return;
    await Promise.all([clearStore(STORE_RIDES), clearStore(STORE_UPLOADS)]);
    state.rides = [];
    state.uploads = [];
    recompute();
    setStatus("warn", "История пустая");
    toast("История очищена");
  }

  function sameCity(value, cityName = activeCityName()) {
    const current = normalizeGoJetCityName(cityName) || normalizeSearch(cityName);
    const incoming = normalizeGoJetCityName(value) || normalizeSearch(value);
    return Boolean(current && incoming && current === incoming);
  }

  function firstValue(row, keys) {
    for (const key of keys) {
      const value = row[key];
      if (cleanText(value)) return value;
    }
    return "";
  }

  function cleanText(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function normalizeSearch(value) {
    return cleanText(value)
      .toLocaleLowerCase("ru")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // A rental cell can list several tech zones at once, e.g. "Zona 1, A2" means the
  // parking belongs to BOTH "Zona 1" and "A2" (A1/A2 and Zona 1/2/3 are separate,
  // overlapping layers). Split into a list of distinct zone tags.
  function techZoneList(value) {
    const text = cleanText(value);
    if (!text) return [];
    return [...new Set(text.split(",").map((z) => z.replace(/[✅]/g, "").trim()).filter(Boolean))];
  }

  function zoneListOf(value) {
    if (Array.isArray(value)) return value;
    return typeof value === "string" && value ? [value] : [];
  }

  function normalizeParkingName(value) {
    let name = cleanText(value);
    if (!name) return "";
    name = name.replace(/\s*,\s*Belo Horizonte\s*$/i, "");
    name = name.replace(/\s*,\s*Brasil\s*$/i, "");
    name = name.replace(/^ЛоуСпид\s*10\s*км\/ч\s*-\s*/i, "");
    name = name.replace(/\s+/g, " ").trim();
    return name;
  }

  function isUsableParking(name) {
    const normalized = normalizeSearch(name);
    if (!normalized) return false;
    const blocked = new Set([
      "belo horizonte",
      "nan",
      "null",
      "undefined",
      "запрет по периметру",
      "a1",
      "a2",
      "zona 1 a2",
      "zona 2 a2",
      "zona 3 a2",
    ]);
    return !blocked.has(normalized) && normalized.length >= 3;
  }

  function parseDateTime(dateValue, timeValue) {
    if (!cleanText(timeValue)) {
      const combined = parseCombinedDateTime(dateValue);
      if (combined) return combined;
    }
    const date = parseDateOnly(dateValue);
    const time = parseTimeOnly(timeValue);
    if (!date) return null;
    date.setHours(time.hour, time.minute, time.second, 0);
    return date;
  }

  function parseDateOnly(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const dt = excelSerialDate(value);
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }
    const text = cleanText(value).replace(/\./g, "").replace(/г$/i, "");
    if (!text) return null;

    let match = text.match(/^(\d{1,2})\s+([а-яёa-z]+)\s+(\d{4})$/i);
    if (match) {
      const day = Number(match[1]);
      const monthToken = match[2].toLocaleLowerCase("ru").slice(0, 6);
      const monthKey = [...monthMap.keys()].find((key) => monthToken.startsWith(key));
      const month = monthMap.get(monthKey);
      const year = Number(match[3]);
      if (month !== undefined) return new Date(year, month, day);
    }

    match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      return new Date(year, month, day);
    }

    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
    return null;
  }

  function parseTimeOnly(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { hour: value.getHours(), minute: value.getMinutes(), second: value.getSeconds() };
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const total = Math.round(value * 86400);
      return {
        hour: Math.floor(total / 3600) % 24,
        minute: Math.floor(total / 60) % 60,
        second: total % 60,
      };
    }
    const text = cleanText(value);
    const match = text.match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/);
    if (match) {
      return {
        hour: clamp(Number(match[1]), 0, 23),
        minute: clamp(Number(match[2]), 0, 59),
        second: clamp(Number(match[3] || 0), 0, 59),
      };
    }
    return { hour: 0, minute: 0, second: 0 };
  }

  function excelSerialDate(serial) {
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    return new Date(dateInfo.getUTCFullYear(), dateInfo.getUTCMonth(), dateInfo.getUTCDate());
  }

  function parseCoords(value) {
    const text = cleanText(value);
    const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
    return { lat, lng };
  }

  function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = cleanText(value).replace(/\s/g, "").replace(",", ".");
    if (!text) return 0;
    const num = Number(text);
    return Number.isFinite(num) ? num : 0;
  }

  function fillByText(hour, leadMinutes) {
    const total = (hour * 60 - leadMinutes + 1440) % 1440;
    return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
  }

  function toDateKey(value) {
    const dt = value instanceof Date ? value : new Date(value);
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function fmtDateTime(value) {
    if (!value) return "N/D";
    const dt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dt.getTime())) return "N/D";
    return dt.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function fmtInt(value) {
    return new Intl.NumberFormat("ru-RU").format(Number(value || 0));
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function indexOfMax(values) {
    let index = 0;
    let best = -Infinity;
    values.forEach((value, idx) => {
      if (value > best) {
        best = value;
        index = idx;
      }
    });
    return index;
  }

  function roundCoord(value) {
    return Math.round(Number(value) * 1e6) / 1e6;
  }

  function signed(value) {
    return value > 0 ? `+${value}` : String(value);
  }

  function priorityText(priority) {
    if (priority === "urgent") return "срочно";
    if (priority === "high") return "высоко";
    return "нормально";
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function csvCell(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function downloadBlob(content, fileName, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function setStatus(kind, text) {
    const dot = els.statusPill ? els.statusPill.querySelector(".status-dot") : null;
    if (dot) {
      dot.classList.remove("ok", "warn", "bad");
      dot.classList.add(kind);
    }
    if (els.statusText) els.statusText.textContent = text;
  }

  function toast(message, error = false) {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    const item = document.createElement("div");
    item.className = `toast${error ? " error" : ""}`;
    item.textContent = message;
    stack.appendChild(item);
    setTimeout(() => item.remove(), 4200);
  }

  function renderIcons() {
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  window.ParkingBrainState = state;
  window.ParkingBrain = {
    getState: () => state,
    analyze,
    parseDateTime,
    normalizeParkingName,
    isUsableParking,
  };
})();

