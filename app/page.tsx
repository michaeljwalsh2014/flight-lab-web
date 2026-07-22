"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type PlaneRecord = { id: number; name: string; createdAt: string };
type ThrowRecord = { id: number; planeId: number; distance: number; createdAt: string };
type FlightBehavior = "straight" | "dives" | "stalls" | "left" | "right" | "wobbles" | "spirals" | "short" | "flips";
type MeasureStage = "ready" | "locating" | "walking";
type MeasureMethod = "choose" | "pace" | "gps" | "manual";
type PhotoSide = "top" | "bottom";
type PlanePhoto = { url: string; name: string };
type ImageSignals = {
  recognizable: boolean;
  reason: string;
  symmetry: number;
  outline: number;
  foldVisibility: number;
  texture: number;
};
type PhotoReport =
  | { kind: "rejected"; headline: string; detail: string; steps: string[] }
  | { kind: "analysis"; score: number; headline: string; detail: string; observations: string[]; steps: string[] };

const behaviorTips: Record<FlightBehavior, string> = {
  straight: "Your flight is stable. Make one small change at a time, then test it with three throws.",
  dives: "Bend both rear wing edges slightly upward. This adds elevator and helps the nose stay up.",
  stalls: "Flatten the rear wing edges a little or add a tiny paper clip to the nose to move weight forward.",
  left: "Line up both wings, then bend the left rear edge down a tiny amount to correct the turn.",
  right: "Line up both wings, then bend the right rear edge down a tiny amount to correct the turn.",
  wobbles: "Check that both wings are equally stiff and that the center crease is sharp from nose to tail.",
  spirals: "Flatten both wings, then make sure one wingtip is not curled more than the other.",
  short: "Open the wings slightly wider and use a smooth, level release instead of throwing harder.",
  flips: "Add a tiny bit of nose weight or flatten any upturned rear edges before the next test.",
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function inspectPlanePhoto(url: string) {
  return new Promise<ImageSignals>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return reject(new Error("Photo analysis is unavailable in this browser."));

      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      const pixels = context.getImageData(0, 0, size, size).data;
      const luminance = new Float32Array(size * size);
      const border: number[][] = [];

      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        luminance[y * size + x] = red * .299 + green * .587 + blue * .114;
        if (x < 7 || x >= size - 7 || y < 7 || y >= size - 7) border.push([red, green, blue]);
      }

      const background = [0, 1, 2].map((channel) => border.reduce((sum, pixel) => sum + pixel[channel], 0) / border.length);
      const backgroundNoise = Math.sqrt(border.reduce((sum, pixel) => {
        const distance = Math.hypot(pixel[0] - background[0], pixel[1] - background[1], pixel[2] - background[2]);
        return sum + distance * distance;
      }, 0) / border.length);
      const threshold = clamp(backgroundNoise * 1.35 + 32, 34, 92);
      const mask = new Uint8Array(size * size);
      let foreground = 0;
      let minX = size;
      let maxX = 0;
      let minY = size;
      let maxY = 0;

      for (let y = 5; y < size - 5; y++) for (let x = 5; x < size - 5; x++) {
        const index = (y * size + x) * 4;
        const distance = Math.hypot(pixels[index] - background[0], pixels[index + 1] - background[1], pixels[index + 2] - background[2]);
        if (distance > threshold) {
          mask[y * size + x] = 1;
          foreground++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }

      const coverage = foreground / (size * size);
      if (!foreground || coverage < .035 || coverage > .72) {
        return resolve({ recognizable: false, reason: "I could not separate one plane from the background. Put it on a plain, contrasting surface with the whole outline visible.", symmetry: 0, outline: 0, foldVisibility: 0, texture: 100 });
      }

      const boxWidth = Math.max(1, maxX - minX + 1);
      const boxHeight = Math.max(1, maxY - minY + 1);
      const centerX = (minX + maxX) / 2;
      const halfWidth = Math.floor(boxWidth / 2);
      let mismatches = 0;
      let compared = 0;
      for (let y = minY; y <= maxY; y++) for (let offset = 0; offset <= halfWidth; offset++) {
        const left = Math.round(centerX - offset);
        const right = Math.round(centerX + offset);
        if (left < 0 || right >= size) continue;
        const leftMask = mask[y * size + left];
        const rightMask = mask[y * size + right];
        if (leftMask || rightMask) {
          compared++;
          if (leftMask !== rightMask) mismatches++;
        }
      }
      const symmetry = Math.round(clamp(100 - (mismatches / Math.max(1, compared)) * 100, 0, 100));

      const rowWidth = (from: number, to: number) => {
        let total = 0;
        let rows = 0;
        for (let y = Math.round(from); y <= Math.round(to); y++) {
          let count = 0;
          for (let x = minX; x <= maxX; x++) count += mask[y * size + x];
          total += count;
          rows++;
        }
        return total / Math.max(1, rows);
      };
      const topWidth = rowWidth(minY, minY + boxHeight * .22);
      const wingWidth = rowWidth(minY + boxHeight * .38, minY + boxHeight * .78);
      const taper = clamp((wingWidth - topWidth) / boxWidth, 0, 1);
      const aspect = boxWidth / boxHeight;
      const aspectSignal = 1 - clamp(Math.abs(aspect - 1.05) / 1.05, 0, 1);
      const outline = Math.round(clamp(taper * 115 + aspectSignal * 28, 0, 100));

      let textureTotal = 0;
      let textureSamples = 0;
      let foldTotal = 0;
      let foldSamples = 0;
      for (let y = minY + 1; y < maxY; y++) for (let x = minX + 1; x < maxX; x++) {
        const position = y * size + x;
        if (!mask[position]) continue;
        textureTotal += Math.abs(luminance[position] - luminance[position - 1]) + Math.abs(luminance[position] - luminance[position - size]);
        textureSamples += 2;
        if (Math.abs(x - centerX) <= 2) {
          const wingOffset = Math.max(5, Math.round(boxWidth * .16));
          const left = luminance[y * size + clamp(Math.round(centerX - wingOffset), 0, size - 1)];
          const right = luminance[y * size + clamp(Math.round(centerX + wingOffset), 0, size - 1)];
          foldTotal += Math.abs(luminance[position] - (left + right) / 2);
          foldSamples++;
        }
      }
      const texture = Math.round(clamp((textureTotal / Math.max(1, textureSamples)) / 255 * 100, 0, 100));
      const foldVisibility = Math.round(clamp((foldTotal / Math.max(1, foldSamples)) / 55 * 100, 0, 100));
      const recognizable = symmetry >= 42 && outline >= 38 && texture <= 31 && aspect >= .55 && aspect <= 2.05;
      let reason = "The pointed nose and two-wing outline are visible.";
      if (symmetry < 42 || outline < 38 || aspect < .55 || aspect > 2.05) reason = "This does not have the centered pointed nose and two-wing outline I expect from a paper airplane.";
      else if (texture > 31) reason = "This looks too textured or visually busy to verify as folded paper. Use a plain surface and even light.";
      resolve({ recognizable, reason, symmetry, outline, foldVisibility, texture });
    };
    image.onerror = () => reject(new Error("I could not read that photo. Try taking it again."));
    image.src = url;
  });
}

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
  const [heightDraft, setHeightDraft] = useState("60");
  const [stepCount, setStepCount] = useState(0);
  const [motionCounterOn, setMotionCounterOn] = useState(false);
  const [manualFeet, setManualFeet] = useState("");
  const [manualInches, setManualInches] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<PhotoSide>("top");
  const [photos, setPhotos] = useState<Record<PhotoSide, PlanePhoto | null>>({ top: null, bottom: null });
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
  const photoUrls = useRef(new Set<string>());
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
        if (savedHeight >= 36 && savedHeight <= 96) {
          setHeightInches(savedHeight);
          setHeightDraft(String(savedHeight));
        }
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
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

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

  function updateHeightDraft(value: string) {
    setHeightDraft(value);
    const nextHeight = Number(value);
    if (nextHeight >= 36 && nextHeight <= 96) setHeightInches(nextHeight);
  }

  function commitHeight() {
    const nextHeight = clamp(Number(heightDraft) || heightInches, 36, 96);
    setHeightInches(nextHeight);
    setHeightDraft(String(nextHeight));
  }

  function openPhotoSource(side: PhotoSide) {
    setPhotoTarget(side);
    setSourceOpen(true);
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const current = photos[photoTarget];
    if (current) {
      URL.revokeObjectURL(current.url);
      photoUrls.current.delete(current.url);
    }
    const url = URL.createObjectURL(file);
    photoUrls.current.add(url);
    setPhotos((previous) => ({ ...previous, [photoTarget]: { url, name: file.name || `${photoTarget} view` } }));
    setReport(null);
    setSourceOpen(false);
    event.target.value = "";
  }

  async function analyzePhoto() {
    if (!photos.top) { openPhotoSource("top"); return; }
    if (!photos.bottom) { openPhotoSource("bottom"); return; }
    setAnalyzing(true);
    setReport(null);
    try {
      const [top, bottom] = await Promise.all([inspectPlanePhoto(photos.top.url), inspectPlanePhoto(photos.bottom.url)]);
      const failedView = !top.recognizable ? { name: "top", signal: top } : !bottom.recognizable ? { name: "bottom", signal: bottom } : null;
      if (failedView) {
        setReport({
          kind: "rejected",
          headline: "I can’t verify a paper airplane",
          detail: `The ${failedView.name} photo did not pass the plane-shape check. ${failedView.signal.reason}`,
          steps: ["Use a plain floor or table that contrasts with the paper.", "Point the airplane nose toward the top of the photo.", "Keep the entire nose, both wingtips, and tail inside the frame."],
        });
        return;
      }

      const averageSymmetry = Math.round((top.symmetry + bottom.symmetry) / 2);
      const averageOutline = Math.round((top.outline + bottom.outline) / 2);
      const averageFold = Math.round((top.foldVisibility + bottom.foldVisibility) / 2);
      const score = Math.round(clamp(averageSymmetry * .55 + averageOutline * .3 + averageFold * .15, 0, 100));
      const weakerView = top.symmetry <= bottom.symmetry ? "top" : "bottom";
      const viewGap = Math.abs(top.symmetry - bottom.symmetry);
      const observations = [
        `Top view: ${top.symmetry}% left-to-right wing match.`,
        `Bottom view: ${bottom.symmetry}% left-to-right wing match.`,
        averageFold >= 42 ? "The center fold is visible enough to compare both sides." : "The center fold is faint; brighter, more even lighting will improve the next scan.",
      ];
      const photoAdvice = averageSymmetry < 74
        ? `The ${weakerView} view shows the bigger mismatch. Place both wingtips together and re-crease the wing that sits farther from the center line.`
        : viewGap >= 14
          ? `The top and bottom views disagree. Check the underside tabs and center pocket for a fold that is pulling one wing out of position.`
          : averageOutline < 68
            ? "The wing outline tapers unevenly. Match the two trailing edges before changing the elevator bends."
            : "Both views show a consistent outline. Keep the folds as they are and change only one rear edge at a time.";
      setReport({
        kind: "analysis",
        score,
        headline: averageSymmetry >= 82 && viewGap < 12 ? "Both views look well matched" : "A specific fold needs attention",
        detail: `${photoAdvice} This recommendation comes from the measured outline and fold contrast in your two photos.`,
        observations,
        steps: [photoAdvice, behaviorTips[behavior], "Make that one change, then measure three throws and compare the new average."],
      });
    } catch (error) {
      setReport({
        kind: "rejected",
        headline: "I couldn’t read those photos",
        detail: error instanceof Error ? error.message : "Try taking both photos again in brighter light.",
        steps: ["Retake the top and bottom views.", "Keep the full plane inside the frame.", "Use even light without a strong shadow."],
      });
    } finally {
      setAnalyzing(false);
    }
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
        <div className="analyzer-intro"><p className="kicker">Two-view camera check</p><h2>Scan your plane.<br /><em>Find the next improvement.</em></h2><p>Add one top photo and one bottom photo. Flight Lab first checks that each picture has a paper-airplane outline, then compares wing shape, fold contrast, and the way the last flight behaved.</p><div className="photo-guides"><span>01 Plain contrasting surface</span><span>02 Nose pointing up</span><span>03 Whole plane visible</span></div></div>
        <div className="scanner-card">
          <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={handlePhoto} aria-label={`Take the ${photoTarget} photo of your paper airplane`} />
          <input ref={libraryRef} className="sr-only" type="file" accept="image/*" onChange={handlePhoto} aria-label={`Choose the ${photoTarget} photo of your paper airplane`} />
          <div className="photo-grid">
            {(["top", "bottom"] as PhotoSide[]).map((side) => <div className={`photo-slot ${photos[side] ? "has-photo" : ""}`} key={side}>
              <span className="photo-side">{side === "top" ? "1 · Top view" : "2 · Bottom view"}</span>
              {photos[side] ? <><img src={photos[side]?.url} alt={`${side} view of the selected paper airplane`} /><button className="change-photo" type="button" onClick={() => openPhotoSource(side)}>Change {side} photo</button></> : <button className="add-photo" type="button" onClick={() => openPhotoSource(side)}><span className="camera-icon" aria-hidden="true">CAM</span><b>Add {side} photo</b><small>{side === "top" ? "Lay the plane normally" : "Flip the plane over"}</small></button>}
              <span className="scan-corner top-left" /><span className="scan-corner top-right" /><span className="scan-corner bottom-left" /><span className="scan-corner bottom-right" />
            </div>)}
          </div>
          <div className="scanner-controls">
            <label htmlFor="behavior">What happened on the last flight?</label>
            <select id="behavior" value={behavior} onChange={(event) => setBehavior(event.target.value as FlightBehavior)}>
              <option value="straight">It flew mostly straight</option><option value="dives">It dives nose-first</option><option value="stalls">It climbs, then stalls</option><option value="left">It drifts or turns left</option><option value="right">It drifts or turns right</option><option value="wobbles">It wobbles side to side</option><option value="spirals">It spirals or corkscrews</option><option value="short">It glides smoothly but lands short</option><option value="flips">It flips over or flies upside down</option>
            </select>
            {!photos.top || !photos.bottom ? <p className="photo-requirement">Add both views before analysis. Non-airplane photos will be rejected instead of scored.</p> : null}
            <button type="button" className="analyze-button" onClick={analyzePhoto} disabled={analyzing || !photos.top || !photos.bottom}>{analyzing ? "Checking both photos…" : "Analyze both views"}</button>
          </div>
        </div>
        {report && <article className={`report-card ${report.kind === "rejected" ? "rejected" : ""}`} aria-live="polite">
          {report.kind === "analysis" ? <div className="report-score"><span>Two-view fold score</span><b>{report.score}<small>/100</small></b></div> : <div className="report-rejected-mark"><b>Not scored</b><span>Plane not verified</span></div>}
          <div className="report-copy"><p className="kicker">{report.kind === "analysis" ? "Analysis complete" : "Photo check stopped"}</p><h3>{report.headline}</h3><p>{report.detail}</p></div>
          {report.kind === "analysis" && <ul className="observations">{report.observations.map((observation) => <li key={observation}>{observation}</li>)}</ul>}
          <ol>{report.steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol>
          <p className="prototype-note">Analysis runs on this device and uses the visible outline, symmetry, texture, and fold contrast in both photos. Confirm advice with repeated throws.</p>
        </article>}
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
            <button className="method-choice" type="button" onClick={() => chooseMeasureMethod("gps")}><span>GPS</span><b>Outdoor GPS · experimental</b><small>Only useful outside for throws longer than the accuracy shown by your device.</small></button>
            <button className="method-choice" type="button" onClick={() => chooseMeasureMethod("manual")}><span>RULER</span><b>Tape or Measure app</b><small>Most precise. Enter a reading from a tape or another measuring tool.</small></button>
          </div>
        </>}

        {measureMethod !== "choose" && <button className="method-back" type="button" onClick={() => chooseMeasureMethod("choose")}>← All measuring tools</button>}

        {measureMethod === "pace" && <>
          {measureStage === "ready" ? <>
            <label className="measure-label" htmlFor="height">Type your height</label>
            <div className="height-input"><input id="height" type="number" min="36" max="96" inputMode="decimal" value={heightDraft} onChange={(event) => updateHeightDraft(event.target.value)} onBlur={commitHeight} aria-describedby="height-help" /><span>inches</span></div>
            <p className="height-help" id="height-help">You can erase the current number and type any height from 36 to 96 inches.</p>
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
          {measureStage === "ready" && !measureError && <div className="permission-callout"><b>GPS is not recommended for normal paper-airplane throws</b><p>Location can be wrong by 15–50 feet, especially on a Wi-Fi-only iPad. Use this only outdoors for a long throw, then choose <strong>Allow</strong> when Safari asks.</p></div>}
          {locationAccuracy !== null && <p className={`accuracy ${locationAccuracy > 15 ? "weak" : ""}`}>Location accuracy: about ±{Math.round(locationAccuracy)} ft{locationAccuracy > 15 ? " · Step measure will be better here" : ""}</p>}
          {measureError && <p className="measure-error">{measureError}</p>}
          {locationDenied && <div className="permission-help"><b>On the iPad:</b><span>Open this website&apos;s Page Menu → More → Website Settings → Location → Ask.</span></div>}
          <button className="analyze-button" type="button" onClick={measureStage === "walking" ? finishGpsMeasuring : startMeasuring} disabled={measureStage === "locating"}>{measureStage === "walking" ? "Mark landing point & save" : measureStage === "locating" ? "Waiting for Safari…" : locationDenied ? "Try location again" : "Allow location & set launch point"}</button>
          {measureError && <button className="gps-fallback" type="button" onClick={() => chooseMeasureMethod("pace")}>Use Walk & count instead</button>}
          <p className="sensor-note">If the accuracy number is larger than the throw, the GPS result cannot be trusted. Switch to Walk & count or manual measurement.</p>
        </>}

        {measureMethod === "manual" && <>
          <p className="measurement-explainer">Use a tape measure or the Measure app already on an iPad or iPhone, then save that reading here.</p>
          <div className="manual-distance"><label><span>Feet</span><input type="number" min="0" inputMode="decimal" value={manualFeet} onChange={(event) => setManualFeet(event.target.value)} placeholder="0" /></label><label><span>Inches</span><input type="number" min="0" max="11.9" inputMode="decimal" value={manualInches} onChange={(event) => setManualInches(event.target.value)} placeholder="0" /></label></div>
          {measureError && <p className="measure-error">{measureError}</p>}
          <button className="analyze-button" type="button" onClick={saveManualMeasurement}>Save throw</button>
        </>}
      </section></div>}

      {sourceOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSourceOpen(false); }}><section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title"><button className="modal-close" type="button" onClick={() => setSourceOpen(false)} aria-label="Close">×</button><p className="kicker">{photoTarget} view</p><h2 id="source-title">Add the {photoTarget} photo</h2><p className="source-help">Use a plain surface, point the nose toward the top of the picture, and include both wingtips and the tail.</p><button className="source-choice" type="button" onClick={() => cameraRef.current?.click()}><span>CAM</span><b>Take {photoTarget} photo</b><small>Open your camera now</small></button><button className="source-choice" type="button" onClick={() => libraryRef.current?.click()}><span>LIB</span><b>Choose {photoTarget} photo</b><small>Select a photo you already took</small></button></section></div>}
    </main>
  );
}
