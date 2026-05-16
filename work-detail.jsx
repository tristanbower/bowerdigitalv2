// Bower Digital — /work/[slug] detail page.
// Reads slug from URL path, renders matching project from window.PROJECTS.

function MagLink({ children, href = "#", className = "" }) {
  return (
    <a className={`mag ${className}`} href={href}>
      <span className="mag-text">{children}</span>
      <span className="mag-arrow" aria-hidden>↗</span>
    </a>
  );
}

function getSlug() {
  const path = window.location.pathname;
  const parts = path.split("/").filter(Boolean);
  // URL is /work/[slug]
  if (parts.length >= 2 && parts[0] === "work") return parts[1];
  return null;
}

function getProject(slug) {
  const projects = window.PROJECTS || [];
  return projects.find((p) => p.slug === slug) || null;
}

// ── Not Found ──

function NotFound() {
  return (
    <section className="wd-not-found">
      <h1 className="wd-not-found-title serif italic">Project not found.</h1>
      <p className="wd-not-found-body">
        The project you're looking for doesn't exist or has been removed.
      </p>
      <MagLink href="/work">← All work</MagLink>
    </section>
  );
}

// ── Screenshot block ──

function Screenshot({ project, index }) {
  const isPrivate = project.visibility === "private";
  const num = String(index + 1).padStart(2, "0");

  if (isPrivate) {
    return (
      <div className="wd-screenshot wd-screenshot--private">
        <div className="wd-screenshot-fallback">
          <div className="w-cell-dots" />
          <span className="w-cell-num serif italic">{num}</span>
        </div>
        <span className="wd-private-label">PRIVATE BUILD</span>
      </div>
    );
  }

  return (
    <div className="wd-screenshot">
      <img
        src={`/work-img/${project.slug}.png`}
        alt={`Screenshot of ${project.name}`}
        className="wd-screenshot-img"
      />
    </div>
  );
}

// ── Body block ──

function BodyBlock({ project }) {
  const sections = [
    { label: "WHAT IT DOES", content: project.whatItDoes },
    { label: "WHAT MADE IT HARD", content: project.whatMadeItHard },
    { label: "OUTCOME", content: project.outcome },
  ];

  return (
    <div className="wd-body">
      {sections.map((s) => (
        <div key={s.label} className="wd-body-row">
          <span className="wd-body-label">{s.label}</span>
          <p className="wd-body-copy">{s.content}</p>
        </div>
      ))}
    </div>
  );
}

// ── Live URL / Private note ──

function LiveUrl({ project }) {
  if (project.visibility === "private") {
    return (
      <div className="wd-private-note">
        <p>
          Private build. Available for similar work —{" "}
          <a className="mag mag-inline" href="/#inquiry">
            <span className="mag-text">get in touch via the main page</span>
            <span className="mag-arrow">↗</span>
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="wd-live-url">
      <span className="wd-live-url-label">Visit the live site →</span>
      <a
        href={project.href}
        target="_blank"
        rel="noopener noreferrer"
        className="wd-live-url-link serif italic"
      >
        {project.href}
      </a>
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

  React.useEffect(() => {
    document.documentElement.style.setProperty("--display-font", `"${tweaks.displayFont}", serif`);
    document.body.classList.toggle("invert", !!tweaks.invert);
  }, [tweaks.displayFont, tweaks.invert]);

  const slug = getSlug();
  const project = getProject(slug);
  const projectIndex = project
    ? (window.PROJECTS || []).indexOf(project)
    : 0;

  // Update page title
  React.useEffect(() => {
    if (project) {
      document.title = `${project.name} — Bower Digital`;
    }
  }, [project]);

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
        {!project ? (
          <NotFound />
        ) : (
          <>
            {/* Hero */}
            <section className="wd-hero">
              <div className="wd-breadcrumb">
                <span>BOWER DIGITAL</span>
                <span className="wd-breadcrumb-sep">/</span>
                <a href="/work">WORK</a>
                <span className="wd-breadcrumb-sep">/</span>
                <span>{project.name.toUpperCase()}</span>
              </div>
              <h1 className="wd-hero-title serif italic">{project.name}</h1>
              <div className="wd-hero-meta">
                <span>{project.kind.toUpperCase()}</span>
                <span className="wd-hero-meta-sep">·</span>
                <span>{project.year}</span>
                <span className="wd-hero-meta-sep">·</span>
                <span>{project.category.toUpperCase()}</span>
              </div>
            </section>

            {/* Screenshot */}
            <Screenshot project={project} index={projectIndex} />

            {/* Body */}
            <BodyBlock project={project} />

            {/* Live URL or private note */}
            <LiveUrl project={project} />

            {/* Back link */}
            <div className="wd-back">
              <MagLink href="/work">← All work</MagLink>
            </div>
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
