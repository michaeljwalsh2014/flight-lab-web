"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { publishProAiContext, currentPlaneId, type ProAiContext } from "./pro-ai-context";
import { AnalysisLoader } from "./pro-ui";
import { COACH_MODEL_NUMBER, COACH_MODEL_OPTIONS, useModelVersion } from "./model-version";

import { evidenceLabel } from "./evidence-label";

import { buildBestTrack, cleanTrack, projectSidePath, isTrackingGap, type TrackPoint, type Candidate } from "./flight-tracking";
type VideoReport = {
  airtime: number;
  curve: number;
  stability: number;
  relativeSpeed: number;
  confidence: number;
  profile: string;
  driftDirection: "left" | "right" | "straight";
  observations: string[];
  points: TrackPoint[];
  sampledFrames: number;
  frameAspect: number;
  sampleInterval: number;
};

type VideoInspection = NonNullable<ProAiContext["videoInspection"]>;

async function sampleVideoForReview(url: string) {
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto";
  video.src = url;
  try {
    await waitForVideoEvent(video, "loadedmetadata");
    if (video.readyState < 2) await waitForVideoEvent(video, "loadeddata");
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration < .5 || duration > 45) throw new Error("Use a clip between half a second and 45 seconds.");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare video frames.");
    const frames: Array<{ time: number; image: string }> = [];
    for (let index = 0; index < 12; index++) {
      const time = (duration - .025) * index / 11;
      await seekVideo(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ time, image: canvas.toDataURL("image/jpeg", .72) });
    }
    return { duration, frames };
  } finally {
    video.removeAttribute("src"); video.load();
  }
}

const clampNumber = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The video took too long to decode. Try a shorter recording."));
    }, 14000);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This video could not be decoded in the browser."));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < .012) return;
  const ready = waitForVideoEvent(video, "seeked");
  video.currentTime = time;
  await ready;
}

function angleDifference(first: number, second: number) {
  let difference = Math.abs(first - second);
  if (difference > Math.PI) difference = Math.PI * 2 - difference;
  return difference;
}

function motionCandidates(
  pixels: Uint8ClampedArray,
  previous: Uint8ClampedArray,
  width: number,
  height: number,
  frame: number,
  time: number,
) {
  const length = width * height;
  const differences = new Float32Array(length);
  let differenceTotal = 0;
  for (let pixel = 0; pixel < length; pixel++) {
    const offset = pixel * 4;
    const difference = (
      Math.abs(pixels[offset] - previous[offset]) +
      Math.abs(pixels[offset + 1] - previous[offset + 1]) +
      Math.abs(pixels[offset + 2] - previous[offset + 2])
    ) / 3;
    differences[pixel] = difference;
    differenceTotal += difference;
  }
  const averageDifference = differenceTotal / length;
  const threshold = clampNumber(averageDifference * 2.9 + 11, 26, 78);
  const mask = new Uint8Array(length);
  let changed = 0;
  for (let y = 4; y < height - 4; y++) for (let x = 4; x < width - 4; x++) {
    const position = y * width + x;
    if (differences[position] > threshold) {
      mask[position] = 1;
      changed++;
    }
  }
  const changedRatio = changed / length;
  if (changedRatio < .00015 || changedRatio > .22) return [];

  const visited = new Uint8Array(length);
  const candidates: Candidate[] = [];
  const stack: number[] = [];
  const maxArea = length * .045;

  for (let y = 5; y < height - 5; y++) for (let x = 5; x < width - 5; x++) {
    const start = y * width + x;
    if (!mask[start] || visited[start]) continue;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    let area = 0;
    let energy = 0;
    let xTotal = 0;
    let yTotal = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    while (stack.length) {
      const position = stack.pop()!;
      const pointY = Math.floor(position / width);
      const pointX = position - pointY * width;
      const weight = Math.max(1, differences[position] - threshold);
      area++;
      energy += weight;
      xTotal += pointX * weight;
      yTotal += pointY * weight;
      minX = Math.min(minX, pointX);
      maxX = Math.max(maxX, pointX);
      minY = Math.min(minY, pointY);
      maxY = Math.max(maxY, pointY);
      if (area > maxArea) break;
      for (let offsetY = -1; offsetY <= 1; offsetY++) for (let offsetX = -1; offsetX <= 1; offsetX++) {
        if (!offsetX && !offsetY) continue;
        const neighborX = pointX + offsetX;
        const neighborY = pointY + offsetY;
        if (neighborX < 3 || neighborX >= width - 3 || neighborY < 3 || neighborY >= height - 3) continue;
        const neighbor = neighborY * width + neighborX;
        if (mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }
    if (area < 3 || area > maxArea || energy < 70) continue;
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const aspect = Math.max(boxWidth, boxHeight) / Math.max(1, Math.min(boxWidth, boxHeight));
    if (aspect > 9 || boxWidth > width * .34 || boxHeight > height * .42) continue;
    candidates.push({
      x: xTotal / Math.max(1, energy) / width,
      y: yTotal / Math.max(1, energy) / height,
      area,
      energy,
      frame,
      time,
    });
  }
  return candidates.sort((first, second) => second.energy / Math.sqrt(second.area) - first.energy / Math.sqrt(first.area)).slice(0, 14);
}

async function analyzeVideo(url: string, onProgress: (progress: number, stage: string) => void): Promise<VideoReport> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    onProgress(4, "Opening the video");
    await waitForVideoEvent(video, "loadedmetadata");
    if (video.readyState < 2) await waitForVideoEvent(video, "loadeddata");

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration < .5) throw new Error("Record at least half a second of the throw.");
    if (duration > 45) throw new Error("Use a clip under 45 seconds so Flight Lab can focus on one throw.");

    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Video analysis is unavailable in this browser.");

    const sampleCount = clampNumber(Math.round(duration * 24), 24, 720);
    const frames: Candidate[][] = [];
    let previous: Uint8ClampedArray | null = null;
    onProgress(10, "Finding the airplane");

    for (let index = 0; index < sampleCount; index++) {
      const time = Math.min(Math.max(0, duration - .025), (duration * index) / Math.max(1, sampleCount - 1));
      await seekVideo(video, time);
      context.drawImage(video, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      frames.push(previous ? motionCandidates(pixels, previous, width, height, index, time) : []);
      previous = new Uint8ClampedArray(pixels);
      const progress = 12 + Math.round((index / Math.max(1, sampleCount - 1)) * 66);
      onProgress(progress, index < sampleCount * .28 ? "Finding the airplane" : "Tracing sampled flight frames");
    }

    onProgress(82, "Checking motion continuity");
    const rawTrack = buildBestTrack(frames);
    const points = cleanTrack(rawTrack, sampleCount);
    if (points.length < 6) {
      throw new Error("I could not lock onto one clear flight. Keep the camera still, use a contrasting background, and keep the complete throw in frame.");
    }

    const displacement = Math.hypot(points.at(-1)!.x - points[0].x, points.at(-1)!.y - points[0].y);
    if (displacement < .11) throw new Error("The tracked movement was too small to separate the airplane from the thrower.");

    let pathLength = 0;
    const angles: number[] = [];
    for (let index = 1; index < points.length; index++) {
      const deltaX = points[index].x - points[index - 1].x;
      const deltaY = points[index].y - points[index - 1].y;
      pathLength += Math.hypot(deltaX, deltaY);
      angles.push(Math.atan2(deltaY, deltaX));
    }
    const directionChanges = angles.slice(1).map((angle, index) => angleDifference(angle, angles[index]));
    const averageTurn = directionChanges.length ? directionChanges.reduce((sum, value) => sum + value, 0) / directionChanges.length : 0;
    const curve = Math.round(clampNumber((1 - displacement / Math.max(.001, pathLength)) * 120, 0, 100));
    const stability = Math.round(clampNumber(100 - averageTurn / Math.PI * 108, 0, 100));
    const airtime = Math.max(.1, points.at(-1)!.time - points[0].time);
    const verticalTravel = points.at(-1)!.y - points[0].y;
    const profile = verticalTravel > .17 ? "Descending finish" : verticalTravel < -.17 ? "Climbing finish" : curve > 52 ? "Curved flight" : stability > 76 ? "Stable flight" : "Mostly level";
    const averagePointConfidence = points.reduce((sum, point) => sum + point.confidence, 0) / points.length;
    const confidence = Math.round(clampNumber(averagePointConfidence * .72 + points.length / sampleCount * 42, 0, 98));
    const middle = points[Math.floor(points.length / 2)];
    const middleProgress = (middle.time - points[0].time) / Math.max(.001, points.at(-1)!.time - points[0].time);
    const expectedMiddleX = points[0].x + (points.at(-1)!.x - points[0].x) * middleProgress;
    const horizontalBend = middle.x - expectedMiddleX;
    const driftDirection = curve < 18 || Math.abs(horizontalBend) < .018
      ? "straight"
      : horizontalBend > 0 ? "right" : "left";
    const observations = [
      stability >= 78 ? "The tracked path stayed stable through most of the flight." : "The path changed direction enough to suggest wobble, a rough release, or uneven wings.",
      curve <= 24 ? "The flight stayed close to a straight screen path." : `The path bent ${driftDirection === "straight" ? "away from a straight line" : `toward the ${driftDirection}`}.`,
      verticalTravel > .17 ? "The flight finished with a noticeable descent." : verticalTravel < -.17 ? "The flight was still climbing near the end of the visible track." : "The visible flight finished mostly level.",
    ];
    onProgress(94, "Drawing the side-view trace");
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    onProgress(100, "Flight trace ready");

    return {
      airtime,
      curve,
      stability,
      relativeSpeed: pathLength / airtime,
      confidence,
      profile,
      driftDirection,
      observations,
      points,
      sampledFrames: sampleCount,
      frameAspect: video.videoWidth / video.videoHeight,
      sampleInterval: duration / (sampleCount - 1),
    };
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

function SideFlightPath({ report }: { report: VideoReport }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#06172a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#17354d";
    context.lineWidth = 1;
    for (let x = 60; x < canvas.width; x += 60) {
      context.beginPath(); context.moveTo(x, 40); context.lineTo(x, canvas.height - 40); context.stroke();
    }
    for (let y = 40; y < canvas.height; y += 60) {
      context.beginPath(); context.moveTo(60, y); context.lineTo(canvas.width - 60, y); context.stroke();
    }
    const points = projectSidePath(report.points, canvas.width, canvas.height, report.frameAspect);
    drawTrace(context, points, report.sampleInterval, 5);
    points.forEach((point, index) => {
      context.fillStyle = point.confidence < 58 ? "#ffb248" : "#d8f8ff";
      context.beginPath(); context.arc(point.x, point.y, index === 0 || index === points.length - 1 ? 7 : 2.5, 0, Math.PI * 2); context.fill();
    });
    context.font = "700 18px system-ui";
    [points[0], points.at(-1)!].forEach((point, index) => {
      context.fillStyle = index ? "#ffb248" : "#c8f34b";
      context.fillText(index ? "LAST TRACKED" : "FIRST TRACKED", Math.min(canvas.width - 180, point.x + 12), Math.max(24, point.y - 14));
    });
  }, [report]);
  return <div className="interactive-flight-model">
    <div className="path-toolbar"><b>Fixed side view</b><span>Path across the video image</span></div>
    <canvas ref={canvasRef} className="interactive-path-canvas" width="1200" height="620" aria-label="Fixed side-view flight trace. Dashed orange sections mark gaps in tracking." />
    <p className="model-disclaimer">Film from the side with a steady camera. This trace follows the visible image; it does not measure depth or real-world distance. Dashed orange sections connect missed samples.</p>
  </div>;
}

function drawTrace(context: CanvasRenderingContext2D, points: TrackPoint[], interval: number, lineWidth: number) {
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    const gap = isTrackingGap(previous, point, interval);
    context.setLineDash(gap ? [8, 8] : []);
    context.strokeStyle = gap || point.confidence < 58 ? "#ffb248" : "#43dcff";
    context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(point.x, point.y); context.stroke();
  });
  context.setLineDash([]);
}

function VideoPathReplay({ url, report }: { url: string; report: VideoReport }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const points = report.points.map(point => ({ ...point, x: point.x * canvas.width, y: point.y * canvas.height }));
    drawTrace(context, points, report.sampleInterval, 4);
  }, [report]);
  return <div className="video-path-replay"><video src={url} controls playsInline preload="metadata" aria-label="Original video with tracked flight path" /><canvas ref={canvasRef} width="960" height={Math.round(960 / report.frameAspect)} aria-hidden="true" /><span>Tracked path overlay</span></div>;
}

export default function ProVideoLab({ displayName }: { displayName: string }) {
  const [selectedModel, chooseModel] = useModelVersion();
  const recordInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [report, setReport] = useState<VideoReport | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [inspection, setInspection] = useState<VideoInspection | null>(null);
  const reviewGeneration = useRef(0);
  const reportGeneration = useRef(-1);
  const [planeId, setPlaneId] = useState<number | null>(null);
  useEffect(() => {
    const sync = () => setPlaneId(currentPlaneId());
    sync();
    window.addEventListener("flight-lab-planes-updated", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("flight-lab-planes-updated", sync); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => {
    setVideoUrl(null); setVideoName(""); setReport(null); setProgress(0); setStage("");
  }, [planeId]);

  useEffect(() => {
    reviewGeneration.current++;
    setInspection(null); setReport(null); setAnalyzing(false);
    publishProAiContext({ videoInspection: null, flight: undefined });
    return () => { reviewGeneration.current++; };
  }, [videoUrl, selectedModel, planeId]);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => {
    if (!report || reportGeneration.current !== reviewGeneration.current) return;
    publishProAiContext({
      flight: {
        planeId,
        engine: "flight-lab-local-v2",
        airtime: Number(report.airtime.toFixed(2)),
        curve: report.curve,
        stability: report.stability,
        relativeSpeed: Number(report.relativeSpeed.toFixed(2)),
        confidence: report.confidence,
        profile: report.profile,
        driftDirection: report.driftDirection,
        sampledFrames: report.sampledFrames,
        observations: report.observations,
      },
    });
  }, [report]);

  function chooseVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Choose a video recording of one paper-airplane throw.");
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setReport(null);
    setProgress(0);
    setStage("");
    setError("");
    event.target.value = "";
  }

  function changeVideo() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoName("");
    setReport(null);
    setInspection(null);
    setProgress(0);
    setStage("");
    setError("");
  }

  async function runAnalysis() {
    if (!videoUrl || analyzing) return;
    const generation = reviewGeneration.current;
    const reviewPlaneId = planeId;
    const isCurrent = () => generation === reviewGeneration.current && currentPlaneId() === reviewPlaneId;
    setAnalyzing(true);
    setInspection(null);
    publishProAiContext({ videoInspection: null, flight: undefined });
    setError("");
    setReport(null);
    setProgress(1);
    setStage("Preparing the flight");
    try {
      let localError = "";
      try {
        const nextReport = await analyzeVideo(videoUrl, (nextProgress, nextStage) => {
          if (!isCurrent()) return;
          setProgress(selectedModel === "v40" || selectedModel === "v46" ? Math.round(nextProgress * .6) : nextProgress);
          setStage(nextStage);
        });
        if (!isCurrent()) return;
        reportGeneration.current = generation;
        setReport(nextReport);
      } catch (failure) {
        if (selectedModel !== "v40" && selectedModel !== "v46") throw failure;
        localError = failure instanceof Error ? failure.message : "Local tracking was unavailable.";
      }
      if (selectedModel === "v40" || selectedModel === "v46") {
        if (!isCurrent()) return;
        setProgress(65); setStage("Preparing frames for advanced review");
        const sampled = await sampleVideoForReview(videoUrl);
        if (!isCurrent()) return;
        setProgress(80); setStage("Reviewing the visible flight with AI");
        const storageKey = "flight-lab-pro-coach-id";
        let coachId = window.localStorage.getItem(storageKey);
        if (!coachId) { coachId = crypto.randomUUID(); window.localStorage.setItem(storageKey, coachId); }
        const response = await fetch("/api/pro-video", {
          method: "POST", headers: { "Content-Type": "application/json", "X-Flight-Lab-Pro-Path": window.location.pathname },
          body: JSON.stringify({ ...sampled, coachId, modelVersion: selectedModel }),
        });
        const payload = await response.json() as { analysis?: Omit<VideoInspection, "sampledFrames">; sampledFrames?: number; message?: string };
        if (!isCurrent()) return;
        if (!response.ok || !payload.analysis) throw new Error(payload.message || "The video review could not connect. Please try again.");
        const reviewed = { ...payload.analysis, planeId: reviewPlaneId, sampledFrames: payload.sampledFrames ?? sampled.frames.length };
        setInspection(reviewed);
        publishProAiContext({ videoInspection: reviewed });
      }
      if (localError) setError(`Motion tracking: ${localError} The AI review is shown separately below.`);
      setProgress(100); setStage("Review complete");
    } catch (analysisError) {
      if (!isCurrent()) return;
      setError(analysisError instanceof Error ? analysisError.message : "The video could not be analyzed.");
      setProgress(0);
      setStage("");
    } finally {
      if (isCurrent()) setAnalyzing(false);
    }
  }

  const trackQuality = useMemo(() => report ? report.confidence >= 80 ? "Stronger tracking evidence" : report.confidence >= 62 ? "Some tracking evidence" : "Review uncertain points" : "", [report]);

  return (
    <section className="pro-tool-section pro-video-lab" id="video-lab">
      <div className="pro-tool-heading">
        <div><span className="pro-index">02</span><p>Airplane-specific motion tracking</p><h2>Flight Path Viewer</h2></div>
        <p>See the visible flight path in a fixed side view and over your original video. Film from the side with a steady camera for the clearest trace.</p>
      </div>

      <div className="pro-video-grid">
        <div className="pro-video-input">
          <label className="pro-model-field">AI version<select value={selectedModel} disabled={analyzing} onChange={(event) => chooseModel(event.target.value as typeof selectedModel)}>{COACH_MODEL_OPTIONS.map((option) => <option key={option.model} value={option.model}>{option.label}</option>)}</select><small>{COACH_MODEL_OPTIONS.find((option) => option.model === selectedModel)?.detail}</small></label>
          <input ref={recordInputRef} className="sr-only" type="file" accept="video/*" capture="environment" onChange={chooseVideo} aria-label="Record a new flight video" />
          <input ref={libraryInputRef} className="sr-only" type="file" accept="video/*" onChange={chooseVideo} aria-label="Choose an existing flight video from Photos" />
          {videoUrl ? <>
            <video src={videoUrl} controls playsInline preload="metadata" aria-label={`Selected flight video: ${videoName}`} />
            <div className="pro-video-actions"><button type="button" disabled={analyzing} onClick={changeVideo}>Choose a different video</button><button type="button" className="primary" onClick={runAnalysis} disabled={analyzing}>{analyzing ? "Analyzing…" : "Analyze flight video"}</button></div>
          </> : <div className="pro-video-source-picker">
            <div><span>Flight video</span><b>Add one complete throw</b><small>Keep the launch and landing in frame · maximum 45 seconds</small></div>
            <button type="button" onClick={() => recordInputRef.current?.click()}><span>REC</span><b>Record a video</b><small>Open the camera and film a new throw</small></button>
            <button type="button" onClick={() => libraryInputRef.current?.click()}><span>LIB</span><b>Choose from Photos</b><small>Use a video you already recorded</small></button>
          </div>}
          {error && <p className="pro-inline-error" role="alert">{error}</p>}
        </div>
        <aside className="pro-video-guide"><span>Tracking checklist</span><ol><li><b>01</b><div><strong>Hold still</strong><small>Brace the phone or iPad against something solid.</small></div></li><li><b>02</b><div><strong>Use contrast</strong><small>A bright plane against a darker background works best.</small></div></li><li><b>03</b><div><strong>Leave space</strong><small>Keep the complete throw inside the picture.</small></div></li></ol><p>{displayName} · {selectedModel === "v40" || selectedModel === "v46" ? "Advanced review sends 12 sampled video frames to cloud AI. Motion tracking runs on this device." : "Your video stays on this device."}</p></aside>
      </div>

      {analyzing && <AnalysisLoader progress={progress} label={stage} />}

      {inspection && <section className="pro-video-ai-review compact" aria-live="polite"><span>Flight Lab {COACH_MODEL_NUMBER[selectedModel]} · Quick review</span><h3>{inspection.canReview ? inspection.summary : "More visual evidence needed"}</h3><ul>{inspection.observations.slice(0, 2).map((item) => <li key={item}>{item}</li>)}</ul><p><b>Release:</b> {inspection.releaseStrength}{inspection.releaseStrength !== "uncertain" ? " · AI interpretation" : ""} <b>Next:</b> {inspection.nextTest}</p>{inspection.uncertainties.length > 0 && <small>Uncertain: {inspection.uncertainties.slice(0, 1).join(" ")}</small>}</section>}

      {report && videoUrl && <div className="pro-video-report" aria-live="polite">
        <div className="pro-report-heading"><div><span>Analysis complete</span><h3>{report.profile}</h3></div><div><b>{evidenceLabel(report.confidence)}</b><small>{trackQuality}</small></div></div>
        <VideoPathReplay url={videoUrl} report={report} />
        <SideFlightPath report={report} />
        <div className="pro-report-metrics compact"><article><span>Visible tracked time</span><b>{report.airtime.toFixed(2)} <small>sec</small></b></article><article><span>Flight curve</span><b>{report.curve}<small>/100</small></b></article><article><span>Path stability</span><b>{report.stability}<small>/100</small></b></article></div>
        <p className="pro-video-summary"><b>On-device coach observations:</b> {report.observations[0]} <span>Relative speed: {report.relativeSpeed.toFixed(2)} screen/sec.</span></p>
        <p className="pro-report-note">{report.sampledFrames} frames sampled · orange points are uncertain · dashed sections mark missed samples. Screen motion, not real-world distance; evidence labels are heuristic checks, not measured accuracy.</p>
      </div>}
    </section>
  );
}
