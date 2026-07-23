"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

type TrackPoint = { x: number; y: number; time: number };
type VideoReport = {
  airtime: number;
  curve: number;
  stability: number;
  relativeSpeed: number;
  confidence: number;
  profile: string;
  points: TrackPoint[];
};

const clampNumber = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The video took too long to decode. Try a shorter recording."));
    }, 12000);
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
  if (Math.abs(video.currentTime - time) < .015) return;
  const ready = waitForVideoEvent(video, "seeked");
  video.currentTime = time;
  await ready;
}

function angleDifference(first: number, second: number) {
  let difference = Math.abs(first - second);
  if (difference > Math.PI) difference = Math.PI * 2 - difference;
  return difference;
}

async function analyzeVideo(url: string): Promise<VideoReport> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  await waitForVideoEvent(video, "loadedmetadata");
  if (video.readyState < 2) await waitForVideoEvent(video, "loadeddata");

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration < .5) {
    throw new Error("Record at least half a second of the throw.");
  }
  if (duration > 45) {
    throw new Error("Use a clip under 45 seconds so Flight Lab can focus on one throw.");
  }

  const width = 240;
  const height = Math.max(120, Math.round(width / Math.max(.75, video.videoWidth / video.videoHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Video analysis is unavailable in this browser.");

  const sampleCount = clampNumber(Math.round(duration * 5), 18, 42);
  const points: TrackPoint[] = [];
  let previous: Uint8ClampedArray | null = null;

  for (let index = 0; index < sampleCount; index++) {
    const time = Math.min(Math.max(0, duration - .03), (duration * index) / Math.max(1, sampleCount - 1));
    await seekVideo(video, time);
    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;

    if (previous) {
      const differences = new Float32Array(width * height);
      let differenceTotal = 0;
      for (let pixel = 0; pixel < width * height; pixel++) {
        const offset = pixel * 4;
        const difference = (
          Math.abs(pixels[offset] - previous[offset]) +
          Math.abs(pixels[offset + 1] - previous[offset + 1]) +
          Math.abs(pixels[offset + 2] - previous[offset + 2])
        ) / 3;
        differences[pixel] = difference;
        differenceTotal += difference;
      }

      const averageDifference = differenceTotal / differences.length;
      const threshold = clampNumber(averageDifference * 2.5 + 8, 24, 72);
      let weightTotal = 0;
      let xTotal = 0;
      let yTotal = 0;
      let changedPixels = 0;

      for (let y = 5; y < height - 5; y++) {
        for (let x = 5; x < width - 5; x++) {
          const difference = differences[y * width + x];
          if (difference <= threshold) continue;
          const weight = difference - threshold;
          weightTotal += weight;
          xTotal += x * weight;
          yTotal += y * weight;
          changedPixels++;
        }
      }

      const changedRatio = changedPixels / (width * height);
      if (weightTotal > 900 && changedRatio > .0004 && changedRatio < .34) {
        points.push({
          x: xTotal / weightTotal / width,
          y: yTotal / weightTotal / height,
          time,
        });
      }
    }

    previous = new Uint8ClampedArray(pixels);
  }

  const smoothed = points.map((point, index, all) => {
    const nearby = all.slice(Math.max(0, index - 1), Math.min(all.length, index + 2));
    return {
      x: nearby.reduce((sum, item) => sum + item.x, 0) / nearby.length,
      y: nearby.reduce((sum, item) => sum + item.y, 0) / nearby.length,
      time: point.time,
    };
  }).filter((point, index, all) => {
    if (index === 0) return true;
    return Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) < .62;
  });

  if (smoothed.length < 5) {
    throw new Error("I could not find a clear moving flight. Keep the camera steady, use a plain background, and keep the airplane in frame.");
  }

  let pathLength = 0;
  const angles: number[] = [];
  for (let index = 1; index < smoothed.length; index++) {
    const deltaX = smoothed[index].x - smoothed[index - 1].x;
    const deltaY = smoothed[index].y - smoothed[index - 1].y;
    pathLength += Math.hypot(deltaX, deltaY);
    angles.push(Math.atan2(deltaY, deltaX));
  }

  const directDistance = Math.hypot(
    smoothed.at(-1)!.x - smoothed[0].x,
    smoothed.at(-1)!.y - smoothed[0].y,
  );
  const curve = Math.round(clampNumber((1 - directDistance / Math.max(.001, pathLength)) * 135, 0, 100));
  const directionChanges = angles.slice(1).map((angle, index) => angleDifference(angle, angles[index]));
  const averageTurn = directionChanges.length
    ? directionChanges.reduce((sum, value) => sum + value, 0) / directionChanges.length
    : 0;
  const stability = Math.round(clampNumber(100 - (averageTurn / Math.PI) * 125, 0, 100));
  const airtime = Math.max(.1, smoothed.at(-1)!.time - smoothed[0].time);
  const verticalTravel = smoothed.at(-1)!.y - smoothed[0].y;
  const profile = verticalTravel > .16
    ? "Descending finish"
    : verticalTravel < -.16
      ? "Climbing finish"
      : curve > 55
        ? "Curved flight"
        : "Mostly level";

  return {
    airtime,
    curve,
    stability,
    relativeSpeed: pathLength / airtime,
    confidence: Math.round(clampNumber((smoothed.length / (sampleCount - 1)) * 125, 0, 100)),
    profile,
    points: smoothed,
  };
}

function FlightPathCanvas({ report }: { report: VideoReport }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    const padding = 48;
    context.clearRect(0, 0, width, height);
    const gradient = context.createRadialGradient(width * .55, height * .45, 20, width * .55, height * .45, width * .65);
    gradient.addColorStop(0, "#164c91");
    gradient.addColorStop(.46, "#0b2b54");
    gradient.addColorStop(1, "#041120");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(67, 220, 255, .22)";
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(width * .52, height * .5, width * .38, height * .3, -.12, 0, Math.PI * 2);
    context.stroke();

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 7;
    context.shadowColor = "rgba(67, 220, 255, .7)";
    context.shadowBlur = 16;
    const line = context.createLinearGradient(0, 0, width, 0);
    line.addColorStop(0, "#c8f34b");
    line.addColorStop(.55, "#43dcff");
    line.addColorStop(1, "#ff7148");
    context.strokeStyle = line;
    context.beginPath();
    report.points.forEach((point, index) => {
      const x = padding + point.x * (width - padding * 2);
      const y = padding + point.y * (height - padding * 2);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.shadowBlur = 0;

    const last = report.points.at(-1)!;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(
      padding + last.x * (width - padding * 2),
      padding + last.y * (height - padding * 2),
      10,
      0,
      Math.PI * 2,
    );
    context.fill();
  }, [report]);

  return <canvas ref={canvasRef} className="pro-path-canvas" width="960" height="420" aria-label="Tracked flight path from the selected video" />;
}

export default function ProVideoLab({ displayName }: { displayName: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [report, setReport] = useState<VideoReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  function chooseVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Choose a video recording of one paper-airplane throw.");
      return;
    }
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setReport(null);
    setError("");
  }

  async function runAnalysis() {
    if (!videoUrl) return;
    setAnalyzing(true);
    setError("");
    setReport(null);
    try {
      setReport(await analyzeVideo(videoUrl));
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "The video could not be analyzed.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <section className="pro-lab-page" id="pro-video-workspace">
      <section className="pro-lab-hero">
        <div>
          <p className="pro-kicker">Flight Lab Pro · Video analyzer</p>
          <h1>Trace the<br /><em>whole flight.</em></h1>
          <p>Record one throw from a steady position. Flight Lab analyzes the video on this device, traces the moving flight path, and measures airtime, curve, stability, and relative screen speed.</p>
        </div>
        <aside><b>{displayName} · Lifetime Pro</b><span>Pro access confirmed. Your video stays on this device and is not uploaded or saved by Flight Lab.</span></aside>
      </section>

      <section className="pro-video-workspace">
        <div className="pro-video-input">
          <input ref={inputRef} className="sr-only" type="file" accept="video/*" capture="environment" onChange={chooseVideo} aria-label="Record or choose a flight video" />
          {videoUrl ? (
            <>
              <video src={videoUrl} controls playsInline preload="metadata" aria-label={`Selected flight video: ${videoName}`} />
              <div className="pro-video-actions">
                <button type="button" className="secondary-action" onClick={() => inputRef.current?.click()}>Choose another video</button>
                <button type="button" className="primary-action" onClick={runAnalysis} disabled={analyzing}>{analyzing ? "Tracing flight…" : "Analyze flight video"}</button>
              </div>
            </>
          ) : (
            <button className="pro-video-picker" type="button" onClick={() => inputRef.current?.click()}>
              <span>VIDEO</span><b>Record or choose one throw</b><small>Best results: steady camera, plain background, whole flight in frame, clip under 45 seconds</small>
            </button>
          )}
          {error && <p className="pro-video-error" role="alert">{error}</p>}
        </div>

        <div className="pro-video-guide">
          <p className="pro-kicker">Capture checklist</p>
          <ol><li><span>01</span><b>Hold still</b><small>Rest the phone or iPad against something stable.</small></li><li><span>02</span><b>Frame the route</b><small>Keep the launch and landing area visible.</small></li><li><span>03</span><b>Use contrast</b><small>A bright plane against a darker background tracks best.</small></li></ol>
        </div>
      </section>

      {report && <section className="pro-video-report" aria-live="polite">
        <div className="pro-report-heading"><div><p className="pro-kicker">Analysis complete</p><h2>{report.profile}</h2></div><span>{report.confidence}% track confidence</span></div>
        <FlightPathCanvas report={report} />
        <div className="pro-report-metrics">
          <article><span>Tracked airtime</span><b>{report.airtime.toFixed(2)} <small>sec</small></b></article>
          <article><span>Flight curve</span><b>{report.curve}<small>/100</small></b></article>
          <article><span>Path stability</span><b>{report.stability}<small>/100</small></b></article>
          <article><span>Relative speed</span><b>{report.relativeSpeed.toFixed(2)} <small>frames/sec</small></b></article>
        </div>
        <p className="pro-report-note">These are on-screen motion estimates, not real-world distance or radar speed. Keep the camera still and compare videos shot from the same position for the most useful results.</p>
      </section>}

    </section>
  );
}
