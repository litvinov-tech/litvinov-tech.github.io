const GOJET_API = "https://logistic.gojet.app/api/v0/urent";
const MAX_PAGES = 30;
const PAGE_LIMIT = 500;

const FALLBACK_CITIES: Record<string, string> = {
  "belo horizonte": "690388c7ad28bbbf340407e0",
  "belo horizonte mg": "690388c7ad28bbbf340407e0",
  bh: "690388c7ad28bbbf340407e0"
};

type GoJetParking = Record<string, unknown>;

type DashboardPoint = {
  name: string;
  lat: number;
  lng: number;
  zone: string;
  cap: number | "";
  gojetId: string;
  monitor: boolean;
  bikes: number;
};

function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function intValue(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCapacity(value: unknown): number | "" {
  const raw = clean(value);
  if (!raw) return "";
  const match = raw.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return "";
  const parsed = Number.parseFloat(match[0]);
  if (!Number.isFinite(parsed)) return "";
  return Number.isInteger(parsed) ? parsed : Number(parsed.toFixed(2));
}

function pickCapacity(...values: unknown[]): number | "" {
  for (const value of values) {
    const capacity = parseCapacity(value);
    if (capacity !== "") return capacity;
  }
  return "";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function fetchGoJet(path: string): Promise<unknown> {
  const response = await fetch(`${GOJET_API}${path}`, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      referer: "https://map.gojet.app/",
      origin: "https://map.gojet.app"
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GoJet HTTP ${response.status}`);
  }
  if (/^\s*</.test(text)) {
    throw new Error("GoJet returned an HTML challenge instead of JSON");
  }
  return JSON.parse(text);
}

function entries(data: unknown): GoJetParking[] {
  if (Array.isArray(data)) return data as GoJetParking[];
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.entries)) return obj.entries as GoJetParking[];
  if (Array.isArray(obj.data)) return obj.data as GoJetParking[];
  if (Array.isArray(obj.items)) return obj.items as GoJetParking[];
  return [];
}

async function findCityId(city: string, requestedCityId: string): Promise<string> {
  if (requestedCityId) return requestedCityId;
  const target = norm(city).replace(/\bmg\b/g, "").trim();
  const fallback = FALLBACK_CITIES[target] || FALLBACK_CITIES[norm(city)];
  if (fallback) return fallback;

  try {
    const cityData = await fetchGoJet("/cities");
    if (Array.isArray(cityData)) {
      for (const item of cityData) {
        const record = item as Record<string, unknown>;
        const name = norm(record.name);
        const id = clean(record.id);
        if (id && (name === target || name.includes(target) || target.includes(name))) {
          return id;
        }
      }
    }
  } catch {
  }

  return "";
}

function pageCount(data: unknown): number {
  if (!data || typeof data !== "object") return 1;
  const obj = data as Record<string, unknown>;
  return intValue(obj.total_pages ?? obj.totalPages ?? 1) || 1;
}

function itemCount(data: unknown, fallback: number): number {
  if (!data || typeof data !== "object") return fallback;
  const obj = data as Record<string, unknown>;
  return intValue(obj.total_items ?? obj.totalItems ?? fallback) || fallback;
}

function toPoint(pk: GoJetParking): DashboardPoint | null {
  const name = clean(pk.name ?? pk.parking_name ?? pk.parkingName ?? pk.title);
  const lat = num(pk.latitude ?? pk.parking_latitude ?? pk.parkingLatitude ?? pk.lat);
  const lng = num(pk.longitude ?? pk.parking_longitude ?? pk.parkingLongitude ?? pk.lng ?? pk.lon);
  if (!name || !lat || !lng) return null;
  return {
    name,
    lat,
    lng,
    zone: "Sem Zona",
    cap: pickCapacity(pk.capacity, pk.expected_bikes_count, pk.expected),
    gojetId: clean(pk.id),
    monitor: pk.monitor === true || pk.is_monitor === true,
    bikes: intValue(pk.bikes_count ?? pk.bikesCount)
  };
}

export default async (request: Request) => {
  const url = new URL(request.url);
  const city = clean(url.searchParams.get("city") || url.searchParams.get("cidade") || "Belo Horizonte");
  const requestedCityId = clean(url.searchParams.get("city_id") || url.searchParams.get("gojetCityId"));

  if (!city && !requestedCityId) {
    return json({ ok: false, msg: "Cidade nao informada" }, 400);
  }

  try {
    const cityId = await findCityId(city, requestedCityId);
    if (!cityId) {
      return json({ ok: false, msg: `Cidade '${city}' nao encontrada na GoJet` }, 404);
    }

    let page = 1;
    let totalPages = 1;
    let totalItems = 0;
    const parkings: GoJetParking[] = [];

    while (page <= totalPages && page <= MAX_PAGES) {
      const data = await fetchGoJet(
        `/parkings?city_id=${encodeURIComponent(cityId)}&page=${page}&limit=${PAGE_LIMIT}`
      );
      const pageEntries = entries(data);
      parkings.push(...pageEntries);
      totalPages = pageCount(data);
      totalItems = itemCount(data, parkings.length);
      page += 1;
    }

    const rows = parkings.reduce<DashboardPoint[]>((acc, parking) => {
      const point = toPoint(parking);
      if (point) acc.push(point);
      return acc;
    }, []);
    const monitores = rows.filter((row) => row.monitor).length;
    const totalBikes = rows.reduce((sum, row) => sum + intValue(row.bikes), 0);

    return json({
      ok: true,
      cidade: city,
      gojetCityId: cityId,
      total: rows.length,
      totalRaw: parkings.length,
      totalItems,
      monitores,
      normais: rows.length - monitores,
      totalBikes,
      rows,
      msg: `${rows.length} pontos carregados da GoJet para ${city}`
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return json({ ok: false, blocked: /403|HTML challenge/i.test(detail), msg: `Erro ao buscar GoJet: ${detail}` }, 502);
  }
};

export const config = {
  path: "/api/gojet-parkings"
};