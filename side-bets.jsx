// Bower Digital — /side-bets terminal.
// A personal research terminal: macro strip, S&P 500 sectors, GPU compute pricing.
// Renders from the latest JSON snapshots in /data/side-bets/ (written by
// scripts/side-bets-collect.cjs). Every figure shows value + as-of + source.
//
// House rules: describe, never prescribe. No forecasts, no signals, no
// verdicts. Never blend unlike numbers — marketplace median, spot-low, RunPod
// list and provider list price each live in their own labelled column.
//
// Sections: Hero · Macro · Sectors · Compute · Sources & open items · Footer

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
        const out = { index };
        for (const s of ["macro", "sectors", "compute"]) {
          const f = index.sections?.[s]?.latest;
          out[s] = f ? { file: f, ...(await getJson(f)) } : null;
        }
        setState({ status: "ok", ...out });
      })
      .catch((e) => setState({ status: "err", error: e.message }));
  }, []);
  return state;
}

// ── Formatting ──

const TZ = "America/Toronto";

function fmtAsOf(s, dateSuffix = "") {
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T12:00:00Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) + dateSuffix;
  }
  const d = new Date(s);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ }) + " ET";
}

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

function SourceLink({ source, children }) {
  if (!source) return null;
  return (
    <a className="sb-src" href={source.url} target="_blank" rel="noopener noreferrer">
      {children || source.name}
    </a>
  );
}

// ── Hero ──

function SBHero({ snaps }) {
  const time = useClock();
  const collected = snaps.status === "ok"
    ? ["macro", "sectors", "compute"].map((s) => snaps[s] && `${s} ${fmtAsOf(snaps[s].collectedAt)}`).filter(Boolean)
    : [];
  return (
    <section className="sb-hero" data-screen-label="01 Terminal">
      <div className="hero-meta-row">
        <span className="meta">BOWER DIGITAL / SIDE BETS — TERMINAL</span>
        <span className="meta">TORONTO, ON · {time} EST</span>
      </div>
      <h1 className="sb-hero-title serif italic">Side Bets terminal</h1>
      <p className="sb-disclaimer">Educational data, not investment advice.</p>
      <p className="sb-hero-sub serif italic">
        Macro, sectors, and the price of compute. Every figure sourced and dated.
      </p>
      <div className="sb-hero-meta">
        <span>Snapshot data — refreshed by hand, not streaming.</span>
        {collected.length > 0 && <span>Collected: {collected.join(" · ")}</span>}
      </div>
    </section>
  );
}

// ── (02) Macro strip ──

const MACRO_GROUPS = [
  { key: "backdrop", label: "Backdrop" },
  { key: "energy", label: "Energy" },
  { key: "supply-chain", label: "Supply chain" },
];

function macroValue(s) {
  if (s.unit === "%") return `${fmtNum(s.value, 2)}%`;
  if (s.key === "btc") return usd(s.value, 0);
  if (s.key === "gold") return usd(s.value, 2);
  return usd(s.value, 2);
}

function macroChange(c) {
  if (!c) return null;
  if (c.unit === "pp") return `${fmtSigned(c.value * 100, 0, "")} bp`;
  return fmtSigned(c.value, 2);
}

function MacroTile({ s }) {
  const chg = macroChange(s.change);
  return (
    <div className="sb-tile">
      <div className="sb-tile-label">{s.label}</div>
      <div className="sb-tile-value">
        {macroValue(s)}
        <span className="sb-tile-unit">{s.unit === "%" ? "yield" : s.unit}</span>
      </div>
      <div className="sb-tile-chg">
        {chg ? (
          <>
            <span className="sb-num">{chg}</span>
            <span className="sb-faint" title={s.change.basis}> {s.change.basis === "rolling 24h" ? "24h" : "1D"}</span>
          </>
        ) : (
          <span className="sb-faint">1D change: needs a prior-day snapshot</span>
        )}
      </div>
      {s.proxy && <div className="sb-tile-note">ETF price, a proxy, not the commodity itself</div>}
      <div className="sb-tile-foot">
        <span>As of {fmtAsOf(s.asOf, s.frequency?.includes("close") ? " close" : "")}</span>
        <SourceLink source={s.source} />
      </div>
    </div>
  );
}

function Macro({ snap }) {
  const series = snap?.data?.series || [];
  return (
    <section className="sb-section" id="macro" data-screen-label="02 Macro">
      <Hairline n="(02)" label="MACRO" />
      <p className="sb-lede">
        The backdrop, plus series tied to energy and the electrification and robotics supply
        chain. Daily series show the latest published observation; spot series show the
        time they were read.
      </p>
      {MACRO_GROUPS.map((g) => {
        const items = series.filter((s) => s.group === g.key);
        if (!items.length) return null;
        return (
          <div className="sb-macro-group" key={g.key}>
            <div className="sb-group-label">{g.label}</div>
            <div className="sb-strip">
              {items.map((s) => <MacroTile key={s.key} s={s} />)}
            </div>
          </div>
        );
      })}
      <NotShown items={snap?.data?.blocked} />
    </section>
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

// ── (03) Sector breakdown ──

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y"];

function Sectors({ snap }) {
  const [sort, setSort] = React.useState({ key: "weight", dir: -1 });
  const data = snap?.data;
  if (!data) return null;
  const spy = data.funds.find((f) => f.etf === "SPY");
  const sectors = data.funds.filter((f) => f.etf !== "SPY");
  const val = (f, k) => (k === "weight" ? f.weightInSP500?.value : k === "name" ? f.sector : f.returns[k]?.value);
  const sorted = [...sectors].sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key);
    if (typeof x === "string") return sort.dir * x.localeCompare(y);
    return sort.dir * ((x ?? -Infinity) - (y ?? -Infinity));
  });
  const onSort = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === "name" ? 1 : -1 }));
  const arrow = (key) => (sort.key === key ? (sort.dir < 0 ? " ↓" : " ↑") : "");

  const closeAsOf = spy.close.asOf;
  const ref = spy.returns;
  const w = sectors[0].weightInSP500;
  const h = sectors.find((f) => f.topHoldings)?.topHoldings;
  const cellTitle = (f, p) =>
    f.returns[p] ? `${f.etf} ${p}: close ${fmtAsOf(f.close.asOf)} $${f.close.value} vs ${fmtAsOf(f.returns[p].from)} $${f.returns[p].fromClose} · ${f.close.source.name}` : "";

  const Row = ({ f, isRef }) => (
    <tr className={isRef ? "sb-ref-row" : ""}>
      <td className="sb-td-name">
        <span className="sb-sector">{isRef ? "S&P 500 (reference)" : f.sector}</span>
      </td>
      <td className="sb-td-etf">{f.etf}</td>
      <td className="sb-num" title={`Close ${fmtAsOf(f.close.asOf)} · ${f.close.source.name}`}>{usd(f.close.value)}</td>
      {PERIODS.map((p) => (
        <td key={p} className="sb-num" title={cellTitle(f, p)}>{fmtSigned(f.returns[p]?.value, 1)}</td>
      ))}
      <td className="sb-num" title={f.weightInSP500 ? `As of ${fmtAsOf(f.weightInSP500.asOf)} · ${f.weightInSP500.source.name}` : ""}>
        {f.weightInSP500 ? `${fmtNum(f.weightInSP500.value, 2)}%` : <span className="sb-faint">—</span>}
      </td>
      <td className="sb-td-hold" title={f.topHoldings ? `As of ${fmtAsOf(f.topHoldings.asOf)} · ${f.topHoldings.source.name}` : ""}>
        {f.topHoldings ? f.topHoldings.items.map((x) => (
          <span key={x.ticker} className="sb-hold"><span>{x.ticker}</span> <span className="sb-faint">{fmtNum(x.weight, 1)}%</span></span>
        )) : <span className="sb-faint">—</span>}
      </td>
    </tr>
  );

  return (
    <section className="sb-section" id="sectors" data-screen-label="03 Sectors">
      <Hairline n="(03)" label="SECTORS" />
      <p className="sb-lede">
        The 11 GICS sectors of the S&amp;P 500. Alphabet and Meta sit in Communication
        Services (XLC), not Technology.
      </p>
      <div className="sb-table-wrap sb-frost">
        <table className="sb-table">
          <thead>
            <tr>
              <th><button className="sb-sort" onClick={() => onSort("name")}>Sector{arrow("name")}</button></th>
              <th>Fund</th>
              <th className="sb-num">Close</th>
              {PERIODS.map((p) => (
                <th key={p} className="sb-num"><button className="sb-sort" onClick={() => onSort(p)}>{p}{arrow(p)}</button></th>
              ))}
              <th className="sb-num"><button className="sb-sort" onClick={() => onSort("weight")}>S&amp;P 500 wt{arrow("weight")}</button></th>
              <th>Top 3 holdings (fund weight)</th>
            </tr>
          </thead>
          <tbody>
            <Row f={spy} isRef />
            {sorted.map((f) => <Row key={f.etf} f={f} />)}
          </tbody>
        </table>
      </div>
      <p className="sb-method">{data.method}</p>
      <dl className="sb-prov">
        <div>
          <dt>Closes &amp; returns</dt>
          <dd>
            Close of {fmtAsOf(closeAsOf)} · <SourceLink source={spy.close.source} />. Price return, dividends
            not included. Compared with closes of 1D {fmtAsOf(ref["1D"]?.from)}, 1W {fmtAsOf(ref["1W"]?.from)},
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
            <dd>As of {fmtAsOf(h.asOf)} · <SourceLink source={h.source}>State Street daily holdings file</SourceLink> for each fund, line items as reported (Alphabet's two share classes are listed separately).</dd>
          </div>
        )}
      </dl>
      {data.classificationCheck && <p className="sb-check">Classification check: {data.classificationCheck}</p>}
      <NotShown items={data.blocked} label="Sources tried, not used" />
    </section>
  );
}

// ── (04) Compute pricing ──

const LIST_PROVIDERS = [
  { key: "AWS", tier: "hyperscaler" },
  { key: "Azure", tier: "hyperscaler" },
  { key: "Oracle", tier: "hyperscaler" },
  { key: "CoreWeave", tier: "gpu-cloud" },
  { key: "Nebius", tier: "gpu-cloud" },
  { key: "Hyperstack", tier: "gpu-cloud" },
];

function PriceCell({ cell, big = false, extra }) {
  if (!cell) return <div className="sb-price sb-price--empty"><span className="sb-faint">not listed</span></div>;
  return (
    <div className={`sb-price ${big ? "sb-price--big" : ""}`}>
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
        <div className="sb-col">
          <div className="sb-col-label">Marketplace median</div>
          <PriceCell cell={m.median} big extra={m.median && `${m.median.offers} offers`} />
          {m.median && <p className="sb-col-note">{m.median.note}</p>}
        </div>
        <div className="sb-col">
          <div className="sb-col-label">Marketplace spot-low</div>
          <PriceCell cell={m.spotLow} big extra={m.spotLow && `${m.spotLow.offers} offers`} />
          {m.spotLow && <p className="sb-col-note">{m.spotLow.note}</p>}
        </div>
        <div className="sb-col">
          <div className="sb-col-label">RunPod list</div>
          <PriceCell cell={g.runpod?.community} big />
          <PriceCell cell={g.runpod?.secure} />
        </div>
        <div className="sb-col">
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

// Single-series line: Vast.ai H200 median, last 30 days. History is built only
// from collector runs — one point per day, nothing backfilled.
function HistoryChart({ points, endDate }) {
  const [hover, setHover] = React.useState(null);
  const bodyRef = React.useRef(null);
  const [W, setW] = React.useState(960);
  React.useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 240, L = 52, R = 16, T = 16, B = 32;
  const end = new Date((endDate || points[points.length - 1]?.date) + "T12:00:00Z");
  const start = new Date(end.getTime() - 29 * 864e5);
  const x = (iso) => L + ((new Date(iso + "T12:00:00Z") - start) / (end - start)) * (W - L - R);
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.2, hi * 0.15);
  lo = Math.max(0, lo - pad); hi = hi + pad;
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  const xTicks = [0, 10, 20, 29].map((d) => new Date(start.getTime() + d * 864e5).toISOString().slice(0, 10));
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = null;
    for (const p of points) if (!best || Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px)) best = p;
    setHover(best);
  };

  return (
    <figure className="sb-chart">
      <figcaption className="sb-chart-cap">
        <span>Vast.ai H200 marketplace median, on-demand · last 30 days</span>
        <span className="sb-faint">{points.length} of 30 days collected · no backfill</span>
      </figcaption>
      <div className="sb-chart-body" ref={bodyRef}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vast.ai H200 median price, last 30 days"
             onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="sb-grid" />
              <text x={L - 8} y={y(t) + 4} className="sb-axis" textAnchor="end">${t.toFixed(2)}</text>
            </g>
          ))}
          {xTicks.map((d) => (
            <text key={d} x={x(d)} y={H - 10} className="sb-axis" textAnchor="middle">{fmtAsOf(d).replace(/, \d{4}$/, "")}</text>
          ))}
          {points.length > 1 && <path d={path} className="sb-line" />}
          {hover && <line x1={x(hover.date)} x2={x(hover.date)} y1={T} y2={H - B} className="sb-crosshair" />}
          {points.map((p) => (
            <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={hover?.date === p.date ? 6 : 4.5} className="sb-dot" />
          ))}
        </svg>
        {hover && (
          <div className="sb-tip" style={{ left: `${(x(hover.date) / W) * 100}%`, top: `${(y(hover.value) / H) * 100}%` }}>
            <strong>{usd(hover.value)}/GPU-hr</strong>
            <span>{fmtAsOf(hover.date)} · {hover.offers} offers</span>
          </div>
        )}
      </div>
      <details className="sb-chart-table">
        <summary>Table view</summary>
        <table className="sb-table sb-table--mini">
          <thead><tr><th>Date</th><th className="sb-num">Median $/GPU-hr</th><th className="sb-num">Offers</th><th>Read at</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}><td>{fmtAsOf(p.date)}</td><td className="sb-num">{usd(p.value, 4)}</td><td className="sb-num">{p.offers}</td><td>{fmtAsOf(p.asOf)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function ComputeTable({ gpus }) {
  const c = (cell, extra) => (cell ? (
    <td className="sb-num" title={`${cell.type} · as of ${fmtAsOf(cell.asOf)} · ${cell.source.name}${extra ? " · " + extra : ""}`}>{usd(cell.value)}</td>
  ) : <td className="sb-num sb-faint">—</td>);
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
            <th className="sb-num">Median</th>
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
              {c(g.marketplace?.median, g.marketplace?.median && `${g.marketplace.median.offers} offers`)}
              {c(g.marketplace?.spotLow, g.marketplace?.spotLow && `${g.marketplace.spotLow.offers} offers`)}
              {c(g.runpod?.community)}
              {c(g.runpod?.secure)}
              {LIST_PROVIDERS.map((p) => {
                const cell = g.list.find((x) => x.provider === p.key);
                return <React.Fragment key={p.key}>{c(cell, cell && `${cell.sku} — ${cell.note}`)}</React.Fragment>;
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

function Compute({ snap }) {
  const data = snap?.data;
  if (!data) return null;
  const h200 = data.gpus.H200;
  const pts = data.history?.vastH200Median || [];
  return (
    <section className="sb-section" id="compute" data-screen-label="04 Compute">
      <Hairline n="(04)" label="COMPUTE PRICING" />
      <p className="sb-lede">
        What it costs to rent one data-centre GPU for an hour. Marketplace prices are live
        offers from independent hosts; list prices are what providers publish. They are
        different things and are shown side by side, not combined.
      </p>
      <H200Card g={h200} />
      {pts.length > 0 && <HistoryChart points={pts} endDate={pts[pts.length - 1].date} />}
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

// ── (05) Sources & open items ──

function Sources({ snaps }) {
  const files = ["macro", "sectors", "compute"].map((s) => snaps[s]?.file).filter(Boolean);
  return (
    <section className="sb-section" id="sources" data-screen-label="05 Sources">
      <Hairline n="(05)" label="METHOD & SOURCES" />
      <div className="sb-sources">
        <div>
          <div className="sb-group-label">Method</div>
          <ul className="sb-plain">
            <li>Describes the market as published. No forecasts, signals, or verdicts.</li>
            <li>Every figure carries its value, its as-of time, and its source. A source that can't be read is listed as not shown — never estimated.</li>
            <li>Snapshots are append-only: each collection writes a new dated file, and old files are never edited.</li>
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
      <span>Phase 1 — Nov ’26</span>
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
        <SBHero snaps={snaps} />
        {snaps.status === "loading" && <p className="sb-status">Loading snapshots…</p>}
        {snaps.status === "err" && <p className="sb-status">Couldn't load snapshot data — {snaps.error}</p>}
        {snaps.status === "ok" && (
          <>
            <Macro snap={snaps.macro} />
            <Sectors snap={snaps.sectors} />
            <Compute snap={snaps.compute} />
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
