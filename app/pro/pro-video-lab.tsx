"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { publishProAiContext, type ProAiContext } from "./pro-ai-context";
import { AnalysisLoader } from "./pro-ui";
import { COACH_MODEL_NUMBER, COACH_MODEL_OPTIONS, useModelVersion } from "./model-version";

type TrackPoint = { x: number; y: number; time: number; confidence: number };
type Candidate = { x: number; y: number; area: number; energy: number; frame: number; time: number };
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
};
type ViewMode = "3d" | "side" | "top";
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

function buildBestTrack(frames: Candidate[][]) {
  type Node = Candidate & { score: number; length: number; previous: Node | null; velocityX: number; velocityY: number };
  const nodesByFrame: Node[][] = [];
  let best: Node | null = null;
  frames.forEach((candidates, frameIndex) => {
    const nodes = candidates.map((candidate) => {
      let bestPrevious: Node | null = null;
      let bestScore = -Infinity;
      for (let lookback = 1; lookback <= 3; lookback++) {
        const previousFrame = nodesByFrame[frameIndex - lookback] ?? [];
        for (const previous of previousFrame) {
          const predictedX = previous.x + previous.velocityX * lookback;
          const predictedY = previous.y + previous.velocityY * lookback;
          const predictionError = Math.hypot(candidate.x - predictedX, candidate.y - predictedY);
          const rawDistance = Math.hypot(candidate.x - previous.x, candidate.y - previous.y);
          if (rawDistance > .24 || predictionError > .18) continue;
          const areaChange = Math.abs(Math.log((candidate.area + 1) / (previous.area + 1)));
          const nextVelocityX = (candidate.x - previous.x) / lookback;
          const nextVelocityY = (candidate.y - previous.y) / lookback;
          const previousSpeed = Math.hypot(previous.velocityX, previous.velocityY);
          const nextSpeed = Math.hypot(nextVelocityX, nextVelocityY);
          let turnPenalty = 0;
          if (previousSpeed > .006 && nextSpeed > .006) {
            const similarity = clampNumber(
              (previous.velocityX * nextVelocityX + previous.velocityY * nextVelocityY) / (previousSpeed * nextSpeed),
              -1,
              1,
            );
            const turn = Math.acos(similarity);
            if (turn > Math.PI * .72) continue;
            turnPenalty = turn * 5.8;
          }
          const speedPenalty = previousSpeed > .006
            ? Math.abs(Math.log((nextSpeed + .006) / (previousSpeed + .006))) * 1.8
            : 0;
          const movementReward = Math.min(.08, rawDistance) * 13;
          const transition = previous.score + 3.1 + movementReward
            - predictionError * 31
            - areaChange * 1.25
            - turnPenalty
            - speedPenalty
            - (lookback - 1) * 1.7;
          if (transition > bestScore) {
            bestScore = transition;
            bestPrevious = previous;
          }
        }
      }
      const baseScore = Math.min(2.4, candidate.energy / Math.max(1, candidate.area) / 18);
      const node: Node = {
        ...candidate,
        score: bestPrevious ? bestScore + baseScore : baseScore,
        length: (bestPrevious?.length ?? 0) + 1,
        previous: bestPrevious,
        velocityX: bestPrevious ? (candidate.x - bestPrevious.x) * .65 + bestPrevious.velocityX * .35 : 0,
        velocityY: bestPrevious ? (candidate.y - bestPrevious.y) * .65 + bestPrevious.velocityY * .35 : 0,
      };
      if (!best || node.length > best.length || (node.length === best.length && node.score > best.score)) best = node;
      return node;
    });
    nodesByFrame.push(nodes);
  });

  const reversed: Candidate[] = [];
  let cursor = best as Node | null;
  while (cursor !== null) {
    const current: Node = cursor;
    reversed.push(current);
    cursor = current.previous;
  }
  return reversed.reverse();
}

function cleanTrack(raw: Candidate[], totalSamples: number) {
  if (raw.length < 6) return [];
  const distances = raw.slice(1).map((point, index) => Math.hypot(point.x - raw[index].x, point.y - raw[index].y)).sort((a, b) => a - b);
  const medianStep = distances[Math.floor(distances.length / 2)] || .03;
  const stepFiltered: Candidate[] = [];
  raw.forEach((point) => {
    const previous = stepFiltered.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) < Math.max(.095, medianStep * 3.2)) {
      stepFiltered.push(point);
    }
  });
  if (stepFiltered.length < 6) return [];

  const first = stepFiltered[0];
  const last = stepFiltered.at(-1)!;
  const directX = last.x - first.x;
  const directY = last.y - first.y;
  const directLength = Math.hypot(directX, directY);
  if (directLength < .06) return [];
  const directionX = directX / directLength;
  const directionY = directY / directLength;
  const forwardFiltered: Candidate[] = [];
  let furthestProgress = -Infinity;
  stepFiltered.forEach((point) => {
    const progress = (point.x - first.x) * directionX + (point.y - first.y) * directionY;
    if (!forwardFiltered.length || progress >= furthestProgress - Math.max(.025, medianStep * 1.25)) {
      forwardFiltered.push(point);
      furthestProgress = Math.max(furthestProgress, progress);
    }
  });
  if (forwardFiltered.length < 6) return [];

  const smoothed = forwardFiltered.map((point, index, all) => {
    const from = Math.max(0, index - 2);
    const to = Math.min(all.length - 1, index + 2);
    let weightTotal = 0;
    let xTotal = 0;
    let yTotal = 0;
    for (let nearbyIndex = from; nearbyIndex <= to; nearbyIndex++) {
      const weight = 3 - Math.abs(nearbyIndex - index);
      weightTotal += weight;
      xTotal += all[nearbyIndex].x * weight;
      yTotal += all[nearbyIndex].y * weight;
    }
    return { ...point, x: xTotal / weightTotal, y: yTotal / weightTotal };
  });

  let pathLength = 0;
  for (let index = 1; index < smoothed.length; index++) {
    pathLength += Math.hypot(smoothed[index].x - smoothed[index - 1].x, smoothed[index].y - smoothed[index - 1].y);
  }
  const straightness = directLength / Math.max(directLength, pathLength);
  const uncertaintyPenalty = clampNumber((.78 - straightness) * 22, 0, 15);

  return smoothed.map((point) => {
    return {
      x: point.x,
      y: point.y,
      time: point.time,
      confidence: Math.round(clampNumber(
        48 + point.energy / Math.max(1, point.area) * 1.8 + forwardFiltered.length / totalSamples * 38 - uncertaintyPenalty,
        0,
        97,
      )),
    };
  });
}

async function analyzeVideo(url: string, onProgress: (progress: number, stage: string) => void): Promise<VideoReport> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  onProgress(4, "Opening the video");
  await waitForVideoEvent(video, "loadedmetadata");
  if (video.readyState < 2) await waitForVideoEvent(video, "loadeddata");

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration < .5) throw new Error("Record at least half a second of the throw.");
  if (duration > 45) throw new Error("Use a clip under 45 seconds so Flight Lab can focus on one throw.");

  const width = 300;
  const height = Math.max(140, Math.round(width / Math.max(.75, video.videoWidth / video.videoHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Video analysis is unavailable in this browser.");

  const sampleCount = clampNumber(Math.round(duration * 9), 24, 90);
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
    onProgress(progress, index < sampleCount * .28 ? "Finding the airplane" : "Tracking every flight frame");
  }

  onProgress(82, "Removing camera shake and false turns");
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
  onProgress(94, "Building the interactive flight model");
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  onProgress(100, "Flight model ready");

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
  };
}

function projectPath(
  report: VideoReport,
  width: number,
  height: number,
  yaw: number,
  pitch: number,
  zoom: number,
) {
  const first = report.points[0];
  const last = report.points.at(-1)!;
  const directX = last.x - first.x;
  const duration = Math.max(.001, last.time - first.time);
  const horizontalSpan = Math.max(.18, Math.abs(directX));
  const verticalScale = Math.max(.18, horizontalSpan * .72);
  return report.points.map((point) => {
    const progress = clampNumber((point.time - first.time) / duration, 0, 1);
    const expectedScreenX = first.x + directX * progress;
    let x = (progress - .5) * 2.2;
    let y = clampNumber((first.y - point.y) / verticalScale, -1.25, 1.25);
    let z = (point.x - expectedScreenX) / horizontalSpan * .9;
    const yawX = x * Math.cos(yaw) - z * Math.sin(yaw);
    const yawZ = x * Math.sin(yaw) + z * Math.cos(yaw);
    const pitchY = y * Math.cos(pitch) - yawZ * Math.sin(pitch);
    const pitchZ = y * Math.sin(pitch) + yawZ * Math.cos(pitch);
    x = yawX;
    y = pitchY;
    z = pitchZ;
    const perspective = 1 / Math.max(.48, 1.8 + z * .34);
    return {
      x: width / 2 + x * width * .39 * perspective * zoom,
      y: height / 2 - y * height * .72 * perspective * zoom,
      depth: z,
      confidence: point.confidence,
    };
  });
}

function InteractiveFlightPath({ report }: { report: VideoReport }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<ViewMode>("3d");
  const [yaw, setYaw] = useState(-.62);
  const [pitch, setPitch] = useState(.34);
  const [zoom, setZoom] = useState(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinch = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    const gradient = context.createRadialGradient(width * .52, height * .42, 20, width * .52, height * .42, width * .72);
    gradient.addColorStop(0, "#123b69");
    gradient.addColorStop(.48, "#071d36");
    gradient.addColorStop(1, "#020913");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const projected = projectPath(report, width, height, yaw, pitch, zoom);
    context.strokeStyle = "rgba(100, 199, 255, .13)";
    context.lineWidth = 1;
    for (let index = -5; index <= 5; index++) {
      const position = height / 2 + index * 36 * zoom;
      context.beginPath();
      context.moveTo(width * .08, position);
      context.lineTo(width * .92, position);
      context.stroke();
    }
    for (let index = -8; index <= 8; index++) {
      const position = width / 2 + index * 52 * zoom;
      context.beginPath();
      context.moveTo(position, height * .12);
      context.lineTo(position, height * .88);
      context.stroke();
    }

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 9;
    context.shadowColor = "rgba(67,220,255,.7)";
    context.shadowBlur = 18;
    const line = context.createLinearGradient(width * .1, 0, width * .9, 0);
    line.addColorStop(0, "#c8f34b");
    line.addColorStop(.54, "#43dcff");
    line.addColorStop(1, "#ff7148");
    context.strokeStyle = line;
    context.beginPath();
    projected.forEach((point, index) => {
      if (!index) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
    context.shadowBlur = 0;

    projected.forEach((point, index) => {
      if (index % Math.max(1, Math.round(projected.length / 12)) !== 0 && index !== projected.length - 1) return;
      context.fillStyle = point.confidence < 58 ? "#ffb248" : "#ffffff";
      context.beginPath();
      context.arc(point.x, point.y, index === projected.length - 1 ? 8 : 4, 0, Math.PI * 2);
      context.fill();
    });

    const start = projected[0];
    const finish = projected.at(-1)!;
    context.font = "800 18px system-ui";
    context.fillStyle = "#c8f34b";
    context.fillText("LAUNCH", start.x + 12, start.y - 12);
    context.fillStyle = "#ff8d6d";
    context.fillText("FINISH", finish.x + 12, finish.y - 12);
  }, [pitch, report, view, yaw, zoom]);

  function chooseView(next: ViewMode) {
    setView(next);
    if (next === "side") {
      setYaw(0);
      setPitch(0);
    } else if (next === "top") {
      setYaw(0);
      setPitch(1.18);
    } else {
      setYaw(-.62);
      setPitch(.34);
    }
    setZoom(1);
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = [...pointers.current.values()];
    if (active.length === 1) {
      setYaw((value) => value + (event.clientX - previous.x) * .009);
      setPitch((value) => clampNumber(value + (event.clientY - previous.y) * .007, -1.25, 1.25));
    } else if (active.length === 2) {
      const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y);
      if (lastPinch.current != null) setZoom((value) => clampNumber(value * distance / Math.max(1, lastPinch.current!), .62, 2.3));
      lastPinch.current = distance;
    }
  }

  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) lastPinch.current = null;
  }

  function wheel(event: WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    setZoom((value) => clampNumber(value * (event.deltaY > 0 ? .92 : 1.08), .62, 2.3));
  }

  return (
    <div className="interactive-flight-model">
      <div className="path-toolbar">
        <div><button type="button" className={view === "3d" ? "active" : ""} onClick={() => chooseView("3d")}>3D view</button><button type="button" className={view === "side" ? "active" : ""} onClick={() => chooseView("side")}>Side view</button><button type="button" className={view === "top" ? "active" : ""} onClick={() => chooseView("top")}>Top map</button></div>
        <span>Drag to rotate · pinch or scroll to zoom</span>
      </div>
      <canvas ref={canvasRef} className="interactive-path-canvas" width="1200" height="620" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel} aria-label="Interactive estimated three-dimensional flight path. Drag to rotate and pinch to zoom." />
      <p className="model-disclaimer">The movable model uses screen motion and time to help inspect the trace. A single side video cannot measure true real-world depth.</p>
    </div>
  );
}

function VideoPathReplay({ url, report }: { url: string; report: VideoReport }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "#c8f34b");
    gradient.addColorStop(.55, "#43dcff");
    gradient.addColorStop(1, "#ff7148");
    context.strokeStyle = gradient;
    context.lineWidth = 5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.shadowColor = "rgba(0,0,0,.65)";
    context.shadowBlur = 8;
    context.beginPath();
    report.points.forEach((point, index) => {
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      if (!index) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.shadowBlur = 0;
  }, [report]);
  return <div className="video-path-replay"><video src={url} controls playsInline preload="metadata" aria-label="Original video with tracked flight path" /><canvas ref={canvasRef} width="960" height="540" aria-hidden="true" /><span>Tracked path overlay</span></div>;
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

  useEffect(() => {
    reviewGeneration.current++;
    setInspection(null);
    publishProAiContext({ videoInspection: null });
    return () => { reviewGeneration.current++; };
  }, [videoUrl, selectedModel]);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => {
    if (!report) return;
    publishProAiContext({
      flight: {
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
    setAnalyzing(true);
    setInspection(null);
    publishProAiContext({ videoInspection: null });
    setError("");
    setReport(null);
    setProgress(1);
    setStage("Preparing the flight");
    try {
      let localError = "";
      try {
        const nextReport = await analyzeVideo(videoUrl, (nextProgress, nextStage) => {
          if (generation !== reviewGeneration.current) return;
          setProgress(selectedModel === "v40" || selectedModel === "v46" ? Math.round(nextProgress * .6) : nextProgress);
          setStage(nextStage);
        });
        if (generation !== reviewGeneration.current) return;
        setReport(nextReport);
      } catch (failure) {
        if (selectedModel !== "v40" && selectedModel !== "v46") throw failure;
        localError = failure instanceof Error ? failure.message : "Local tracking was unavailable.";
      }
      if (selectedModel === "v40" || selectedModel === "v46") {
        if (generation !== reviewGeneration.current) return;
        setProgress(65); setStage("Preparing frames for advanced review");
        const sampled = await sampleVideoForReview(videoUrl);
        if (generation !== reviewGeneration.current) return;
        setProgress(80); setStage("Reviewing the visible flight with AI");
        const storageKey = "flight-lab-pro-coach-id";
        let coachId = window.localStorage.getItem(storageKey);
        if (!coachId) { coachId = crypto.randomUUID(); window.localStorage.setItem(storageKey, coachId); }
        const response = await fetch("/api/pro-video", {
          method: "POST", headers: { "Content-Type": "application/json", "X-Flight-Lab-Pro-Path": window.location.pathname },
          body: JSON.stringify({ ...sampled, coachId, modelVersion: selectedModel }),
        });
        const payload = await response.json() as { analysis?: Omit<VideoInspection, "sampledFrames">; sampledFrames?: number; message?: string };
        if (generation !== reviewGeneration.current) return;
        if (!response.ok || !payload.analysis) throw new Error(payload.message || "The video review could not connect. Please try again.");
        const reviewed = { ...payload.analysis, sampledFrames: payload.sampledFrames ?? sampled.frames.length };
        setInspection(reviewed);
        publishProAiContext({ videoInspection: reviewed });
      }
      if (localError) setError(`Motion tracking: ${localError} The AI review is shown separately below.`);
      setProgress(100); setStage("Review complete");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "The video could not be analyzed.");
      setProgress(0);
      setStage("");
    } finally {
      setAnalyzing(false);
    }
  }

  const trackQuality = useMemo(() => report ? report.confidence >= 80 ? "High-confidence track" : report.confidence >= 62 ? "Usable track" : "Review uncertain points" : "", [report]);

  return (
    <section className="pro-tool-section pro-video-lab" id="video-lab">
      <div className="pro-tool-heading">
        <div><span className="pro-index">02</span><p>Airplane-specific motion tracking</p><h2>3D Flight Tracker</h2></div>
        <p>Higher frame sampling, motion-component tracking, shake rejection, and a path you can move with your fingers.</p>
      </div>

      <div className="pro-video-grid">
        <div className="pro-video-input">
          <label className="pro-model-field">AI version<select value={selectedModel} disabled={analyzing} onChange={(event) => chooseModel(event.target.value as typeof selectedModel)}>{COACH_MODEL_OPTIONS.map((option) => <option key={option.model} value={option.model}>{option.label}</option>)}</select></label>
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

      {inspection && <section className="pro-video-ai-review compact" aria-live="polite"><span>Flight Lab {COACH_MODEL_NUMBER[selectedModel]} · Quick review</span><h3>{inspection.canReview ? inspection.summary : "More visual evidence needed"}</h3><ul>{inspection.observations.slice(0, 2).map((item) => <li key={item}>{item}</li>)}</ul><p><b>Release:</b> {inspection.releaseStrength}{inspection.releaseStrength !== "uncertain" ? ` · ${Math.round(inspection.releaseConfidence)}% confidence` : ""} <b>Next:</b> {inspection.nextTest}</p>{inspection.uncertainties.length > 0 && <small>Uncertain: {inspection.uncertainties.slice(0, 1).join(" ")}</small>}</section>}

      {report && videoUrl && <div className="pro-video-report" aria-live="polite">
        <div className="pro-report-heading"><div><span>Analysis complete</span><h3>{report.profile}</h3></div><div><b>{report.confidence}%</b><small>{trackQuality}</small></div></div>
        <VideoPathReplay url={videoUrl} report={report} />
        <InteractiveFlightPath report={report} />
        <div className="pro-report-metrics compact"><article><span>Tracked airtime</span><b>{report.airtime.toFixed(2)} <small>sec</small></b></article><article><span>Flight curve</span><b>{report.curve}<small>/100</small></b></article><article><span>Path stability</span><b>{report.stability}<small>/100</small></b></article></div>
        <p className="pro-video-summary"><b>On-device coach observations:</b> {report.observations[0]} <span>Relative speed: {report.relativeSpeed.toFixed(2)} screen/sec.</span></p>
        <p className="pro-report-note">{report.sampledFrames} frames tracked · orange points are uncertain · screen motion, not real-world distance.</p>
      </div>}
    </section>
  );
}
