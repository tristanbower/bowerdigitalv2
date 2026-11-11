#!/usr/bin/env node
// Side Bets terminal — snapshot collector.
//
// Reads public, no-key sources and writes dated JSON snapshots to
// data/side-bets/ (one file per section per run). The /side-bets page
// renders from the latest snapshot listed in data/side-bets/index.json.
//
//   node scripts/side-bets-collect.cjs            # all sections
//   node scripts/side-bets-collect.cjs compute    # one section
//
// Rules this script enforces:
//   - Snapshots are append-only. A run writes a NEW file; it never edits an
//     old one. If the data is identical to the latest snapshot, it writes
//     nothing for that section.
//   - Every figure carries value + asOf + source. A source that can't be read
//     is recorded under `blocked` with the reason — never filled with a guess.
//   - No API keys. Anything that needs one is an open item, not a workaround.
//   - History files (data/side-bets/history/<series>.json) are append-only:
//     a run may add points it hasn't seen, never edit or drop a stored one. If
//     a source later reports a different value for a stored point, the stored
//     value stays and the difference is logged under `revisions`.
//   - Backfill comes only from a source's own published history. A series with
//     no free history source starts from this collector's first reading.
//
// Data directory is data/side-bets/ (not public/): this site has no build
// step and Vercel would treat a top-level public/ folder as the site root.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "side-bets");
const INDEX_FILE = path.join(OUT_DIR, "index.json");
const HIST_DIR = path.join(OUT_DIR, "history");
// Seed window for sources with published history: enough for a 1Y range.
const HIST_DAYS = 400;
const SCHEMA = 1;
const TZ = "America/Toronto";
// Identify honestly. (Sources that only answer a browser-impersonating
// User-Agent are treated as blocked, not worked around.)
const UA = "bowerdigital-side-bets-collector/1.0 (+https://bowerdigital.com/side-bets)";

// ── HTTP helpers ──

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { json = false, headers = {}, body = null, method = "GET" } = {}) {
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(url, {
      method,
      body,
      headers: { "User-Agent": UA, Accept: json ? "application/json" : "*/*", ...headers },
      signal: AbortSignal.timeout(45000),
    });
    // Back off politely on rate limits and transient server errors.
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 5000 * attempt;
      await sleep(Math.min(wait, 60000));
      continue;
    }
    break;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  if (json) return res.json();
  return Buffer.from(await res.arrayBuffer());
}

const text = async (url, opts) => (await get(url, opts)).toString("utf8");

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#34;|&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

// ── Dates ──

const torontoDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const pad = (n) => String(n).padStart(2, "0");
// "09-Nov-2026" or "Nov 09 2026" -> "2026-11-09"
function parseLooseDate(s) {
  let m = s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (m) return `${m[3]}-${pad(MONTHS[m[2]])}-${pad(m[1])}`;
  m = s.match(/([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) return `${m[3]}-${pad(MONTHS[m[1]])}-${pad(m[2])}`;
  return null;
}
// "11/09/2026" -> "2026-11-09"
const mdyToIso = (s) => { const [m, d, y] = s.split("/"); return `${y}-${m}-${d}`; };

function shiftIso(iso, { days = 0, months = 0, years = 0 }) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Stats ──

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
const round = (x, dp = 4) => (x == null ? null : Math.round(x * 10 ** dp) / 10 ** dp);

// ── Minimal .xlsx reader (zip + sheet1), no dependencies ──

function unzipEntry(buf, name) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entry = buf.toString("utf8", p + 46, p + 46 + nlen);
    if (entry === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      return method === 0 ? data.toString("utf8") : zlib.inflateRawSync(data).toString("utf8");
    }
    p += 46 + nlen + xlen + clen;
  }
  throw new Error(`zip entry not found: ${name}`);
}

const xmlUnescape = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

function readXlsxRows(buf) {
  const shared = [...unzipEntry(buf, "xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => xmlUnescape(m[1].replace(/<[^>]+>/g, "")));
  const sheet = unzipEntry(buf, "xl/worksheets/sheet1.xml");
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
    [...r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
      .map(([, attrs, inner]) => {
        const v = (inner || "").match(/<v>([\s\S]*?)<\/v>/);
        if (!v) return null;
        return /t="s"/.test(attrs) ? shared[Number(v[1])] : xmlUnescape(v[1]);
      })
      .filter((x) => x !== null)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 1 — Macro strip
// ═══════════════════════════════════════════════════════════════════════════

const FRED = (id) => ({
  name: "FRED, Federal Reserve Bank of St. Louis",
  url: `https://fred.stlouisfed.org/series/${id}`,
  endpoint: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`,
});

async function fredSeries(key, label, id, unit, changeUnit, group) {
  const src = FRED(id);
  const csv = await text(src.endpoint);
  const obs = csv.trim().split("\n").slice(1)
    .map((l) => l.split(","))
    .filter(([, v]) => v && v !== "." && !isNaN(Number(v)))
    .map(([d, v]) => ({ date: d, value: Number(v) }));
  if (obs.length < 2) throw new Error(`FRED ${id}: fewer than two observations`);
  const last = obs[obs.length - 1], prev = obs[obs.length - 2];
  const diff = last.value - prev.value;
  return {
    key, label, group, unit,
    value: last.value,
    asOf: last.date,
    change: changeUnit === "pp"
      ? { value: round(diff, 4), unit: "pp", basis: `vs prior observation ${prev.date}`, prevValue: prev.value }
      : { value: round((diff / prev.value) * 100, 4), unit: "%", basis: `vs prior observation ${prev.date}`, prevValue: prev.value },
    frequency: "daily (observation date)",
    source: { name: src.name, url: src.url, series: id },
    _history: {
      points: obs.map((o) => ({ t: o.date, value: o.value })),
      backfill: { available: true, note: `FRED publishes the full daily history of ${id}; points kept from ${HIST_DAYS} days back.` },
      source: { name: src.name, url: src.url, endpoint: src.endpoint, series: id },
    },
  };
}

async function goldApi(key, label, symbol, unit, group, prevMacro) {
  const url = `https://api.gold-api.com/price/${symbol}`;
  const d = await get(url, { json: true });
  if (typeof d.price !== "number") throw new Error(`gold-api ${symbol}: no price`);
  // gold-api's history endpoint needs a key, so 1D change comes from the
  // previous snapshot when that snapshot is from an earlier day.
  const prev = prevMacro?.series?.find((s) => s.key === key);
  let change = null;
  if (prev && prev.asOf.slice(0, 10) < d.updatedAt.slice(0, 10)) {
    change = {
      value: round(((d.price - prev.value) / prev.value) * 100, 4), unit: "%",
      basis: `vs previous snapshot ${prev.asOf}`, prevValue: prev.value,
    };
  }
  return {
    key, label, group, unit,
    value: round(d.price, 4),
    asOf: d.updatedAt,
    change,
    changeNote: change ? null : "1D change needs a prior-day snapshot (no-key source has no history)",
    frequency: "spot, intraday",
    source: { name: "gold-api.com", url: "https://gold-api.com", endpoint: url, series: symbol },
    _history: {
      points: [{ t: d.updatedAt, value: round(d.price, 4) }],
      backfill: { available: false, note: GOLD_API_NO_HISTORY[symbol] },
      source: { name: "gold-api.com (this collector's own readings)", url: "https://gold-api.com", endpoint: url, series: symbol },
    },
  };
}

// Why gold and copper have no backfill. Verbatim responses, read Nov 10, 2026.
const GOLD_API_NO_HISTORY = {
  XAU: "No free history source found. gold-api.com's history endpoint answers {\"error\": \"No x-api-key header.\"} (HTTP 401); FRED's LBMA gold series GOLDAMGBD228NLBM returns HTTP 404 (discontinued). History is this collector's own readings only.",
  HG: "No free history source found. gold-api.com's history endpoint needs an API key (HTTP 401, \"No x-api-key header.\"). FRED's PCOPPUSDM is a monthly global copper price in USD per metric ton — a different instrument and unit from the COMEX HG USD/lb read here — so it is not substituted. History is this collector's own readings only.",
};

async function coingeckoBtc() {
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true";
  const d = (await get(url, { json: true })).bitcoin;
  // Daily history: CoinGecko's daily points are the price at 00:00 UTC. The
  // free API serves up to 365 days. The trailing "now" point is dropped.
  const histUrl = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily";
  const daily = (await get(histUrl, { json: true })).prices
    .filter(([ms]) => ms % 864e5 === 0)
    .map(([ms, v]) => ({ t: new Date(ms).toISOString().slice(0, 10), value: round(v, 2) }));
  // Last 24 hours at CoinGecko's automatic 5-minute granularity.
  const dayUrl = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1";
  const day = (await get(dayUrl, { json: true })).prices;
  const cgSource = (endpoint) => ({ name: "CoinGecko", url: "https://www.coingecko.com/en/coins/bitcoin", endpoint, series: "bitcoin/usd" });
  return {
    key: "btc", label: "Bitcoin", group: "backdrop", unit: "USD",
    value: d.usd,
    asOf: new Date(d.last_updated_at * 1000).toISOString(),
    change: { value: round(d.usd_24h_change, 4), unit: "%", basis: "rolling 24h" },
    frequency: "spot, intraday",
    source: { name: "CoinGecko", url: "https://www.coingecko.com/en/coins/bitcoin", endpoint: url, series: "bitcoin/usd" },
    intraday: {
      label: "last 24 hours, 5-minute points",
      points: day.map(([ms, v]) => ({ t: new Date(ms).toISOString(), value: round(v, 2) })),
      source: cgSource(dayUrl),
    },
    _history: {
      points: daily,
      backfill: { available: true, note: "CoinGecko's free API publishes 365 days of daily prices (00:00 UTC each day)." },
      source: cgSource(histUrl),
    },
  };
}

// Cboe's public delayed-quote CDN (no key): daily OHLC history per symbol,
// split-adjusted, not dividend-adjusted — so returns are price returns.
async function cboeHistory(symbol) {
  const endpoint = `https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/${symbol}.json`;
  const d = await get(endpoint, { json: true });
  if (!d?.data?.length) throw new Error(`Cboe ${symbol}: no rows`);
  return {
    source: { name: "Cboe delayed quotes (daily closes)", url: `https://www.cboe.com/us/equities/market_statistics/historical_data/`, endpoint, series: symbol },
    closes: d.data
      .map((r) => ({ date: r.date, close: Number(r.close) }))
      .filter((r) => Number.isFinite(r.close) && r.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// "2026-11-10T09:31:00" (exchange time, America/New_York) -> UTC ISO string.
function etToIso(naive) {
  const guess = new Date(naive + "Z");
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(guess).find((p) => p.type === "timeZoneName").value; // "GMT-5"
  const h = Number(off.replace("GMT", "") || 0);
  return new Date(guess.getTime() - h * 36e5).toISOString();
}

// Latest session from Cboe's 1-minute delayed quotes, sampled every 5 minutes.
async function cboeIntraday(symbol) {
  const endpoint = `https://cdn.cboe.com/api/global/delayed_quotes/charts/intraday/${symbol}.json`;
  const d = await get(endpoint, { json: true });
  const rows = (d?.data || []).filter((r) => Number.isFinite(r.price?.close));
  if (!rows.length) return null;
  const pts = rows.filter((r, i) => i % 5 === 4 || i === rows.length - 1)
    .map((r) => ({ t: etToIso(r.datetime), value: r.price.close }));
  return {
    label: `session of ${rows[0].datetime.slice(0, 10)}, 5-minute points (delayed)`,
    session: rows[0].datetime.slice(0, 10),
    points: pts,
    source: { name: "Cboe delayed quotes (1-minute bars)", url: "https://www.cboe.com/us/equities/market_statistics/historical_data/", endpoint, series: symbol },
  };
}

async function etfProxy(key, label, symbol, group) {
  const { closes, source } = await cboeHistory(symbol);
  const last0 = closes[closes.length - 1];
  let intraday = null, intradayBlocked = null;
  try {
    intraday = await cboeIntraday(symbol);
    // The CDN sometimes serves an old session; never show it as the latest day.
    if (intraday && intraday.session < last0.date) {
      intradayBlocked = `Cboe's intraday feed for ${symbol} returned the session of ${intraday.session}, older than the latest daily close (${last0.date}). Not shown.`;
      intraday = null;
    } else if (!intraday) intradayBlocked = `Cboe's intraday feed for ${symbol} returned no rows.`;
  } catch (e) { intradayBlocked = `Cboe intraday ${symbol}: ${e.message}`; }
  const last = closes[closes.length - 1], prev = closes[closes.length - 2];
  return {
    key, label, group, unit: "USD",
    value: last.close,
    asOf: last.date,
    change: { value: round((last.close / prev.close - 1) * 100, 4), unit: "%", basis: `close vs close ${prev.date}`, prevValue: prev.close },
    frequency: "daily close",
    proxy: `${symbol} ETF close (proxy, not the underlying commodity)`,
    source,
    intraday,
    intradayBlocked,
    _history: {
      points: closes.map((c) => ({ t: c.date, value: c.close })),
      backfill: { available: true, note: `Cboe publishes the daily close history of ${symbol}; points kept from ${HIST_DAYS} days back. Stooq, the planned source, serves a bot check instead of CSV.` },
      source,
    },
  };
}

async function collectMacro(prev) {
  const series = [];
  const blocked = [
    {
      series: "DXY (ICE US Dollar Index)",
      source: "Stooq (dx.f) / ICE",
      reason: "Stooq serves a JavaScript proof-of-work bot check instead of CSV; ICE distributes DXY data on paid terms. FRED has no DXY series (its broad trade-weighted dollar index, DTWEXBGS, is a different index and is not substituted).",
      needs: "A paid or keyed market-data feed (e.g. a free-tier quote API with key).",
    },
    {
      series: "Daily ETF history via Stooq",
      source: "https://stooq.com/q/d/l/?s=ura.us&i=d",
      reason: "Returns \"This site requires JavaScript to verify your browser.\" (a JavaScript proof-of-work page), not CSV. Not bypassed. ETF history is read from Cboe's public daily closes instead.",
    },
  ];
  const jobs = [
    ["us10y", () => fredSeries("us10y", "US 10Y Treasury yield", "DGS10", "%", "pp", "backdrop")],
    ["wti", () => fredSeries("wti", "WTI crude oil (Cushing spot)", "DCOILWTICO", "USD/bbl", "%", "energy")],
    ["natgas", () => fredSeries("natgas", "Henry Hub natural gas (spot)", "DHHNGSP", "USD/MMBtu", "%", "energy")],
    ["gold", () => goldApi("gold", "Gold (spot)", "XAU", "USD/oz", "backdrop", prev)],
    ["copper", () => goldApi("copper", "Copper", "HG", "USD/lb", "supply-chain", prev)],
    ["btc", () => coingeckoBtc()],
    ["ura", () => etfProxy("ura", "Uranium miners (URA)", "URA", "energy")],
    ["remx", () => etfProxy("remx", "Rare earths & strategic metals (REMX)", "REMX", "supply-chain")],
    ["botz", () => etfProxy("botz", "Robotics & AI (BOTZ)", "BOTZ", "supply-chain")],
  ];
  const _histories = {};
  for (const [key, job] of jobs) {
    try {
      const { _history, ...s } = await job();
      series.push(s);
      _histories[`macro-${key}`] = { label: s.label, unit: s.unit, ..._history };
    } catch (e) { blocked.push({ series: key, source: "see collector", reason: e.message }); }
  }
  return { series, blocked, _histories };
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 2 — Sector breakdown
// ═══════════════════════════════════════════════════════════════════════════

const SECTORS = [
  { etf: "XLK", sector: "Information Technology", short: "Technology" },
  { etf: "XLC", sector: "Communication Services", short: "Communication Services" },
  { etf: "XLF", sector: "Financials", short: "Financials" },
  { etf: "XLE", sector: "Energy", short: "Energy" },
  { etf: "XLB", sector: "Materials", short: "Materials" },
  { etf: "XLI", sector: "Industrials", short: "Industrials" },
  { etf: "XLY", sector: "Consumer Discretionary", short: "Consumer Discretionary" },
  { etf: "XLP", sector: "Consumer Staples", short: "Consumer Staples" },
  { etf: "XLV", sector: "Health Care", short: "Health Care" },
  { etf: "XLU", sector: "Utilities", short: "Utilities" },
  { etf: "XLRE", sector: "Real Estate", short: "Real Estate" },
];

// Close on or before a date (closes sorted ascending).
function closeOnOrBefore(closes, iso) {
  for (let i = closes.length - 1; i >= 0; i--) if (closes[i].date <= iso) return closes[i];
  return null;
}

function periodReturns(closes) {
  const last = closes[closes.length - 1];
  const ref = {
    "1D": closes[closes.length - 2],
    "1W": closeOnOrBefore(closes, shiftIso(last.date, { days: -7 })),
    "1M": closeOnOrBefore(closes, shiftIso(last.date, { months: -1 })),
    "3M": closeOnOrBefore(closes, shiftIso(last.date, { months: -3 })),
    YTD: closeOnOrBefore(closes, `${Number(last.date.slice(0, 4)) - 1}-12-31`),
    "1Y": closeOnOrBefore(closes, shiftIso(last.date, { years: -1 })),
  };
  const out = {};
  for (const [k, r] of Object.entries(ref)) {
    out[k] = r ? { value: round((last.close / r.close - 1) * 100, 4), from: r.date, fromClose: r.close } : null;
  }
  return { last, returns: out };
}

const ssgaHoldingsUrl = (t) =>
  `https://www.ssga.com/us/en/intermediary/etfs/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${t.toLowerCase()}.xlsx`;

async function topHoldings(etf) {
  const url = ssgaHoldingsUrl(etf);
  const rows = readXlsxRows(await get(url));
  const asOfRow = rows.find((r) => r[0] === "Holdings:");
  const asOf = asOfRow ? parseLooseDate(asOfRow[1]) : null;
  const h = rows.findIndex((r) => r[0] === "Name" && r.includes("Weight"));
  if (h < 0 || !asOf) throw new Error(`SSGA ${etf}: holdings header or date not found`);
  const iT = rows[h].indexOf("Ticker"), iW = rows[h].indexOf("Weight");
  const holdings = rows.slice(h + 1)
    .filter((r) => r.length > iW && r[iT] && r[iT] !== "-" && !isNaN(Number(r[iW])))
    .map((r) => ({ name: r[0], ticker: r[iT], weight: Number(r[iW]) }))
    .sort((a, b) => b.weight - a.weight);
  return { asOf, url, all: holdings, top3: holdings.slice(0, 3).map((x) => ({ ...x, weight: round(x.weight, 2) })) };
}

async function spySectorWeights() {
  const url = "https://www.ssga.com/us/en/intermediary/etfs/spdr-sp-500-etf-trust-spy";
  const t = htmlToText(await text(url));
  // The page carries "Fund Sector Breakdown" and "Index Sector Breakdown";
  // the index table is the S&P 500's own sector weights.
  const i = t.indexOf("Index Sector Breakdown as of");
  if (i < 0) throw new Error("SSGA SPY: index sector breakdown not found");
  const seg = t.slice(i, i + 900);
  const asOf = parseLooseDate(seg.slice(0, 60));
  const weights = {};
  for (const s of SECTORS) {
    const m = seg.match(new RegExp(s.sector + "\\s+([\\d.]+)%"));
    if (m) weights[s.sector] = Number(m[1]);
  }
  if (Object.keys(weights).length !== SECTORS.length) throw new Error("SSGA SPY: not all 11 sector weights found");
  return { asOf, url, weights };
}

async function collectSectors() {
  const blocked = [
    {
      series: "ETF daily closes via Stooq",
      source: "https://stooq.com/q/d/l/?s=xlk.us&i=d",
      reason: "Returns an HTML JavaScript proof-of-work bot check, not CSV. Not bypassed. Closes are read from Cboe's public delayed-quote data instead.",
    },
    {
      series: "ETF daily closes via Nasdaq.com",
      source: "https://api.nasdaq.com/api/quote/XLK/historical",
      reason: "Answers only a browser-impersonating User-Agent; a plain request gets the connection reset. Not used.",
    },
  ];

  const weights = await spySectorWeights();
  const funds = [];
  for (const t of ["SPY", ...SECTORS.map((s) => s.etf)]) {
    const meta = SECTORS.find((s) => s.etf === t);
    const hist = await cboeHistory(t);
    const { last, returns } = periodReturns(hist.closes);
    let holdings = null;
    try { holdings = await topHoldings(t); }
    catch (e) { blocked.push({ series: `${t} holdings`, source: ssgaHoldingsUrl(t), reason: e.message }); }
    funds.push({
      etf: t,
      sector: meta ? meta.sector : "S&P 500 (index reference)",
      close: { value: last.close, asOf: last.date, source: hist.source },
      returns,
      weightInSP500: meta ? { value: weights.weights[meta.sector], asOf: weights.asOf, source: { name: "State Street — SPY fund page, Index Sector Breakdown", url: weights.url } } : null,
      topHoldings: holdings ? { asOf: holdings.asOf, source: { name: `State Street — ${t} daily holdings file`, url: holdings.url }, items: holdings.top3 } : null,
      _all: holdings?.all,
    });
  }

  // Classification guard: Alphabet and Meta are Communication Services (XLC),
  // not Technology (XLK). Fail the run rather than publish a misclassification.
  const tickers = (etf) => new Set((funds.find((f) => f.etf === etf)._all || []).map((h) => h.ticker));
  const xlc = tickers("XLC"), xlk = tickers("XLK");
  for (const t of ["GOOGL", "GOOG", "META"]) {
    if (!xlc.has(t)) throw new Error(`classification check: ${t} not found in XLC holdings`);
    if (xlk.has(t)) throw new Error(`classification check: ${t} found in XLK holdings`);
  }
  for (const f of funds) delete f._all;

  return {
    method: "Each sector is the Select Sector SPDR fund that tracks it, measured close to close; S&P 500 measured with SPY.",
    returnBasis: "Price return from daily closes (dividends not included). 1W/1M/3M/1Y compare the latest close with the last close on or before the same calendar date one week/month/three months/year earlier; YTD compares with the last close of the prior year.",
    classificationCheck: "GOOGL, GOOG and META confirmed in XLC holdings and absent from XLK holdings.",
    funds,
    blocked,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 3 — Compute pricing
// ═══════════════════════════════════════════════════════════════════════════

// Vast.ai gpu_name / RunPod id / per-provider SKU for each tracked GPU.
const GPUS = [
  { key: "H200", label: "H200 SXM 141GB", vast: "H200", runpod: "NVIDIA H200" },
  { key: "H100", label: "H100 SXM 80GB", vast: "H100 SXM", runpod: "NVIDIA H100 80GB HBM3" },
  { key: "B200", label: "B200 180GB", vast: "B200", runpod: "NVIDIA B200" },
];
const VAST_CAP = 64; // the public bundles endpoint returns at most 64 offers

async function vastOffers(gpuName, type) {
  const q = { gpu_name: { eq: gpuName }, num_gpus: { eq: 1 }, rentable: { eq: true }, verified: { eq: true }, type, limit: VAST_CAP };
  const url = "https://console.vast.ai/api/v0/bundles/?q=" + encodeURIComponent(JSON.stringify(q));
  const d = await get(url, { json: true });
  return { url, offers: d.offers || [] };
}

async function vastFor(gpu, at) {
  const od = await vastOffers(gpu.vast, "on-demand");
  const bid = await vastOffers(gpu.vast, "bid");
  const prices = od.offers.map((o) => o.dph_base).filter(Number.isFinite);
  const bids = bid.offers.map((o) => o.min_bid).filter(Number.isFinite);
  const source = { name: "Vast.ai public marketplace API", url: "https://cloud.vast.ai/create/" };
  const filter = `gpu_name=${gpu.vast}, 1 GPU, rentable, verified hosts`;
  return {
    median: prices.length ? {
      value: round(median(prices), 4), type: "on-demand", asOf: at, source,
      offers: prices.length, capped: od.offers.length >= VAST_CAP,
      note: `Median of dph_base (GPU-hour base rate, excludes storage and bandwidth) across ${prices.length} offers; ${filter}.`,
    } : null,
    spotLow: bids.length ? {
      value: round(Math.min(...bids), 4), type: "spot (interruptible, min bid)", asOf: at, source,
      offers: bids.length, capped: bid.offers.length >= VAST_CAP,
      note: `Lowest minimum bid across ${bids.length} interruptible offers; ${filter}. A bid can be outbid and the instance paused.`,
    } : null,
  };
}

async function runpodPrices(at) {
  const url = "https://api.runpod.io/graphql";
  const query = "query { gpuTypes { id displayName memoryInGb securePrice communityPrice secureCloud communityCloud } }";
  const d = await get(url, { json: true, method: "POST", body: JSON.stringify({ query }), headers: { "Content-Type": "application/json" } });
  if (d.errors) throw new Error("RunPod GraphQL: " + JSON.stringify(d.errors).slice(0, 200));
  const source = { name: "RunPod public GraphQL pricing API", url: "https://www.runpod.io/pricing" };
  const out = {};
  for (const g of GPUS) {
    const t = d.data.gpuTypes.find((x) => x.id === g.runpod);
    if (!t) continue;
    out[g.key] = {
      community: t.communityCloud && t.communityPrice > 0 ? { value: t.communityPrice, type: "community, on-demand", asOf: at, source, sku: t.displayName } : null,
      secure: t.secureCloud && t.securePrice > 0 ? { value: t.securePrice, type: "secure, on-demand", asOf: at, source, sku: t.displayName } : null,
    };
  }
  return out;
}

// Provider list prices. Each returns { [gpuKey]: cell } with $/GPU-hour.
const listCell = (provider, tier, value, sku, gpusPerSku, asOf, source, note) => ({
  provider, tier, value: round(value, 4), type: "list, on-demand", sku, gpusPerSku, asOf, source, note,
});

async function awsList(at) {
  const url = "https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2-ondemand-without-sec-sel/US%20East%20(N.%20Virginia)/Linux/index.json";
  let buf = await get(url);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const d = JSON.parse(buf.toString("utf8"));
  const region = Object.values(d.regions)[0];
  const published = d.manifest?.hawkFilePublicationDate || at;
  const source = { name: "AWS public EC2 price list (us-east-1, Linux, on-demand)", url: "https://aws.amazon.com/ec2/pricing/on-demand/" };
  const skus = { H200: "p5en.48xlarge", H100: "p5.48xlarge", B200: "p6-b200.48xlarge" };
  const out = {};
  for (const [g, sku] of Object.entries(skus)) {
    const row = Object.values(region).find((r) => r["Instance Type"] === sku);
    if (row) out[g] = listCell("AWS", "hyperscaler", Number(row.price) / 8, sku, 8, published, source, `$${Number(row.price).toFixed(4)}/hr for 8 GPUs`);
  }
  return out;
}

async function azureList(at) {
  const skus = { H200: "Standard_ND96isr_H200_v5", H100: "Standard_ND96isr_H100_v5" };
  const source = { name: "Azure Retail Prices API (East US 2, Linux, pay-as-you-go)", url: "https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/" };
  const out = {};
  for (const [g, sku] of Object.entries(skus)) {
    const filter = `serviceName eq 'Virtual Machines' and armSkuName eq '${sku}' and armRegionName eq 'eastus2' and priceType eq 'Consumption'`;
    const url = "https://prices.azure.com/api/retail/prices?$filter=" + encodeURIComponent(filter);
    const d = await get(url, { json: true });
    const row = (d.Items || []).find((i) => !/Windows/.test(i.productName) && !/Spot|Low Priority/.test(i.skuName));
    if (row) out[g] = listCell("Azure", "hyperscaler", row.unitPrice / 8, sku, 8, at, source, `$${row.unitPrice}/hr for 8 GPUs; price effective ${row.effectiveStartDate.slice(0, 10)}`);
  }
  return out;
}

async function oracleList(at) {
  const url = "https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/?currencyCode=USD";
  const d = await get(url, { json: true });
  const parts = { H200: "B110519", H100: "B98415", B200: "B110978" };
  const source = { name: "Oracle Cloud price list API (pay as you go)", url: "https://www.oracle.com/cloud/compute/pricing/" };
  const out = {};
  for (const [g, pn] of Object.entries(parts)) {
    const item = d.items.find((i) => i.partNumber === pn);
    const price = item?.currencyCodeLocalizations?.flatMap((c) => c.prices).find((p) => p.model === "PAY_AS_YOU_GO")?.value;
    if (price) out[g] = listCell("Oracle", "hyperscaler", price, `${pn} ${item.displayName}`, 1, at, source, "Priced per GPU-hour");
  }
  return out;
}

async function coreweaveList(at) {
  const url = "https://www.coreweave.com/pricing";
  const t = htmlToText(await text(url));
  const source = { name: "CoreWeave pricing page", url };
  const out = {};
  for (const [g, name] of [["H200", "NVIDIA HGX H200"], ["H100", "NVIDIA HGX H100"], ["B200", "NVIDIA HGX B200"]]) {
    // "NVIDIA HGX H200 8 141 128 2,048 61.44 $50.44" — GPU count, VRAM, vCPU, RAM, storage, $/instance-hour
    const m = t.match(new RegExp(name + " (\\d+) \\d+ \\d+ [\\d,]+ [\\d.]+ \\$([\\d.,]+)"));
    if (m) {
      const n = Number(m[1]), price = Number(m[2].replace(/,/g, ""));
      out[g] = listCell("CoreWeave", "gpu-cloud", price / n, name, n, at, source, `$${price}/hr for ${n} GPUs`);
    }
  }
  return out;
}

async function nebiusList(at) {
  const url = "https://nebius.com/prices";
  const html = (await text(url)).replace(/\\"/g, '"');
  const source = { name: "Nebius pricing page", url };
  if (!/"On-demand, GPU-hour"/.test(html)) throw new Error("Nebius: on-demand column header not found");
  const out = {};
  for (const [g, name] of [["H200", "NVIDIA HGX H200"], ["H100", "NVIDIA HGX H100"], ["B200", "NVIDIA HGX B200"]]) {
    // table row: ["NVIDIA HGX H200","16","200","from $0.79","$5.40"] — last column is on-demand
    const m = html.match(new RegExp(`\\["${name}","[^"]*","[^"]*","[^"]*","\\$([\\d.]+)\\s*"\\]`));
    if (m) out[g] = listCell("Nebius", "gpu-cloud", Number(m[1]), name, 1, at, source, "On-demand, per GPU-hour");
  }
  return out;
}

async function hyperstackList(at) {
  const url = "https://www.hyperstack.cloud/gpu-pricing";
  let t = htmlToText(await text(url));
  const source = { name: "Hyperstack GPU pricing page", url };
  const end = t.indexOf("Reservation Pricing");
  if (end > 0) t = t.slice(0, end); // on-demand table only
  const out = {};
  for (const [g, name] of [["H200", "NVIDIA H200 SXM"], ["H100", "NVIDIA H100 SXM"], ["B200", "NVIDIA B200"]]) {
    const m = t.match(new RegExp(name + " \\d+ \\d+ \\d+ \\$([\\d.]+)"));
    if (m) out[g] = listCell("Hyperstack", "gpu-cloud", Number(m[1]), name, 1, at, source, "On-demand, per GPU-hour");
  }
  return out;
}

const sane = (c) => c && Number.isFinite(c.value) && c.value > 0.2 && c.value < 40;

async function collectCompute() {
  const at = new Date().toISOString();
  const blocked = [
    { series: "Google Cloud list price", source: "https://cloud.google.com/compute/gpus-pricing", reason: "H200/H100/B200 prices are rendered client-side; the static pages carry no figures. The Cloud Billing Catalog API needs an API key.", needs: "A Google Cloud API key (free) for the Cloud Billing Catalog API." },
    { series: "Lambda list price", source: "https://lambda.ai/pricing", reason: "The public page shows prices that 'take effect November 16, 2026'; current prices require logging in. Future prices are not shown as current.", needs: "Re-read after Nov 16, 2026." },
  ];
  const gpus = {};
  for (const g of GPUS) gpus[g.key] = { key: g.key, label: g.label, marketplace: {}, runpod: null, list: [] };

  for (const g of GPUS) {
    try { gpus[g.key].marketplace = await vastFor(g, at); }
    catch (e) { blocked.push({ series: `Vast.ai ${g.key}`, source: "console.vast.ai", reason: e.message }); }
  }
  try {
    const rp = await runpodPrices(at);
    for (const g of GPUS) gpus[g.key].runpod = rp[g.key] || null;
  } catch (e) { blocked.push({ series: "RunPod", source: "api.runpod.io/graphql", reason: e.message }); }

  for (const [name, fn] of [["AWS", awsList], ["Azure", azureList], ["Oracle", oracleList], ["CoreWeave", coreweaveList], ["Nebius", nebiusList], ["Hyperstack", hyperstackList]]) {
    try {
      const cells = await fn(at);
      for (const g of GPUS) {
        const c = cells[g.key];
        if (sane(c)) gpus[g.key].list.push(c);
        else if (c) blocked.push({ series: `${name} ${g.key}`, source: c.source.url, reason: `parsed value ${c.value} failed sanity range` });
      }
    } catch (e) { blocked.push({ series: `${name} list price`, source: name, reason: e.message }); }
  }

  blocked.push(...COMPUTE_NO_HISTORY);

  return {
    unit: "USD per GPU-hour",
    columns: {
      marketplaceMedian: "Vast.ai marketplace median, on-demand",
      marketplaceSpotLow: "Vast.ai marketplace lowest spot (interruptible) bid",
      runpod: "RunPod list price (community and secure clouds)",
      list: "Provider list price, on-demand (hyperscalers and GPU clouds)",
    },
    gpus,
    blocked,
    _histories: Object.fromEntries(GPUS.map((g) => [`compute-vast-${g.key}`, vastHistoryEntry(g.key, gpus[g.key].marketplace)])),
  };
}

// Marketplace price history is built from this collector's own readings —
// neither marketplace publishes a free history endpoint (checked Nov 10, 2026).
const COMPUTE_NO_HISTORY = [
  { series: "Vast.ai price history", source: "https://console.vast.ai/api/v0/", reason: "No public history endpoint found: /api/v0/price_history/, /market/history/, /gpu_stats/ and /bundles/history/ all return HTTP 404. Charts use this collector's own readings only." },
  { series: "RunPod price history", source: "https://api.runpod.io/graphql", reason: `No history field: asking the GraphQL API for one answers 'Cannot query field "priceHistory" on type "GpuType".', and schema introspection is disabled. RunPod is not charted.` },
];

function vastHistoryEntry(key, m) {
  const points = m?.median ? [{
    t: m.median.asOf, value: m.median.value, offers: m.median.offers,
    spotLow: m.spotLow?.value ?? null, spotLowOffers: m.spotLow?.offers ?? null,
  }] : [];
  return {
    label: `Vast.ai ${key} marketplace median, on-demand`, unit: "USD per GPU-hour",
    points,
    backfill: { available: false, note: "No free history source found for Vast.ai or RunPod. History is this collector's own readings, one point per run." },
    source: { name: "Vast.ai public marketplace API (this collector's own readings)", url: "https://cloud.vast.ai/create/" },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Snapshot writing — append-only
// ═══════════════════════════════════════════════════════════════════════════

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) return { schema: SCHEMA, sections: {} };
  return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
}

function latestSnapshot(index, section) {
  const f = index.sections[section]?.latest;
  return f ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")) : null;
}

// Fields that change on every run without the data changing.
const volatile = new Set(["collectedAt", "asOf"]);
const stable = (v) => JSON.stringify(v, (k, x) => (volatile.has(k) ? undefined : x));

function writeSnapshot(index, section, data) {
  const prev = latestSnapshot(index, section);
  if (prev && stable(prev.data) === stable(data)) {
    console.log(`  ${section}: unchanged since ${index.sections[section].latest} — nothing written`);
    return false;
  }
  const date = torontoDate();
  let name = `${section}-${date}.json`;
  for (let n = 2; fs.existsSync(path.join(OUT_DIR, name)); n++) name = `${section}-${date}-${n}.json`;
  const snapshot = { schema: SCHEMA, section, collectedAt: new Date().toISOString(), data };
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx" });
  const s = (index.sections[section] ||= { files: [] });
  s.files.push(name);
  s.latest = name;
  console.log(`  ${section}: wrote ${name}`);
  return true;
}

// ── History files — append-only, one per series ──

const histFile = (series) => path.join(HIST_DIR, `${series}.json`);
const sameValue = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));

// Adds points whose timestamp isn't stored yet. Stored points are never
// edited or removed; a source value that differs from a stored one goes to
// `revisions`. Returns true if the file changed.
function appendHistory(index, series, entry) {
  fs.mkdirSync(HIST_DIR, { recursive: true });
  const file = histFile(series);
  const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const floor = shiftIso(torontoDate(), { days: -HIST_DAYS });
  const byT = new Map((cur?.points || []).map((p) => [p.t, p]));
  const revisions = [...(cur?.revisions || [])];
  let added = 0;
  for (const p of entry.points) {
    if (!p || !Number.isFinite(p.value)) continue;
    const old = byT.get(p.t);
    if (!old) {
      if (p.t.slice(0, 10) < floor) continue; // bounds backfill; stored points stay regardless
      byT.set(p.t, p); added++;
    } else if (!sameValue(old.value, p.value) && !revisions.some((r) => r.t === p.t && sameValue(r.sourceValue, p.value))) {
      revisions.push({ t: p.t, stored: old.value, sourceValue: p.value, seenAt: new Date().toISOString() });
    }
  }
  const revised = revisions.length !== (cur?.revisions || []).length;
  if (cur && !added && !revised) return false;
  const points = [...byT.values()].sort((a, b) => a.t.localeCompare(b.t));
  const out = {
    schema: SCHEMA,
    series,
    label: entry.label,
    unit: entry.unit,
    version: (cur?.version || 0) + 1,
    updated: new Date().toISOString(),
    appendOnly: "Points are only ever added. A stored point is never edited or removed; later source differences are listed under revisions.",
    backfill: entry.backfill,
    source: entry.source,
    firstPoint: points[0]?.t ?? null,
    points,
    revisions,
  };
  fs.writeFileSync(file, JSON.stringify(out) + "\n");
  (index.history ||= {})[series] = `history/${series}.json`;
  console.log(`  history ${series}: +${added} point(s) → v${out.version}${revised ? " (revision logged)" : ""}`);
  return true;
}

// Readings already in earlier snapshots are real collected data: feed them to
// the history files of series that have no published history (idempotent).
function seedFromSnapshots(index) {
  const out = {};
  for (const f of index.sections.macro?.files || []) {
    const snap = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8"));
    for (const s of snap.data.series.filter((x) => x.key === "gold" || x.key === "copper")) {
      (out[`macro-${s.key}`] ||= []).push({ t: s.asOf, value: s.value });
    }
  }
  for (const f of index.sections.compute?.files || []) {
    const snap = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8"));
    for (const g of GPUS) {
      const e = vastHistoryEntry(g.key, snap.data.gpus[g.key]?.marketplace);
      (out[`compute-vast-${g.key}`] ||= []).push(...e.points);
    }
  }
  return out;
}

async function main() {
  const only = process.argv[2];
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const index = readIndex();
  const sections = {
    macro: () => collectMacro(latestSnapshot(index, "macro")?.data),
    sectors: () => collectSectors(),
    compute: () => collectCompute(),
  };
  const seeds = seedFromSnapshots(index);
  let wrote = false, failed = false;
  for (const [name, fn] of Object.entries(sections)) {
    if (only && only !== name) continue;
    console.log(`collecting ${name}…`);
    try {
      const { _histories = {}, ...data } = await fn();
      wrote = writeSnapshot(index, name, data) || wrote;
      for (const [series, entry] of Object.entries(_histories)) {
        const points = [...(seeds[series] || []), ...entry.points];
        wrote = appendHistory(index, series, { ...entry, points }) || wrote;
      }
    }
    catch (e) { failed = true; console.error(`  ${name}: FAILED — ${e.message}`); }
  }
  if (wrote) {
    index.schema = SCHEMA;
    index.updated = new Date().toISOString();
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + "\n");
  }
  process.exitCode = failed ? 1 : 0;
}

main();
