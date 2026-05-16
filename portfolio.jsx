// Bower Digital — main studio page.
// Sections: Hero · Services · Recent Work · Process · Inquiry · Footer

// Projects loaded from projects-data.jsx via window.PROJECTS.
const FEATURED_PROJECTS = (window.PROJECTS || [])
  .filter((p) => p.featured)
  .slice(0, 3)
  .map((p, i) => ({
    n: String(i + 1).padStart(2, "0"),
    name: p.name,
    kind: p.kind,
    year: p.year,
    blurb: p.blurb,
    href: p.href || "#",
  }));

const SERVICES = [
  {
    n: "01",
    name: "Websites",
    desc: "Marketing sites, landing pages, portfolios. Editorial type, considered motion, fast on every device.",
    price: "From $250",
    href: "#inquiry",
  },
  {
    n: "02",
    name: "Web apps",
    desc: "Custom tools, dashboards, internal apps. Built lean — only what the work actually needs.",
    price: "Scope per project",
    href: "#inquiry",
  },
  {
    n: "03",
    name: "Side Bets",
    desc: "A free weekly note on the charts I'm watching — macro plots, ratios worth tracking, the occasional half-formed trade idea.",
    price: "Free · weekly",
    href: "research.html",
    external: true,
  },
];

const PROCESS = [
  {
    n: "01",
    title: "Talk",
    body: "Short call or email exchange. Free, ~20 minutes. We scope the build together.",
  },
  {
    n: "02",
    title: "Quote",
    body: "Fixed price or hourly estimate in a couple business days. No surprises, no scope creep.",
  },
  {
    n: "03",
    title: "Build",
    body: "Iterate against a live preview link. You see progress as it happens, give feedback inline.",
  },
  {
    n: "04",
    title: "Ship",
    body: "Deploy, hand off cleanly. Optional retainer for upkeep and small additions.",
  },
];

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

function Hero() {
  const time = useClock();
  return (
    <section className="hero" data-screen-label="01 Hero">
      <div className="hero-meta-row">
        <span className="meta">BOWER DIGITAL — STUDIO OF ONE</span>
        <span className="meta">TORONTO, ON · {time} EST</span>
      </div>

      <h1 className="hero-title">
        <span className="serif italic">Bower</span>{" "}
        <span className="serif italic">Digital</span>
        <span className="hero-rule" />
        <span className="hero-sub">
          <span className="block">
            <em className="serif italic">Custom websites</em>
          </span>
          <span className="block">
            <span className="amp serif italic">&</span>{" "}
            <em className="serif italic">web apps</em>.
          </span>
        </span>
      </h1>

      <div className="hero-bottom">
        <p className="hero-blurb">
          A one-person studio in Toronto. <span className="under">Custom builds</span>,
          fixed prices, and a live preview link the day after we agree on scope.
          Just <span className="under">the work</span>.
        </p>
        <div className="hero-cta">
          <MagLink href="#inquiry">Start a project</MagLink>
          <MagLink href="#work">See recent work</MagLink>
        </div>
      </div>

      <div className="scroll-cue">
        <span className="cue-line" />
        <span className="cue-label">SCROLL</span>
      </div>
    </section>
  );
}

function Services() {
  const [hovered, setHovered] = React.useState(null);
  return (
    <section className="services" id="services" data-screen-label="02 Services">
      <Hairline n="(02)" label="SERVICES" />
      <div className="services-grid">
        {SERVICES.map((s, i) => (
          <a
            key={s.n}
            href={s.href}
            className={`service-card ${hovered === i ? "is-hover" : ""}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            {...(s.external ? {} : {})}
          >
            <div className="service-n">{s.n}</div>
            <div className="service-name serif italic">{s.name}</div>
            <p className="service-desc">{s.desc}</p>
            <div className="service-foot">
              <span className="service-price">{s.price}</span>
              <span className="service-arrow">↗</span>
            </div>
          </a>
        ))}
      </div>
      <div className="services-engagement">
        Fixed projects · Hourly at $50/hr · Retainer on request
      </div>
    </section>
  );
}

function Work() {
  const [hovered, setHovered] = React.useState(null);
  return (
    <section className="work" id="work" data-screen-label="03 Recent Work">
      <Hairline n="(03)" label="RECENT WORK" />
      <ol className="work-list">
        {FEATURED_PROJECTS.map((p, i) => (
          <li
            key={p.n}
            className={`work-row ${hovered === i ? "is-hover" : ""} ${hovered !== null && hovered !== i ? "is-dim" : ""}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <a href="/work" className="work-row-link">
              <span className="work-n">{p.n}</span>
              <span className="work-name serif">{p.name}</span>
              <span className="work-kind">{p.kind}</span>
              <span className="work-year">{p.year}</span>
              <span className="work-arrow">↗</span>
            </a>
            <div className="work-blurb">{p.blurb}</div>
          </li>
        ))}
      </ol>
      <div className="work-see-all">
        <MagLink href="/work">See all work →</MagLink>
      </div>
    </section>
  );
}

function Process() {
  return (
    <section className="process" id="process" data-screen-label="04 Process">
      <Hairline n="(04)" label="PROCESS" />
      <ol className="process-list">
        {PROCESS.map((p) => (
          <li key={p.n} className="process-step">
            <div className="process-n">{p.n}</div>
            <h3 className="process-title serif italic">{p.title}</h3>
            <p className="process-body">{p.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Inquiry() {
  const [state, setState] = React.useState("idle"); // idle · submitting · ok · err
  const [err, setErr] = React.useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setState("submitting");
    setErr("");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      // ──────────────────────────────────────────────────────────────────────
      // FORMSPREE: replace the URL below with your Formspree form endpoint.
      // 1. Create a form at https://formspree.io (free tier is fine)
      // 2. Paste the endpoint here, e.g. "https://formspree.io/f/xyzabcde"
      // ──────────────────────────────────────────────────────────────────────
      const INQUIRY_ENDPOINT = "https://formspree.io/f/YOUR_FORM_ID";
      const res = await fetch(INQUIRY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Server responded " + res.status);
      setState("ok");
      form.reset();
    } catch (e2) {
      setState("err");
      setErr(e2.message || "Something went wrong. Email me directly below.");
    }
  };

  return (
    <section className="inquiry" id="inquiry" data-screen-label="05 Inquiry">
      <Hairline n="(05)" label="START A PROJECT" />
      <div className="inquiry-grid">
        <div className="inquiry-lead">
          <h2 className="inquiry-headline serif">
            <span className="italic">Tell me</span> about<br />
            what you want<br />
            to <span className="italic">build</span>.
          </h2>
          <p className="inquiry-sub">
            I read every inquiry myself. Expect a reply within a couple business days.
          </p>
        </div>

        <form className="inquiry-form" onSubmit={onSubmit} noValidate>
          <div className="field-row">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" type="text" required autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="project_type">Project type</label>
              <div className="select-wrap">
                <select id="project_type" name="project_type" required defaultValue="">
                  <option value="" disabled>Select…</option>
                  <option>Website</option>
                  <option>Web app</option>
                  <option>Trading algorithm</option>
                  <option>Not sure</option>
                </select>
                <span className="select-caret">▾</span>
              </div>
            </div>
            <div className="field">
              <label htmlFor="budget">Budget range</label>
              <div className="select-wrap">
                <select id="budget" name="budget" required defaultValue="">
                  <option value="" disabled>Select…</option>
                  <option>&lt; $1k</option>
                  <option>$1k – $5k</option>
                  <option>$5k – $15k</option>
                  <option>$15k+</option>
                  <option>Not sure</option>
                </select>
                <span className="select-caret">▾</span>
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="timeline">Timeline <span className="muted">(optional)</span></label>
            <div className="select-wrap">
              <select id="timeline" name="timeline" defaultValue="">
                <option value="">Select…</option>
                <option>ASAP</option>
                <option>1–3 months</option>
                <option>3+ months</option>
                <option>Flexible</option>
              </select>
              <span className="select-caret">▾</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="brief">Tell me about it</label>
            <textarea id="brief" name="brief" rows="4" required placeholder="Goals, references, anything I should know…" />
          </div>

          <div className="form-foot">
            <button type="submit" className="submit-btn" disabled={state === "submitting"}>
              <span>
                {state === "submitting" ? "Sending…" :
                 state === "ok" ? "Sent — talk soon" :
                 "Send inquiry"}
              </span>
              <span className="submit-arrow">↗</span>
            </button>
            <span className="form-meta">
              {state === "err" ? `Couldn't send — ${err}` :
               state === "ok" ? "I'll reply within a couple business days." :
               "I read every inquiry myself."}
            </span>
          </div>

          <p className="inquiry-fallback">
            Or email directly:{" "}
            {/* TODO: switch to tristan@bowerdigital.com once Google Workspace is set up */}
            <a className="mag mag-inline" href="mailto:tristan@bowerdigital.com">
              <span className="mag-text">tristan@bowerdigital.com</span>
              <span className="mag-arrow">↗</span>
            </a>
          </p>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <span>© 2026 Bower Digital</span>
      <span className="foot-mid">Toronto · Available for new work</span>
      <span>v 5.0 — May ’26</span>
    </footer>
  );
}

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
        <a className="brand" href="#top">
          <span className="brand-mark">●</span>
          <span className="brand-name">Bower / Digital</span>
        </a>
        <nav className="nav-links">
          <a href="/work">Work</a>
          <a href="/research">Side Bets</a>
          <a href="#inquiry">Contact</a>
          <button className="theme-toggle" onClick={() => setTweak("invert", !tweaks.invert)} aria-label="Toggle theme">
            {tweaks.invert ? "DARK" : "LIGHT"}
          </button>
          <span className="nav-status"><span className="dot" /> available for new work</span>
        </nav>
      </header>

      <main id="top" className="page">
        <Hero />
        <Services />
        <Work />
        <Process />
        <Inquiry />
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
          <TweakSelect
            label="Display font"
            value={tweaks.displayFont}
            onChange={(v) => setTweak("displayFont", v)}
            options={[
              { value: "Instrument Serif", label: "Instrument Serif" },
              { value: "EB Garamond", label: "EB Garamond" },
              { value: "Inter", label: "Inter (sans)" },
              { value: "JetBrains Mono", label: "JetBrains Mono" },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
