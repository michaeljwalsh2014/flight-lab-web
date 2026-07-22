"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type PlaneRecord = { id: number; name: string; createdAt: string };
type ThrowRecord = { id: number; planeId: number; distance: number; createdAt: string };
type FlightBehavior = "straight" | "dives" | "stalls" | "left" | "right";
type MeasureStage = "ready" | "locating" | "walking";
type PhotoReport = { symmetry: number; headline: string; detail: string; steps: string[] };

const behaviorTips: Record<FlightBehavior, string> = {
  straight: "Your flight is stable. Make one small change at a time, then test it with three throws.",
  dives: "Bend both rear wing edges slightly upward. This adds elevator and helps the nose stay up.",
  stalls: "Flatten the rear wing edges a little or add a tiny paper clip to the nose to move weight forward.",
  left: "Line up both wings, then bend the left rear edge down a tiny amount to correct the turn.",
  right: "Line up both wings, then bend the right rear edge down a tiny amount to correct the turn.",
};

function distanceInFeet(start: GeolocationCoordinates, end: GeolocationCoordinates) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const deltaLatitude = radians(end.latitude - start.latitude);
  const deltaLongitude = radians(end.longitude - start.longitude);
  const latitude1 = radians(start.latitude);
  const latitude2 = radians(end.latitude);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 3.28084;
}

export default function Home() {
  const [planes, setPlanes] = useState<PlaneRecord[]>([]);
  const [activePlaneId, setActivePlaneId] = useState<number | null>(null);
  const [throws, setThrows] = useState<ThrowRecord[]>([]);
  const [planeModalOpen, setPlaneModalOpen] = useState(false);
  const [newPlaneName, setNewPlaneName] = useState("");
  const [measureOpen, setMeasureOpen] = useState(false);
  const [measureStage, setMeasureStage] = useState<MeasureStage>("ready");
  const [liveDistance, setLiveDistance] = useState(0);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [measureError, setMeasureError] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [behavior, setBehavior] = useState<FlightBehavior>("straight");
  const [report, setReport] = useState<PhotoReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const startPosition = useRef<GeolocationCoordinates | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    try {
      const savedPlanes = JSON.parse(window.localStorage.getItem("flight-lab-v2-planes") ?? "[]") as PlaneRecord[];
      const savedThrows = JSON.parse(window.localStorage.getItem("flight-lab-v2-throws") ?? "[]") as ThrowRecord[];
      setPlanes(savedPlanes);
      setThrows(savedThrows);
      setActivePlaneId(savedPlanes[0]?.id ?? null);
    } catch {
      window.localStorage.removeItem("flight-lab-v2-planes");
      window.localStorage.removeItem("flight-lab-v2-throws");
    }
  }, []);

  useEffect(() => { window.localStorage.setItem("flight-lab-v2-planes", JSON.stringify(planes)); }, [planes]);
  useEffect(() => { window.localStorage.setItem("flight-lab-v2-throws", JSON.stringify(throws)); }, [throws]);
  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const activePlane = planes.find((plane) => plane.id === activePlaneId) ?? null;
  const activeThrows = useMemo(() => throws.filter((item) => item.planeId === activePlaneId), [throws, activePlaneId]);
  const average = activeThrows.length ? activeThrows.reduce((sum, item) => sum + item.distance, 0) / activeThrows.length : 0;
  const best = activeThrows.length ? Math.max(...activeThrows.map((item) => item.distance)) : 0;

  function addPlane() {
    const name = newPlaneName.trim();
    if (!name) return;
    const plane = { id: Date.now(), name, createdAt: "Just now" };
    setPlanes((current) => [...current, plane]);
    setActivePlaneId(plane.id);
    setNewPlaneName("");
    setPlaneModalOpen(false);
  }

  function openMeasure() {
    if (!activePlane) {
      setPlaneModalOpen(true);
      return;
    }
    setMeasureOpen(true);
    setMeasureStage("ready");
    setMeasureError("");
    setLiveDistance(0);
    setLocationAccuracy(null);
  }

  function startMeasuring() {
    if (!navigator.geolocation) {
      setMeasureError("This device does not provide a location sensor to the browser.");
      return;
    }
    setMeasureStage("locating");
    setMeasureError("");
    navigator.geolocation.getCurrentPosition((position) => {
      startPosition.current = position.coords;
      setLocationAccuracy(position.coords.accuracy * 3.28084);
      setMeasureStage("walking");
      watchId.current = navigator.geolocation.watchPosition((next) => {
        if (!startPosition.current) return;
        setLocationAccuracy(next.coords.accuracy * 3.28084);
        setLiveDistance(distanceInFeet(startPosition.current, next.coords));
      }, () => setMeasureError("The location signal was lost. Move outdoors or closer to a window and try again."), {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      });
    }, () => {
      setMeasureStage("ready");
      setMeasureError("Location permission is needed for walk-to-measure. Allow it, then try again.");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }

  function finishMeasuring() {
    if (!activePlane || measureStage !== "walking") return;
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    if (liveDistance < 0.5) {
      setMeasureError("The sensor has not detected enough movement yet. Walk to the landing point, then mark it.");
      return;
    }
    setThrows((current) => [{
      id: Date.now(),
      planeId: activePlane.id,
      distance: Math.round(liveDistance * 10) / 10,
      createdAt: "Just now",
    }, ...current]);
    setMeasureOpen(false);
    setMeasureStage("ready");
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
    setPhotoName(file.name || "New plane photo");
    setReport(null);
    setSourceOpen(false);
  }

  async function analyzePhoto() {
    if (!photoUrl) { setSourceOpen(true); return; }
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
        let difference = 0;
        let samples = 0;
        for (let y = 10; y < 86; y += 2) for (let x = 7; x < 48; x += 2) {
          const left = (y * 96 + x) * 4;
          const right = (y * 96 + (95 - x)) * 4;
          const leftLight = pixels[left] * .3 + pixels[left + 1] * .59 + pixels[left + 2] * .11;
          const rightLight = pixels[right] * .3 + pixels[right + 1] * .59 + pixels[right + 2] * .11;
          difference += Math.abs(leftLight - rightLight);
          samples++;
        }
        resolve(Math.max(55, Math.min(96, Math.round(100 - (difference / samples) * .38))));
      };
      image.onerror = () => resolve(82);
      image.src = photoUrl;
    });
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    const balanced = symmetry >= 78;
    setReport({
      symmetry,
      headline: balanced ? "Strong wing balance" : "Fold alignment needs attention",
      detail: balanced ? "The left and right sides look visually consistent in this photo." : "The photo shows a noticeable left-to-right difference. Re-crease the center fold and compare both wing edges.",
      steps: [behaviorTips[behavior], balanced ? "Try widening both wings by 1 cm for more glide." : "Line up both wingtips and make the rear edges the same height.", "Measure three new throws and compare the average."],
    });
    setAnalyzing(false);
  }

  function closeMeasure() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setMeasureOpen(false);
    setMeasureStage("ready");
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Flight Lab home"><span className="brand-mark" aria-hidden="true">➤</span><span>Flight Lab</span></a>
        <nav aria-label="Main navigation"><a href="#hangar">My planes</a><a href="#performance">Performance</a><a href="#analyzer">Photo analyzer</a></nav>
        <button className="header-add" type="button" onClick={() => setPlaneModalOpen(true)}>＋ Add a plane</button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Ready for takeoff</p>
          <h1>Throw.<br />Measure. <em>Improve.</em></h1>
          <p className="lede">Create a plane, measure every flight as you walk to it, and turn your results into a better design.</p>
          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={openMeasure}><span aria-hidden="true">＋</span> Measure a throw</button>
            <button className="secondary-action" type="button" onClick={() => setPlaneModalOpen(true)}>Add a plane</button>
          </div>
        </div>
        <div className="flight-stage" aria-label="Paper airplane flight graphic">
          <div className="speed-lines" aria-hidden="true"><i /><i /><i /></div><div className="plane" aria-hidden="true"><span /></div>
          <div className="flight-number"><b>{activePlane ? activePlane.name : "No plane"}</b><span>{activePlane ? "ready to test" : "add your first plane"}</span></div>
        </div>
      </section>

      <section className="hangar" id="hangar">
        <div><p className="kicker">Your hangar</p><h2>My planes</h2></div>
        <button className="add-plane-card" type="button" onClick={() => setPlaneModalOpen(true)}><span>＋</span><b>Add a plane</b><small>Name a new design and start testing</small></button>
        {planes.map((plane) => <button key={plane.id} type="button" className={`plane-card ${activePlaneId === plane.id ? "selected" : ""}`} onClick={() => setActivePlaneId(plane.id)}><span className="mini-plane" aria-hidden="true">➤</span><b>{plane.name}</b><small>{throws.filter((item) => item.planeId === plane.id).length} throws</small></button>)}
      </section>

      <section className="performance" id="performance">
        <div className="section-heading"><div><p className="kicker">Current plane</p><h2>{activePlane?.name ?? "No plane yet"}</h2></div>{activePlane && planes.length > 1 && <select className="plane-select" value={activePlaneId ?? ""} onChange={(event) => setActivePlaneId(Number(event.target.value))} aria-label="Choose a plane">{planes.map((plane) => <option key={plane.id} value={plane.id}>{plane.name}</option>)}</select>}</div>
        <div className="stat-strip"><div><span>Average distance</span><b>{average.toFixed(1)} <small>ft</small></b></div><div><span>Best throw</span><b>{best.toFixed(1)} <small>ft</small></b></div><div><span>Throws logged</span><b>{activeThrows.length}</b></div><div className="trend"><span>Flight trend</span><b>{activeThrows.length >= 3 ? "↑ Tracking" : "Needs 3 throws"}</b></div></div>
        <div className="performance-grid">
          <article className="throw-card"><div className="card-title"><div><p className="kicker">Flight log</p><h3>Recent throws</h3></div><button onClick={openMeasure}>Measure throw</button></div>
            {activeThrows.length ? <ol className="throw-list">{activeThrows.slice(0, 5).map((item, index) => <li key={item.id}><span className="throw-rank">{String(index + 1).padStart(2, "0")}</span><span className="throw-bar"><i style={{ width: `${Math.max(18, (item.distance / Math.max(best, 1)) * 100)}%` }} /></span><b>{item.distance.toFixed(1)} ft</b><small>{item.createdAt}</small></li>)}</ol> : <div className="empty-state"><b>No throws yet</b><p>Your measurements will appear here after your first flight.</p><button type="button" onClick={openMeasure}>{activePlane ? "Measure first throw" : "Add a plane first"}</button></div>}
          </article>
          <aside className="coach-card"><span className="coach-label">Coach&apos;s next move</span><div className="coach-number">01</div><h3>{activeThrows.length >= 3 ? "Test one change" : "Build a baseline"}</h3><p>{activeThrows.length >= 3 ? "Change one fold, then measure three more throws to see if your average improves." : "Measure at least three throws with the same plane before changing the design."}</p><div className="test-plan"><span>Next test</span><b>{Math.max(0, 3 - activeThrows.length)} throws</b><small>needed for a useful average</small></div></aside>
        </div>
      </section>

      <section className="analyzer" id="analyzer">
        <div className="analyzer-intro"><p className="kicker">Camera feature</p><h2>Scan your plane.<br /><em>Find the next improvement.</em></h2><p>Take a new top-down picture or choose one from your photo library. Flight Lab checks left-to-right balance and combines it with the way the plane flew.</p><div className="photo-guides"><span>01 Flat surface</span><span>02 Camera overhead</span><span>03 Whole plane visible</span></div></div>
        <div className="scanner-card">
          <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={handlePhoto} aria-label="Take a photo of your paper airplane" />
          <input ref={libraryRef} className="sr-only" type="file" accept="image/*" onChange={handlePhoto} aria-label="Choose a photo of your paper airplane" />
          <div className={`photo-area ${photoUrl ? "has-photo" : ""}`}>{photoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={photoUrl} alt="Selected paper airplane" /> : <button type="button" onClick={() => setSourceOpen(true)}><span className="camera-icon" aria-hidden="true">CAM</span><b>Add a plane photo</b><small>Take a picture or choose from your library</small></button>}<span className="scan-corner top-left" /><span className="scan-corner top-right" /><span className="scan-corner bottom-left" /><span className="scan-corner bottom-right" /></div>
          {photoUrl && <div className="scanner-controls"><div className="file-row"><span>{photoName}</span><button type="button" onClick={() => setSourceOpen(true)}>Change photo</button></div><label htmlFor="behavior">What happened on the last flight?</label><select id="behavior" value={behavior} onChange={(event) => setBehavior(event.target.value as FlightBehavior)}><option value="straight">It flew mostly straight</option><option value="dives">It dives nose-first</option><option value="stalls">It climbs, then stalls</option><option value="left">It turns left</option><option value="right">It turns right</option></select><button type="button" className="analyze-button" onClick={analyzePhoto} disabled={analyzing}>{analyzing ? "Analyzing photo…" : "Analyze my plane"}</button></div>}
        </div>
        {report && <article className="report-card" aria-live="polite"><div className="report-score"><span>Photo balance signal</span><b>{report.symmetry}<small>/100</small></b></div><div className="report-copy"><p className="kicker">Analysis complete</p><h3>{report.headline}</h3><p>{report.detail}</p></div><ol>{report.steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol><p className="prototype-note">This prototype uses on-device image balance. Confirm every suggestion with repeated test throws.</p></article>}
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">➤</span><span>Flight Lab</span></a><p>Build. Test. Fly farther.</p></footer>

      {planeModalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setPlaneModalOpen(false); }}><section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="plane-title"><button className="modal-close" type="button" onClick={() => setPlaneModalOpen(false)} aria-label="Close">×</button><p className="kicker">Your hangar</p><h2 id="plane-title">Add a plane</h2><p>Give this paper airplane design a name. Its throws and average will be tracked separately.</p><label htmlFor="plane-name">Plane name</label><input className="name-input" autoFocus id="plane-name" value={newPlaneName} onChange={(event) => setNewPlaneName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addPlane(); }} placeholder="Example: Sky Dart" maxLength={32} /><button className="analyze-button" type="button" onClick={addPlane}>Add this plane</button></section></div>}

      {measureOpen && <div className="modal-backdrop"><section className="measure-modal" role="dialog" aria-modal="true" aria-labelledby="measure-title"><button className="modal-close" type="button" onClick={closeMeasure} aria-label="Close">×</button><p className="kicker">Walk-to-measure · {activePlane?.name}</p><h2 id="measure-title">Measure the throw</h2><div className={`measure-display ${measureStage === "walking" ? "active" : ""}`}><div className="measure-line"><span /><i /></div><b>{liveDistance.toFixed(1)} <small>ft</small></b><p>{measureStage === "ready" ? "Stand at the launch line with your device." : measureStage === "locating" ? "Finding your starting point…" : "Walk straight to where the plane first touched down."}</p></div>{locationAccuracy !== null && <p className="accuracy">Location accuracy: about ±{Math.round(locationAccuracy)} ft</p>}{measureError && <p className="measure-error">{measureError}</p>}<button className="analyze-button" type="button" onClick={measureStage === "walking" ? finishMeasuring : startMeasuring} disabled={measureStage === "locating"}>{measureStage === "walking" ? "Mark landing point & save" : measureStage === "locating" ? "Locating…" : "Set launch point"}</button><p className="sensor-note">Best outdoors with a clear sky view. The native iPad version can use AR for finer indoor measurement.</p></section></div>}

      {sourceOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSourceOpen(false); }}><section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title"><button className="modal-close" type="button" onClick={() => setSourceOpen(false)} aria-label="Close">×</button><p className="kicker">Plane photo</p><h2 id="source-title">How do you want to add it?</h2><button className="source-choice" type="button" onClick={() => cameraRef.current?.click()}><span>CAM</span><b>Take a photo</b><small>Open your camera now</small></button><button className="source-choice" type="button" onClick={() => libraryRef.current?.click()}><span>LIB</span><b>Choose from photo library</b><small>Select a photo you already took</small></button></section></div>}
    </main>
  );
}
