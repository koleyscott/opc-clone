import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

function clampNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normType(t) {
  return t === "P" ? "P" : "C";
}

function payoffAtPrice(leg, S) {
  const K = clampNumber(leg.strike, 0);
  const qty = clampNumber(leg.qty, 0);
  const side = leg.side === "SHORT" ? -1 : 1;
  const type = normType(leg.type);

  // Ignore premium for now since we don't have it in the UI yet.
  // This is intrinsic payoff only, which is still useful for shape and breakevens.
  let intrinsic = 0;
  if (type === "C") intrinsic = Math.max(0, S - K);
  else intrinsic = Math.max(0, K - S);

  return side * qty * intrinsic * 100;
}

function buildPayoffSeries(legs, spot) {
  const S0 = clampNumber(spot, 0);
  const center = S0 > 0 ? S0 : 100;

  const minS = Math.max(1, center * 0.5);
  const maxS = center * 1.5;
  const steps = 200;
  const step = (maxS - minS) / steps;

  const xs = [];
  const ys = [];

  for (let i = 0; i <= steps; i++) {
    const S = minS + step * i;
    let total = 0;
    for (const leg of legs) total += payoffAtPrice(leg, S);
    xs.push(S);
    ys.push(total);
  }

  return { xs, ys, minS, maxS };
}

function svgPathFromSeries(xs, ys, width, height, padding = 30) {
  if (!xs.length) return { path: "", bounds: null };

  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 0);

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const xToPx = (x) => padding + ((x - xMin) / (xMax - xMin)) * innerW;
  const yToPx = (y) => padding + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;

  let d = "";
  for (let i = 0; i < xs.length; i++) {
    const px = xToPx(xs[i]);
    const py = yToPx(ys[i]);
    d += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
  }

  // axis lines (y=0 and x=spot handled outside)
  const yZero = yToPx(0);

  return {
    path: d,
    bounds: { xMin, xMax, yMin, yMax, yZero, xToPx, yToPx },
  };
}

export default function App() {
  const [spot, setSpot] = useState(null);
  const [spotMeta, setSpotMeta] = useState(null);
  const [err, setErr] = useState(null);

  const [symbol, setSymbol] = useState("SPY");

  const [expirations, setExpirations] = useState([]);
  const [expErr, setExpErr] = useState(null);

  const [legs, setLegs] = useState([
    { id: crypto.randomUUID(), side: "LONG", type: "C", qty: 1, strike: 500, exp: "" },
  ]);

  // Fetch quote (works for market closed because backend returns last close)
  useEffect(() => {
    setErr(null);
    setSpot(null);
    setSpotMeta(null);

    fetch(`${API_BASE}/quote?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) setErr(d.error);
        else {
          setSpot(d.price);
          setSpotMeta(d);
        }
      })
      .catch((e) => setErr(String(e)));
  }, [symbol]);

  // Fetch expirations (optional, only if IB is connected)
  useEffect(() => {
    setExpErr(null);
    setExpirations([]);

    fetch(`${API_BASE}/options/expirations?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) setExpErr(d.error);
        else setExpirations(d.expirations || []);
      })
      .catch((e) => setExpErr(String(e)));
  }, [symbol]);

  const payoff = useMemo(() => buildPayoffSeries(legs, spot), [legs, spot]);
  const chart = useMemo(() => {
    const width = 900;
    const height = 360;
    const { xs, ys } = payoff;
    const { path, bounds } = svgPathFromSeries(xs, ys, width, height, 34);
    return { width, height, path, bounds };
  }, [payoff]);

  const totalAtSpot = useMemo(() => {
    const S = clampNumber(spot, 0);
    if (!S) return null;
    let total = 0;
    for (const leg of legs) total += payoffAtPrice(leg, S);
    return total;
  }, [legs, spot]);

  function addLeg() {
    setLegs((prev) => [
      ...prev,
      { id: crypto.randomUUID(), side: "LONG", type: "C", qty: 1, strike: clampNumber(spot, 500), exp: "" },
    ]);
  }

  function removeLeg(id) {
    setLegs((prev) => prev.filter((x) => x.id !== id));
  }

  function updateLeg(id, patch) {
    setLegs((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Arial, sans-serif", maxWidth: 1100 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Option Payoff Calculator (TEST)</h2>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 14 }}>
            Symbol{" "}
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              style={{ width: 90, padding: "6px 8px" }}
            />
          </label>
        </div>
      </div>

      <div style={{ marginTop: 10, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Spot</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {spot == null ? "loading..." : Number(spot).toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Mode</div>
            <div style={{ fontSize: 14 }}>
              {spotMeta?.source ? String(spotMeta.source) : err ? "error" : "loading"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Payoff at spot (intrinsic)</div>
            <div style={{ fontSize: 14 }}>{totalAtSpot == null ? "n/a" : totalAtSpot.toFixed(2)}</div>
          </div>

          <div style={{ flex: 1 }} />

          <button onClick={addLeg} style={{ padding: "8px 10px", cursor: "pointer" }}>
            Add leg
          </button>
        </div>

        {err ? (
          <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div>
        ) : null}
      </div>

      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Payoff Chart</div>

        <svg width={chart.width} height={chart.height} style={{ width: "100%", height: "auto" }}>
          <rect x="0" y="0" width={chart.width} height={chart.height} fill="white" />

          {chart.bounds ? (
            <>
              {/* y=0 axis */}
              <line
                x1="34"
                x2={chart.width - 34}
                y1={chart.bounds.yZero}
                y2={chart.bounds.yZero}
                stroke="#bbb"
                strokeWidth="1"
              />

              {/* spot vertical */}
              {spot != null ? (
                <line
                  x1={chart.bounds.xToPx(clampNumber(spot))}
                  x2={chart.bounds.xToPx(clampNumber(spot))}
                  y1="34"
                  y2={chart.height - 34}
                  stroke="#bbb"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              ) : null}

              <path d={chart.path} fill="none" stroke="black" strokeWidth="2" />

              {/* labels */}
              <text x="34" y={chart.height - 10} fontSize="12" fill="#333">
                {chart.bounds.xMin.toFixed(0)}
              </text>
              <text x={chart.width - 60} y={chart.height - 10} fontSize="12" fill="#333">
                {chart.bounds.xMax.toFixed(0)}
              </text>
              <text x="8" y="18" fontSize="12" fill="#333">
                Payoff
              </text>
            </>
          ) : null}
        </svg>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
          Intrinsic payoff only (premium not included yet). This still shows structure and breakeven shape.
        </div>
      </div>

      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Option Legs</div>
          {expErr ? (
            <div style={{ color: "crimson", fontSize: 12 }}>Expirations unavailable: {expErr}</div>
          ) : expirations.length ? (
            <div style={{ fontSize: 12, opacity: 0.75 }}>Loaded {expirations.length} expirations</div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.75 }}>No expirations loaded yet</div>
          )}
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: 8 }}>Side</th>
                <th style={{ padding: 8 }}>Type</th>
                <th style={{ padding: 8 }}>Qty</th>
                <th style={{ padding: 8 }}>Strike</th>
                <th style={{ padding: 8 }}>Expiry</th>
                <th style={{ padding: 8 }} />
              </tr>
            </thead>
            <tbody>
              {legs.map((leg) => (
                <tr key={leg.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                  <td style={{ padding: 8 }}>
                    <select
                      value={leg.side}
                      onChange={(e) => updateLeg(leg.id, { side: e.target.value })}
                      style={{ padding: 6 }}
                    >
                      <option value="LONG">Long</option>
                      <option value="SHORT">Short</option>
                    </select>
                  </td>

                  <td style={{ padding: 8 }}>
                    <select
                      value={leg.type}
                      onChange={(e) => updateLeg(leg.id, { type: e.target.value })}
                      style={{ padding: 6 }}
                    >
                      <option value="C">Call</option>
                      <option value="P">Put</option>
                    </select>
                  </td>

                  <td style={{ padding: 8 }}>
                    <input
                      type="number"
                      value={leg.qty}
                      min="0"
                      step="1"
                      onChange={(e) => updateLeg(leg.id, { qty: clampNumber(e.target.value, 0) })}
                      style={{ width: 90, padding: "6px 8px" }}
                    />
                  </td>

                  <td style={{ padding: 8 }}>
                    <input
                      type="number"
                      value={leg.strike}
                      step="0.5"
                      onChange={(e) => updateLeg(leg.id, { strike: clampNumber(e.target.value, 0) })}
                      style={{ width: 120, padding: "6px 8px" }}
                    />
                  </td>

                  <td style={{ padding: 8 }}>
                    <select
                      value={leg.exp}
                      onChange={(e) => updateLeg(leg.id, { exp: e.target.value })}
                      style={{ padding: 6, width: 160 }}
                    >
                      <option value="">(not set)</option>
                      {expirations.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td style={{ padding: 8 }}>
                    <button onClick={() => removeLeg(leg.id)} style={{ padding: "6px 10px", cursor: "pointer" }}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!legs.length ? (
                <tr>
                  <td colSpan="6" style={{ padding: 12, opacity: 0.75 }}>
                    No legs. Click “Add leg”.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
        Next improvements: include premium, implied vol, greeks, and real contract selection using expiry and strike.
      </div>
    </div>
  );
}
