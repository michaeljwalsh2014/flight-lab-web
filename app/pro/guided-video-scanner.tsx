"use client";

import { useEffect, useRef, useState } from "react";
import type { ReconstructionView } from "./plane-reconstruction";

type ScanFrameSet = Partial<Record<ReconstructionView, string>>;

const phases: Array<{ view: ReconstructionView; title: string; instruction: string; arrow: string }> = [
  { view: "top", title: "Upper pass", instruction: "Start directly above the plane", arrow: "↓" },
  { view: "right", title: "Upper right", instruction: "Circle right while staying above the wing", arrow: "↘" },
  { view: "tail", title: "Upper tail", instruction: "Continue slowly around the tail", arrow: "→" },
  { view: "left", title: "Upper left", instruction: "Complete the upper circle", arrow: "↗" },
  { view: "nose", title: "Level nose", instruction: "Lower to wing height and face the nose", arrow: "↓" },
  { view: "right", title: "Level right", instruction: "Circle at the same height as the wings", arrow: "→" },
  { view: "tail", title: "Level tail", instruction: "Keep the entire tail and both wings visible", arrow: "→" },
  { view: "left", title: "Level left", instruction: "Finish the wing-level circle", arrow: "←" },
  { view: "underside", title: "Lower pass", instruction: "Lower the camera—do not move the plane", arrow: "↙" },
  { view: "underside", title: "Under wings", instruction: "Circle below the wing edges", arrow: "←" },
  { view: "underside", title: "Under tail", instruction: "Finish with the underside and tail visible", arrow: "✓" },
];

function captureFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not capture the scan video.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", .84);
}

export async function extractGuidedVideoFrames(file: File): Promise<ScanFrameSet> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "metadata"; video.src = url;
  try {
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("That video could not be read.")); });
    if (!Number.isFinite(video.duration) || video.duration < 5) throw new Error("Record at least 5 seconds so every side can be seen.");
    const frames: ScanFrameSet = {};
    for (let index = 0; index < phases.length; index += 1) {
      video.currentTime = Math.min(video.duration - .05, video.duration * (.04 + index * .092));
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
      frames[phases[index].view] = captureFrame(video);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function GuidedVideoScanner({ onComplete, onError }: { onComplete: (frames: ScanFrameSet) => void; onError: (message: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const framesRef = useRef<ScanFrameSet>({});
  const [phase, setPhase] = useState(0);
  const [status, setStatus] = useState<"idle" | "ready" | "scanning" | "done">("idle");
  const current = phases[Math.min(phase, phases.length - 1)];

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setStatus("ready"); setPhase(0); framesRef.current = {};
    } catch {
      onError("Camera access was not available. You can choose a video from your camera roll instead.");
    }
  }

  function beginScan() {
    if (!videoRef.current?.videoWidth) return;
    setStatus("scanning"); setPhase(0); framesRef.current = {};
    const take = (index: number) => {
      timerRef.current = window.setTimeout(() => {
        try {
          if (!videoRef.current) return;
          framesRef.current[phases[index].view] = captureFrame(videoRef.current);
          if (index === phases.length - 1) {
            setStatus("done"); streamRef.current?.getTracks().forEach((track) => track.stop()); onComplete(framesRef.current); return;
          }
          setPhase(index + 1); take(index + 1);
        } catch (error) { onError(error instanceof Error ? error.message : "The camera scan stopped unexpectedly."); }
      }, index === 0 ? 1800 : 2100);
    };
    take(0);
  }

  return <div className={`guided-video-scanner ${status}`}>
    <div className="guided-camera-stage">
      <video ref={videoRef} muted playsInline aria-label="Live camera view for the guided airplane scan" />
      {status === "idle" ? <div className="guided-camera-empty"><span>3D</span><b>Three-pass camera orbit</b><small>Keep the plane still. The guide takes you above, level with, and below it.</small></div> : null}
      {status === "ready" || status === "scanning" ? <div className="guided-scan-overlay"><i>{current.arrow}</i><span>Step {phase + 1} of {phases.length}</span><b>{current.title}</b><small>{current.instruction}</small></div> : null}
      {status === "done" ? <div className="guided-camera-empty complete"><span>✓</span><b>All three passes captured</b><small>Upper, wing-level, and underside coverage are ready.</small></div> : null}
      <div className="guided-frame-corners"><i /><i /><i /><i /></div>
    </div>
    <div className="guided-phase-strip" aria-label="Scan viewpoints">{phases.map((item, index) => <span key={`${item.view}-${index}`} className={index < phase || status === "done" ? "done" : index === phase && status !== "idle" ? "active" : ""}><i>{index + 1}</i>{item.title}</span>)}</div>
    {status === "idle" ? <button type="button" onClick={openCamera}>Open guided camera</button> : null}
    {status === "ready" ? <button type="button" onClick={beginScan}>Start 23-second scan</button> : null}
    {status === "scanning" ? <p>Move slowly—Flight Lab captures each view automatically.</p> : null}
    {status === "done" ? <button type="button" onClick={openCamera}>Scan again</button> : null}
  </div>;
}
