(() => {
  "use strict";

  const CITY = "Belo Horizonte";
  const DB_NAME = "bh-parking-brain";
  const DB_VERSION = 1;
  const STORE_RIDES = "rides";
  const STORE_UPLOADS = "uploads";
  const STORE_META = "meta";
  const SETTINGS_KEY = "settings";

  const defaults = {
    lookbackDays: 21,
    leadMinutes: 45,
    minRides: 3,
    topLimit: 24,
    planMode: "now",
  };

  const state = {
    db: null,
    rides: [],
    uploads: [],
    settings: { ...defaults },
    analysis: null,
    search: "",
  };

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

  document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    bindElements();
    bindEvents();
    setStatus("warn", "Загрузка истории");
    try {
      state.db = await openDatabase();
      await loadState();
      renderSettings();
      recompute();
      setStatus(state.rides.length ? "ok" : "warn", state.rides.length ? "Мозг готов" : "История пустая");
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
      "lastUploadText", "lookbackDays", "leadMinutes", "minRides", "topLimit",
      "lookbackValue", "leadValue", "minRidesValue", "topLimitValue",
      "exportHistoryBtn", "importHistoryBtn", "historyInput", "exportCsvBtn", "clearBtn",
      "uploadCount", "uploadList", "kpiRides", "kpiParkings", "kpiDays", "kpiConfidence",
      "planSubtext", "planList", "topSubtext", "topTable", "searchInput", "hourChart", "donorList",
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

  function putMany(storeName, items) {
    return new Promise((resolve, reject) => {
      if (!items.length) {
        resolve();
        return;
      }
      const transaction = state.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      items.forEach((item) => store.put(item));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const request = tx(storeName, "readwrite").clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async function loadState() {
    const [rides, uploads, settings] = await Promise.all([
      getAll(STORE_RIDES),
      getAll(STORE_UPLOADS),
      getMeta(SETTINGS_KEY),
    ]);
    state.rides = rides;
    state.uploads = uploads.sort((a, b) => b.importedAt - a.importedAt);
    state.settings = { ...defaults, ...(settings || {}) };
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
        allNew.push(...parsed.rides);
        uploadRows.push(parsed.upload);
        toast(`${file.name}: добавлено ${parsed.upload.newRides}, BH строк ${parsed.upload.cityRows}`);
      } catch (err) {
        console.error(err);
        toast(`${file.name}: ${err.message}`, true);
      }
    }

    if (allNew.length || uploadRows.length) {
      await putMany(STORE_RIDES, allNew);
      await putMany(STORE_UPLOADS, uploadRows);
      state.rides.push(...allNew);
      state.uploads = [...uploadRows, ...state.uploads].sort((a, b) => b.importedAt - a.importedAt);
      recompute();
      setStatus("ok", `Добавлено ${allNew.length}`);
    } else {
      setStatus(state.rides.length ? "ok" : "warn", state.rides.length ? "Мозг готов" : "История пустая");
    }
  }

  async function parseRentalFile(file, existingIds) {
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = pickSheet(workbook);
    if (!sheetName) throw new Error("лист не найден");
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

    const rides = [];
    let cityRows = 0;
    let ignoredRows = 0;
    let duplicateRows = 0;
    let parkingRows = 0;

    rows.forEach((row, rowIndex) => {
      const normalized = normalizeRow(row);
      const city = cleanText(normalized["Город"]);
      if (!sameCity(city)) return;
      cityRows += 1;

      const ride = extractRide(normalized, file.name, rowIndex + 2);
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

    const importedAt = Date.now();
    const upload = {
      id: `${importedAt}-${hashText(file.name)}-${Math.random().toString(16).slice(2)}`,
      fileName: file.name,
      sheetName,
      importedAt,
      totalRows: rows.length,
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

  function extractRide(row, fileName, rowNumber) {
    const startNameRaw = firstValue(row, [
      "Название паверстанции начала",
      "Зона начала аренды",
      "Тарифная зона аренды",
    ]);
    const endNameRaw = firstValue(row, [
      "Название паверстанции завершения",
      "Зоны завершения аренды",
      "Тех. зона завершения",
    ]);
    const parkingName = normalizeParkingName(startNameRaw);
    const endName = normalizeParkingName(endNameRaw);
    const startAt = parseDateTime(row["Дата начала аренды"], row["Время начала аренды"]);
    if (!startAt) return null;

    const startCoords = parseCoords(row["Местоположение транспорта (начало аренды)"]);
    const endCoords = parseCoords(row["Местоположение транспорта (конец аренды)"]);
    const idRaw = cleanText(row["ID аренды"]);
    const scooter = cleanText(row["Идентификатор"] || row["QR-номер"]);
    const fallbackId = hashText(`${fileName}|${rowNumber}|${parkingName}|${startAt.getTime()}|${scooter}`);
    const id = idRaw || `row-${fallbackId}`;
    const dateKey = toDateKey(startAt);
    const hour = startAt.getHours();

    return {
      id,
      city: CITY,
      fileName,
      rowNumber,
      ts: startAt.getTime(),
      dateKey,
      weekday: startAt.getDay(),
      hour,
      parkingName: parkingName || "Без зоны",
      parkingKey: normalizeSearch(parkingName || "Без зоны"),
      endName: endName || "",
      endKey: normalizeSearch(endName || ""),
      isParkingSignal: isUsableParking(parkingName),
      scooter,
      qr: cleanText(row["QR-номер"]),
      tariff: cleanText(row["Тариф. название"]),
      durationSec: toNumber(row["Длительность"]),
      distanceM: toNumber(row["Расстояние"]),
      revenue: toNumber(row["Итог"]),
      startLat: startCoords ? startCoords.lat : null,
      startLng: startCoords ? startCoords.lng : null,
      endLat: endCoords ? endCoords.lat : null,
      endLng: endCoords ? endCoords.lng : null,
    };
  }

  function recompute() {
    state.analysis = analyze(state.rides, state.settings);
    renderAll();
  }

  function analyze(rides, settings) {
    const usable = rides.filter((ride) => ride.city === CITY);
    const dates = [...new Set(usable.map((ride) => ride.dateKey))].sort();
    const latestTs = usable.reduce((max, ride) => Math.max(max, ride.ts || 0), 0);
    const latestDate = latestTs ? new Date(latestTs) : null;
    const cutoffTs = latestTs - settings.lookbackDays * 86400000;
    const recent = usable.filter((ride) => ride.ts >= cutoffTs);

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
        <span>${fmtDateTime(upload.importedAt)} · BH ${fmtInt(upload.cityRows)} · новых ${fmtInt(upload.newRides)}</span>
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

    const maxScore = Math.max(...stations.map((station) => station.score), 1);
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
      city: CITY,
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
        state.settings = { ...defaults, ...payload.settings };
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

  function sameCity(value) {
    return normalizeSearch(value) === normalizeSearch(CITY);
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
    return { lat: Number(match[1]), lng: Number(match[2]) };
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

