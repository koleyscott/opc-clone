import { useEffect, useState } from "react";

export default function App() {
  const [spot, setSpot] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/quote?symbol=SPY")
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) setErr(d.error);
        else setSpot(d.price);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Arial, sans-serif" }}>
      <h2>Backend connectivity test</h2>
      {err ? (
        <pre style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</pre>
      ) : (
        <div>SPY last close: {spot ?? "loading..."}</div>
      )}
    </div>
  );
}
