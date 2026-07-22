"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type PlaneRecord = { id: number; name: string; createdAt: string };
type ThrowRecord = { id: number; planeId: number; distance: number; createdAt: string };
type FlightBehavior = "straight" | "dives" | "stalls" | "left" | "right";
type MeasureStage = "ready" | "locating" | "walking";
type MeasureMethod = "choose" | "pace" | "gps" | "manual";
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
  const [measureMethod, setMeasureMethod] = useState<MeasureMethod>("choose");
  const [measureStage, setMeasureStage] = useState<MeasureStage>("ready");
  const [liveDistance, setLiveDistance] = useState(0);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [measureError, setMeasureError] = useState("");
  const [heightInches, setHeightInches] = useState(60);
  const [stepCount, setStepCount] = useState(0);
  const [motionCounterOn, setMotionCounterOn] = useState(false);
  const [manualFeet, setManualFeet] = useState("");
  const [manualInches, setManualInches] = useState("");
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
  const lastStepAt = useRef(0);
  const motionArmed = useRef(true);
  const motionListener = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const strideFeet = Math.max(1.25, Math.min(3.25, heightInches * 0.413 / 12));

  useEffect(() => {
    const loadSavedData = window.setTimeout(() => {
      try {
        const savedPlanes = JSON.parse(window.localStorage.getItem("flight-lab-v2-planes") ?? "[]") as PlaneRecord[];
        const savedThrows = JSON.parse(window.localStorage.getItem("flight-lab-v2-throws") ?? "[]") as ThrowRecord[];
        setPlanes(savedPlanes);
        setThrows(savedThrows);
        setActivePlaneId(savedPlanes[0]?.id ?? null);
        const savedHeight = Number(window.localStorage.getItem("flight-lab-v3-height"));
        if (savedHeight >= 36 && savedHeight <= 96) setHeightInches(savedHeight);
      } catch {
        window.localStorage.removeItem("flight-lab-v2-planes");
        window.localStorage.removeItem("flight-lab-v2-throws");
      }
    }, 0);
    return () => window.clearTimeout(loadSavedData);
  }, []);

  useEffect(() => { window.localStorage.setItem("flight-lab-v2-planes", JSON.stringify(planes)); }, [planes]);
  useEffect(() => { window.localStorage.setItem("flight-lab-v2-throws", JSON.stringify(throws)); }, [throws]);
  useEffect(() => { window.localStorage.setItem("flight-lab-v3-height", String(heightInches)); }, [heightInches]);
  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    if (motionListener.current) window.removeEventListener("devicemotion", motionListener.current);
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
    setMeasureMethod("choose");
    setMeasureStage("ready");
    setMeasureError("");
    setLiveDistance(0);
    setLocationAccuracy(null);
    setLocationDenied(false);
    setStepCount(0);
    setManualFeet("");
    setManualInches("");
  }

  function chooseMeasureMethod(method: MeasureMethod) {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    stopMotionCounter();
    setMeasureMethod(method);
    setMeasureStage("ready");
    setMeasureError("");
    setLiveDistance(0);
    setLocationAccuracy(null);
    setLocationDenied(false);
    setStepCount(0);
  }

  function updateSteps(nextCount: number) {
    const safeCount = Math.max(0, nextCount);
    setStepCount(safeCount);
    setLiveDistance(safeCount * strideFeet);
  }

  function stopMotionCounter() {
    if (motionListener.current) window.removeEventListener("devicemotion", motionListener.current);
    motionListener.current = null;
    setMotionCounterOn(false);
  }

  async function startPaceMeasuring() {
    setMeasureError("");
    setStepCount(0);
    setLiveDistance(0);
    setMeasureStage("walking");
    setMotionCounterOn(false);
    lastStepAt.current = 0;
    motionArmed.current = true;

    const motionEvent = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    try {
      const permission = motionEvent.requestPermission ? await motionEvent.requestPermission() : "granted";
      if (permission === "granted") {
        const listener = (event: DeviceMotionEvent) => {
          const acceleration = event.accelerationIncludingGravity;
          if (!acceleration) return;
          const x = acceleration.x ?? 0;
          const y = acceleration.y ?? 0;
          const z = acceleration.z ?? 0;
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          const now = Date.now();
          if (magnitude < 10.7) motionArmed.current = true;
          if (motionArmed.current && magnitude > 11.7 && now - lastStepAt.current > 330) {
            motionArmed.current = false;
            lastStepAt.current = now;
            setStepCount((current) => {
              const next = current + 1;
              setLiveDistance(next * strideFeet);
              return next;
            });
          }
        };
        motionListener.current = listener;
        window.addEventListener("devicemotion", listener);
        setMotionCounterOn(true);
      } else {
        setMeasureError("Automatic step counting was not allowed. Tap + STEP once for each step instead.");
      }
    } catch {
      setMeasureError("Automatic step counting is unavailable here. Tap + STEP once for each step instead.");
    }
  }

  function startMeasuring() {
    if (!navigator.geolocation) {
      setMeasureError("This device does not provide a location sensor to the browser.");
      return;
    }
    setMeasureStage("locating");
    setMeasureError("");
    setLocationDenied(false);
    startPosition.current = null;
    navigator.geolocation.getCurrentPosition((position) => {
      startPosition.current = position.coords;
      setLocationAccuracy(position.coords.accuracy * 3.28084);
      setMeasureStage("walking");
      watchId.current = navigator.geolocation.watchPosition((next) => {
        if (!startPosition.current) return;
        setLocationAccuracy(next.coords.accuracy * 3.28084);
        setLiveDistance(distanceInFeet(startPosition.current, next.coords));
      }, (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationDenied(true);
          setMeasureError("Safari blocked location access. Change this website's Location setting to Ask or Allow, then tap Try location again.");
        } else if (error.code === error.TIMEOUT) {
          setMeasureError("The GPS signal took too long. Move outdoors with a clear view of the sky, then try again.");
        } else {
          setMeasureError("The location signal was lost. Move outdoors or use Walk & count instead.");
        }
      }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      });
    }, (error) => {
      setMeasureStage("ready");
      if (error.code === error.PERMISSION_DENIED) {
        setLocationDenied(true);
        setMeasureError("Safari did not allow this website to use your location.");
      } else if (error.code === error.TIMEOUT) {
        setMeasureError("Safari allowed the request, but the GPS signal took too long. Move outdoors and try again.");
      } else {
        setMeasureError("Your iPad could not find a location right now. Move outdoors or use Walk & count instead.");
      }
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }

  function finishGpsMeasuring() {
    if (!activePlane || measureStage !== "walking") return;
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    if (liveDistance < 0.5) {
      setMeasureError("The sensor has not detected enough movement yet. Walk to the landing point, then mark it.");
      return;
    }
    saveMeasurement(liveDistance);
  }

  function saveMeasurement(distance: number) {
    if (!activePlane || distance < 0.1) {
      setMeasureError("Measure a distance before saving this throw.");
      return;
    }
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    stopMotionCounter();
    setThrows((current) => [{ id: Date.now(), planeId: activePlane.id, distance: Math.round(distance * 10) / 10, createdAt: "Just now" }, ...current]);
    setMeasureOpen(false);
    setMeasureMethod("choose");
    setMeasureStage("ready");
  }

  function saveManualMeasurement() {
    const total = (Number(manualFeet) || 0) + (Number(manualInches) || 0) / 12;
    saveMeasurement(total);
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
    stopMotionCounter();
    setMeasureOpen(false);
    setMeasureMethod("choose");
    setMeasureStage("ready");
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Flight Lab home"><span className="brand-mark" aria-hidden="true">➤</span><span>Flight Lab</span></a>
        <nav aria-label="Main navigation"><a href="#hangar">My planes</a><a href="#performance">Performance</a><a href="#analyzer">Photo analyzer</a><a href="#install">Install</a></nav>
        <button className="header-add" type="button" onClick={() => setPlaneModalOpen(true)}>＋ Add a plane</button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Ready for takeoff</p>
          <h1>Throw.<br />Measure. <em>Improve.</em></h1>
          <p className="lede">Create a plane, measure every flight from any phone or iPad, and turn your results into a better design. No download or account required.</p>
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
          <div className={`photo-area ${photoUrl ? "has-photo" : ""}`}>{photoUrl ? <img src={photoUrl} alt="Selected paper airplane" /> : <button type="button" onClick={() => setSourceOpen(true)}><span className="camera-icon" aria-hidden="true">CAM</span><b>Add a plane photo</b><small>Take a picture or choose from your library</small></button>}<span className="scan-corner top-left" /><span className="scan-corner top-right" /><span className="scan-corner bottom-left" /><span className="scan-corner bottom-right" /></div>
          {photoUrl && <div className="scanner-controls"><div className="file-row"><span>{photoName}</span><button type="button" onClick={() => setSourceOpen(true)}>Change photo</button></div><label htmlFor="behavior">What happened on the last flight?</label><select id="behavior" value={behavior} onChange={(event) => setBehavior(event.target.value as FlightBehavior)}><option value="straight">It flew mostly straight</option><option value="dives">It dives nose-first</option><option value="stalls">It climbs, then stalls</option><option value="left">It turns left</option><option value="right">It turns right</option></select><button type="button" className="analyze-button" onClick={analyzePhoto} disabled={analyzing}>{analyzing ? "Analyzing photo…" : "Analyze my plane"}</button></div>}
        </div>
        {report && <article className="report-card" aria-live="polite"><div className="report-score"><span>Photo balance signal</span><b>{report.symmetry}<small>/100</small></b></div><div className="report-copy"><p className="kicker">Analysis complete</p><h3>{report.headline}</h3><p>{report.detail}</p></div><ol>{report.steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol><p className="prototype-note">This prototype uses on-device image balance. Confirm every suggestion with repeated test throws.</p></article>}
      </section>

      <section className="install-section" id="install">
        <div>
          <p className="kicker">Use it like an app</p>
          <h2>Put Flight Lab on your Home Screen.</h2>
          <p>Open this website in Safari on an iPad or iPhone, tap the Share button, choose <b>Add to Home Screen</b>, turn on <b>Open as Web App</b>, and tap Add.</p>
        </div>
        <ol className="install-steps">
          <li><span>01</span><b>Open in Safari</b><small>Use the public Flight Lab link.</small></li>
          <li><span>02</span><b>Tap Share</b><small>It looks like a box with an up arrow.</small></li>
          <li><span>03</span><b>Add to Home Screen</b><small>Flight Lab gets its own icon.</small></li>
        </ol>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">➤</span><span>Flight Lab</span></a><p>Build. Test. Fly farther.</p></footer>

      {planeModalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setPlaneModalOpen(false); }}><section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="plane-title"><button className="modal-close" type="button" onClick={() => setPlaneModalOpen(false)} aria-label="Close">×</button><p className="kicker">Your hangar</p><h2 id="plane-title">Add a plane</h2><p>Give this paper airplane design a name. Its throws and average will be tracked separately.</p><label htmlFor="plane-name">Plane name</label><input className="name-input" autoFocus id="plane-name" value={newPlaneName} onChange={(event) => setNewPlaneName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addPlane(); }} placeholder="Example: Sky Dart" maxLength={32} /><button className="analyze-button" type="button" onClick={addPlane}>Add this plane</button></section></div>}

      {measureOpen && <div className="modal-backdrop"><section className="measure-modal" role="dialog" aria-modal="true" aria-labelledby="measure-title">
        <button className="modal-close" type="button" onClick={closeMeasure} aria-label="Close">×</button>
        <p className="kicker">Measure a throw · {activePlane?.name}</p>
        <h2 id="measure-title">{measureMethod === "choose" ? "Choose a measuring tool" : measureMethod === "pace" ? "Walk & count" : measureMethod === "gps" ? "Outdoor GPS" : "Enter a measured distance"}</h2>

        {measureMethod === "choose" && <>
          <p className="method-intro">Pick the method that fits where you are flying.</p>
          <div className="method-grid">
            <button className="method-choice recommended" type="button" onClick={() => chooseMeasureMethod("pace")}><span>STEP</span><b>Walk & count</b><small>Best indoors and for normal throws. Uses your steps—no location permission.</small><em>Recommended</em></button>
            <button className="method-choice" type="button" onClick={() => chooseMeasureMethod("gps")}><span>GPS</span><b>Outdoor GPS</b><small>Best outside for long throws with a clear sky view.</small></button>
            <button className="method-choice" type="button" onClick={() => chooseMeasureMethod("manual")}><span>RULER</span><b>Tape or Measure app</b><small>Most precise. Enter a reading from a tape or another measuring tool.</small></button>
          </div>
        </>}

        {measureMethod !== "choose" && <button className="method-back" type="button" onClick={() => chooseMeasureMethod("choose")}>← All measuring tools</button>}

        {measureMethod === "pace" && <>
          {measureStage === "ready" ? <>
            <label className="measure-label" htmlFor="height">Your height</label>
            <div className="height-input"><input id="height" type="number" min="36" max="96" inputMode="decimal" value={heightInches} onChange={(event) => setHeightInches(Math.max(36, Math.min(96, Number(event.target.value) || 36)))} /><span>inches</span></div>
            <p className="measurement-explainer">Flight Lab estimates each normal step at {strideFeet.toFixed(2)} feet. Stand at the launch line, tap Start, then walk normally to the plane.</p>
            <button className="analyze-button" type="button" onClick={startPaceMeasuring}>Start at launch line</button>
          </> : <>
            <div className="measure-display active"><div className="measure-line"><span /><i /></div><b>{liveDistance.toFixed(1)} <small>ft</small></b><p>{stepCount} steps counted · {motionCounterOn ? "automatic counter on" : "use the step buttons"}</p></div>
            <div className="step-controls"><button type="button" onClick={() => updateSteps(stepCount - 1)} aria-label="Remove one step">−</button><button className="add-step" type="button" onClick={() => updateSteps(stepCount + 1)}>＋ STEP</button></div>
            {measureError && <p className="measure-error">{measureError}</p>}
            <button className="analyze-button" type="button" onClick={() => saveMeasurement(liveDistance)} disabled={stepCount === 0}>At airplane — save throw</button>
            <p className="sensor-note">Watch the step number while you walk. Use + STEP or − to correct it before saving.</p>
          </>}
        </>}

        {measureMethod === "gps" && <>
          <div className={`measure-display ${measureStage === "walking" ? "active" : ""}`}><div className="measure-line"><span /><i /></div><b>{liveDistance.toFixed(1)} <small>ft</small></b><p>{measureStage === "ready" ? "Stand at the launch line outdoors." : measureStage === "locating" ? "Finding your starting point…" : "Walk straight to where the plane first touched down."}</p></div>
          {measureStage === "ready" && !measureError && <div className="permission-callout"><b>Safari will ask for location access</b><p>Tap the button below, then choose <strong>Allow</strong>. Flight Lab only uses your location while measuring this throw.</p></div>}
          {locationAccuracy !== null && <p className={`accuracy ${locationAccuracy > 15 ? "weak" : ""}`}>Location accuracy: about ±{Math.round(locationAccuracy)} ft{locationAccuracy > 15 ? " · Step measure will be better here" : ""}</p>}
          {measureError && <p className="measure-error">{measureError}</p>}
          {locationDenied && <div className="permission-help"><b>On the iPad:</b><span>Open this website&apos;s Page Menu → More → Website Settings → Location → Ask.</span></div>}
          <button className="analyze-button" type="button" onClick={measureStage === "walking" ? finishGpsMeasuring : startMeasuring} disabled={measureStage === "locating"}>{measureStage === "walking" ? "Mark landing point & save" : measureStage === "locating" ? "Waiting for Safari…" : locationDenied ? "Try location again" : "Allow location & set launch point"}</button>
          {measureError && <button className="gps-fallback" type="button" onClick={() => chooseMeasureMethod("pace")}>Use Walk & count instead</button>}
          <p className="sensor-note">GPS can drift by several feet. Use it outdoors for longer throws and check the accuracy shown above.</p>
        </>}

        {measureMethod === "manual" && <>
          <p className="measurement-explainer">Use a tape measure or the Measure app already on an iPad or iPhone, then save that reading here.</p>
          <div className="manual-distance"><label><span>Feet</span><input type="number" min="0" inputMode="decimal" value={manualFeet} onChange={(event) => setManualFeet(event.target.value)} placeholder="0" /></label><label><span>Inches</span><input type="number" min="0" max="11.9" inputMode="decimal" value={manualInches} onChange={(event) => setManualInches(event.target.value)} placeholder="0" /></label></div>
          {measureError && <p className="measure-error">{measureError}</p>}
          <button className="analyze-button" type="button" onClick={saveManualMeasurement}>Save throw</button>
        </>}
      </section></div>}

      {sourceOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSourceOpen(false); }}><section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title"><button className="modal-close" type="button" onClick={() => setSourceOpen(false)} aria-label="Close">×</button><p className="kicker">Plane photo</p><h2 id="source-title">How do you want to add it?</h2><button className="source-choice" type="button" onClick={() => cameraRef.current?.click()}><span>CAM</span><b>Take a photo</b><small>Open your camera now</small></button><button className="source-choice" type="button" onClick={() => libraryRef.current?.click()}><span>LIB</span><b>Choose from photo library</b><small>Select a photo you already took</small></button></section></div>}
    </main>
  );
}
