// Bower Digital — /research sub-page.
// Home of Side Bets, a free weekly newsletter on markets.
//
// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE NOTE — DO NOT REMOVE
// ─────────────────────────────────────────────────────────────────────────────
// This page must never mention any current or past employer (e.g. BMO),
// professional license (e.g. IIROC), or any registered role. Side Bets is
// framed as personal commentary, not investment advice. The "Side Bets"
// name itself is part of the compliance posture — keep the casual tone
// throughout. No buy/sell calls in marketing copy.
//
// Background credentials that ARE okay to mention:
//   - CFA Level II candidate (May 2026), Level I passed  (qualification, not employer)
//   - Queen's BASc Electrical Engineering                 (education)
//   - "Writes the code himself"                            (capability)
//
// Sections: Hero · What you'll get · Latest issue · Subscribe · About · Footer
// ─────────────────────────────────────────────────────────────────────────────

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

const WHAT_YOU_GET = [
  {
    n: "01",
    name: "Macro charts",
    desc: "Rate spreads, credit, breadth, dollar, energy. The handful of charts I personally check every Sunday.",
  },
  {
    n: "02",
    name: "Ratios worth watching",
    desc: "XLF/XLU, copper/gold, HYG/IEF, and stranger ones. When they move, why they move, what they're telling me.",
  },
  {
    n: "03",
    name: "Trade ideas",
    desc: "Discretionary or systematic, when I've got one I like enough to put my own money on. Marked as such — no track record claimed, no skin asked of you.",
  },
];

function RHero() {
  const time = useClock();
  return (
    <section className="r-hero" data-screen-label="01 Side Bets Hero">
      <div className="hero-meta-row">
        <span className="meta">BOWER DIGITAL / SIDE BETS</span>
        <span className="meta">TORONTO, ON · {time} EST</span>
      </div>

      <h1 className="r-hero-title">
        <span className="serif italic">Side Bets</span>
      </h1>
      <p className="r-hero-tagline serif italic">
        A weekly note on the charts I'm watching.
      </p>

      <div className="r-hero-bottom">
        <p className="r-hero-blurb">
          Macro plots, ratios that are telling me something, the occasional
          half-formed trade idea. Free, weekly-ish, no schedule beyond "when
          there's something worth saying." <span className="under">Read by hand,
          written by hand.</span>
        </p>
        <p className="r-hero-honest">
          Issue 01 ships soon. Subscribe below.
        </p>
        <div className="hero-cta">
          <MagLink href="#subscribe">Subscribe</MagLink>
          <MagLink href="#what-youll-get">What you'll get</MagLink>
        </div>
      </div>

      <div className="scroll-cue">
        <span className="cue-line" />
        <span className="cue-label">SCROLL</span>
      </div>
    </section>
  );
}

function WhatYouGet() {
  return (
    <section className="r-info" id="what-youll-get" data-screen-label="02 What you'll get">
      <Hairline n="(02)" label="WHAT YOU'LL GET" />
      <div className="r-info-grid">
        {WHAT_YOU_GET.map((s) => (
          <div key={s.n} className="r-info-card">
            <div className="service-n">{s.n}</div>
            <div className="service-name serif italic">{s.name}</div>
            <p className="service-desc">{s.desc}</p>
          </div>
        ))}
      </div>
      <p className="r-info-disclaimer">
        — <em>Side Bets is personal commentary, not investment advice. For
        informational and entertainment purposes only. Do your own research.</em>
      </p>
    </section>
  );
}

function LatestIssue() {
  return (
    <section className="r-latest" id="latest-issue" data-screen-label="03 Latest issue">
      <Hairline n="(03)" label="LATEST ISSUE" />
      {/* TODO: swap this static card for a Substack/Ghost RSS pull, or update by hand each week. */}
      <article className="r-issue-card">
        <div className="r-issue-meta">ISSUE 00 · COMING SOON</div>
        <h3 className="r-issue-title serif">
          <span className="italic">The setup post</span> — what Side Bets is,
          what it isn't, and the six charts I'll track to start.
        </h3>
        <p className="r-issue-blurb">
          A short opening note: framing, voice, the disclaimers worth knowing,
          and the small handful of indicators I'm starting with. If you've
          subscribed, this lands first.
        </p>
        <div className="r-issue-cta">
          <MagLink href="#subscribe">Subscribe to get it first</MagLink>
        </div>
      </article>
    </section>
  );
}

function Subscribe() {
  const [state, setState] = React.useState("idle");
  const [err, setErr] = React.useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setState("submitting");
    setErr("");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      // ──────────────────────────────────────────────────────────────────────
      // NEWSLETTER SUBSCRIBE: replace the URL below with your provider.
      //
      // Option A — Buttondown (recommended for API-style integration):
      //   "https://api.buttondown.email/v1/subscribers"
      //   (set header: Authorization: Token YOUR_API_KEY)
      //
      // Option B — Substack embed:
      //   Replace this entire <form> with the Substack embed iframe/snippet.
      //
      // Option C — Formspree (simplest, no backend needed):
      //   "https://formspree.io/f/YOUR_FORM_ID"
      // ──────────────────────────────────────────────────────────────────────
      const SUBSCRIBE_ENDPOINT = "https://formspree.io/f/YOUR_FORM_ID";
      const res = await fetch(SUBSCRIBE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Server responded " + res.status);
      setState("ok");
      form.reset();
    } catch (e2) {
      setState("err");
      setErr(e2.message || "Couldn't subscribe — try again in a minute.");
    }
  };

  return (
    <section className="r-subscribe" id="subscribe" data-screen-label="04 Subscribe">
      <Hairline n="(04)" label="SUBSCRIBE" />
      <div className="r-subscribe-grid">
        <div className="r-subscribe-lead">
          <h2 className="r-subscribe-headline serif">
            <span className="italic">No paywall.</span><br />
            <span className="italic">No spam.</span><br />
            <span className="italic">No schedule</span> beyond weekly-ish.
          </h2>
        </div>

        <form className="r-subscribe-form" onSubmit={onSubmit} noValidate>
          <div className="r-subscribe-row">
            <input
              name="email"
              type="email"
              required
              placeholder="you@email.com"
              autoComplete="email"
              aria-label="Email address"
            />
            <button type="submit" disabled={state === "submitting"}>
              <span>
                {state === "submitting" ? "Sending…" :
                 state === "ok" ? "Subscribed ↗" : "Subscribe ↗"}
              </span>
            </button>
          </div>
          <div className="r-subscribe-meta">
            {state === "err" ? `Couldn't send — ${err}` :
             state === "ok" ? "Check your inbox for a confirmation." :
             "Free. Unsubscribe anytime. Read by hand, replied to by hand."}
          </div>
        </form>
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="r-about" data-screen-label="05 About">
      <Hairline n="(05)" label="WHO'S WRITING THIS" />
      <div className="r-about-grid">
        <h2 className="r-about-headline serif">
          <span className="italic">Tristan Bower.</span> A studio of one in
          Toronto, with a side interest in markets.
        </h2>
        <div className="r-about-body">
          <p>
            I run Bower Digital — a one-person studio building custom websites
            and web apps. Side Bets is the part of my week I spend looking at
            charts instead of writing JavaScript.
          </p>
          <p>
            Background: Queen's BASc Electrical Engineering, CFA Level II
            candidate (May 2026), Level I passed. I write all the code, all the
            analysis, and all the copy here myself.
          </p>
          <p className="muted">
            If you'd rather hire me to build something — site, app, internal
            tool — that lives over on the{" "}
            <a className="mag mag-inline" href="index.html">
              <span className="mag-text">main page</span>
              <span className="mag-arrow">↗</span>
            </a>.
          </p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot r-foot">
      <div className="r-foot-note">
        Building strategies for clients? Available on request —{" "}
        <a className="mag mag-inline" href="index.html#inquiry">
          <span className="mag-text">get in touch via the main page</span>
          <span className="mag-arrow">↗</span>
        </a>.
      </div>
      <div className="r-foot-row">
        <span>© 2026 Bower Digital</span>
        <span className="foot-mid">Side Bets · Toronto · Personal commentary, not advice</span>
        <span>v 5.0 — May ’26</span>
      </div>
    </footer>
  );
}

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
        <a className="brand" href="index.html">
          <span className="brand-mark">●</span>
          <span className="brand-name">Bower / Digital — Side Bets</span>
        </a>
        <nav className="nav-links">
          <a href="/">← Main studio</a>
          <a href="/work">Work</a>
          <a href="#what-youll-get">What you'll get</a>
          <a href="#subscribe">Subscribe</a>
          <button className="theme-toggle" onClick={() => setTweak("invert", !tweaks.invert)} aria-label="Toggle theme">
            {tweaks.invert ? "DARK" : "LIGHT"}
          </button>
          <span className="nav-status"><span className="dot" /> weekly · free</span>
        </nav>
      </header>

      <main id="top" className="page">
        <RHero />
        <WhatYouGet />
        <LatestIssue />
        <Subscribe />
        <About />
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
