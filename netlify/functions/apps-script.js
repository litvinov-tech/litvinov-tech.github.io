const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwI4vWqnNW4icATzMh1JLkeLGJg2mQNXSVGIAK_sRzmjO2DLV_Ba3QWB0V7QpCmxsVPtw/exec";

let cachedToken = "";
let cachedAt = 0;

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

async function postAppsScript(payload) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script returned non-JSON ${response.status}: ${text.slice(0, 160)}`);
  }
  if (!response.ok) throw new Error(data?.msg || `Apps Script HTTP ${response.status}`);
  return data;
}

async function getToken({ force = false } = {}) {
  const user = process.env.APPS_SCRIPT_USER;
  const pass = process.env.APPS_SCRIPT_PASS;
  if (!user || !pass) throw new Error("Netlify env APPS_SCRIPT_USER/APPS_SCRIPT_PASS is not configured");
  if (cachedToken && !force && Date.now() - cachedAt < 45 * 60 * 1000) return cachedToken;
  const login = await postAppsScript({ acao: "login", usuario: user, senha: pass });
  if (!login?.token) throw new Error(login?.msg || "Apps Script login returned empty token");
  cachedToken = login.token;
  cachedAt = Date.now();
  return cachedToken;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { ok: false, msg: "POST only" });

  try {
    const payload = JSON.parse(event.body || "{}");
    const acao = String(payload.acao || "");
    const allowed = new Set(["carregarTodosPontos", "carregarPontos", "listarConfigs"]);
    if (!allowed.has(acao)) return json(400, { ok: false, msg: "Unsupported acao" });

    const call = async (forceLogin = false) => postAppsScript({
      ...payload,
      _token: await getToken({ force: forceLogin }),
    });

    let data = await call(false);
    if (data?.authError) {
      cachedToken = "";
      data = await call(true);
    }
    return json(200, data);
  } catch (error) {
    return json(500, { ok: false, msg: error.message || String(error) });
  }
};
