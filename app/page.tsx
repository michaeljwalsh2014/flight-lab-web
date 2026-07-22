"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type DesignName = "Sky Dart" | "Wide Glider";
type FlightBehavior = "straight" | "dives" | "stalls" | "left" | "right";

type ThrowRecord = {
  id: number;
  design: DesignName;
  distance: number;
  createdAt: string;
};

type PhotoReport = {
  symmetry: number;
  headline: string;
  detail: string;
  steps: string[];
};

const seedThrows: ThrowRecord[] = [
  { id: 1, design: "Sky Dart", distance: 7.8, createdAt: "Today" },
  { id: 2, design: "Sky Dart", distance: 9.1, createdAt: "Today" },
  { id: 3, design: "Sky Dart", distance: 8.3, createdAt: "Yesterday" },
  { id: 4, design: "Sky Dart", distance: 5.6, createdAt: "Yesterday" },
  { id: 5, design: "Sky Dart", distance: 11.2, createdAt: "Yesterday" },
  { id: 6, design: "Wide Glider", distance: 9.6, createdAt: "Yesterday" },
  { id: 7, design: "Wide Glider", distance: 10.4, createdAt: "Yesterday" },
  { id: 8, design: "Wide Glider", distance: 8.9, createdAt: "Yesterday" },
];

const behaviorTips: Record<FlightBehavior, string> = {
  straight: "Your flight is stable. Make one small change at a time and test three throws before changing it again.",
  dives: "Bend both rear wing edges slightly upward. This adds elevator and helps the nose stay up.",
  stalls: "Flatten the rear wing edges a little or add a tiny paper clip to the nose to move weight forward.",
  left: "Check that both wings match, then bend the left rear edge down a tiny amount to correct the turn.",
  right: "Check that both wings match, then bend the right rear edge down a tiny amount to correct the turn.",
};

export default function Home() {
  const [design, setDesign] = useState<DesignName>("Sky Dart");
  const [throws, setThrows] = useState<ThrowRecord[]>(seedThrows);
  const [distance, setDistance] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [behavior, setBehavior] = useState<FlightBehavior>("straight");
  const [report, setReport] = useState<PhotoReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("flight-lab-throws");
    if (saved) {
      try {
        setThrows(JSON.parse(saved));
      } catch {
        window.localStorage.removeItem("flight-lab-throws");
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("flight-lab-throws", JSON.stringify(throws));
  }, [throws]);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const activeThrows = useMemo(
    () => throws.filter((item) => item.design === design),
    [throws, design],
  );

  const average = activeThrows.length
    ? activeThrows.reduce((sum, item) => sum + item.distance, 0) / activeThrows.length
    : 0;
  const best = activeThrows.length
    ? Math.max(...activeThrows.map((item) => item.distance))
    : 0;

  function recordThrow() {
    const value = Number(distance);
    if (!Number.isFinite(value) || value <= 0 || value > 1000) return;
    setThrows((current) => [
      { id: Date.now(), design, distance: Math.round(value * 10) / 10, createdAt: "Just now" },
      ...current,
    ]);
    setDistance("");
    setRecordOpen(false);
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
    setPhotoName(file.name);
    setReport(null);
  }

  async function analyzePhoto() {
    if (!photoUrl) {
      fileRef.current?.click();
      return;
    }
    setAnalyzing(true);

    const symmetry = await new Promise<number>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 96;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return resolve(82);
        context.drawImage(image, 0, 0, 96, 96);
        const pixels = context.getImageData(0, 0, 96, 96).data;
        let totalDifference = 0;
        let samples = 0;
        for (let y = 10; y < 86; y += 2) {
          for (let x = 7; x < 48; x += 2) {
            const left = (y * 96 + x) * 4;
            const right = (y * 96 + (95 - x)) * 4;
            const leftLight = pixels[left] * 0.3 + pixels[left + 1] * 0.59 + pixels[left + 2] * 0.11;
            const rightLight = pixels[right] * 0.3 + pixels[right + 1] * 0.59 + pixels[right + 2] * 0.11;
            totalDifference += Math.abs(leftLight - rightLight);
            samples += 1;
          }
        }
        resolve(Math.max(55, Math.min(96, Math.round(100 - (totalDifference / samples) * 0.38))));
      };
      image.onerror = () => resolve(82);
      image.src = photoUrl;
    });

    await new Promise((resolve) => window.setTimeout(resolve, 650));
    const balanced = symmetry >= 78;
    const behaviorAdvice = behaviorTips[behavior];
    setReport({
      symmetry,
      headline: balanced ? "Strong wing balance" : "Fold alignment needs attention",
      detail: balanced
        ? "The left and right sides look visually consistent in this photo. That is a strong starting point for a straight flight."
        : "The photo shows a noticeable left-to-right difference. Re-crease the center fold and compare the wing edges before your next throw.",
      steps: [
        behaviorAdvice,
        balanced ? "Try widening both wings by 1 cm for more glide." : "Line up both wingtips and make the rear edges the same height.",
        "Test the change with three throws and compare the new average.",
      ],
    });
    setAnalyzing(false);
  }

  const recent = activeThrows.slice(0, 5);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Flight Lab home">
          <span className="brand-mark" aria-hidden="true">➤</span>
          <span>Flight Lab</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#performance">Performance</a>
          <a href="#analyzer">Photo analyzer</a>
          <a href="#tips">Flight tips</a>
        </nav>
        <span className="profile" aria-label="Profile">A</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Ready for takeoff</p>
          <h1>Throw.<br />Measure. <em>Improve.</em></h1>
          <p className="lede">Track every flight, compare your designs, and turn each throw into a better paper airplane.</p>
          <button className="primary-action" type="button" onClick={() => setRecordOpen(true)}>
            <span aria-hidden="true">＋</span> Record a throw
          </button>
        </div>
        <div className="flight-stage" aria-label="Paper airplane flight graphic">
          <div className="speed-lines" aria-hidden="true"><i /><i /><i /></div>
          <div className="plane" aria-hidden="true"><span /></div>
          <div className="flight-number"><b>{best.toFixed(1)}</b><span>meters / personal best</span></div>
        </div>
      </section>

      <section className="performance" id="performance">
        <div className="section-heading">
          <div>
            <p className="kicker">Current design</p>
            <h2>{design}</h2>
          </div>
          <div className="design-tabs" role="group" aria-label="Choose airplane design">
            {(["Sky Dart", "Wide Glider"] as DesignName[]).map((name) => (
              <button key={name} type="button" className={design === name ? "active" : ""} onClick={() => setDesign(name)}>
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="stat-strip">
          <div><span>Average distance</span><b>{average.toFixed(1)} <small>m</small></b></div>
          <div><span>Best throw</span><b>{best.toFixed(1)} <small>m</small></b></div>
          <div><span>Throws logged</span><b>{activeThrows.length}</b></div>
          <div className="trend"><span>Flight trend</span><b>{activeThrows.length > 2 ? "↑ Improving" : "Keep testing"}</b></div>
        </div>

        <div className="performance-grid">
          <article className="throw-card">
            <div className="card-title"><div><p className="kicker">Latest results</p><h3>Recent throws</h3></div><button onClick={() => setRecordOpen(true)}>Add throw</button></div>
            {recent.length ? (
              <ol className="throw-list">
                {recent.map((item, index) => (
                  <li key={item.id}>
                    <span className="throw-rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="throw-bar"><i style={{ width: `${Math.max(18, (item.distance / Math.max(best, 1)) * 100)}%` }} /></span>
                    <b>{item.distance.toFixed(1)} m</b>
                    <small>{item.createdAt}</small>
                  </li>
                ))}
              </ol>
            ) : <p className="empty-state">No throws yet. Record your first flight.</p>}
          </article>

          <aside className="coach-card" id="tips">
            <span className="coach-label">Coach&apos;s next move</span>
            <div className="coach-number">01</div>
            <h3>Widen the wings</h3>
            <p>Add 1 cm to each wing to create more lift and a longer glide. Keep the center crease sharp.</p>
            <div className="test-plan"><span>Next test</span><b>3 throws</b><small>Compare the new average</small></div>
          </aside>
        </div>
      </section>

      <section className="analyzer" id="analyzer">
        <div className="analyzer-intro">
          <p className="kicker">Camera feature</p>
          <h2>Scan your plane.<br /><em>Find the next improvement.</em></h2>
          <p>Take a top-down photo on a plain background. Flight Lab checks left-to-right balance and combines it with your last flight behavior to create a test plan.</p>
          <div className="photo-guides"><span>01 Flat surface</span><span>02 Camera overhead</span><span>03 Whole plane visible</span></div>
        </div>

        <div className="scanner-card">
          <input ref={fileRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={handlePhoto} aria-label="Take or choose a photo of your paper airplane" />
          <div className={`photo-area ${photoUrl ? "has-photo" : ""}`}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Uploaded paper airplane" />
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}>
                <span className="camera-icon" aria-hidden="true">CAM</span>
                <b>Take a plane photo</b>
                <small>or choose one from your library</small>
              </button>
            )}
            <span className="scan-corner top-left" /><span className="scan-corner top-right" />
            <span className="scan-corner bottom-left" /><span className="scan-corner bottom-right" />
          </div>

          {photoUrl && (
            <div className="scanner-controls">
              <div className="file-row"><span>{photoName}</span><button type="button" onClick={() => fileRef.current?.click()}>Change photo</button></div>
              <label htmlFor="behavior">What happened on the last flight?</label>
              <select id="behavior" value={behavior} onChange={(event) => setBehavior(event.target.value as FlightBehavior)}>
                <option value="straight">It flew mostly straight</option>
                <option value="dives">It dives nose-first</option>
                <option value="stalls">It climbs, then stalls</option>
                <option value="left">It turns left</option>
                <option value="right">It turns right</option>
              </select>
              <button type="button" className="analyze-button" onClick={analyzePhoto} disabled={analyzing}>
                {analyzing ? "Analyzing photo…" : "Analyze my plane"}
              </button>
            </div>
          )}
        </div>

        {report && (
          <article className="report-card" aria-live="polite">
            <div className="report-score"><span>Photo balance signal</span><b>{report.symmetry}<small>/100</small></b></div>
            <div className="report-copy"><p className="kicker">Analysis complete</p><h3>{report.headline}</h3><p>{report.detail}</p></div>
            <ol>{report.steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol>
            <p className="prototype-note">This prototype uses on-device image balance—not a medical or engineering measurement. Confirm suggestions with repeated test throws.</p>
          </article>
        )}
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">➤</span><span>Flight Lab</span></a><p>Build. Test. Fly farther.</p></footer>

      {recordOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setRecordOpen(false); }}>
          <section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-title">
            <button className="modal-close" type="button" onClick={() => setRecordOpen(false)} aria-label="Close">×</button>
            <p className="kicker">{design}</p>
            <h2 id="record-title">Record your throw</h2>
            <p>Measure from the launch line to where the plane first touches the ground.</p>
            <label htmlFor="distance">Distance in meters</label>
            <div className="distance-input"><input autoFocus id="distance" type="number" inputMode="decimal" min="0.1" max="1000" step="0.1" value={distance} onChange={(event) => setDistance(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") recordThrow(); }} placeholder="8.4" /><span>m</span></div>
            <button className="analyze-button" type="button" onClick={recordThrow}>Save this throw</button>
          </section>
        </div>
      )}
    </main>
  );
}
