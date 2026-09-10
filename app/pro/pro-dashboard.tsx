"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { detectObjects, inspectPlanePhoto, type ImageSignals } from "@/app/flight-lab-app";
import ProCoachChat from "./pro-coach-chat";
import { publishProAiContext, readProAiContext, type CoachTestMemory } from "./pro-ai-context";
import ProVideoLab from "./pro-video-lab";
import { AnalysisLoader } from "./pro-ui";
import { COACH_MODEL_NUMBER, COACH_MODEL_OPTIONS, useModelVersion } from "./model-version";
import ProViewCounter from "./pro-view-counter";

type PlaneKind = "dart" | "glider" | "stunt" | "custom";
type ThrowStrength = "gentle" | "normal" | "strong";
type AgeRange = "not-set" | "under-8" | "8-10" | "11-13" | "14-17" | "adult";
type FlightBehavior = "straight" | "dives" | "stalls" | "turns" | "wobbles" | "spirals";
type ScanMode = "quick" | "multiview";
type ScanView = "top" | "nose" | "left" | "right" | "underside" | "tail";
type VisionScanReport = {
  model?: string;
  recognizable: boolean;
  confidence: number;
  observations: string[];
  uncertainties: string[];
  issues: string[];
  symmetryScore: number;
  noseAlignment: "centered" | "left" | "right" | "uncertain";
  wingDihedral: "flat" | "slight" | "strong" | "uneven" | "uncertain";
  foldDefinition: "crisp" | "mixed" | "soft" | "uncertain";
  inspectionSummary: string;
};
type PlaneReport = {
  planeId: number | null;
  planeName: string;
  score: number;
  range: string;
  confidence: number;
  headline: string;
  detail: string;
  nextTest: string;
  recommendationId: string;
  evidence: string[];
  scanMode: ScanMode;
  viewCount: number;
  signals: ImageSignals;
  localViewsAnalyzed: number;
  deepInspection: "used" | "unavailable" | "off" | "not-applicable";
  vision: VisionScanReport | null;
};
type StoredPlane = {
  id: number;
  name: string;
  createdAt?: string;
  image?: string;
  preset?: "dart" | "glider" | "custom";
};
type StoredThrow = { id: number; planeId: number; distance: number; createdAt: string };

const proPlanePresets = [
  { id: "dart" as const, name: "Dart", image: "/plane-presets/dart.png", description: "Narrow wings for speed and distance" },
  { id: "glider" as const, name: "Glider", image: "/plane-presets/nakamura-lock.png", description: "Traditional locked nose with broad, balanced glider wings" },
];
const planesUpdatedEvent = "flight-lab-planes-updated";
const activePlaneStorageKey = "flight-lab-v2-active-plane-id";
const coachMemoryStorageKey = "flight-lab-pro-coach-tests-v1";
const planeReportsStorageKey = "flight-lab-pro-plane-reports-v1";

const scanViews: Array<{ id: ScanView; label: string; instruction: string }> = [
  { id: "top", label: "Top", instruction: "Camera directly above · nose pointing away · both wingtips visible" },
  { id: "nose", label: "Nose", instruction: "Move low and face the nose straight on" },
  { id: "left", label: "Left wing", instruction: "Circle to the left at about 45 degrees" },
  { id: "right", label: "Right wing", instruction: "Circle to the right at about 45 degrees" },
  { id: "underside", label: "Underside", instruction: "Turn the plane over and capture all folds" },
  { id: "tail", label: "Tail", instruction: "Capture the rear edges and wing angles" },
];

function photoToDataUrl(url: string, maxDimension = 760) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) { reject(new Error("This browser could not prepare the inspection photos.")); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", .76));
    };
    image.onerror = () => reject(new Error("One of the inspection photos could not be read."));
    image.src = url;
  });
}

const unrelatedClasses = new Set([
  "person", "bird", "cat", "dog", "horse", "car", "motorcycle", "bus", "train",
  "truck", "bottle", "cup", "cell phone", "laptop", "teddy bear",
]);

const planeBaselines: Record<PlaneKind, number> = {
  dart: 44,
  glider: 40,
  stunt: 29,
  custom: 34,
};

const ageFactors: Record<AgeRange, number> = {
  "not-set": 1,
  "under-8": .68,
  "8-10": .8,
  "11-13": .93,
  "14-17": 1.02,
  adult: 1,
};

const strengthFactorsByPlane: Record<PlaneKind, Record<ThrowStrength, number>> = {
  dart: { gentle: .74, normal: 1, strong: 1.34 },
  glider: { gentle: 1.08, normal: 1, strong: .82 },
  stunt: { gentle: .9, normal: 1, strong: .94 },
  custom: { gentle: .84, normal: 1, strong: 1.12 },
};

const behaviorFactors: Record<FlightBehavior, number> = {
  straight: 1,
  dives: .78,
  stalls: .82,
  turns: .88,
  wobbles: .84,
  spirals: .72,
};

const testOptions: Record<FlightBehavior, string[]> = {
  straight: [
    "Keep the folds unchanged and compare three launches at the same angle.",
    "Keep the design fixed and compare three slightly gentler, level releases.",
    "Mark the launch line and test three throws with the nose held exactly level.",
  ],
  dives: [
    "Bend both rear edges upward by about 2 mm, then repeat three level throws.",
    "Move the center of lift back by raising both rear edges only 1 mm, then test three throws.",
    "Leave the folds alone and compare three gentler, level releases before adding more elevator.",
  ],
  stalls: [
    "Flatten the rear edges slightly and use a smoother, more level release.",
    "Reduce both elevator bends by about 1 mm, then repeat three level throws.",
    "Keep the folds fixed and lower the launch angle for three comparable throws.",
  ],
  turns: [
    "Match both wingtips, then make one tiny adjustment on the outside rear edge.",
    "Rest the plane at eye level and flatten only the higher wingtip, then test three throws.",
    "Refold the wings together so their trailing edges match, then repeat three level throws.",
  ],
  wobbles: [
    "Sharpen the center crease and check that both wings have the same stiffness.",
    "Flatten unequal wingtip curl without changing the main wing angle, then test three throws.",
    "Use a gentler release for three throws to separate launch wobble from fold wobble.",
  ],
  spirals: [
    "Flatten both wings and remove unequal curl from the wingtips before retesting.",
    "Match the two rear edges exactly and test three throws without changing the nose.",
    "Check the center crease for twist, correct only that twist, then repeat three throws.",
  ],
};

const nextTests = Object.fromEntries(Object.entries(testOptions).map(([key, options]) => [key, options[0]])) as Record<FlightBehavior, string>;

function readCoachMemory(): CoachTestMemory[] {
  try {
    return JSON.parse(window.localStorage.getItem(coachMemoryStorageKey) ?? "[]") as CoachTestMemory[];
  } catch {
    return [];
  }
}

function chooseFreshTest(behavior: FlightBehavior, planeId: number | null) {
  const used = new Set(readCoachMemory().filter((item) => item.planeId === planeId).map((item) => item.action));
  return testOptions[behavior].find((option) => !used.has(option)) ?? testOptions[behavior][used.size % testOptions[behavior].length];
}

function getScanClientId() {
  const key = "flight-lab-pro-coach-id";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, value);
  }
  return value;
}

function ProPlaneHangar() {
  const [planes, setPlanes] = useState<StoredPlane[]>([]);
  const [throws, setThrows] = useState<StoredThrow[]>([]);
  const [activePlaneId, setActivePlaneId] = useState<number | null>(null);
  const [presetId, setPresetId] = useState<"dart" | "glider">("dart");
  const [planeName, setPlaneName] = useState("Dart");
  const [hangarNotice, setHangarNotice] = useState("");
  const activePlane = planes.find((plane) => plane.id === activePlaneId) ?? null;
  const activeThrows = throws.filter((item) => item.planeId === activePlaneId);
  const activeAverage = activeThrows.length ? activeThrows.reduce((sum, item) => sum + item.distance, 0) / activeThrows.length : 0;
  const activeBest = activeThrows.length ? Math.max(...activeThrows.map((item) => item.distance)) : 0;

  useEffect(() => {
    const loadSavedData = () => {
      try {
        const savedPlanes = JSON.parse(window.localStorage.getItem("flight-lab-v2-planes") ?? "[]") as StoredPlane[];
        const savedThrows = JSON.parse(window.localStorage.getItem("flight-lab-v2-throws") ?? "[]") as StoredThrow[];
        const seenEmptyPlanes = new Set<string>();
        const keysWithFlights = new Set(savedPlanes.filter((plane) => savedThrows.some((item) => item.planeId === plane.id)).map((plane) => `${plane.preset ?? "custom"}:${plane.name.trim().toLowerCase()}`));
        const cleanedPlanes = savedPlanes.filter((plane) => {
          const hasFlights = savedThrows.some((item) => item.planeId === plane.id);
          const key = `${plane.preset ?? "custom"}:${plane.name.trim().toLowerCase()}`;
          if (hasFlights) return true;
          if (keysWithFlights.has(key) || seenEmptyPlanes.has(key)) return false;
          seenEmptyPlanes.add(key);
          return true;
        });
        const savedActivePlaneId = Number(window.localStorage.getItem(activePlaneStorageKey));
        setPlanes(cleanedPlanes);
        setThrows(savedThrows);
        const nextActivePlaneId = cleanedPlanes.some((plane) => plane.id === savedActivePlaneId) ? savedActivePlaneId : cleanedPlanes[0]?.id ?? null;
        setActivePlaneId(nextActivePlaneId);
        if (cleanedPlanes.length !== savedPlanes.length) {
          window.localStorage.setItem("flight-lab-v2-planes", JSON.stringify(cleanedPlanes));
          if (nextActivePlaneId === null) window.localStorage.removeItem(activePlaneStorageKey);
          else window.localStorage.setItem(activePlaneStorageKey, String(nextActivePlaneId));
          setHangarNotice(`${savedPlanes.length - cleanedPlanes.length} empty duplicate ${savedPlanes.length - cleanedPlanes.length === 1 ? "plane was" : "planes were"} removed from this device.`);
        }
      } catch {
        setPlanes([]);
        setThrows([]);
        setActivePlaneId(null);
      }
    };
    loadSavedData();
    window.addEventListener(planesUpdatedEvent, loadSavedData);
    return () => window.removeEventListener(planesUpdatedEvent, loadSavedData);
  }, []);

  function saveHangar(nextPlanes: StoredPlane[], nextThrows: StoredThrow[], nextActivePlaneId: number | null) {
    setPlanes(nextPlanes);
    setThrows(nextThrows);
    setActivePlaneId(nextActivePlaneId);
    window.localStorage.setItem("flight-lab-v2-planes", JSON.stringify(nextPlanes));
    window.localStorage.setItem("flight-lab-v2-throws", JSON.stringify(nextThrows));
    if (nextActivePlaneId === null) window.localStorage.removeItem(activePlaneStorageKey);
    else window.localStorage.setItem(activePlaneStorageKey, String(nextActivePlaneId));
    window.dispatchEvent(new CustomEvent(planesUpdatedEvent, { detail: nextPlanes }));
  }

  function selectPlane(planeId: number) {
    saveHangar(planes, throws, planeId);
  }

  function choosePreset(preset: typeof proPlanePresets[number]) {
    const currentPresetName = proPlanePresets.find((item) => item.id === presetId)?.name;
    setPresetId(preset.id);
    if (!planeName.trim() || planeName === currentPresetName) setPlaneName(preset.name);
  }

  function addPlane() {
    const preset = proPlanePresets.find((item) => item.id === presetId) ?? proPlanePresets[0];
    const nextName = planeName.trim() || preset.name;
    const duplicate = planes.find((item) => item.preset === preset.id && item.name.trim().toLowerCase() === nextName.toLowerCase());
    if (duplicate) {
      selectPlane(duplicate.id);
      setHangarNotice(`${duplicate.name} is already saved on this device. Rename it first if this is a different plane.`);
      return;
    }
    const plane: StoredPlane = {
      id: Date.now(),
      name: nextName,
      createdAt: "Just now",
      image: preset.image,
      preset: preset.id,
    };
    const nextPlanes = [plane, ...planes];
    saveHangar(nextPlanes, throws, plane.id);
    setPlaneName(preset.name);
    setHangarNotice(`${plane.name} was saved on this device.`);
  }

  function clearHangar() {
    if (!window.confirm("Remove every saved plane, flight, scan report, and coach test from this device? This cannot be undone.")) return;
    saveHangar([], [], null);
    window.localStorage.removeItem(planeReportsStorageKey);
    window.localStorage.removeItem(coachMemoryStorageKey);
    setHangarNotice("The hangar is empty. Nothing from another visitor was stored here.");
  }

  function deletePlane(plane: StoredPlane) {
    const flightCount = throws.filter((item) => item.planeId === plane.id).length;
    const historyNote = flightCount === 1 ? " and its 1 saved flight" : flightCount > 1 ? ` and its ${flightCount} saved flights` : "";
    if (!window.confirm(`Delete ${plane.name}${historyNote}? This cannot be undone.`)) return;
    const nextPlanes = planes.filter((item) => item.id !== plane.id);
    const nextThrows = throws.filter((item) => item.planeId !== plane.id);
    const nextActivePlaneId = activePlaneId === plane.id ? nextPlanes[0]?.id ?? null : activePlaneId;
    saveHangar(nextPlanes, nextThrows, nextActivePlaneId);
  }

  return (
    <section className="pro-tool-section pro-hangar-section" id="plane-hangar">
      <div className="pro-tool-heading">
        <div><span className="pro-index">PLANES</span><p>Your shared hangar</p><h2>Add a plane</h2></div>
        <p>Planes added here also appear in normal Flight Lab. They are saved only in this browser on this device—not to the public site or other visitors.</p>
      </div>
      <div className="pro-hangar-grid">
        <div className="pro-preset-picker" aria-label="Choose a plane design">
          {proPlanePresets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={presetId === preset.id ? "selected" : ""}
              onClick={() => choosePreset(preset)}
              aria-pressed={presetId === preset.id}
            >
              <img src={preset.image} alt={`${preset.name} paper airplane`} />
              <span><b>{preset.name}</b><small>{preset.description}</small></span>
            </button>
          ))}
        </div>
        <div className="pro-plane-builder">
          <label>Plane name<input value={planeName} onChange={(event) => setPlaneName(event.target.value)} maxLength={32} onKeyDown={(event) => { if (event.key === "Enter") addPlane(); }} /></label>
          <button className="pro-command-button" type="button" onClick={addPlane}>＋ Add {presetId === "dart" ? "Dart" : "Glider"}</button>
          {hangarNotice && <p className="pro-hangar-notice" role="status">{hangarNotice}</p>}
          <div className="pro-saved-planes">
            <div className="pro-saved-header"><span>{planes.length ? `${planes.length} saved on this device` : "No planes saved on this device"}</span>{planes.length ? <button type="button" onClick={clearHangar}>Clear hangar</button> : null}</div>
            {planes.map((plane) => (
              <div className={`pro-saved-plane ${activePlaneId === plane.id ? "selected" : ""}`} key={plane.id}>
                <button type="button" className="pro-plane-select" onClick={() => selectPlane(plane.id)} aria-pressed={activePlaneId === plane.id}>
                  {plane.image ? <img src={plane.image} alt="" /> : null}
                  <span><b>{plane.name}</b><small>{throws.filter((item) => item.planeId === plane.id).length} throws · {activePlaneId === plane.id ? "Current plane" : "Select this plane"}</small></span>
                </button>
                <button type="button" className="pro-plane-delete" onClick={() => deletePlane(plane)} aria-label={`Delete ${plane.name}`}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {activePlane ? <div className="pro-active-plane-bar" aria-live="polite">
        <img src={activePlane.image ?? "/plane-presets/dart.png"} alt="" />
        <div><span>Current plane · every new measurement and AI report goes here</span><h3>{activePlane.name}</h3></div>
        <dl><div><dt>Throws</dt><dd>{activeThrows.length}</dd></div><div><dt>Average</dt><dd>{activeAverage.toFixed(1)} ft</dd></div><div><dt>Best</dt><dd>{activeBest.toFixed(1)} ft</dd></div></dl>
        <a href="#smart-measure">Measure {activePlane.name}</a>
      </div> : null}
    </section>
  );
}

function ProPlaneCoach() {
  const [selectedModel, chooseModel] = useModelVersion();
  const useGemini = selectedModel === "v40";
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingViewRef = useRef<ScanView>("top");
  const [scanMode, setScanMode] = useState<ScanMode>("quick");
  const [scanPhotos, setScanPhotos] = useState<Partial<Record<ScanView, string>>>({});
  const [planes, setPlanes] = useState<StoredPlane[]>([]);
  const [throws, setThrows] = useState<StoredThrow[]>([]);
  const [activePlaneId, setActivePlaneId] = useState<number | null>(null);
  const [planeKind, setPlaneKind] = useState<PlaneKind>("glider");
  const [ageRange, setAgeRange] = useState<AgeRange>("not-set");
  const [strength, setStrength] = useState<ThrowStrength>("normal");
  const [behavior, setBehavior] = useState<FlightBehavior>("straight");
  const [knownBest, setKnownBest] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [report, setReport] = useState<PlaneReport | null>(null);
  const [testOutcome, setTestOutcome] = useState<CoachTestMemory["result"] | null>(null);
  const [cloudVisionEnabled, setCloudVisionEnabled] = useState(true);
  const [error, setError] = useState("");
  const activePlane = planes.find((plane) => plane.id === activePlaneId) ?? null;
  const activeThrows = throws.filter((item) => item.planeId === activePlaneId);
  const capturedViews = scanViews.filter((view) => scanPhotos[view.id]);
  const requiredViews = scanMode === "quick" ? scanViews.slice(0, 1) : scanViews;

  useEffect(() => { setReport(null); setTestOutcome(null); setError(""); }, [selectedModel]);

  useEffect(() => {
    const loadSavedData = () => {
      try {
        const nextPlanes = JSON.parse(window.localStorage.getItem("flight-lab-v2-planes") ?? "[]") as StoredPlane[];
        const nextThrows = JSON.parse(window.localStorage.getItem("flight-lab-v2-throws") ?? "[]") as StoredThrow[];
        const savedId = Number(window.localStorage.getItem(activePlaneStorageKey));
        const nextId = nextPlanes.some((plane) => plane.id === savedId) ? savedId : nextPlanes[0]?.id ?? null;
        setPlanes(nextPlanes);
        setThrows(nextThrows);
        setActivePlaneId(nextId);
      } catch {
        setPlanes([]); setThrows([]); setActivePlaneId(null);
      }
    };
    loadSavedData();
    window.addEventListener(planesUpdatedEvent, loadSavedData);
    return () => window.removeEventListener(planesUpdatedEvent, loadSavedData);
  }, []);

  useEffect(() => {
    if (!activePlane) { setKnownBest(""); return; }
    const distances = throws.filter((item) => item.planeId === activePlane.id).map((item) => item.distance);
    setKnownBest(distances.length ? Math.max(...distances).toFixed(1) : "");
    setPlaneKind(activePlane.preset === "dart" || activePlane.preset === "glider" ? activePlane.preset : "custom");
    setScanPhotos({}); setReport(null); setTestOutcome(null);
  }, [activePlaneId, planes, throws]);

  useEffect(() => {
    if (!report) return;
    const memory = readCoachMemory().filter((item) => item.planeId === report.planeId).slice(-8);
    publishProAiContext({
      plane: {
        planeId: report.planeId, planeName: report.planeName, score: report.score, range: report.range,
        confidence: report.confidence, headline: report.headline, nextTest: report.nextTest,
        recommendationId: report.recommendationId, evidence: report.evidence,
        symmetry: report.signals.symmetry, outline: report.signals.outline, planeStyle: planeKind, ageRange, throwStrength: strength,
        lastFlight: behavior, scanMode: report.scanMode, viewCount: report.viewCount,
        localViewsAnalyzed: report.localViewsAnalyzed,
        deepInspection: report.deepInspection,
        vision: report.vision ? {
          source: report.vision.model ?? "gpt-5.6-terra-vision", confidence: report.vision.confidence,
          observations: report.vision.observations, issues: report.vision.issues,
          uncertainties: report.vision.uncertainties, noseAlignment: report.vision.noseAlignment,
          wingDihedral: report.vision.wingDihedral, foldDefinition: report.vision.foldDefinition,
        } : undefined,
      },
      coachMemory: memory,
    });
  }, [ageRange, behavior, planeKind, report, strength]);

  function selectActivePlane(planeId: number) {
    setActivePlaneId(planeId);
    window.localStorage.setItem(activePlaneStorageKey, String(planeId));
    window.dispatchEvent(new CustomEvent(planesUpdatedEvent));
  }

  function requestView(view: ScanView) {
    pendingViewRef.current = view;
    inputRef.current?.click();
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose a photo of one paper airplane."); return; }
    const view = pendingViewRef.current;
    const previous = scanPhotos[view];
    if (previous) URL.revokeObjectURL(previous);
    setScanPhotos((current) => ({ ...current, [view]: URL.createObjectURL(file) }));
    setReport(null); setTestOutcome(null); setError("");
    event.target.value = "";
  }

  function recordOutcome(result: CoachTestMemory["result"]) {
    if (!report) return;
    const item: CoachTestMemory = { planeId: report.planeId, recommendationId: report.recommendationId, action: report.nextTest, result, createdAt: new Date().toISOString() };
    const next = [...readCoachMemory(), item].slice(-40);
    window.localStorage.setItem(coachMemoryStorageKey, JSON.stringify(next));
    setTestOutcome(result);
    publishProAiContext({ coachMemory: next.filter((entry) => entry.planeId === report.planeId).slice(-8) });
  }

  async function analyzePlane() {
    const topPhoto = scanPhotos.top;
    if (!topPhoto) { requestView("top"); return; }
    const missing = requiredViews.filter((view) => !scanPhotos[view.id]);
    if (missing.length) { setError(`Finish the guided scan: add ${missing.map((view) => view.label.toLowerCase()).join(", ")}.`); return; }
    setError(""); setReport(null); setTestOutcome(null); setProgress(6); setStage("Verifying the airplane");
    try {
      let detections: Awaited<ReturnType<typeof detectObjects>> = [];
      if (!useGemini) {
        try { detections = await detectObjects(topPhoto); } catch { /* Local shape analysis remains available. */ }
      }
      const unrelated = detections.find((item) => unrelatedClasses.has(item.class) && item.score >= .58);
      if (unrelated && !useGemini) throw new Error(`The top view appears to contain a ${unrelated.class}. Use a plain surface with only the airplane in frame.`);
      setProgress(34); setStage("Measuring wing symmetry and fold geometry");
      const signals = await inspectPlanePhoto(topPhoto);
      if (!signals.recognizable && !useGemini) throw new Error(signals.reason);
      setProgress(52); setStage(scanMode === "multiview" ? "Comparing visible details across six photos" : "Finishing the top-view measurements");
      const localViewSignals = scanMode === "multiview"
        ? (await Promise.all(scanViews.map(async (view) => {
            try {
              const result = await inspectPlanePhoto(scanPhotos[view.id]!);
              return result.recognizable ? result : null;
            } catch { return null; }
          }))).filter((item): item is ImageSignals => Boolean(item))
        : [signals];
      const localViewsAnalyzed = localViewSignals.length;
      let vision: VisionScanReport | null = null;
      let deepInspection: PlaneReport["deepInspection"] = useGemini ? "unavailable" : scanMode === "quick" ? "not-applicable" : cloudVisionEnabled ? "unavailable" : "off";
      if (useGemini || (scanMode !== "quick" && cloudVisionEnabled)) {
        setProgress(68); setStage(useGemini ? "Advanced AI is inspecting your photos" : "Running deep AI inspection across all six photos");
        try {
          const prepared = await Promise.all(requiredViews.map(async (view) => [view.id, await photoToDataUrl(scanPhotos[view.id]!, useGemini ? 1280 : 760)] as const));
          const response = await fetch("/api/pro-scan", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Flight-Lab-Pro-Path": window.location.pathname },
            body: JSON.stringify({ images: Object.fromEntries(prepared), coachId: getScanClientId(), modelVersion: selectedModel, scanMode, planeStyle: planeKind, ageRange, throwStrength: strength, lastFlight: behavior, measuredBest: Number(knownBest) || null }),
          });
          const payload = await response.json() as { analysis?: VisionScanReport; model?: string; message?: string };
          if (response.ok && payload.analysis?.recognizable) { vision = { ...payload.analysis, model: payload.model }; deepInspection = "used"; }
          else if (useGemini) throw new Error(response.ok ? payload.analysis?.inspectionSummary || "Advanced AI could not identify a paper airplane in these photos." : payload.message || "Advanced AI could not analyze these photos. Please try again.");
        } catch (error) {
          if (useGemini) throw error;
          /* Older versions retain their on-device fallback. */
        }
      }
      const topScore = signals.symmetry * .55 + signals.outline * .3 + signals.foldVisibility * .15;
      const crossViewScore = localViewSignals.reduce((sum, item) => sum + item.symmetry * .45 + item.outline * .35 + item.foldVisibility * .2, 0) / Math.max(1, localViewsAnalyzed);
      const localScore = scanMode === "multiview" ? topScore * .68 + crossViewScore * .32 : topScore;
      const score = Math.round(Math.max(0, Math.min(100, vision ? localScore * .7 + vision.symmetryScore * .3 : localScore)));
      const measuredBest = activeThrows.length ? Math.max(...activeThrows.map((item) => item.distance)) : Number(knownBest);
      const videoReview = selectedModel === "v40" ? readProAiContext().videoInspection : null;
      const videoStrength = videoReview && videoReview.releaseStrength !== "uncertain" && videoReview.releaseConfidence >= 55 ? videoReview.releaseStrength : null;
      const selectedStrengthFactor = strengthFactorsByPlane[planeKind][strength];
      const videoStrengthFactor = videoStrength ? strengthFactorsByPlane[planeKind][videoStrength] : selectedStrengthFactor;
      const releaseFactor = videoStrength ? selectedStrengthFactor * .65 + videoStrengthFactor * .35 : selectedStrengthFactor;
      const base = measuredBest > 0 ? measuredBest : planeBaselines[planeKind] * ageFactors[ageRange] * releaseFactor;
      const designFactor = .88 + score / 710;
      const center = base * behaviorFactors[behavior] * designFactor;
      const baseUncertainty = measuredBest > 0 ? .12 : ageRange === "not-set" ? .24 : .18;
      const uncertainty = Math.max(.08, baseUncertainty - (scanMode !== "quick" ? .035 : 0));
      const low = Math.max(5, Math.round(center * (1 - uncertainty)));
      const high = Math.max(low + 2, Math.round(center * (1 + uncertainty)));
      const confidence = Math.round(Math.max(38, Math.min(97, 40 + (measuredBest > 0 ? 22 : 0) + (ageRange !== "not-set" ? 6 : 0) + signals.symmetry * .1 + capturedViews.length * 2.2 + (vision ? vision.confidence * .12 : 0))));
      const nextTest = chooseFreshTest(behavior, activePlaneId);
      const recommendationId = `${activePlaneId ?? "custom"}-${behavior}-${Date.now()}`;
      const planeName = activePlane?.name ?? "Unsaved plane";
      const evidence = [
        `Top-view wing symmetry measured ${signals.symmetry}%.`,
        scanMode === "multiview" ? `On-device checks found usable paper-airplane geometry in ${localViewsAnalyzed} of 6 photos and combined those checks with the top-view measurements.` : "This quick check measured only the visible top-view outline, wing balance, and fold contrast.",
        ...(vision?.observations ?? []),
        deepInspection === "used" ? `${useGemini ? "Advanced AI" : "Deep Visual Inspection"} inspected ${requiredViews.length === 1 ? "the top photo; hidden and underside folds were not visible" : "nose alignment, both wing angles, underside folds, and tail edges across all six photos"}.` : deepInspection === "unavailable" ? "Deep Visual Inspection could not connect, so no cloud findings were added; the report clearly falls back to on-device photo checks." : scanMode === "multiview" ? "Deep Visual Inspection was off; the photos stayed on this device." : "Hidden and underside folds were not inspected in Quick Check.",
        activeThrows.length ? `${planeName} has ${activeThrows.length} saved throws with a ${measuredBest.toFixed(1)} ft best.` : `${planeName} has no measured baseline yet.`,
        `The last reported flight behavior was ${behavior}.`,
        `The estimate uses the ${ageRange === "not-set" ? "unspecified" : ageRange} age range and a ${strength} release for this ${planeKind} design.`,
        ...(videoStrength ? [`The latest video review classified the visible release as ${videoStrength} (${Math.round(videoReview!.releaseConfidence)}% confidence), so it was used as a cross-check.`] : []),
      ].slice(0, 9);
      const headline = vision?.issues[0] ? vision.issues[0] : useGemini ? "Advanced AI photo inspection complete" : signals.symmetry < 78 ? "Wing mismatch is the clearest issue" : behavior === "dives" ? "The build looks usable; the dive is the next clue" : behavior === "stalls" ? "The scan points to too much rear lift" : score >= 84 ? "The build is strong enough for a controlled launch test" : "One measured adjustment should clarify the problem";
      const detail = `${scanMode === "multiview" ? `Flight Lab compared six labeled photos of ${planeName}` : `Flight Lab measured the top photo of ${planeName}`} and matched the visible build evidence with ${activeThrows.length || "no"} saved ${activeThrows.length === 1 ? "throw" : "throws"}. ${vision ? useGemini ? "Advanced AI inspected the uploaded images and added its findings for the report and Coach." : "Deep Visual Inspection added structured cross-view findings for the report and coach." : "No 3D model or hidden geometry was invented."}`;
      setProgress(89); setStage("Matching this plane with its saved flights");
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      setProgress(99); setStage("Finishing the evidence report");
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const nextReport: PlaneReport = { planeId: activePlaneId, planeName, score, range: `${low}–${high} ft`, confidence, headline, detail, nextTest, recommendationId, evidence, scanMode, viewCount: capturedViews.length, signals, localViewsAnalyzed, deepInspection, vision };
      setReport(nextReport); setProgress(100); setStage("Evidence report ready");
      try {
        const profiles = JSON.parse(window.localStorage.getItem(planeReportsStorageKey) ?? "{}") as Record<string, PlaneReport>;
        window.localStorage.setItem(planeReportsStorageKey, JSON.stringify({ ...profiles, [String(activePlaneId ?? "custom")]: nextReport }));
      } catch { /* The current report still works if storage is unavailable. */ }
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "The plane could not be analyzed."); setProgress(0); setStage("");
    }
  }

  const analyzing = progress > 0 && progress < 100 && !report;
  return <section className="pro-tool-section" id="plane-coach">
    <div className="pro-tool-heading"><div><span className="pro-index">01</span><p>Photo-based plane intelligence</p><h2>Inspect your plane</h2></div><p>Choose a fast one-photo check or add six labeled angles for stronger visual evidence. Flight Lab reports only what the photos actually show.</p></div>
    <div className="pro-plane-grid">
      <div className="pro-upload-panel">
        <label className="pro-model-field">AI version<select aria-label="AI version for photos, video and Coach" value={selectedModel} disabled={analyzing} onChange={(event) => chooseModel(event.target.value as typeof selectedModel)}>{COACH_MODEL_OPTIONS.map((option) => <option key={option.model} value={option.model}>{option.label}</option>)}</select></label>
        <input ref={inputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={choosePhoto} aria-label={`Capture the ${pendingViewRef.current} view of your plane`} />
        <div className="pro-coach-plane-bar"><div><span>Analyzing</span><b>{activePlane?.name ?? "Unsaved plane"}</b></div>{planes.length ? <label>Current plane<select value={activePlaneId ?? ""} onChange={(event) => selectActivePlane(Number(event.target.value))}>{planes.map((plane) => <option key={plane.id} value={plane.id}>{plane.name}</option>)}</select></label> : <a href="#plane-hangar">＋ Add a plane first</a>}</div>
        <div className="pro-scan-mode" role="group" aria-label="Choose scan mode"><button type="button" className={scanMode === "multiview" ? "selected" : ""} onClick={() => { setScanMode("multiview"); setReport(null); }}><span>Full inspection</span><small>6 photos</small></button><button type="button" className={scanMode === "quick" ? "selected" : ""} onClick={() => { setScanMode("quick"); setReport(null); }}><span>Quick check</span><small>1 photo</small></button></div>
        <div className={`pro-scan-capture ${scanMode}`}>
          <div className="pro-scan-progress"><span>{capturedViews.length}/{requiredViews.length} views captured</span><i><b style={{ width: `${Math.min(100, capturedViews.length / requiredViews.length * 100)}%` }} /></i><small>{requiredViews.find((view) => !scanPhotos[view.id])?.instruction ?? "All required views are ready"}</small></div>
          <div className="pro-scan-view-grid">{requiredViews.map((view) => <button type="button" key={view.id} className={scanPhotos[view.id] ? "captured" : ""} onClick={() => requestView(view.id)}>{scanPhotos[view.id] ? <img src={scanPhotos[view.id]} alt={`${view.label} scan captured`} /> : <span>{view.id === "top" ? "CAM" : "＋"}</span>}<b>{view.label}</b><small>{scanPhotos[view.id] ? "Retake" : view.instruction}</small></button>)}</div>
        </div>
        {useGemini ? <p>4.0 sends your {scanMode === "quick" ? "top photo" : "six photos"} to cloud AI for visual analysis.</p> : scanMode !== "quick" ? <label className="pro-cloud-vision-choice"><input type="checkbox" checked={cloudVisionEnabled} onChange={(event) => setCloudVisionEnabled(event.target.checked)} /><span><b>Deep visual inspection</b><small>When on, cloud AI compares all six photos for nose alignment, uneven wing angles, fold quality, underside folds, and tail-edge differences. When off, all analysis stays on this device.</small></span></label> : null}
        <div className="pro-form-grid">
          <label>Plane style<select value={planeKind} onChange={(event) => setPlaneKind(event.target.value as PlaneKind)}><option value="dart">Dart</option><option value="glider">Glider</option><option value="stunt">Stunt</option><option value="custom">Custom</option></select></label>
          <label>Last flight<select value={behavior} onChange={(event) => { setBehavior(event.target.value as FlightBehavior); setReport(null); }}><option value="straight">Mostly straight</option><option value="dives">Dived</option><option value="stalls">Stalled</option><option value="turns">Turned left or right</option><option value="wobbles">Wobbled</option><option value="spirals">Spiraled</option></select></label>
          <label>Age range · optional<select value={ageRange} onChange={(event) => setAgeRange(event.target.value as AgeRange)}><option value="not-set">Skip this</option><option value="under-8">7 or younger</option><option value="8-10">8–10</option><option value="11-13">11–13</option><option value="14-17">14–17</option><option value="adult">18+</option></select></label>
          <label>Throw strength<select value={strength} onChange={(event) => setStrength(event.target.value as ThrowStrength)}><option value="gentle">Gentle</option><option value="normal">Normal</option><option value="strong">Strong</option></select><small>{planeKind === "glider" ? "Gliders usually travel farther with a smooth, gentle release; a hard throw is penalized." : planeKind === "dart" ? "Darts usually gain distance from a firm, level throw." : "Flight Lab adjusts the same strength differently for each plane style."}</small></label>
          <label className="span-two">This plane&apos;s measured best<div className="pro-unit-input"><input type="number" min="0" inputMode="decimal" value={knownBest} onChange={(event) => setKnownBest(event.target.value)} placeholder="No measured throws yet" /><span>feet</span></div><small>Automatically filtered to the selected plane; you can correct it here.</small></label>
        </div>
        <button className="pro-command-button" type="button" onClick={analyzePlane} disabled={analyzing}>{analyzing ? "Analyzing your plane…" : useGemini ? "Analyze photos with Advanced AI" : scanMode !== "quick" ? cloudVisionEnabled ? "Run deep six-photo inspection" : "Analyze six photos on device" : "Run quick one-photo check"}</button>
        {error && <p className="pro-inline-error" role="alert">{error}</p>}
      </div>
      <div className="pro-result-panel">
        {analyzing ? <AnalysisLoader progress={progress} label={stage} /> : report ? <div className="pro-plane-report" aria-live="polite">
          <div className="pro-report-photos" aria-label={`${report.viewCount} photos used in this analysis`}>{requiredViews.map((view) => scanPhotos[view.id] ? <img key={view.id} src={scanPhotos[view.id]} alt={`${view.label} view used in the analysis`} /> : null)}</div>
          <span>Analysis complete · {report.confidence}% confidence · {report.planeName}</span><h3>{report.headline}</h3>
          {report.vision?.model?.startsWith("gemini-") && <div><b>Advanced AI visual analysis</b><p>{report.vision.inspectionSummary}</p>{report.vision.uncertainties.length > 0 && <p>Uncertain: {report.vision.uncertainties.join(" ")}</p>}</div>}
          <div className="pro-range"><small>Estimated next flight</small><b>{report.range}</b></div><p>{report.detail}</p>
          <ul className="pro-evidence-list">{report.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          <div className="pro-signal-row"><span><b>{report.signals.symmetry}%</b> top symmetry</span><span><b>{report.localViewsAnalyzed}/{report.viewCount}</b> usable views</span><span><b>{report.score}</b> build score</span></div>
          <div className="pro-next-test"><small>One change · then three throws</small><b>{report.nextTest}</b></div>
          <div className="pro-test-feedback"><span>After testing, what happened?</span><button type="button" className={testOutcome === "better" ? "selected" : ""} onClick={() => recordOutcome("better")}>Better</button><button type="button" className={testOutcome === "same" ? "selected" : ""} onClick={() => recordOutcome("same")}>Same</button><button type="button" className={testOutcome === "worse" ? "selected" : ""} onClick={() => recordOutcome("worse")}>Worse</button></div>
          <p className="pro-honesty-note">Photo analysis can flag visible differences, but it cannot see hidden geometry or predict exact flight performance. Confirm every recommendation with measured throws.</p>
        </div> : <div className="pro-empty-result"><div className="pro-photo-analysis-placeholder"><span>{scanMode === "multiview" ? "6" : "1"}</span><b>{scanMode === "multiview" ? "Six-angle evidence" : "Top-view evidence"}</b></div><span>Photo analysis</span><h3>{scanMode === "multiview" ? "Add six clear photos for the strongest inspection." : "Start with one clear top view."}</h3><p>{scanMode === "multiview" ? "Deep Visual Inspection can compare visible folds and alignment across every angle." : "Quick Check measures top-view outline, balance, and fold contrast."}</p></div>}
      </div>
    </div>
  </section>;
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
  const [planes, setPlanes] = useState<StoredPlane[]>([]);
  const [activePlaneId, setActivePlaneId] = useState<number | null>(null);
  const [flightHistory, setFlightHistory] = useState<StoredThrow[]>([]);
  const [historyView, setHistoryView] = useState<"latest" | "all">("latest");
  const motionArmed = useRef(true);
  const lastStepAt = useRef(0);
  const initialHeading = useRef<number | null>(null);

  useEffect(() => {
    const loadSavedData = () => {
      const saved = Number(window.localStorage.getItem("flight-lab-pro-stride"));
      if (saved >= 1.1 && saved <= 4) setStride(saved);
      try {
        const savedPlanes = JSON.parse(window.localStorage.getItem("flight-lab-v2-planes") ?? "[]") as StoredPlane[];
        const savedThrows = JSON.parse(window.localStorage.getItem("flight-lab-v2-throws") ?? "[]") as StoredThrow[];
        const savedActivePlaneId = Number(window.localStorage.getItem(activePlaneStorageKey));
        setPlanes(savedPlanes);
        setActivePlaneId(savedPlanes.some((plane) => plane.id === savedActivePlaneId) ? savedActivePlaneId : savedPlanes[0]?.id ?? null);
        setFlightHistory(savedThrows.sort((first, second) => second.id - first.id));
      } catch {
        setPlanes([]);
        setActivePlaneId(null);
        setFlightHistory([]);
      }
    };
    loadSavedData();
    window.addEventListener(planesUpdatedEvent, loadSavedData);
    return () => window.removeEventListener(planesUpdatedEvent, loadSavedData);
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
    const distance = Math.round(steps * stride * 10) / 10;
    const driftPenalty = Math.min(28, maxDrift * .7);
    const confidence = Math.round(Math.max(55, Math.min(96, 94 - driftPenalty - (steps < 6 ? 8 : 0))));
    setResult({ distance, confidence, drift: maxDrift });
    const savedFlight: StoredThrow = {
      id: Date.now(),
      planeId: activePlaneId ?? planes[0]?.id ?? 0,
      distance,
      createdAt: "Just now",
    };
    const nextHistory = [savedFlight, ...flightHistory];
    setFlightHistory(nextHistory);
    window.localStorage.setItem("flight-lab-v2-throws", JSON.stringify(nextHistory));
    setMode("idle");
    setMessage("");
  }

  function chooseActivePlane(planeId: number) {
    setActivePlaneId(planeId);
    window.localStorage.setItem(activePlaneStorageKey, String(planeId));
    window.dispatchEvent(new CustomEvent(planesUpdatedEvent, { detail: planes }));
  }

  const liveDistance = steps * (stride || 0);
  const activeFlightHistory = flightHistory.filter((flight) => flight.planeId === activePlaneId);
  const averageDistance = activeFlightHistory.length
    ? activeFlightHistory.reduce((sum, flight) => sum + flight.distance, 0) / activeFlightHistory.length
    : 0;
  const bestDistance = activeFlightHistory.length
    ? Math.max(...activeFlightHistory.map((flight) => flight.distance))
    : 0;
  const visibleFlights = historyView === "latest" ? activeFlightHistory.slice(0, 5) : activeFlightHistory;
  const planeNames = new Map(planes.map((plane) => [plane.id, plane.name]));

  return (
    <section className="pro-tool-section pro-measure-section" id="smart-measure">
      <div className="pro-tool-heading">
        <div><span className="pro-index">03</span><p>Calibrated distance</p><h2>Smart Walk Measure</h2></div>
        <p>Teach Flight Lab your real stride once, then combine it with motion sensing and straight-line checks.</p>
      </div>
      <div className="smart-measure-grid">
        <div className="measure-control-card">
          <div className="calibration-status"><span>Personal calibration</span><b>{stride ? `${stride.toFixed(2)} ft / step` : "Not calibrated"}</b><i className={stride ? "ready" : ""} /></div>
          {planes.length ? <label>Plane<select value={activePlaneId ?? ""} onChange={(event) => chooseActivePlane(Number(event.target.value))}>{planes.map((plane) => <option key={plane.id} value={plane.id}>{plane.name}</option>)}</select></label> : <a className="pro-add-plane-callout" href="#plane-hangar">＋ Add a Dart or Glider before measuring</a>}
          {mode === "idle" && !result && <>
            <label>Known calibration distance<div className="pro-unit-input"><input type="number" min="6" inputMode="decimal" value={calibrationDistance} onChange={(event) => setCalibrationDistance(event.target.value)} /><span>feet</span></div></label>
            <div className="measure-button-row"><button type="button" onClick={() => begin("calibrating")}>Calibrate stride</button><button type="button" className="primary" onClick={() => begin("measuring")} disabled={!stride || !planes.length}>Measure a throw</button></div>
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
      <div className="pro-flight-history">
        <div className="pro-history-heading">
          <div><span>Saved performance</span><h3>Your flights</h3></div>
          <div className="pro-history-tabs" aria-label="Choose how many flights to show">
            <button type="button" className={historyView === "latest" ? "active" : ""} onClick={() => setHistoryView("latest")}>Newest 5</button>
            <button type="button" className={historyView === "all" ? "active" : ""} onClick={() => setHistoryView("all")}>Show all flights</button>
          </div>
        </div>
        <div className="pro-history-stats">
          <article><span>Average distance</span><b>{averageDistance.toFixed(1)} <small>ft</small></b></article>
          <article><span>Best throw</span><b>{bestDistance.toFixed(1)} <small>ft</small></b></article>
          <article><span>Flights logged</span><b>{activeFlightHistory.length}</b></article>
        </div>
        {visibleFlights.length ? (
          <ol className="pro-history-list">
            {visibleFlights.map((flight, index) => (
              <li key={flight.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><b>{flight.distance.toFixed(1)} ft</b><small>{planeNames.get(flight.planeId) ?? "Paper airplane"} · {flight.createdAt}</small></div>
                <i><b style={{ width: `${Math.max(8, flight.distance / Math.max(1, bestDistance) * 100)}%` }} /></i>
              </li>
            ))}
          </ol>
        ) : <p className="pro-history-empty">Your measured flights will appear here. Finish a Smart Measure walk to save the first one.</p>}
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
  const [selectedModel] = useModelVersion();
  return (
    <main className="pro-dashboard">
      <header className="pro-nav">
        <a className="pro-brand" href="#pro-top"><span>➤</span><b>Flight Lab</b><em>PRO</em></a>
        <nav aria-label="Pro tools"><a href="#plane-hangar">Planes</a><a href="#plane-coach">Plane AI</a><a href="#video-lab">Flight path</a><a href="#smart-measure">Smart Measure</a><a href="#experiment-lab">Experiments</a></nav>
        <div className="pro-nav-actions"><a className="pro-measure-shortcut" href="#smart-measure">Measure</a><a className="back-to-lab" href="/">Free Flight Lab</a></div>
      </header>

      <section className="pro-dashboard-hero" id="pro-top">
        <div className="pro-hero-copy">
          <div className="pro-access-pill"><i /><span>{sharedPass ? "Pro Pass active" : "Lifetime Pro active"} · {COACH_MODEL_NUMBER[selectedModel]}</span></div>
          {!sharedPass && <ProViewCounter />}
          <p>Flight intelligence for paper aircraft</p>
          <h1>See what your<br />plane is <em>really doing.</em></h1>
          <p className="pro-hero-lede">Track the full flight, rate the build, measure with personal calibration, and ask a smarter knowledge-first Coach without unnecessary searches.</p>
          <div className="pro-hero-actions"><a href="#smart-measure">Measure a throw</a><a href="#plane-coach">Rate my plane</a></div>
          <small>{displayName} · Core analysis stays on your device. Cloud AI runs only when you choose it.</small>
        </div>
        <div className="pro-hero-visual">
          <img className="pro-hero-plane-photo" src="/plane-presets/nakamura-lock.png" alt="A realistic handmade paper airplane glider" />
          <div className="pro-visual-readout"><span>GLIDER</span><b>Traditional glider profile</b><small>Build a guided six-angle scan to inspect your own plane.</small></div>
          <i className="visual-axis axis-x">X</i><i className="visual-axis axis-y">Y</i><i className="visual-axis axis-z">Z</i>
        </div>
      </section>

      <section className="pro-tool-deck" aria-label="Flight Lab Pro tools">
        <a href="#plane-coach"><span>01</span><b>Plane Intelligence</b><small>Personal range estimate</small></a>
        <a href="#video-lab"><span>02</span><b>3D Flight Tracker</b><small>Movable path analysis</small></a>
        <a href="#smart-measure"><span>03</span><b>Smart Measure</b><small>Calibrated walking distance</small></a>
        <a href="#experiment-lab"><span>04</span><b>Experiment Lab</b><small>Controlled improvement plan</small></a>
      </section>

      <ProPlaneHangar />
      <ProPlaneCoach />
      <ProVideoLab displayName={displayName} />
      <ProSmartMeasure />
      <ExperimentLab />
      <ProCoachChat />

      <footer className="pro-footer"><a className="pro-brand" href="#pro-top"><span>➤</span><b>Flight Lab</b><em>PRO</em></a><p>Build smarter. Track the truth. Fly farther.</p></footer>
    </main>
  );
}
