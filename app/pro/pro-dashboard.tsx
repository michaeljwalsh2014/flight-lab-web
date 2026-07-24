"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { detectObjects, inspectPlanePhoto, type ImageSignals } from "@/app/flight-lab-app";
import ProVideoLab from "./pro-video-lab";
import { AnalysisLoader, SpinningPlane } from "./pro-ui";

type PlaneKind = "dart" | "glider" | "stunt" | "custom";
type ThrowStrength = "gentle" | "normal" | "strong";
type AgeRange = "not-set" | "under-8" | "8-10" | "11-13" | "14-17" | "adult";
type FlightBehavior = "straight" | "dives" | "stalls" | "turns" | "wobbles" | "spirals";
type PlaneReport = {
  score: number;
  range: string;
  confidence: number;
  headline: string;
  detail: string;
  nextTest: string;
  signals: ImageSignals;
};

const unrelatedClasses = new Set([
  "person", "bird", "cat", "dog", "horse", "car", "motorcycle", "bus", "train",
  "truck", "bottle", "cup", "cell phone", "laptop", "teddy bear",
]);

const planeBaselines: Record<PlaneKind, number> = {
  dart: 38,
  glider: 34,
  stunt: 27,
  custom: 31,
};

const ageFactors: Record<AgeRange, number> = {
  "not-set": 1,
  "under-8": .68,
  "8-10": .8,
  "11-13": .93,
  "14-17": 1.02,
  adult: 1,
};

const strengthFactors: Record<ThrowStrength, number> = {
  gentle: .78,
  normal: 1,
  strong: 1.17,
};

const behaviorFactors: Record<FlightBehavior, number> = {
  straight: 1,
  dives: .78,
  stalls: .82,
  turns: .88,
  wobbles: .84,
  spirals: .72,
};

const nextTests: Record<FlightBehavior, string> = {
  straight: "Keep the folds unchanged and compare three launches at the same angle.",
  dives: "Bend both rear edges upward by about 2 mm, then repeat three level throws.",
  stalls: "Flatten the rear edges slightly and use a smoother, more level release.",
  turns: "Match both wingtips, then make one tiny adjustment on the outside rear edge.",
  wobbles: "Sharpen the center crease and check that both wings have the same stiffness.",
  spirals: "Flatten both wings and remove unequal curl from the wingtips before retesting.",
};

function ProPlaneCoach() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [planeKind, setPlaneKind] = useState<PlaneKind>("glider");
  const [ageRange, setAgeRange] = useState<AgeRange>("not-set");
  const [strength, setStrength] = useState<ThrowStrength>("normal");
  const [behavior, setBehavior] = useState<FlightBehavior>("straight");
  const [knownBest, setKnownBest] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [report, setReport] = useState<PlaneReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const throws = JSON.parse(window.localStorage.getItem("flight-lab-v2-throws") ?? "[]") as Array<{ distance?: number }>;
      const best = Math.max(0, ...throws.map((throwRecord) => Number(throwRecord.distance) || 0));
      if (best > 0) setKnownBest(best.toFixed(1));
    } catch {
      // A manual calibration can still be entered.
    }
  }, []);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a photo of one paper airplane.");
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
    setReport(null);
    setError("");
    event.target.value = "";
  }

  async function analyzePlane() {
    if (!photoUrl) {
      inputRef.current?.click();
      return;
    }
    setError("");
    setReport(null);
    setProgress(6);
    setStage("Preparing your plane");
    try {
      setProgress(16);
      setStage("Checking the photo");
      let detections: Awaited<ReturnType<typeof detectObjects>> = [];
      try {
        detections = await detectObjects(photoUrl);
      } catch {
        // Shape analysis continues when the optional object detector is unavailable.
      }
      const unrelated = detections.find((item) => unrelatedClasses.has(item.class) && item.score >= .58);
      if (unrelated) throw new Error(`The photo looks like it contains a ${unrelated.class}. Use a clear top-view photo of only the plane.`);

      setProgress(43);
      setStage("Measuring wings and folds");
      const signals = await inspectPlanePhoto(photoUrl);
      if (!signals.recognizable) throw new Error(signals.reason);

      setProgress(72);
      setStage("Calibrating throw power");
      const score = Math.round(Math.max(0, Math.min(100, signals.symmetry * .56 + signals.outline * .29 + signals.foldVisibility * .15)));
      const enteredBest = Number(knownBest);
      const base = enteredBest > 0
        ? enteredBest
        : planeBaselines[planeKind] * ageFactors[ageRange] * strengthFactors[strength];
      const designFactor = .88 + score / 710;
      const center = base * behaviorFactors[behavior] * designFactor;
      const uncertainty = enteredBest > 0 ? .12 : ageRange === "not-set" ? .24 : .18;
      const low = Math.max(5, Math.round(center * (1 - uncertainty)));
      const high = Math.max(low + 2, Math.round(center * (1 + uncertainty)));
      const confidence = Math.round(Math.max(38, Math.min(96,
        48 + (enteredBest > 0 ? 24 : 0) + (ageRange !== "not-set" ? 8 : 0) + signals.symmetry * .16,
      )));
      const headline = score >= 84
        ? "Strong build with real distance potential"
        : score >= 70
          ? "A solid plane with one useful adjustment"
          : "The scan found a fold worth correcting";
      const detail = enteredBest > 0
        ? `The estimate is anchored to your measured ${enteredBest.toFixed(1)} ft best, then adjusted for this scan and the reported flight behavior.`
        : "This estimate uses the plane style, optional age range, throw strength, scan quality, and reported flight behavior.";

      setProgress(93);
      setStage("Building your flight report");
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      setReport({
        score,
        range: `${low}–${high} ft`,
        confidence,
        headline,
        detail,
        nextTest: nextTests[behavior],
        signals,
      });
      setProgress(100);
      setStage("Report ready");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "The plane could not be analyzed.");
      setProgress(0);
      setStage("");
    }
  }

  const analyzing = progress > 0 && progress < 100 && !report;

  return (
    <section className="pro-tool-section" id="plane-coach">
      <div className="pro-tool-heading">
        <div><span className="pro-index">01</span><p>Pro plane intelligence</p><h2>Rate my plane</h2></div>
        <p>One top photo plus optional throw calibration creates a more personal, honest range estimate.</p>
      </div>
      <div className="pro-plane-grid">
        <div className="pro-upload-panel">
          <input ref={inputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={choosePhoto} aria-label="Choose a top-view plane photo" />
          <button type="button" className={`pro-photo-target ${photoUrl ? "has-photo" : ""}`} onClick={() => inputRef.current?.click()}>
            {photoUrl ? <img src={photoUrl} alt="Selected paper airplane from above" /> : <><span>TOP VIEW</span><b>Add your airplane</b><small>Use a plain background and include both wingtips</small></>}
            <i className="target-corner corner-a" /><i className="target-corner corner-b" /><i className="target-corner corner-c" /><i className="target-corner corner-d" />
          </button>
          <div className="pro-form-grid">
            <label>Plane style<select value={planeKind} onChange={(event) => setPlaneKind(event.target.value as PlaneKind)}><option value="dart">Distance dart</option><option value="glider">Wide glider</option><option value="stunt">Stunt plane</option><option value="custom">Custom design</option></select></label>
            <label>Last flight<select value={behavior} onChange={(event) => setBehavior(event.target.value as FlightBehavior)}><option value="straight">Mostly straight</option><option value="dives">Dived</option><option value="stalls">Stalled</option><option value="turns">Turned left or right</option><option value="wobbles">Wobbled</option><option value="spirals">Spiraled</option></select></label>
            <label>Age range · optional<select value={ageRange} onChange={(event) => setAgeRange(event.target.value as AgeRange)}><option value="not-set">Skip this</option><option value="under-8">7 or younger</option><option value="8-10">8–10</option><option value="11-13">11–13</option><option value="14-17">14–17</option><option value="adult">18+</option></select></label>
            <label>Throw strength<select value={strength} onChange={(event) => setStrength(event.target.value as ThrowStrength)}><option value="gentle">Gentle</option><option value="normal">Normal</option><option value="strong">Strong</option></select></label>
            <label className="span-two">Measured best · optional<div className="pro-unit-input"><input type="number" min="0" inputMode="decimal" value={knownBest} onChange={(event) => setKnownBest(event.target.value)} placeholder="Example: 51" /><span>feet</span></div><small>Using a real throw is more accurate than age alone.</small></label>
          </div>
          <button className="pro-command-button" type="button" onClick={analyzePlane} disabled={analyzing}>{analyzing ? "Analyzing…" : "AI · Rate my plane"}</button>
          {error && <p className="pro-inline-error" role="alert">{error}</p>}
        </div>
        <div className="pro-result-panel">
          {analyzing ? <AnalysisLoader progress={progress} label={stage} /> : report ? (
            <div className="pro-plane-report" aria-live="polite">
              <div className="pro-report-orbit"><SpinningPlane compact /></div>
              <span>Analysis complete · {report.confidence}% confidence</span>
              <h3>{report.headline}</h3>
              <div className="pro-range"><small>Predicted next flight</small><b>{report.range}</b></div>
              <p>{report.detail}</p>
              <div className="pro-signal-row"><span><b>{report.signals.symmetry}%</b> symmetry</span><span><b>{report.signals.outline}%</b> outline</span><span><b>{report.score}</b> build score</span></div>
              <div className="pro-next-test"><small>Next controlled test</small><b>{report.nextTest}</b></div>
              <p className="pro-honesty-note">Prediction is an estimate. A measured best throw greatly improves calibration.</p>
            </div>
          ) : (
            <div className="pro-empty-result"><SpinningPlane compact /><span>Personal flight model</span><h3>Your plane report will appear here.</h3><p>Add a top photo and any calibration you know. Flight Lab will show what affected the prediction instead of pretending the estimate is exact.</p></div>
          )}
        </div>
      </div>
    </section>
  );
}

type MeasureMode = "idle" | "calibrating" | "measuring";

function headingDistance(first: number, second: number) {
  const direct = Math.abs(first - second) % 360;
  return Math.min(direct, 360 - direct);
}

function ProSmartMeasure() {
  const [stride, setStride] = useState(0);
  const [calibrationDistance, setCalibrationDistance] = useState("20");
  const [steps, setSteps] = useState(0);
  const [mode, setMode] = useState<MeasureMode>("idle");
  const [sensorOn, setSensorOn] = useState(false);
  const [maxDrift, setMaxDrift] = useState(0);
  const [result, setResult] = useState<{ distance: number; confidence: number; drift: number } | null>(null);
  const [message, setMessage] = useState("");
  const motionArmed = useRef(true);
  const lastStepAt = useRef(0);
  const initialHeading = useRef<number | null>(null);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("flight-lab-pro-stride"));
    if (saved >= 1.1 && saved <= 4) setStride(saved);
  }, []);

  useEffect(() => {
    if (mode === "idle") return;
    const onMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration) return;
      const magnitude = Math.hypot(acceleration.x ?? 0, acceleration.y ?? 0, acceleration.z ?? 0);
      if (magnitude < 10.65) motionArmed.current = true;
      if (motionArmed.current && magnitude > 12.15 && Date.now() - lastStepAt.current > 330) {
        motionArmed.current = false;
        lastStepAt.current = Date.now();
        setSteps((current) => current + 1);
      }
    };
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha == null) return;
      if (initialHeading.current == null) initialHeading.current = event.alpha;
      setMaxDrift((current) => Math.max(current, headingDistance(initialHeading.current!, event.alpha!)));
    };
    window.addEventListener("devicemotion", onMotion);
    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, [mode]);

  async function requestSensors() {
    try {
      const motionEvent = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<PermissionState> };
      const orientationEvent = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<PermissionState> };
      const motionPermission = motionEvent.requestPermission ? await motionEvent.requestPermission() : "granted";
      const orientationPermission = orientationEvent.requestPermission ? await orientationEvent.requestPermission() : "granted";
      const allowed = motionPermission === "granted";
      setSensorOn(allowed);
      if (!allowed) setMessage("Automatic step counting is off. Use the + step button while you walk.");
    } catch {
      setSensorOn(false);
      setMessage("Automatic step counting is unavailable. Use the + step button while you walk.");
    }
  }

  async function begin(nextMode: Exclude<MeasureMode, "idle">) {
    setSteps(0);
    setResult(null);
    setMessage("");
    setMaxDrift(0);
    initialHeading.current = null;
    motionArmed.current = true;
    await requestSensors();
    setMode(nextMode);
  }

  function finishCalibration() {
    const knownDistance = Number(calibrationDistance);
    if (!steps || !knownDistance) {
      setMessage("Walk the known distance and count at least one step.");
      return;
    }
    const calibratedStride = knownDistance / steps;
    if (calibratedStride < 1.1 || calibratedStride > 4) {
      setMessage("That stride result looks unusual. Check the distance and step count, then try again.");
      return;
    }
    setStride(calibratedStride);
    window.localStorage.setItem("flight-lab-pro-stride", String(calibratedStride));
    setMode("idle");
    setMessage(`Calibration saved: ${calibratedStride.toFixed(2)} feet per step.`);
  }

  function finishMeasurement() {
    if (!steps || !stride) {
      setMessage(stride ? "Count at least one step before finishing." : "Calibrate your stride first.");
      return;
    }
    const distance = steps * stride;
    const driftPenalty = Math.min(28, maxDrift * .7);
    const confidence = Math.round(Math.max(55, Math.min(96, 94 - driftPenalty - (steps < 6 ? 8 : 0))));
    setResult({ distance, confidence, drift: maxDrift });
    setMode("idle");
    setMessage("");
  }

  const liveDistance = steps * (stride || 0);

  return (
    <section className="pro-tool-section pro-measure-section" id="smart-measure">
      <div className="pro-tool-heading">
        <div><span className="pro-index">03</span><p>Calibrated distance</p><h2>Smart Walk Measure</h2></div>
        <p>Teach Flight Lab your real stride once, then combine it with motion sensing and straight-line checks.</p>
      </div>
      <div className="smart-measure-grid">
        <div className="measure-control-card">
          <div className="calibration-status"><span>Personal calibration</span><b>{stride ? `${stride.toFixed(2)} ft / step` : "Not calibrated"}</b><i className={stride ? "ready" : ""} /></div>
          {mode === "idle" && !result && <>
            <label>Known calibration distance<div className="pro-unit-input"><input type="number" min="6" inputMode="decimal" value={calibrationDistance} onChange={(event) => setCalibrationDistance(event.target.value)} /><span>feet</span></div></label>
            <div className="measure-button-row"><button type="button" onClick={() => begin("calibrating")}>Calibrate stride</button><button type="button" className="primary" onClick={() => begin("measuring")} disabled={!stride}>Measure a throw</button></div>
          </>}
          {mode !== "idle" && <div className="active-measure">
            <span>{mode === "calibrating" ? `Walk exactly ${calibrationDistance} feet` : "Walk straight to the landing point"}</span>
            <b>{mode === "measuring" ? `${liveDistance.toFixed(1)} ft` : steps}</b>
            <small>{mode === "measuring" ? `${steps} calibrated steps` : `${steps} steps counted`} · {sensorOn ? "automatic counter on" : "manual counter"}</small>
            <div className="step-controls"><button type="button" onClick={() => setSteps((value) => Math.max(0, value - 1))}>−</button><button type="button" onClick={() => setSteps((value) => value + 1)}>＋ Step</button></div>
            <div className="straight-meter"><span>Walking line</span><i><b style={{ width: `${Math.max(4, 100 - Math.min(100, maxDrift * 2))}%` }} /></i><small>{maxDrift < 12 ? "Straight" : maxDrift < 28 ? "Slight drift" : "Turn detected"}</small></div>
            <button className="pro-command-button" type="button" onClick={mode === "calibrating" ? finishCalibration : finishMeasurement}>{mode === "calibrating" ? "Finish calibration" : "At airplane · finish"}</button>
          </div>}
          {result && <div className="measure-result">
            <span>Measured flight distance</span><b>{result.distance.toFixed(1)} <small>ft</small></b>
            <div><strong>{result.confidence}% confidence</strong><small>{result.drift < 15 ? "Straight walk detected" : `${Math.round(result.drift)}° direction change detected`}</small></div>
            <button type="button" onClick={() => setResult(null)}>Measure another</button>
          </div>}
          {message && <p className="measure-message">{message}</p>}
        </div>
        <aside className="measure-trust-card">
          <span>Why it is better</span>
          <ol><li><b>01</b><div><strong>Your real stride</strong><small>No generic height-based guess.</small></div></li><li><b>02</b><div><strong>Motion filtering</strong><small>Rejects quick shakes that do not look like steps.</small></div></li><li><b>03</b><div><strong>Direction check</strong><small>Lowers confidence when the walking path bends.</small></div></li></ol>
          <p>For official records, confirm with a tape or laser. Smart Measure reports confidence instead of claiming impossible precision.</p>
        </aside>
      </div>
    </section>
  );
}

function ExperimentLab() {
  const [problem, setProblem] = useState<FlightBehavior>("dives");
  const [goal, setGoal] = useState("distance");
  const plan = useMemo(() => {
    const change = nextTests[problem];
    const finish = goal === "distance"
      ? "Keep the version with the best three-throw average."
      : goal === "stability"
        ? "Keep the version with the smallest spread between all three throws."
        : "Keep the version that stays airborne longest without stalling.";
    return [change, "Throw the original design three times, then the changed design three times.", finish];
  }, [goal, problem]);

  return (
    <section className="pro-tool-section pro-experiment-section" id="experiment-lab">
      <div className="pro-tool-heading">
        <div><span className="pro-index">04</span><p>Controlled testing</p><h2>Experiment Builder</h2></div>
        <p>Change one thing, run a fair test, and know whether the plane actually improved.</p>
      </div>
      <div className="experiment-grid">
        <div className="experiment-controls">
          <label>Current problem<select value={problem} onChange={(event) => setProblem(event.target.value as FlightBehavior)}><option value="dives">Dives</option><option value="stalls">Stalls</option><option value="turns">Turns</option><option value="wobbles">Wobbles</option><option value="spirals">Spirals</option><option value="straight">Already flies straight</option></select></label>
          <label>Test goal<select value={goal} onChange={(event) => setGoal(event.target.value)}><option value="distance">More distance</option><option value="stability">More consistency</option><option value="airtime">More airtime</option></select></label>
        </div>
        <ol className="experiment-plan">{plan.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><b>{step}</b></li>)}</ol>
      </div>
    </section>
  );
}

export default function ProDashboard({
  displayName,
  sharedPass = false,
}: {
  displayName: string;
  sharedPass?: boolean;
}) {
  return (
    <main className="pro-dashboard">
      <header className="pro-nav">
        <a className="pro-brand" href="#pro-top"><span>➤</span><b>Flight Lab</b><em>PRO</em></a>
        <nav aria-label="Pro tools"><a href="#plane-coach">Plane AI</a><a href="#video-lab">Flight path</a><a href="#smart-measure">Smart Measure</a><a href="#experiment-lab">Experiments</a></nav>
        <a className="back-to-lab" href="/">Free Flight Lab</a>
      </header>

      <section className="pro-dashboard-hero" id="pro-top">
        <div className="pro-hero-copy">
          <div className="pro-access-pill"><i /><span>{sharedPass ? "Pro Pass active" : "Lifetime Pro active"}</span></div>
          <p>Flight intelligence for paper aircraft</p>
          <h1>See what your<br />plane is <em>really doing.</em></h1>
          <p className="pro-hero-lede">Track the full flight, rate the build, measure with personal calibration, and test one improvement at a time.</p>
          <div className="pro-hero-actions"><a href="#video-lab">Analyze a flight</a><a href="#plane-coach">Rate my plane</a></div>
          <small>{displayName} · Videos and photos are analyzed on this device.</small>
        </div>
        <div className="pro-hero-visual">
          <SpinningPlane />
          <div className="pro-visual-readout"><span>LIVE MODEL</span><b>Flight vector ready</b><small>Drag the finished path to inspect it from every angle.</small></div>
          <i className="visual-axis axis-x">X</i><i className="visual-axis axis-y">Y</i><i className="visual-axis axis-z">Z</i>
        </div>
      </section>

      <section className="pro-tool-deck" aria-label="Flight Lab Pro tools">
        <a href="#plane-coach"><span>01</span><b>Plane Intelligence</b><small>Personal range estimate</small></a>
        <a href="#video-lab"><span>02</span><b>3D Flight Tracker</b><small>Movable path analysis</small></a>
        <a href="#smart-measure"><span>03</span><b>Smart Measure</b><small>Calibrated walking distance</small></a>
        <a href="#experiment-lab"><span>04</span><b>Experiment Lab</b><small>Controlled improvement plan</small></a>
      </section>

      <ProPlaneCoach />
      <ProVideoLab displayName={displayName} />
      <ProSmartMeasure />
      <ExperimentLab />

      <footer className="pro-footer"><a className="pro-brand" href="#pro-top"><span>➤</span><b>Flight Lab</b><em>PRO</em></a><p>Build smarter. Track the truth. Fly farther.</p></footer>
    </main>
  );
}
