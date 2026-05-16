// Reactive canvas background. Modes: candles, dots, lines, ascii, halftone, topo.
// All are drawn on a single canvas at devicePixelRatio for crispness.

// Deterministic seeded pseudo-random — gives each candle a stable shape
function seedRand(i, j, salt = 0) {
  const x = Math.sin(i * 374.761 + j * 119.873 + salt * 17.31) * 43758.5453;
  return x - Math.floor(x);
}

function PatternBG({ mode = "dots", density = 28, intensity = 1.2, invert = false, accent = false }) {
  const canvasRef = React.useRef(null);
  const mouseRef = React.useRef({ x: -9999, y: -9999, vx: 0, vy: 0, lastX: 0, lastY: 0 });
  const rafRef = React.useRef(0);
  const tRef = React.useRef(0);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      const nx = e.clientX - r.left;
      const ny = e.clientY - r.top;
      mouseRef.current.vx = nx - mouseRef.current.lastX;
      mouseRef.current.vy = ny - mouseRef.current.lastY;
      mouseRef.current.lastX = nx;
      mouseRef.current.lastY = ny;
      mouseRef.current.x = nx;
      mouseRef.current.y = ny;
    };
    const onLeave = () => {
      mouseRef.current.x = -9999;
      mouseRef.current.y = -9999;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);

    const fg = invert ? "rgba(10, 10, 10," : "rgba(245, 243, 238,";
    const accentColor = "rgba(178, 50, 40,"; // deep red, only when accent=true near cursor

    const ASCII_CHARS = ["·", "+", "x", "*", "o", "#", "/", "\\", "—", "|"];

    const draw = () => {
      tRef.current += 0.012;
      const t = tRef.current;
      ctx.clearRect(0, 0, w, h);

      const m = mouseRef.current;
      const radius = 180 * intensity;
      const radius2 = radius * radius;

      const gap = density;
      const cols = Math.ceil(w / gap) + 2;
      const rows = Math.ceil(h / gap) + 2;
      const offX = (w - (cols - 1) * gap) / 2;
      const offY = (h - (rows - 1) * gap) / 2;

      if (mode === "candles") {
        // Treat the canvas as a single horizontal "chart": one candle per column.
        // Each candle's height is driven by a smooth random walk seeded on column index;
        // bars near the cursor pop in scale and reveal red/green color.
        const candleW = Math.max(6, Math.min(14, gap * 0.45));
        const candleStride = Math.max(candleW + 4, gap * 0.85);
        const nCandles = Math.ceil(w / candleStride) + 2;
        const baseY = h * 0.5;
        const maxAmp = h * 0.32;

        // Build a smooth random walk for the chart shape (cached on first run via tRef trick is overkill;
        // recompute cheaply each frame so it can drift slowly with time).
        let level = 0;
        const levels = new Array(nCandles);
        for (let i = 0; i < nCandles; i++) {
          // smooth pseudo-noise that drifts slowly with t
          const n =
            Math.sin(i * 0.31 + t * 0.6) * 0.5 +
            Math.sin(i * 0.13 + t * 0.25) * 0.3 +
            Math.sin(i * 0.07 - t * 0.4) * 0.2;
          level = level * 0.7 + n * 0.3;
          levels[i] = level;
        }

        for (let i = 0; i < nCandles; i++) {
          const cx = i * candleStride - candleStride * 0.5 + (w % candleStride) * 0.5;
          const open = baseY - levels[i] * maxAmp;
          const close = baseY - (levels[i + 1] !== undefined ? levels[i + 1] : levels[i]) * maxAmp;
          const wickRand = seedRand(i, 0, 1);
          const wickExtra = (8 + wickRand * 22);
          const high = Math.min(open, close) - wickExtra;
          const low = Math.max(open, close) + wickExtra * (0.4 + seedRand(i, 0, 2) * 0.8);
          const isUp = close <= open; // close above open means bullish (lower y)

          // distance to mouse — use horizontal proximity primarily, with a vertical falloff
          const dx = cx - m.x;
          const candleMidY = (open + close) / 2;
          const dy = candleMidY - m.y;
          const d2 = dx * dx + dy * dy;
          let near = 0;
          if (d2 < radius2) {
            near = 1 - Math.sqrt(d2) / radius;
          }

          // Scale up vertical stretch and width near cursor
          const stretch = 1 + near * 1.4 * intensity;
          const sOpen = baseY + (open - baseY) * stretch;
          const sClose = baseY + (close - baseY) * stretch;
          const sHigh = baseY + (high - baseY) * stretch;
          const sLow = baseY + (low - baseY) * stretch;
          const wPx = candleW * (1 + near * 0.6);

          // Color: distant = greyscale; near = red/green
          const greyAlpha = 0.10 + near * 0.05;
          const colorAlpha = 0.25 + near * 0.85;
          let bodyFill, wickStroke;
          if (near < 0.04) {
            // far: just hairlines, very quiet
            bodyFill = fg + greyAlpha + ")";
            wickStroke = fg + (greyAlpha * 0.7) + ")";
          } else {
            const upColor = `rgba(110, 200, 130, ${colorAlpha})`;
            const downColor = `rgba(220, 80, 70, ${colorAlpha})`;
            bodyFill = isUp ? upColor : downColor;
            wickStroke = isUp ? upColor : downColor;
          }

          // wick
          ctx.strokeStyle = wickStroke;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, sHigh);
          ctx.lineTo(cx, sLow);
          ctx.stroke();

          // body
          const bodyTop = Math.min(sOpen, sClose);
          const bodyH = Math.max(2, Math.abs(sClose - sOpen));
          if (isUp && near > 0.04) {
            // hollow up-candle near cursor — outline only — feels like a real chart
            ctx.strokeStyle = bodyFill;
            ctx.lineWidth = 1.2;
            ctx.strokeRect(cx - wPx / 2, bodyTop, wPx, bodyH);
          } else {
            ctx.fillStyle = bodyFill;
            ctx.fillRect(cx - wPx / 2, bodyTop, wPx, bodyH);
          }
        }
      } else if (mode === "dots") {
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const x = offX + i * gap;
            const y = offY + j * gap;
            const dx = x - m.x;
            const dy = y - m.y;
            const d2 = dx * dx + dy * dy;
            let r = 0.9;
            let push = 0;
            let near = 0;
            if (d2 < radius2) {
              const d = Math.sqrt(d2);
              near = 1 - d / radius;
              push = near * 22 * intensity;
              r = 0.9 + near * 3.2;
            }
            const ang = Math.atan2(dy, dx);
            const px = x + Math.cos(ang) * push;
            const py = y + Math.sin(ang) * push;
            const baseAlpha = 0.18 + Math.sin(t + (i + j) * 0.15) * 0.04;
            const alpha = baseAlpha + near * 0.7;
            if (accent && near > 0.55) {
              ctx.fillStyle = accentColor + alpha + ")";
            } else {
              ctx.fillStyle = fg + alpha + ")";
            }
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (mode === "lines") {
        ctx.lineWidth = 0.6;
        for (let j = 0; j < rows; j++) {
          ctx.beginPath();
          for (let i = 0; i < cols; i++) {
            const x = offX + i * gap;
            const y = offY + j * gap;
            const dx = x - m.x;
            const dy = y - m.y;
            const d2 = dx * dx + dy * dy;
            let oy = 0;
            if (d2 < radius2) {
              const d = Math.sqrt(d2);
              const near = 1 - d / radius;
              oy = -Math.sin(near * Math.PI) * 18 * intensity * Math.sign(dy || 1);
            }
            if (i === 0) ctx.moveTo(x, y + oy);
            else ctx.lineTo(x, y + oy);
          }
          ctx.strokeStyle = fg + "0.14)";
          ctx.stroke();
        }
        for (let i = 0; i < cols; i++) {
          ctx.beginPath();
          for (let j = 0; j < rows; j++) {
            const x = offX + i * gap;
            const y = offY + j * gap;
            const dx = x - m.x;
            const dy = y - m.y;
            const d2 = dx * dx + dy * dy;
            let ox = 0;
            if (d2 < radius2) {
              const d = Math.sqrt(d2);
              const near = 1 - d / radius;
              ox = -Math.sin(near * Math.PI) * 18 * intensity * Math.sign(dx || 1);
            }
            if (j === 0) ctx.moveTo(x + ox, y);
            else ctx.lineTo(x + ox, y);
          }
          ctx.strokeStyle = fg + "0.14)";
          ctx.stroke();
        }
      } else if (mode === "ascii") {
        ctx.font = `${Math.max(10, gap * 0.6)}px "JetBrains Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const x = offX + i * gap;
            const y = offY + j * gap;
            const dx = x - m.x;
            const dy = y - m.y;
            const d2 = dx * dx + dy * dy;
            let charIdx = 0;
            let alpha = 0.16;
            if (d2 < radius2) {
              const d = Math.sqrt(d2);
              const near = 1 - d / radius;
              charIdx = Math.floor(near * (ASCII_CHARS.length - 1));
              alpha = 0.16 + near * 0.7;
            }
            const ch = ASCII_CHARS[charIdx];
            if (accent && d2 < radius2 && (1 - Math.sqrt(d2) / radius) > 0.55) {
              ctx.fillStyle = accentColor + alpha + ")";
            } else {
              ctx.fillStyle = fg + alpha + ")";
            }
            ctx.fillText(ch, x, y);
          }
        }
      } else if (mode === "halftone") {
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const x = offX + i * gap;
            const y = offY + j * gap;
            const dx = x - m.x;
            const dy = y - m.y;
            const d2 = dx * dx + dy * dy;
            let r = 0.6;
            if (d2 < radius2) {
              const d = Math.sqrt(d2);
              const near = 1 - d / radius;
              r = 0.6 + near * (gap * 0.45);
            }
            ctx.fillStyle = fg + "0.85)";
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (mode === "topo") {
        // concentric distance-field rings, distorted by cursor
        ctx.lineWidth = 0.5;
        const cx = w / 2;
        const cy = h / 2;
        for (let r = 30; r < Math.max(w, h); r += gap) {
          ctx.beginPath();
          const steps = 180;
          for (let s = 0; s <= steps; s++) {
            const a = (s / steps) * Math.PI * 2;
            let rr = r;
            const px0 = cx + Math.cos(a) * rr;
            const py0 = cy + Math.sin(a) * rr;
            const dx = px0 - m.x;
            const dy = py0 - m.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < radius2) {
              const d = Math.sqrt(d2);
              rr = r + (1 - d / radius) * 30 * intensity;
            }
            const px = cx + Math.cos(a) * rr;
            const py = cy + Math.sin(a) * rr;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = fg + "0.10)";
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [mode, density, intensity, invert, accent]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}

window.PatternBG = PatternBG;
