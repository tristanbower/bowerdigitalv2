// Bower Digital — /work gallery page.
// Displays all projects with category filtering.

function Hairline({ label, n }) {
  return (
    <div className="hairline">
      <span className="hairline-n">{n}</span>
      <span className="hairline-line" />
      <span className="hairline-label">{label}</span>
    </div>
  );
}

function MagLink({ children, href = "#", className = "" }) {
  return (
    <a className={`mag ${className}`} href={href}>
      <span className="mag-text">{children}</span>
      <span className="mag-arrow" aria-hidden>↗</span>
    </a>
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

// ── Filter logic ──

const FILTERS = [
  { key: "all", label: "ALL" },
  { key: "websites", label: "WEBSITES", category: "website" },
  { key: "webapps", label: "WEB APPS", category: "webapp" },
  { key: "tools", label: "TOOLS", category: "tool" },
];

function getInitialFilter() {
  const params = new URLSearchParams(window.location.search);
  const f = params.get("filter");
  if (f && FILTERS.some((x) => x.key === f)) return f;
  return "all";
}

function countForFilter(key) {
  const projects = window.PROJECTS || [];
  if (key === "all") return projects.length;
  const cat = FILTERS.find((f) => f.key === key)?.category;
  return projects.filter((p) => p.category === cat).length;
}

function sortedProjects(projects) {
  return [...projects].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year);
    return a.name.localeCompare(b.name);
  });
}

// ── Cell component ──

function WorkCell({ project, index }) {
  const isPrivate = project.visibility === "private";
  const num = String(index + 1).padStart(2, "0");

  const handleClick = () => {
    window.location.href = `/work/${project.slug}`;
  };

  return (
    <button
      className="w-cell"
      onClick={handleClick}
      type="button"
    >
      <div className="w-cell-thumb">
        <div className="w-cell-dots" />
        <span className="w-cell-num serif italic">{num}</span>
        {isPrivate && (
          <>
            <img src={`/work-img/${project.slug}.png`} alt="" className="w-cell-screenshot w-cell-screenshot--blurred" />
            <span className="w-cell-private">PRIVATE</span>
          </>
        )}
        {!isPrivate && <img src={`/work-img/${project.slug}.png`} alt="" className="w-cell-screenshot" />}
      </div>
      <div className="w-cell-meta">
        <h3 className="w-cell-name serif italic">{project.name}</h3>
        <div className="w-cell-row">
          <span>{project.kind} · {project.year}</span>
          <span>Open ↗</span>
        </div>
      </div>
    </button>
  );
}

// ── Hero ──

function WHero() {
  return (
    <section className="w-hero">
      <Hairline n="(01)" label="SELECTED WORK" />
      <h1 className="w-hero-title serif italic">
        Every site, app, and tool I've shipped.
      </h1>
      <p className="w-hero-sub serif italic">
        Filtered by category. Private builds are listed without client names.
      </p>
    </section>
  );
}

// ── Filter chips ──

function FilterChips({ active, onChange }) {
  return (
    <div className="w-filters">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          className={`w-chip ${active === f.key ? "is-active" : ""}`}
          onClick={() => onChange(f.key)}
          type="button"
        >
          {f.label} · {countForFilter(f.key)}
        </button>
      ))}
    </div>
  );
}

// ── Grid ──

function WorkGrid({ filter }) {
  const projects = window.PROJECTS || [];
  const filtered = filter === "all"
    ? projects
    : projects.filter((p) => p.category === FILTERS.find((f) => f.key === filter)?.category);
  const sorted = sortedProjects(filtered);

  return (
    <div className="w-grid">
      {sorted.map((p, i) => (
        <WorkCell key={p.slug} project={p} index={i} />
      ))}
    </div>
  );
}

// ── Footer ──

function Footer() {
  return (
    <footer className="foot">
      <span>© 2026 Bower Digital</span>
      <span className="foot-mid">Toronto · Available for new work</span>
      <span>v 5.0 — May '26</span>
    </footer>
  );
}

// ── App ──

function App() {
  const defaults = /*EDITMODE-BEGIN*/{
    "pattern": "dots",
    "density": 28,
    "intensity": 1.2,
    "invert": false,
    "accent": true,
    "displayFont": "Instrument Serif"
  }/*EDITMODE-END*/;

  const [tweaks, setTweak] = useTweaks(defaults);
  const [filter, setFilter] = React.useState(getInitialFilter);
  const [fading, setFading] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.style.setProperty("--display-font", `"${tweaks.displayFont}", serif`);
    document.body.classList.toggle("invert", !!tweaks.invert);
  }, [tweaks.displayFont, tweaks.invert]);

  const handleFilterChange = (key) => {
    if (key === filter) return;
    setFading(true);
    setTimeout(() => {
      setFilter(key);
      const url = key === "all"
        ? window.location.pathname
        : window.location.pathname + "?filter=" + key;
      history.replaceState(null, "", url);
      setFading(false);
    }, 200);
  };

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
          <span className="brand-name">Bower / Digital</span>
        </a>
        <nav className="nav-links">
          <a href="/work">Work</a>
          <a href="/research">Side Bets</a>
          <a href="/#inquiry">Contact</a>
          <button className="theme-toggle" onClick={() => setTweak("invert", !tweaks.invert)} aria-label="Toggle theme">
            {tweaks.invert ? "DARK" : "LIGHT"}
          </button>
          <span className="nav-status"><span className="dot" /> available for new work</span>
        </nav>
      </header>

      <main id="top" className="page">
        <WHero />
        <FilterChips active={filter} onChange={handleFilterChange} />
        <div className={`w-grid-wrap ${fading ? "is-fading" : ""}`}>
          <WorkGrid filter={filter} />
        </div>
        <Footer />
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Pattern">
          <TweakSelect
            label="Style"
            value={tweaks.pattern}
            onChange={(v) => setTweak("pattern", v)}
            options={[
              { value: "dots", label: "Dot grid" },
              { value: "candles", label: "Candlesticks" },
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
