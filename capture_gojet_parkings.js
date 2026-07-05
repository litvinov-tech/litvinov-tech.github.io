/*
 * CAPTURA DE PARKINGS GoJet (com parking_id)
 * ------------------------------------------------------------------
 * Por que: a API logistic.gojet.app fica atras do Cloudflare e retorna 403
 * para servidores (Netlify, Apps Script, PowerShell). So o navegador logado
 * no proprio dominio GoJet passa. Entao capturamos os parkings AQUI e
 * importamos o JSON no site (botao "Importar parkings JSON").
 *
 * COMO USAR:
 * 1) Abra e faca login em https://map.gojet.app  (deixe a aba aberta).
 * 2) F12 -> Console. Cole este script e Enter.
 * 3) Informe o city_id quando pedir (ex.: Curitiba = 674bf482f61e01bbafea9e94).
 * 4) Vai baixar parkings_<city_id>.json.
 * 5) No site bh-parking-brain: selecione a cidade -> "Importar parkings JSON".
 */
(async () => {
  const BASE = "https://logistic.gojet.app/api/v0/urent";
  const cityId = (prompt("GoJet city_id:", "674bf482f61e01bbafea9e94") || "").trim();
  if (!cityId) { console.warn("cancelado"); return; }

  const all = [];
  let page = 1, totalPages = 1;
  while (page <= totalPages && page <= 50) {
    const url = `${BASE}/parkings?city_id=${encodeURIComponent(cityId)}&page=${page}&limit=1000`;
    const res = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
    if (!res.ok) { console.error("HTTP", res.status, "na pagina", page); break; }
    const json = await res.json();
    totalPages = json.total_pages || json.totalPages || 1;
    const entries = json.entries || json.rows || json.parkings || [];
    for (const pk of entries) {
      const name = String(pk.name || "").trim();
      const lat = parseFloat(pk.latitude ?? pk.lat);
      const lng = parseFloat(pk.longitude ?? pk.lng);
      if (!name || !lat) continue;
      all.push({
        id: pk.id || pk._id || "",
        name, lat, lng,
        monitor: pk.monitor === true,
        bikes_count: pk.bikes_count || 0,
      });
    }
    console.log(`pagina ${page}/${totalPages} -> ${all.length} parkings`);
    page++;
  }

  const withId = all.filter(p => p.id).length;
  const payload = { source: "GoJet parkings (browser capture)", cityId, capturedAt: new Date().toISOString(), count: all.length, withId, parkings: all };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `parkings_${cityId}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  console.log(`PRONTO: ${all.length} parkings, com id ${withId}. Baixado parkings_${cityId}.json`);
})();
