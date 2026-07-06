/*
 * CAPTURA GoJet COMPLETA (parkings + parking_rules + schedule)
 * ------------------------------------------------------------------
 * Por que: logistic.gojet.app retorna 403 fora do navegador GoJet.
 * Este script deve ser colado no Console do navegador enquanto voce esta
 * logado em https://map.gojet.app. Ele baixa um JSON unico que o site
 * JET Capacity Brain entende pelo botao "Importar GoJet JSON".
 *
 * COMO USAR:
 * 1) Abra https://map.gojet.app e deixe logado.
 * 2) F12 -> Console. Cole este script e Enter.
 * 3) Informe o city_id. Curitiba = 655636e16e2c3042b5abbc9e.
 * 4) Vai baixar gojet_capacity_<city_id>.json.
 * 5) No site, selecione a cidade e importe esse JSON.
 */
(async () => {
  const BASE = "https://logistic.gojet.app/api/v0/urent";
  const cityId = (prompt("GoJet city_id:", "655636e16e2c3042b5abbc9e") || "").trim();
  if (!cityId) { console.warn("cancelado"); return; }

  async function fetchJson(url) {
    const res = await fetch(url, { credentials: "omit", mode: "cors", headers: { accept: "application/json,*/*" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText || "HTTP"}: ${url}`);
    return res.json();
  }

  function rows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    for (const key of ["entries", "rows", "items", "results", "data", "parkings", "rules", "schedules"]) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
      if (value && Array.isArray(value.entries)) return value.entries;
      if (value && Array.isArray(value.rows)) return value.rows;
      if (value && Array.isArray(value.items)) return value.items;
      if (value && Array.isArray(value.data)) return value.data;
    }
    return [];
  }

  async function fetchPaged(path, limit = 1000, maxPages = 50) {
    const out = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages && page <= maxPages) {
      const join = path.includes("?") ? "&" : "?";
      const url = `${BASE}/${path}${join}city_id=${encodeURIComponent(cityId)}&page=${page}&limit=${limit}`;
      const json = await fetchJson(url);
      const chunk = rows(json);
      out.push(...chunk);
      totalPages = Number(json.total_pages || json.totalPages || totalPages || 1);
      console.log(`${path} pagina ${page}/${totalPages}: +${chunk.length}, total ${out.length}`);
      if (!chunk.length || chunk.length < limit) break;
      page += 1;
    }
    return out;
  }

  async function tryFetch(paths) {
    let lastErr = null;
    for (const path of paths) {
      try {
        const url = `${BASE}/${path}${path.includes("?") ? "&" : "?"}city_id=${encodeURIComponent(cityId)}`;
        const json = await fetchJson(url);
        console.log(`${path}: ok`);
        return json;
      } catch (err) {
        console.warn(`${path}:`, err.message);
        lastErr = err;
      }
    }
    console.warn("nao conseguiu buscar", paths, lastErr?.message);
    return null;
  }

  const parkingsRaw = await fetchPaged("parkings");
  const parkings = parkingsRaw.map((pk) => {
    const lat = Number(pk.latitude ?? pk.lat);
    const lng = Number(pk.longitude ?? pk.lng ?? pk.lon);
    return {
      ...pk,
      id: pk.id || pk._id || pk.parking_id || "",
      name: String(pk.name || pk.nome || pk.title || "").trim(),
      lat,
      lng,
      latitude: lat,
      longitude: lng,
    };
  }).filter((pk) => pk.id && pk.name && Number.isFinite(pk.lat) && Number.isFinite(pk.lng));

  const rulesPayload = await tryFetch(["parking_rules", "parking_rules/"]);
  const rules = rows(rulesPayload);
  const schedulePayload = await tryFetch(["schedule", "schedules", "schedule/", "schedules/"]);

  const payload = {
    source: "GoJet browser capture: parkings + parking_rules + schedule",
    cityId,
    capturedAt: new Date().toISOString(),
    counts: { parkings: parkings.length, rules: rules.length },
    parkings,
    rules,
    schedule: schedulePayload,
    schedules: rows(schedulePayload),
  };

  const withScheduleId = rules.filter((rule) => rule.schedule_id || rule.scheduleId || rule.schedule?.id || rule.schedule?._id).length;
  const withParkingId = rules.filter((rule) => rule.parking_id || rule.parkingId || rule.parking?.id || rule.parking?._id).length;
  console.log(`PRONTO: parkings=${parkings.length}, rules=${rules.length}, rules com schedule_id=${withScheduleId}, rules com parking_id=${withParkingId}`);

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gojet_capacity_${cityId}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
})();