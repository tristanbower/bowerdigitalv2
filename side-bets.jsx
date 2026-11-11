// Bower Digital — /side-bets terminal.
// A personal research terminal: macro band, composite sector indexes, GPU compute pricing.
// Renders from the latest JSON snapshots in /data/side-bets/ plus the
// append-only history files in /data/side-bets/history/ (both written by
// scripts/side-bets-collect.cjs). Every figure shows value + as-of + source.
//
// House rules: describe, never prescribe. No forecasts, no signals, no
// verdicts. Never blend unlike numbers — marketplace median, spot-low, RunPod
// list and provider list price each live in their own labelled column.
// Charts draw only stored points: a range with no data says so, it is never
// filled in.
//
// Sections: Macro band (hero + chart) · Sectors · Compute · Sources · Footer

const DATA_DIR = "/data/side-bets/";

function Hairline({ label, n }) {
  return (
    <div className="hairline">
      <span className="hairline-n">{n}</span>
      <span className="hairline-line" />
      <span className="hairline-label">{label}</span>
    </div>
  );
}

function useClock() {
  const [time, setTime] = React.useState("");
  React.useEffect(() => {
    const upd = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      setTime(`${hh}:${mm}:${ss}`);
    };
    upd();
    const id = setInterval(upd, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function useWidth(initial = 960, min = 280) {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(initial);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w];
}

// ── Data loading ──

function useSnapshots() {
  const [state, setState] = React.useState({ status: "loading" });
  React.useEffect(() => {
    const getJson = (f) => fetch(DATA_DIR + f, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
      return r.json();
    });
    getJson("index.json")
      .then(async (index) => {
        const out = { index, history: {} };
        const sections = ["macro", "sectors", "compute"].map(async (s) => {
          const f = index.sections?.[s]?.latest;
          out[s] = f ? { file: f, ...(await getJson(f)) } : null;
        });
        const hist = Object.entries(index.history || {}).map(async ([k, f]) => {
          out.history[k] = { file: f, ...(await getJson(f)) };
        });
        await Promise.all([...sections, ...hist]);
        setState({ status: "ok", ...out });
      })
      .catch((e) => setState({ status: "err", error: e.message }));
  }, []);
  return state;
}

// ── Formatting ──

const TZ = "America/Toronto";
const DAY = 864e5;
const isDateOnly = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t);
// Date-only points sit at noon UTC so they land on their own calendar day.
const tms = (t) => new Date(isDateOnly(t) ? t + "T12:00:00Z" : t).getTime();
const torontoDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

function fmtAsOf(s, dateSuffix = "") {
  if (!s) return "—";
  if (isDateOnly(s)) {
    const d = new Date(s + "T12:00:00Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) + dateSuffix;
  }
  const d = new Date(s);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ }) + " ET";
}

// Short label for a point's time: "Nov 3" for daily points, "Nov 10, 7:05 PM" for readings.
function fmtShort(t, withTime = !isDateOnly(t)) {
  if (isDateOnly(t)) return new Date(t + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const o = { month: "short", day: "numeric", timeZone: TZ };
  if (withTime) Object.assign(o, { hour: "numeric", minute: "2-digit" });
  return new Date(t).toLocaleString("en-US", o);
}
const fmtClock = (t) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });

function fmtNum(v, dp = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtSigned(v, dp = 2, unit = "%") {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${sign}${fmtNum(Math.abs(v), dp)}${unit}`;
}

const usd = (v, dp = 2) => (v == null ? "—" : `$${fmtNum(v, dp)}`);
const dir = (v) => (v > 0 ? "up" : v < 0 ? "down" : "flat");
const arrowFor = (v) => (v > 0 ? "▲" : v < 0 ? "▼" : "■");

function fmtDuration(ms) {
  const m = Math.round(ms / 6e4);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)} days`;
}

function SourceLink({ source, children }) {
  if (!source) return null;
  return (
    <a className="sb-src" href={source.url} target="_blank" rel="noopener noreferrer">
      {children || source.name}
    </a>
  );
}

function NotShown({ items, label = "Not shown" }) {
  if (!items?.length) return null;
  return (
    <div className="sb-notshown">
      <span className="sb-group-label">{label}</span>
      <ul>
        {items.map((b) => (
          <li key={b.series}><strong>{b.series}</strong> — {b.reason}{b.needs ? ` Needs: ${b.needs}` : ""}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Line chart (single series) ──
// Shared by the macro chart and the GPU price panels. Draws only the points it
// is given. `domain` can be wider than the data: the uncovered stretch is
// hatched and labelled instead of drawn. Optional high/low markers carry their
// dates. Line colour shows direction over the window; values stay in ink.

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo || Math.abs(hi) || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

function LineChart({ points, domain, fmtY, tip, extremes = false, height = 280, label, gapLabel, timeAxis = false }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = React.useState(null);
  const H = height, L = 64, R = 18, T = extremes ? 30 : 14, B = 30;
  const xs = points.map((p) => tms(p.t));
  let [x0, x1] = domain || [Math.min(...xs), Math.max(...xs)];
  if (x1 - x0 < 6e4) { x0 -= 12 * 36e5; x1 += 12 * 36e5; }
  const x = (ms) => L + ((ms - x0) / (x1 - x0)) * (W - L - R);
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.14 || Math.abs(hi) * 0.02 || 1;
  lo -= pad; hi += pad;
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const yTicks = niceTicks(lo, hi, 4).filter((v) => v >= lo && v <= hi);
  const nX = W < 520 ? 3 : 5;
  const xTicks = Array.from({ length: nX }, (_, i) => x0 + ((x1 - x0) * i) / (nX - 1));
  const xLabel = (ms) => (timeAxis ? fmtClock(ms) : fmtShort(new Date(ms).toISOString(), false));

  const first = points[0], last = points[points.length - 1];
  const trend = dir(last.value - first.value);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(tms(p.t)).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${line} L${x(tms(last.t)).toFixed(1)},${H - B} L${x(tms(first.t)).toFixed(1)},${H - B} Z` : null;
  const gapEnd = x(xs[0]);
  const showGap = gapLabel && gapEnd - L > 24;

  let hiP = null, loP = null;
  if (extremes && points.length > 1) {
    hiP = points.reduce((a, p) => (p.value > a.value ? p : a));
    loP = points.reduce((a, p) => (p.value < a.value ? p : a));
    if (hiP.value === loP.value) hiP = loP = null;
  }
  const anchor = (px) => (px > W * 0.72 ? "end" : px < L + W * 0.2 ? "start" : "middle");
  const gid = React.useId().replace(/:/g, "");

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = null;
    for (const p of points) if (!best || Math.abs(x(tms(p.t)) - px) < Math.abs(x(tms(best.t)) - px)) best = p;
    setHover(best);
  };
  const tipData = hover && tip(hover);

  return (
    <div className={`sb-chart-body sb-trend-${trend}`} ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className="sb-fill-top" />
            <stop offset="100%" className="sb-fill-bottom" />
          </linearGradient>
          <pattern id={`hatch-${gid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="sb-hatch" />
          </pattern>
        </defs>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="sb-grid" />
            <text x={L - 10} y={y(t) + 3.5} className="sb-axis" textAnchor="end">{fmtY(t)}</text>
          </g>
        ))}
        {xTicks.map((ms, i) => (
          <text key={i} x={x(ms)} y={H - 9} className="sb-axis"
                textAnchor={i === 0 ? "start" : i === nX - 1 ? "end" : "middle"}>{xLabel(ms)}</text>
        ))}
        {showGap && (
          <g>
            <rect x={L} y={T} width={gapEnd - L} height={H - T - B} fill={`url(#hatch-${gid})`} className="sb-gap" />
            {gapEnd - L > 150 && (
              <text x={L + (gapEnd - L) / 2} y={T + (H - T - B) / 2} className="sb-gap-label" textAnchor="middle">{gapLabel}</text>
            )}
          </g>
        )}
        {area && <path d={area} fill={`url(#fill-${gid})`} />}
        {points.length > 1 && <path d={line} className="sb-line" />}
        {hover && <line x1={x(tms(hover.t))} x2={x(tms(hover.t))} y1={T} y2={H - B} className="sb-crosshair" />}
        {[hiP, loP].filter(Boolean).map((p) => {
          const isHi = p === hiP, px = x(tms(p.t)), py = y(p.value);
          return (
            <g key={isHi ? "hi" : "lo"}>
              <circle cx={px} cy={py} r={4.5} className="sb-extreme" />
              <text x={px} y={isHi ? py - 10 : py + 17} className="sb-extreme-label" textAnchor={anchor(px)}>
                {isHi ? "High" : "Low"} {fmtY(p.value, true)} · {fmtShort(p.t)}
              </text>
            </g>
          );
        })}
        {points.length <= 40 && points.map((p) => (
          <circle key={p.t} cx={x(tms(p.t))} cy={y(p.value)} r={hover === p ? 5.5 : 3.5} className="sb-dot" />
        ))}
        {points.length > 40 && <circle cx={x(tms(last.t))} cy={y(last.value)} r={4.5} className="sb-dot sb-dot--last" />}
        {hover && points.length > 40 && <circle cx={x(tms(hover.t))} cy={y(hover.value)} r={5} className="sb-dot" />}
      </svg>
      {tipData && (
        <div className="sb-tip" style={{
          left: `${Math.min(88, Math.max(12, (x(tms(hover.t)) / W) * 100))}%`,
          top: `${(y(hover.value) / H) * 100}%`,
        }}>
          <strong>{tipData.main}</strong>
          <span>{tipData.sub}</span>
        </div>
      )}
    </div>
  );
}

function Sparkline({ points }) {
  if (!points || points.length < 2) return <div className="sb-spark sb-spark--empty" aria-hidden="true" />;
  const W = 120, H = 30;
  const xs = points.map((p) => tms(p.t)), vs = points.map((p) => p.value);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (ms) => ((ms - x0) / (x1 - x0 || 1)) * (W - 4) + 2;
  const y = (v) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(tms(p.t)).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const trend = dir(vs[vs.length - 1] - vs[0]);
  return (
    <svg className={`sb-spark sb-trend-${trend}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} className="sb-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ═══ (01) Macro band — the page's hero ═══

const HERO_KEYS = ["us10y", "gold", "btc"];
const MACRO_GROUPS = [
  { key: "backdrop", label: "Backdrop" },
  { key: "energy", label: "Energy" },
  { key: "supply-chain", label: "Supply chain" },
];

function macroValue(s, v = s.value) {
  if (s.unit === "%") return `${fmtNum(v, 2)}%`;
  if (s.key === "btc") return usd(v, 0);
  return usd(v, 2);
}

function macroChange(c) {
  if (!c) return null;
  if (c.unit === "pp") return `${fmtSigned(c.value * 100, 0, "")} bp`;
  return fmtSigned(c.value, 2);
}

// Change over a window, in the series' natural unit (bp for yields).
function windowChange(s, a, b) {
  if (s.unit === "%") return { text: `${fmtSigned((b - a) * 100, 0, "")} bp`, v: b - a };
  return { text: fmtSigned((b / a - 1) * 100, 2), v: b - a };
}

function ChangeBadge({ s }) {
  const chg = macroChange(s.change);
  if (!chg) return <span className="sb-chg sb-chg--na">1D change: needs a prior-day snapshot</span>;
  const d = dir(s.change.value);
  return (
    <span className={`sb-chg sb-chg--${d}`} title={s.change.basis}>
      <span className="sb-chg-fig"><span aria-hidden="true">{arrowFor(s.change.value)}</span> {chg}</span>
      <span className="sb-chg-basis"> {s.change.basis === "rolling 24h" ? "24h" : `1D · ${s.change.basis.replace("vs prior observation", "vs").replace("close vs close", "vs")}`.split(" ").map((w, i) => <React.Fragment key={i}>{i ? " " : ""}<span className="sb-nowrap">{w}</span></React.Fragment>)}</span>
    </span>
  );
}

const asOfText = (s) => fmtAsOf(s.asOf, s.frequency?.includes("close") ? " close" : "");

// Last month of history for the sparkline — or null when the stored history
// doesn't reach back a month (a few hours of readings would read as a trend).
function lastMonth(hist) {
  const pts = hist?.points || [];
  if (!pts.length) return null;
  const end = tms(pts[pts.length - 1].t);
  if (tms(pts[0].t) > end - 28 * DAY) return null;
  return pts.filter((p) => tms(p.t) >= end - 31 * DAY);
}

function Spark({ hist }) {
  const pts = lastMonth(hist);
  if (pts) return <Sparkline points={pts} />;
  const first = hist?.points?.[0];
  return (
    <span className="sb-spark-na">
      {first ? `1M trend: collecting since ${fmtShort(first.t, false)}` : "no history"}
    </span>
  );
}

function HeroFigure({ s, hist, active, onPick }) {
  return (
    <div className={`sb-fig ${active ? "is-active" : ""}`} onClick={() => onPick(s.key)}>
      <div className="sb-fig-label">{s.label}</div>
      <div className="sb-fig-value">{macroValue(s)}</div>
      <div className="sb-fig-row">
        <ChangeBadge s={s} />
        <Spark hist={hist} />
      </div>
      <div className="sb-fig-foot">
        <span>As of {asOfText(s)}</span>
        <SourceLink source={s.source} />
      </div>
    </div>
  );
}

function SubFigure({ s, hist, active, onPick }) {
  return (
    <div className={`sb-sub ${active ? "is-active" : ""}`} onClick={() => onPick(s.key)}>
      <div className="sb-sub-label">{s.label}</div>
      <div className="sb-sub-value">
        {macroValue(s)}<span className="sb-sub-unit">{s.unit}</span>
      </div>
      <ChangeBadge s={s} />
      <Spark hist={hist} />
      {s.proxy && <div className="sb-sub-note">ETF price, a proxy, not the commodity itself</div>}
      <div className="sb-sub-foot">
        <span>As of {asOfText(s)}</span>
        <SourceLink source={s.source} />
      </div>
    </div>
  );
}

function MacroBand({ snaps }) {
  const time = useClock();
  const [pick, setPick] = React.useState("us10y");
  const series = snaps.macro?.data?.series || [];
  const byKey = Object.fromEntries(series.map((s) => [s.key, s]));
  const hist = (k) => snaps.history[`macro-${k}`];
  const collected = ["macro", "sectors", "compute"].map((s) => snaps[s] && `${s} ${fmtAsOf(snaps[s].collectedAt)}`).filter(Boolean);
  const onPick = (k) => setPick(k);
  const subs = series.filter((s) => !HERO_KEYS.includes(s.key));

  return (
    <section className="sb-band" id="macro" data-screen-label="01 Macro">
      <div className="sb-band-head">
        <div className="sb-band-title">
          <h1 className="serif italic">Side Bets terminal</h1>
          <p className="sb-disclaimer">Educational data, not investment advice.</p>
        </div>
        <div className="sb-band-meta">
          <span>TORONTO, ON · {time} ET</span>
          <span>Snapshot data — refreshed by hand, not streaming</span>
        </div>
      </div>

      <div className="sb-figs">
        {HERO_KEYS.map((k) => byKey[k] && (
          <HeroFigure key={k} s={byKey[k]} hist={hist(k)} active={pick === k} onPick={onPick} />
        ))}
      </div>

      <div className="sb-subs">
        {MACRO_GROUPS.filter((g) => g.key !== "backdrop").map((g) => (
          <div className="sb-subs-group" key={g.key}>
            <div className="sb-group-label">{g.label}</div>
            <div className="sb-subs-row">
              {subs.filter((s) => s.group === g.key).map((s) => (
                <SubFigure key={s.key} s={s} hist={hist(s.key)} active={pick === s.key} onPick={onPick} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <MacroChart series={series} history={snaps.history} pick={pick} setPick={setPick} />

      <div className="sb-band-foot">
        {collected.length > 0 && <span>Collected: {collected.join(" · ")}</span>}
        <span>Daily series show the latest published observation; spot series show the time they were read.</span>
      </div>
      <NotShown items={snaps.macro?.data?.blocked} />
    </section>
  );
}

// ── Macro chart: series selector + range buttons ──

const RANGES = [
  { key: "1D", label: "1D" },
  { key: "5D", label: "5D" },
  { key: "1M", label: "1M", months: 1 },
  { key: "3M", label: "3M", months: 3 },
  { key: "6M", label: "6M", months: 6 },
  { key: "1Y", label: "1Y", months: 12 },
];

const monthsBack = (ms, n) => { const d = new Date(ms); d.setUTCMonth(d.getUTCMonth() - n); return d.getTime(); };

// The points for one range, or the reason there are none. Everything comes
// from stored data: the history file, or the snapshot's intraday block for 1D.
function rangeView(s, h, range) {
  const pts = h?.points || [];
  const daily = pts.length > 0 && isDateOnly(pts[pts.length - 1].t);
  const end = pts.length ? tms(pts[pts.length - 1].t) : null;
  const noBackfill = h && !h.backfill?.available;
  const firstLabel = pts.length ? fmtAsOf(isDateOnly(pts[0].t) ? pts[0].t : torontoDay(tms(pts[0].t))) : "";
  const gapNote = noBackfill ? `History from ${firstLabel} — no free backfill source found` : null;

  if (range.key === "1D") {
    if (s.intraday?.points?.length > 1) {
      return { points: s.intraday.points, timeAxis: true, source: s.intraday.source, note: s.intraday.label };
    }
    if (!daily && pts.length) {
      const sub = pts.filter((p) => tms(p.t) >= end - DAY);
      if (sub.length > 1) return { points: sub, timeAxis: true, note: "collected readings in the last 24 hours", gapNote };
      return { na: `Only one reading in the last 24 hours. ${gapNote || ""}` };
    }
    const why = s.intradayBlocked
      || (s.source?.name?.startsWith("FRED")
        ? "FRED publishes one observation per day, so there is no intraday series."
        : "No intraday data for this series.");
    return { na: `1D needs intraday data. ${why} The latest daily change is shown above the chart.` };
  }
  if (!pts.length) return { na: "No history stored for this series." };
  let sub, domain;
  if (range.key === "5D") {
    if (daily) {
      sub = pts.slice(-6);
      domain = null;
    } else {
      domain = [end - 5 * DAY, end];
      sub = pts.filter((p) => tms(p.t) >= domain[0]);
    }
  } else {
    domain = [monthsBack(end, range.months), end];
    sub = pts.filter((p) => tms(p.t) >= domain[0]);
  }
  if (sub.length < 2) return { na: `Not enough stored points for ${range.label}. ${gapNote || ""}`.trim() };
  const covered = !domain || tms(pts[0].t) <= domain[0] + 2 * DAY;
  return {
    points: sub, domain,
    note: range.key === "5D" && daily ? "last 5 observations and the one before" : null,
    gapNote: covered ? null : gapNote || `History starts ${firstLabel}`,
  };
}

function MacroChart({ series, history, pick, setPick }) {
  const [rangeKey, setRangeKey] = React.useState("1M");
  const s = series.find((x) => x.key === pick) || series[0];
  if (!s) return null;
  const h = history[`macro-${s.key}`];
  const range = RANGES.find((r) => r.key === rangeKey);
  const view = rangeView(s, h, range);
  const avail = Object.fromEntries(RANGES.map((r) => [r.key, !rangeView(s, h, r).na]));

  const fmtY = (v, exact) => (s.unit === "%" ? `${fmtNum(v, 2)}%` : s.key === "btc" || s.key === "gold"
    ? usd(v, 0) : usd(v, exact ? 2 : v >= 100 ? 0 : 2));
  const tip = (p) => ({
    main: macroValue(s, p.value),
    sub: view.timeAxis ? fmtAsOf(p.t) : isDateOnly(p.t) ? fmtAsOf(p.t, s.key === "btc" ? " (00:00 UTC)" : "") : fmtAsOf(p.t),
  });
  const pts = view.points;
  const chg = pts && windowChange(s, pts[0].value, pts[pts.length - 1].value);
  const hiP = pts && pts.reduce((a, p) => (p.value > a.value ? p : a));
  const loP = pts && pts.reduce((a, p) => (p.value < a.value ? p : a));
  const src = view.source || h?.source || s.source;

  return (
    <figure className="sb-chart sb-chart--macro">
      <div className="sb-controls">
        <div className="sb-seg" role="group" aria-label="Series">
          {series.map((x) => (
            <button key={x.key} className={`sb-chip ${x.key === s.key ? "is-on" : ""}`} aria-pressed={x.key === s.key}
                    onClick={() => setPick(x.key)}>
              {x.label.replace(/ \(.*\)$/, "").replace("US 10Y Treasury yield", "US 10Y")}
            </button>
          ))}
        </div>
        <div className="sb-seg sb-seg--range" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.key} aria-pressed={r.key === rangeKey}
                    className={`sb-range ${r.key === rangeKey ? "is-on" : ""} ${avail[r.key] ? "" : "is-na"}`}
                    title={avail[r.key] ? "" : "No stored data for this range — click for why"}
                    onClick={() => setRangeKey(r.key)}>{r.label}</button>
          ))}
        </div>
      </div>

      <figcaption className="sb-chart-cap">
        <span className="sb-chart-title">{s.label} · {range.label}{view.note ? ` · ${view.note}` : ""}</span>
        {chg && (
          <span className="sb-chart-stats">
            <span className={`sb-chg sb-chg--${dir(chg.v)}`}><span aria-hidden="true">{arrowFor(chg.v)}</span> {chg.text}</span>
            <span className="sb-faint"> over the window, from {fmtShort(pts[0].t)}</span>
            <span className="sb-stat">High {fmtY(hiP.value, true)} <span className="sb-faint">{fmtShort(hiP.t)}</span></span>
            <span className="sb-stat">Low {fmtY(loP.value, true)} <span className="sb-faint">{fmtShort(loP.t)}</span></span>
          </span>
        )}
      </figcaption>

      {view.na ? (
        <div className="sb-chart-na" role="status">
          <span className="sb-chart-na-tag">{range.label} unavailable</span>
          <span>{view.na}</span>
        </div>
      ) : (
        <LineChart key={`${s.key}-${rangeKey}`} points={pts} domain={view.domain} fmtY={fmtY} tip={tip}
                   timeAxis={view.timeAxis} gapLabel={view.gapNote && "no stored data"} height={300}
                   label={`${s.label}, ${range.label} range, ${pts.length} points`} />
      )}

      <div className="sb-chart-foot">
        <span>
          {view.gapNote && <strong className="sb-gapnote">{view.gapNote}. </strong>}
          {pts ? `${pts.length} points` : ""}{pts ? " · " : ""}Source: <SourceLink source={src} />
          {h && <> · <a className="sb-src" href={DATA_DIR + h.file} target="_blank" rel="noopener noreferrer">history file v{h.version}</a></>}
        </span>
        {h?.backfill && <span className="sb-faint">{h.backfill.note}</span>}
      </div>

      {pts && (
        <details className="sb-chart-table">
          <summary>Table view</summary>
          <table className="sb-table sb-table--mini">
            <thead><tr><th>{view.timeAxis ? "Time" : "Date"}</th><th className="sb-num">{s.label}</th></tr></thead>
            <tbody>
              {[...pts].reverse().map((p) => (
                <tr key={p.t}><td>{fmtAsOf(p.t)}</td><td className="sb-num">{macroValue(s, p.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
}

// ═══ (02) Sector breakdown ═══

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y"];

// Heat shade: intensity scales with the move's size relative to the largest
// move in the same column (1D and 1Y moves live on different scales).
function heat(v, maxAbs) {
  if (v == null || !maxAbs || v === 0) return undefined;
  const a = Math.round(8 + 54 * Math.min(1, Math.abs(v) / maxAbs));
  return { "--heat": `color-mix(in oklab, var(--sb-${v > 0 ? "up" : "down"}) ${a}%, transparent)` };
}

// One row per sector: the Bower composite is the headline, its Select Sector
// SPDR fund rides along as the single-fund reference (weight, holdings, close).
function sectorRows(data) {
  const fund = (t) => data.funds.find((f) => f.etf === t);
  return (data.composites || []).map((c) => {
    const ref = fund(c.spdr);
    return { ...c, etf: c.spdr, ref, weightInSP500: ref?.weightInSP500, topHoldings: ref?.topHoldings };
  });
}

const constituentList = (c) => c.constituents.map((x) => `${x.ticker} (${x.brand})`).join(", ");

function Sectors({ snap }) {
  const [sort, setSort] = React.useState({ key: "1D", dir: -1 });
  const [focus, setFocus] = React.useState("1D");
  const [open, setOpen] = React.useState(() => new Set());
  const data = snap?.data;
  if (!data?.composites) return null;
  const spy = data.funds.find((f) => f.etf === "SPY");
  const sectors = sectorRows(data);
  const val = (f, k) => (k === "weight" ? f.weightInSP500?.value : k === "name" ? f.sector : f.returns[k]?.value);
  const sorted = [...sectors].sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key);
    if (typeof x === "string") return sort.dir * x.localeCompare(y);
    return sort.dir * ((x ?? -Infinity) - (y ?? -Infinity));
  });
  const onSort = (key) => {
    if (PERIODS.includes(key)) setFocus(key);
    setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === "name" ? 1 : -1 }));
  };
  const arrow = (key) => (sort.key === key ? (sort.dir < 0 ? " ↓" : " ↑") : "");
  const ariaSort = (key) => (sort.key === key ? (sort.dir < 0 ? "descending" : "ascending") : undefined);

  const maxAbs = Object.fromEntries(PERIODS.map((p) => [p, Math.max(...[spy, ...sectors].map((f) => Math.abs(f.returns[p]?.value ?? 0)))]));
  const maxW = Math.max(...sectors.map((f) => f.weightInSP500?.value ?? 0));
  const ranked = [...sectors].filter((f) => f.returns[focus]).sort((a, b) => b.returns[focus].value - a.returns[focus].value);
  const best = ranked[0], worst = ranked[ranked.length - 1];
  const above = ranked.filter((f) => f.returns[focus].value > (spy.returns[focus]?.value ?? 0)).length;

  const closeAsOf = sectors[0].asOf;
  const ref = sectors[0].returns;
  const w = sectors[0].weightInSP500;
  const h = sectors.find((f) => f.topHoldings)?.topHoldings;
  const nFunds = sectors.reduce((n, c) => n + c.constituents.length, 0);
  const singles = sectors.filter((c) => c.single);
  const fundTitle = (f, p) =>
    f.returns[p] ? `${f.etf} ${p}: close ${fmtAsOf(f.close.asOf)} $${f.close.value} vs ${fmtAsOf(f.returns[p].from)} $${f.returns[p].fromClose} · ${f.close.source.name}` : "";
  const compTitle = (c, p) => {
    const r = c.returns[p];
    if (!r) return "";
    const parts = c.constituents.map((x) => `${x.ticker} ${fmtSigned(r.constituents[x.ticker].value, 2)}`).join(", ");
    return `${c.name} ${p}: equal-weight mean of ${parts} · closes ${fmtAsOf(r.from)} → ${fmtAsOf(c.asOf)} · ${c.source.name}`;
  };
  const toggle = (key) => setOpen((o) => { const n = new Set(o); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const COLS = PERIODS.length + 4;

  const weightCell = (f) => (
    <td className="sb-num sb-quiet sb-td-weight" title={f.weightInSP500 ? `As of ${fmtAsOf(f.weightInSP500.asOf)} · ${f.weightInSP500.source.name}` : ""}>
      {f.weightInSP500 ? (
        <>
          <span className="sb-wbar" style={{ width: `${(f.weightInSP500.value / maxW) * 100}%` }} aria-hidden="true" />
          <span>{fmtNum(f.weightInSP500.value, 1)}%</span>
        </>
      ) : <span className="sb-faint">—</span>}
    </td>
  );
  const holdingsCell = (f) => (
    <td className="sb-td-hold sb-quiet" title={f.topHoldings ? `${f.etf} · as of ${fmtAsOf(f.topHoldings.asOf)} · ${f.topHoldings.source.name}` : ""}>
      {f.topHoldings ? f.topHoldings.items.map((x) => (
        <span key={x.ticker} className="sb-hold"><span>{x.ticker}</span> <span className="sb-faint">{fmtNum(x.weight, 1)}%</span></span>
      )) : <span className="sb-faint">—</span>}
    </td>
  );
  const periodCells = (f, title) => PERIODS.map((p) => {
    const v = f.returns[p]?.value;
    return (
      <td key={p} className={`sb-num sb-heat ${p === focus ? "is-focus" : ""}`} style={heat(v, maxAbs[p])} title={title(f, p)}>
        {fmtSigned(v, p === focus ? 2 : 1)}
      </td>
    );
  });

  const refRow = (
    <tr className="sb-ref-row">
      <td className="sb-td-name">
        <span className="sb-sector">S&amp;P 500 (reference)</span>
        <span className="sb-td-etf">SPY · single fund</span>
      </td>
      {periodCells(spy, fundTitle)}
      <td className="sb-num sb-quiet" title={fundTitle(spy, focus)}>
        <span className="sb-td-etf">SPY</span> {fmtSigned(spy.returns[focus]?.value, 2)}
      </td>
      {weightCell(spy)}
      {holdingsCell(spy)}
    </tr>
  );

  const compRow = (c) => {
    const isOpen = open.has(c.key);
    const rv = c.ref?.returns[focus]?.value;
    return (
      <React.Fragment key={c.key}>
        <tr className={isOpen ? "is-open" : ""}>
          <td className="sb-td-name sb-td-comp">
            <button className="sb-expand" aria-expanded={isOpen} aria-controls={`sb-comp-${c.key}`} onClick={() => toggle(c.key)}
                    title={`${c.name} — equal-weighted composite of ${constituentList(c)}`}>
              <span className="sb-expand-mark" aria-hidden="true">{isOpen ? "−" : "+"}</span>
              <span className="sb-sector">{c.name}</span>
            </button>
            <span className="sb-comp-funds">
              {c.single ? <>{c.constituents[0].ticker} <span className="sb-faint">{c.constituents[0].brand} · single qualifying fund</span></>
                : c.constituents.map((x) => <span key={x.ticker} className="sb-comp-fund">{x.ticker} <span className="sb-faint">{x.brand}</span></span>)}
            </span>
          </td>
          {periodCells(c, compTitle)}
          <td className="sb-num sb-quiet" title={c.ref ? fundTitle(c.ref, focus) : ""}>
            <span className="sb-td-etf">{c.spdr}</span> {fmtSigned(rv, 2)}
          </td>
          {weightCell(c)}
          {holdingsCell(c)}
        </tr>
        {isOpen && (
          <tr className="sb-comp-detail" id={`sb-comp-${c.key}`}>
            <td colSpan={COLS}>
              <table className="sb-table sb-table--mini sb-table--comp">
                <caption className="sb-faint">
                  {c.name}: {c.single ? "one qualifying fund, shown as is" : `equal-weighted mean of ${c.constituents.length} funds' price returns`}.
                  Closes from {c.source.name.replace(", computed by this collector", "")}, latest {fmtAsOf(c.asOf)}.
                </caption>
                <thead>
                  <tr>
                    <th>Fund</th><th>Provider · index tracked</th><th className="sb-num">Weight</th>
                    {PERIODS.map((p) => <th key={p} className="sb-num">{p}</th>)}
                    <th className="sb-num">Close</th>
                  </tr>
                </thead>
                <tbody>
                  {c.constituents.map((x) => (
                    <tr key={x.ticker}>
                      <td className="sb-mono">{x.ticker}{x.ticker === c.spdr && <span className="sb-faint"> · reference</span>}</td>
                      <td>{x.provider} <span className="sb-faint">· {x.index}</span></td>
                      <td className="sb-num">{fmtNum(x.weight * 100, 2)}%</td>
                      {PERIODS.map((p) => {
                        const r = c.returns[p]?.constituents[x.ticker];
                        return <td key={p} className="sb-num" title={r ? `${fmtAsOf(c.returns[p].from)} $${r.fromClose} → ${fmtAsOf(c.asOf)} $${r.close}` : ""}>{fmtSigned(r?.value, 2)}</td>;
                      })}
                      <td className="sb-num">{usd(c.returns["1D"]?.constituents[x.ticker].close)}</td>
                    </tr>
                  ))}
                  <tr className="sb-comp-total">
                    <td colSpan={3}>{c.name}</td>
                    {PERIODS.map((p) => <td key={p} className="sb-num">{fmtSigned(c.returns[p]?.value, 2)}</td>)}
                    <td className="sb-num sb-faint">—</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <section className="sb-section" id="sectors" data-screen-label="02 Sectors">
      <Hairline n="(02)" label="SECTORS" />
      <div className="sb-sec-head">
        <p className="sb-lede">
          The 11 GICS sectors. Each headline is a Bower Digital composite index — the equal-weighted
          average of {nFunds} plain sector funds from the major providers — with the Select Sector
          SPDR fund alongside for reference. Alphabet and Meta sit in Communication Services, not Technology.
        </p>
        {best && (
          <div className="sb-sec-summary">
            <div className="sb-seg sb-seg--range" role="group" aria-label="Headline period">
              {PERIODS.map((p) => (
                <button key={p} aria-pressed={p === focus} className={`sb-range ${p === focus ? "is-on" : ""}`}
                        onClick={() => onSort(p)}>{p}</button>
              ))}
            </div>
            <dl className="sb-sec-stats">
              <div><dt>Top {focus}</dt><dd><strong>{best.sector}</strong> <span className={`sb-chg sb-chg--${dir(best.returns[focus].value)}`}>{fmtSigned(best.returns[focus].value, 2)}</span></dd></div>
              <div><dt>Bottom {focus}</dt><dd><strong>{worst.sector}</strong> <span className={`sb-chg sb-chg--${dir(worst.returns[focus].value)}`}>{fmtSigned(worst.returns[focus].value, 2)}</span></dd></div>
              <div><dt>S&amp;P 500 {focus}</dt><dd><strong>SPY</strong> <span className={`sb-chg sb-chg--${dir(spy.returns[focus]?.value)}`}>{fmtSigned(spy.returns[focus]?.value, 2)}</span> <span className="sb-faint">· {above} of 11 sectors above it</span></dd></div>
            </dl>
          </div>
        )}
      </div>
      <div className="sb-table-wrap sb-frost">
        <table className="sb-table sb-table--sectors">
          <thead>
            <tr>
              <th aria-sort={ariaSort("name")}><button className="sb-sort" onClick={() => onSort("name")}>Composite index · constituents{arrow("name")}</button></th>
              {PERIODS.map((p) => (
                <th key={p} className={`sb-num ${p === focus ? "is-focus" : ""}`} aria-sort={ariaSort(p)}>
                  <button className="sb-sort" onClick={() => onSort(p)}>{p}{arrow(p)}</button>
                </th>
              ))}
              <th className="sb-num sb-quiet">SPDR fund {focus}</th>
              <th className="sb-num sb-quiet" aria-sort={ariaSort("weight")}><button className="sb-sort" onClick={() => onSort("weight")}>S&amp;P 500 wt{arrow("weight")}</button></th>
              <th className="sb-quiet">Top 3 holdings (SPDR fund weight)</th>
            </tr>
          </thead>
          <tbody>
            {refRow}
            {sorted.map(compRow)}
          </tbody>
        </table>
      </div>
      <p className="sb-legend">
        <span className="sb-legend-ramp" aria-hidden="true"><i className="d3" /><i className="d2" /><i className="d1" /><i className="n" /><i className="u1" /><i className="u2" /><i className="u3" /></span>
        Shade scales with the size of the move, relative to the largest move in the same column. Green is a rise,
        red a fall; the signed figure is always printed. Click a period to make it the headline column and sort by it;
        open a row to see each constituent's own return.
      </p>
      <p className="sb-method">{data.method}</p>
      <dl className="sb-prov">
        <div>
          <dt>Composite method</dt>
          <dd>
            Equal weight: each sector's included funds count the same ({singles.length ? `${singles.length} sector${singles.length > 1 ? "s have" : " has"} one qualifying fund, shown as is` : "every sector has two or more funds"}).
            For each period, every fund's return runs between the same two closes and the composite is their plain
            average — equal weight at the start of the period, no rebalancing. Recomputed from the latest closes
            each collection. A Bower Digital construction: not affiliated with, endorsed by, or tracking any
            provider's index. The constituent funds track different underlying indexes (S&amp;P 500 members only
            for SPDR; all-cap MSCI US IMI for Vanguard and Fidelity) under the same GICS sector definition; see the
            fund list for each one's index. Funds on a different sector definition (iShares' US sector funds, on FTSE Russell or Dow Jones sectors;
            REIT-only funds) and equal-weight funds are left out rather than blended; the fund list gives each reason.
          </dd>
        </div>
        <div>
          <dt>Fund list</dt>
          <dd>
            <a className="sb-src" href={DATA_DIR + sectors[0].universe.file} target="_blank" rel="noopener noreferrer">{sectors[0].universe.file}</a>{" "}
            v{sectors[0].universe.version}, researched {fmtAsOf(sectors[0].universe.asOf)}: every fund considered per
            sector, with provider, index, expense ratio, assets (each dated and sourced) and the reason for every exclusion.
          </dd>
        </div>
        <div>
          <dt>Closes &amp; returns</dt>
          <dd>
            Closes of {fmtAsOf(closeAsOf)} · <SourceLink source={spy.close.source} />. Price return for every
            fund, composite and SPDR reference alike — distributions not included. Compared with closes of 1D {fmtAsOf(ref["1D"]?.from)}, 1W {fmtAsOf(ref["1W"]?.from)},
            1M {fmtAsOf(ref["1M"]?.from)}, 3M {fmtAsOf(ref["3M"]?.from)}, YTD {fmtAsOf(ref.YTD?.from)},
            1Y {fmtAsOf(ref["1Y"]?.from)}.
          </dd>
        </div>
        <div>
          <dt>S&amp;P 500 weight</dt>
          <dd>As of {fmtAsOf(w.asOf)} · <SourceLink source={w.source}>State Street — SPY fund page, index sector breakdown</SourceLink></dd>
        </div>
        {h && (
          <div>
            <dt>Top holdings</dt>
            <dd>As of {fmtAsOf(h.asOf)} · <SourceLink source={h.source}>State Street daily holdings file</SourceLink> for each SPDR reference fund, line items as reported (Alphabet's two share classes are listed separately).</dd>
          </div>
        )}
      </dl>
      {data.classificationCheck && <p className="sb-check">Classification check: {data.classificationCheck.value ?? data.classificationCheck}</p>}
      <NotShown items={data.blocked} label="Sources tried, not used" />
    </section>
  );
}

// ═══ (03) Compute pricing ═══

const LIST_PROVIDERS = [
  { key: "AWS", tier: "hyperscaler" },
  { key: "Azure", tier: "hyperscaler" },
  { key: "Oracle", tier: "hyperscaler" },
  { key: "CoreWeave", tier: "gpu-cloud" },
  { key: "Nebius", tier: "gpu-cloud" },
  { key: "Hyperstack", tier: "gpu-cloud" },
];

function PriceCell({ cell, size = "md", extra }) {
  if (!cell) return <div className="sb-price sb-price--empty"><span className="sb-faint">not listed</span></div>;
  return (
    <div className={`sb-price sb-price--${size}`}>
      <div className="sb-price-value">{usd(cell.value)}<span className="sb-price-unit">/GPU-hr</span></div>
      <div className="sb-price-type">{cell.type}{extra ? ` · ${extra}` : ""}</div>
      <div className="sb-price-foot">
        <span>As of {fmtAsOf(cell.asOf)}</span>
        <SourceLink source={cell.source} />
      </div>
    </div>
  );
}

function ListRows({ g, tier }) {
  return (
    <ul className="sb-list">
      {LIST_PROVIDERS.filter((p) => p.tier === tier).map((p) => {
        const c = g.list.find((x) => x.provider === p.key);
        return (
          <li key={p.key} title={c ? `${c.sku} · ${c.note}` : ""}>
            <span className="sb-list-name">
              {c ? <SourceLink source={c.source}>{p.key}</SourceLink> : p.key}
            </span>
            <span className="sb-list-asof">{c ? fmtAsOf(c.asOf).replace(/, \d{4}.*$/, "") : ""}</span>
            <span className="sb-num">{c ? usd(c.value) : <span className="sb-faint">not listed</span>}</span>
          </li>
        );
      })}
    </ul>
  );
}

function H200Card({ g }) {
  const m = g.marketplace || {};
  return (
    <div className="sb-card sb-frost">
      <div className="sb-card-head">
        <span className="sb-card-title serif italic">{g.label}</span>
        <span className="sb-faint">USD per GPU-hour · four separate measures, never averaged together</span>
      </div>
      <div className="sb-card-grid">
        <div className="sb-col sb-col--hero">
          <div className="sb-col-label">Marketplace median · Vast.ai</div>
          <PriceCell cell={m.median} size="hero" extra={m.median && `${m.median.offers} offers`} />
          {m.median && <p className="sb-col-note">{m.median.note}</p>}
        </div>
        <div className="sb-col sb-col--quiet">
          <div className="sb-col-label">Marketplace spot-low</div>
          <PriceCell cell={m.spotLow} extra={m.spotLow && `${m.spotLow.offers} offers`} />
          {m.spotLow && <p className="sb-col-note">{m.spotLow.note}</p>}
        </div>
        <div className="sb-col sb-col--quiet">
          <div className="sb-col-label">RunPod list</div>
          <PriceCell cell={g.runpod?.community} />
          <PriceCell cell={g.runpod?.secure} size="sm" />
        </div>
        <div className="sb-col sb-col--quiet">
          <div className="sb-col-label">Hyperscaler list</div>
          <ListRows g={g} tier="hyperscaler" />
          <div className="sb-col-label sb-col-label--sub">GPU cloud list</div>
          <ListRows g={g} tier="gpu-cloud" />
          <p className="sb-col-note">List price, on-demand, per GPU. Instances sold as 8 GPUs are divided by 8. Hover a row for the SKU.</p>
        </div>
      </div>
    </div>
  );
}

// "Significant move" = more than 5% away from the current price.
const LEVEL_BAND = 0.05;

// Walk back from the latest reading while readings stay within ±5% of it.
// Returns the earliest reading of that unbroken run, and whether the run
// reaches back to the first reading ever collected.
function timeAtLevel(points) {
  const cur = points[points.length - 1];
  let i = points.length - 1;
  while (i > 0 && Math.abs(points[i - 1].value / cur.value - 1) <= LEVEL_BAND) i--;
  return { since: points[i], toStart: i === 0, ms: tms(cur.t) - tms(points[i].t), lastMove: i > 0 ? points[i - 1] : null };
}

function RangeGauge({ lo, hi, cur }) {
  const flat = hi.value === lo.value;
  const pos = flat ? 50 : ((cur.value - lo.value) / (hi.value - lo.value)) * 100;
  return (
    <div className="sb-gauge">
      <div className="sb-gauge-head">
        <span className="sb-col-label">Current vs 30-day range</span>
        <span className="sb-gauge-pos">{flat ? "no range yet" : `${Math.round(pos)}% of range`}</span>
      </div>
      <div className={`sb-gauge-track ${flat ? "is-flat" : ""}`} role="img"
           aria-label={flat ? `Every reading so far is ${usd(cur.value)}` : `Current ${usd(cur.value)} sits at ${Math.round(pos)}% between the low ${usd(lo.value)} and the high ${usd(hi.value)}`}>
        <span className="sb-gauge-fill" style={{ width: `${pos}%` }} />
        <span className="sb-gauge-mark" style={{ left: `${pos}%` }} />
      </div>
      <div className="sb-gauge-ends">
        <span>Low {usd(lo.value)}<br /><span className="sb-faint">{fmtShort(lo.t)}</span></span>
        <span className="sb-gauge-cur">Now {usd(cur.value)}</span>
        <span>High {usd(hi.value)}<br /><span className="sb-faint">{fmtShort(hi.t)}</span></span>
      </div>
      {flat && <p className="sb-col-note">The low and high are equal: every reading collected so far is {usd(cur.value)}. The gauge fills in once the price moves.</p>}
    </div>
  );
}

function GpuPanel({ g, h, compact = false }) {
  const [win, setWin] = React.useState("30d");
  const all = h?.points || [];
  if (!all.length) {
    return (
      <div className="sb-gpu sb-frost">
        <div className="sb-gpu-head"><span className="sb-gpu-name">{g.label}</span></div>
        <p className="sb-col-note">No collected readings yet.</p>
      </div>
    );
  }
  const end = tms(all[all.length - 1].t);
  const endDay = torontoDay(end);
  const startMs = new Date(endDay + "T00:00:00Z").getTime() - 29 * DAY;
  const pts = all.filter((p) => tms(p.t) >= startMs);
  const days = new Set(pts.map((p) => torontoDay(tms(p.t)))).size;
  const cur = pts[pts.length - 1];
  const hi = pts.reduce((a, p) => (p.value > a.value ? p : a));
  const lo = pts.reduce((a, p) => (p.value < a.value ? p : a));
  const lvl = timeAtLevel(pts);
  const first = all[0];
  const tip = (p) => ({ main: `${usd(p.value)}/GPU-hr`, sub: `${fmtAsOf(p.t)} · ${p.offers} offers` });
  const zoomed = win === "readings";

  return (
    <div className={`sb-gpu sb-frost ${compact ? "sb-gpu--compact" : ""}`}>
      <div className="sb-gpu-head">
        <span className="sb-gpu-name">{g.label}</span>
        <span className="sb-faint">{days} of 30 days collected · {pts.length} readings · no backfill</span>
      </div>
      <div className="sb-gpu-now">
        <span className="sb-gpu-value">{usd(cur.value)}</span>
        <span className="sb-price-unit">/GPU-hr median · {cur.offers} offers · {fmtAsOf(cur.t)}</span>
      </div>
      <div className="sb-seg sb-seg--range sb-gpu-win" role="group" aria-label="Chart window">
        <button className={`sb-range ${!zoomed ? "is-on" : ""}`} aria-pressed={!zoomed} onClick={() => setWin("30d")}>30-day window</button>
        <button className={`sb-range ${zoomed ? "is-on" : ""}`} aria-pressed={zoomed} onClick={() => setWin("readings")}>Collected readings only</button>
      </div>
      <LineChart key={win} points={pts} domain={zoomed ? null : [startMs, end]} extremes fmtY={(v) => usd(v)} tip={tip}
                 timeAxis={zoomed && end - tms(pts[0].t) < 2 * DAY}
                 height={compact ? 200 : 260} gapLabel={zoomed ? null : `collection began ${fmtShort(first.t, false)} — no backfill`}
                 label={`Vast.ai ${g.key} marketplace median, ${zoomed ? "collected readings" : "last 30 days"}, ${pts.length} readings`} />
      <div className="sb-gpu-reads">
        <RangeGauge lo={lo} hi={hi} cur={cur} />
        <div className="sb-level">
          <span className="sb-col-label">Time at level</span>
          {lvl.ms === 0 && !lvl.toStart ? (
            <>
              <span className="sb-level-value">Moved at latest reading</span>
              <span className="sb-col-note">
                The latest median, {usd(cur.value)}, is {fmtSigned((cur.value / lvl.lastMove.value - 1) * 100, 1)} from the
                reading before it ({usd(lvl.lastMove.value)}, {fmtAsOf(lvl.lastMove.t)}) — more than 5%, so the time at this level starts now.
              </span>
            </>
          ) : (
            <>
              <span className="sb-level-value">{lvl.toStart ? "≥ " : ""}{fmtDuration(lvl.ms)}</span>
              <span className="sb-col-note">
                Within ±5% of {usd(cur.value)} since {fmtAsOf(lvl.since.t)}
                {lvl.toStart ? " — the first reading collected, so the true span may be longer." : `; the reading before that was ${usd(lvl.lastMove.value)} (${fmtAsOf(lvl.lastMove.t)}), more than 5% away.`}
              </span>
            </>
          )}
        </div>
      </div>
      <details className="sb-chart-table">
        <summary>Table view</summary>
        <table className="sb-table sb-table--mini">
          <thead><tr><th>Read at</th><th className="sb-num">Median $/GPU-hr</th><th className="sb-num">Offers</th><th className="sb-num">Spot-low</th></tr></thead>
          <tbody>
            {[...pts].reverse().map((p) => (
              <tr key={p.t}><td>{fmtAsOf(p.t)}</td><td className="sb-num">{usd(p.value, 4)}</td><td className="sb-num">{p.offers}</td><td className="sb-num">{usd(p.spotLow, 4)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function ComputeHistory({ gpus, history }) {
  const hist = (k) => history[`compute-vast-${k}`];
  const note = hist("H200")?.backfill?.note;
  return (
    <div className="sb-mt">
      <div className="sb-group-label">Price history · Vast.ai marketplace median, on-demand · last 30 days</div>
      <GpuPanel g={gpus.H200} h={hist("H200")} />
      <div className="sb-gpu-pair">
        {["H100", "B200"].map((k) => gpus[k] && <GpuPanel key={k} g={gpus[k]} h={hist(k)} compact />)}
      </div>
      <p className="sb-method">
        One point per collector run; nothing is backfilled{note ? ` (${note.replace(/\.$/, "")})` : ""}. The
        gauge places the latest median between the lowest and highest medians collected in the window.
        Time at level counts back from the latest reading to the earliest reading in an unbroken run within
        ±5% of it; a <strong>significant move</strong> is a reading more than 5% away from the current price.
      </p>
    </div>
  );
}

function ComputeTable({ gpus }) {
  const c = (cell, extra, cls = "") => (cell ? (
    <td className={`sb-num ${cls}`} title={`${cell.type} · as of ${fmtAsOf(cell.asOf)} · ${cell.source.name}${extra ? " · " + extra : ""}`}>{usd(cell.value)}</td>
  ) : <td className={`sb-num sb-faint ${cls}`}>—</td>);
  return (
    <div className="sb-table-wrap sb-frost">
      <table className="sb-table sb-table--compute">
        <thead>
          <tr className="sb-group-row">
            <th />
            <th colSpan={2}>Marketplace · Vast.ai</th>
            <th colSpan={2}>RunPod list</th>
            <th colSpan={3}>Hyperscaler list · on-demand</th>
            <th colSpan={3}>GPU cloud list · on-demand</th>
          </tr>
          <tr>
            <th>GPU</th>
            <th className="sb-num is-focus">Median</th>
            <th className="sb-num">Spot-low</th>
            <th className="sb-num">Community</th>
            <th className="sb-num">Secure</th>
            {LIST_PROVIDERS.map((p) => <th key={p.key} className="sb-num">{p.key}</th>)}
          </tr>
        </thead>
        <tbody>
          {Object.values(gpus).map((g) => (
            <tr key={g.key}>
              <td className="sb-td-name">{g.label}</td>
              {c(g.marketplace?.median, g.marketplace?.median && `${g.marketplace.median.offers} offers`, "sb-td-hero")}
              {c(g.marketplace?.spotLow, g.marketplace?.spotLow && `${g.marketplace.spotLow.offers} offers`, "sb-quiet")}
              {c(g.runpod?.community, null, "sb-quiet")}
              {c(g.runpod?.secure, null, "sb-quiet")}
              {LIST_PROVIDERS.map((p) => {
                const cell = g.list.find((x) => x.provider === p.key);
                return <React.Fragment key={p.key}>{c(cell, cell && `${cell.sku} — ${cell.note}`, "sb-quiet")}</React.Fragment>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One line per source: what it supplied and when it was read.
function ComputeSources({ gpus }) {
  const bySrc = new Map();
  const add = (cell) => {
    if (!cell) return;
    const k = cell.source.name;
    const e = bySrc.get(k) || { source: cell.source, asOf: new Set() };
    e.asOf.add(cell.asOf);
    bySrc.set(k, e);
  };
  for (const g of Object.values(gpus)) {
    add(g.marketplace?.median); add(g.marketplace?.spotLow);
    add(g.runpod?.community); add(g.runpod?.secure);
    g.list.forEach(add);
  }
  return (
    <dl className="sb-prov">
      {[...bySrc.values()].map((e) => (
        <div key={e.source.name}>
          <dt><SourceLink source={e.source} /></dt>
          <dd>As of {[...e.asOf].sort().map((a) => fmtAsOf(a)).join(", ")}</dd>
        </div>
      ))}
    </dl>
  );
}

function Compute({ snap, history }) {
  const data = snap?.data;
  if (!data) return null;
  return (
    <section className="sb-section" id="compute" data-screen-label="03 Compute">
      <Hairline n="(03)" label="COMPUTE PRICING" />
      <p className="sb-lede">
        What it costs to rent one data-centre GPU for an hour. Marketplace prices are live
        offers from independent hosts; list prices are what providers publish. They are
        different things and are shown side by side, not combined.
      </p>
      <H200Card g={data.gpus.H200} />
      <ComputeHistory gpus={data.gpus} history={history} />
      <div className="sb-group-label sb-mt">H200 · H100 · B200, USD per GPU-hour</div>
      <ComputeTable gpus={data.gpus} />
      <p className="sb-method">
        Marketplace median and spot-low are Vast.ai single-GPU offers from verified hosts; the median
        is the on-demand base rate (storage and bandwidth excluded), the spot-low is the lowest
        interruptible bid. Small offer counts make the marketplace figures move. Hover any cell for
        its SKU, offer count and as-of time.
      </p>
      <ComputeSources gpus={data.gpus} />
      <NotShown items={data.blocked} />
    </section>
  );
}

// ═══ (04) Sources & open items ═══

function Sources({ snaps }) {
  const files = ["macro", "sectors", "compute"].map((s) => snaps[s]?.file).filter(Boolean);
  const hist = Object.values(snaps.history || {}).sort((a, b) => a.file.localeCompare(b.file));
  // Composite series carry every constituent close per day; linked, not loaded.
  const comp = Object.values(snaps.index?.sectorHistory || {}).sort();
  return (
    <section className="sb-section" id="sources" data-screen-label="04 Sources">
      <Hairline n="(04)" label="METHOD & SOURCES" />
      <div className="sb-sources">
        <div>
          <div className="sb-group-label">Method</div>
          <ul className="sb-plain">
            <li>Describes the market as published. No forecasts, signals, or verdicts.</li>
            <li>Every figure carries its value, its as-of time, and its source. A source that can't be read is listed as not shown — never estimated.</li>
            <li>Snapshots are append-only: each collection writes a new dated file, and old files are never edited.</li>
            <li>History files are append-only too: points are only ever added. Backfill comes only from a source's own published history; a series without one starts at the collector's first reading, and charts mark the missing stretch instead of filling it.</li>
            <li>No API keys are used. Series that need one are left out until they can be read openly.</li>
          </ul>
        </div>
        <div>
          <div className="sb-group-label">Raw snapshots</div>
          <ul className="sb-plain">
            {files.map((f) => (
              <li key={f}><a className="sb-src" href={DATA_DIR + f} target="_blank" rel="noopener noreferrer">{f}</a></li>
            ))}
          </ul>
          <div className="sb-group-label sb-mt-s">History files</div>
          <ul className="sb-plain">
            {hist.map((h) => (
              <li key={h.file}>
                <a className="sb-src" href={DATA_DIR + h.file} target="_blank" rel="noopener noreferrer">{h.file.replace("history/", "")}</a>
                <span className="sb-faint"> v{h.version} · {h.points.length} pts{h.backfill?.available ? "" : " · no backfill"}</span>
              </li>
            ))}
          </ul>
          {comp.length > 0 && (
            <>
              <div className="sb-group-label sb-mt-s">Composite index series</div>
              <ul className="sb-plain">
                {comp.map((f) => (
                  <li key={f}><a className="sb-src" href={DATA_DIR + f} target="_blank" rel="noopener noreferrer">{f.replace("history/", "")}</a></li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <span>© 2026 Bower Digital</span>
      <span className="foot-mid">Side Bets terminal · Educational data, not investment advice</span>
      <span>Phase 3 — Nov ’26</span>
    </footer>
  );
}

// ── App ──

function App() {
  const defaults = /*EDITMODE-BEGIN*/{
    "pattern": "candles",
    "density": 28,
    "intensity": 1.2,
    "invert": false,
    "accent": true,
    "displayFont": "Instrument Serif"
  }/*EDITMODE-END*/;

  const [tweaks, setTweak] = useTweaks(defaults);
  const snaps = useSnapshots();

  React.useEffect(() => {
    document.documentElement.style.setProperty("--display-font", `"${tweaks.displayFont}", serif`);
    document.body.classList.toggle("invert", !!tweaks.invert);
  }, [tweaks.displayFont, tweaks.invert]);

  return (
    <>
      <PatternBG
        mode={tweaks.pattern}
        density={tweaks.density}
        intensity={tweaks.intensity}
        invert={tweaks.invert}
        accent={tweaks.accent}
      />

      <header className="top-nav">
        <a className="brand" href="/">
          <span className="brand-mark">●</span>
          <span className="brand-name">Bower / Digital — Side Bets</span>
        </a>
        <nav className="nav-links">
          <a href="/">← Main studio</a>
          <a className="sb-nav-anchor" href="#macro">Macro</a>
          <a className="sb-nav-anchor" href="#sectors">Sectors</a>
          <a className="sb-nav-anchor" href="#compute">Compute</a>
          <button className="theme-toggle" onClick={() => setTweak("invert", !tweaks.invert)} aria-label="Toggle theme">
            {tweaks.invert ? "DARK" : "LIGHT"}
          </button>
          <span className="nav-status"><span className="dot" /> snapshot data</span>
        </nav>
      </header>

      <main id="top" className="page">
        {snaps.status === "loading" && (
          <section className="sb-band">
            <div className="sb-band-head"><div className="sb-band-title"><h1 className="serif italic">Side Bets terminal</h1><p className="sb-disclaimer">Educational data, not investment advice.</p></div></div>
            <p className="sb-status">Loading snapshots…</p>
          </section>
        )}
        {snaps.status === "err" && (
          <section className="sb-band">
            <div className="sb-band-head"><div className="sb-band-title"><h1 className="serif italic">Side Bets terminal</h1><p className="sb-disclaimer">Educational data, not investment advice.</p></div></div>
            <p className="sb-status">Couldn't load snapshot data — {snaps.error}</p>
          </section>
        )}
        {snaps.status === "ok" && (
          <>
            <MacroBand snaps={snaps} />
            <Sectors snap={snaps.sectors} />
            <Compute snap={snaps.compute} history={snaps.history} />
            <Sources snaps={snaps} />
          </>
        )}
        <Footer />
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Pattern">
          <TweakSelect
            label="Style"
            value={tweaks.pattern}
            onChange={(v) => setTweak("pattern", v)}
            options={[
              { value: "candles", label: "Candlesticks" },
              { value: "dots", label: "Dot grid" },
              { value: "lines", label: "Line grid" },
              { value: "ascii", label: "ASCII" },
              { value: "halftone", label: "Halftone" },
              { value: "topo", label: "Topographic" },
            ]}
          />
          <TweakSlider label="Density" min={16} max={56} step={2} value={tweaks.density} onChange={(v) => setTweak("density", v)} />
          <TweakSlider label="Hover intensity" min={0.4} max={2.4} step={0.1} value={tweaks.intensity} onChange={(v) => setTweak("intensity", v)} />
          <TweakToggle label="Red accent on hover" value={tweaks.accent} onChange={(v) => setTweak("accent", v)} />
        </TweakSection>
        <TweakSection title="Theme">
          <TweakToggle label="Light mode" value={tweaks.invert} onChange={(v) => setTweak("invert", v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
