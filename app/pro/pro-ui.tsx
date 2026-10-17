"use client";

import { useEffect, useState } from "react";

// AI requests have no measurable percentage. This estimate slows gently rather
// than racing to a fixed ceiling; elapsed time stays visible for long requests.
export function estimatedProgress(elapsedMs: number, expectedDurationMs: number) {
  const elapsed = Math.max(0, elapsedMs);
  return Math.min(99.9, 1 + 99 * elapsed / (elapsed + Math.max(1000, expectedDurationMs) / 3));
}

function useEstimatedProgress(expectedDurationMs: number) {
  const [elapsedMs, setElapsedMs] = useState(0);
  // Keep pacing stable if the interface or model controls change mid-request.
  const [requestDurationMs] = useState(expectedDurationMs);
  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 200);
    return () => window.clearInterval(timer);
  }, []);
  return { progress: estimatedProgress(elapsedMs, requestDurationMs), seconds: Math.floor(elapsedMs / 1000) };
}

export function WaitingProgress({ label, expectedDurationMs = 20000 }: { label: string; expectedDurationMs?: number }) {
  const { progress, seconds } = useEstimatedProgress(expectedDurationMs);
  return <div className="waiting-progress" role="status" aria-label={label}>
    <small>{label}</small>
    <div className="pro-progress-track" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
    <small aria-hidden="true">Estimated {progress < 90 ? Math.floor(progress) : progress.toFixed(1)}% · {seconds}s{seconds * 1000 > expectedDurationMs ? " · Still working" : ""}</small>
  </div>;
}

export function SpinningPlane({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`pro-plane-orbit ${compact ? "compact" : ""}`} aria-hidden="true">
      <div className="pro-orbit-ring ring-one" />
      <div className="pro-orbit-ring ring-two" />
      <div className="pro-plane-3d">
        <span className="pro-plane-wing wing-left" />
        <span className="pro-plane-wing wing-right" />
        <span className="pro-plane-panel panel-left" />
        <span className="pro-plane-panel panel-right" />
        <span className="pro-plane-body" />
        <span className="pro-plane-fold" />
        <span className="pro-plane-nose" />
      </div>
    </div>
  );
}

export function AnalysisLoader({
  progress,
  label,
  expectedDurationMs = 20000,
}: {
  progress: number;
  label: string;
  expectedDurationMs?: number;
}) {
  const { progress: estimate, seconds } = useEstimatedProgress(expectedDurationMs);
  const safeProgress = progress >= 100 ? 100 : estimate;
  const percentage = safeProgress < 90 || safeProgress === 100 ? Math.floor(safeProgress) : safeProgress.toFixed(1);
  return (
    <div className="pro-analysis-loader" role="status" aria-live="polite">
      <div className="pro-evidence-loader" aria-hidden="true">
        <span className={safeProgress >= 12 ? "done" : "active"}>01<b>Check input</b></span>
        <span className={safeProgress >= 27 ? "done" : safeProgress >= 12 ? "active" : ""}>02<b>Find plane</b></span>
        <span className={safeProgress >= 42 ? "done" : safeProgress >= 27 ? "active" : ""}>03<b>Measure folds</b></span>
        <span className={safeProgress >= 58 ? "done" : safeProgress >= 42 ? "active" : ""}>04<b>Build depth</b></span>
        <span className={safeProgress >= 74 ? "done" : safeProgress >= 58 ? "active" : ""}>05<b>Inspect views</b></span>
        <span className={safeProgress >= 89 ? "done" : safeProgress >= 74 ? "active" : ""}>06<b>Match flights</b></span>
        <span className={safeProgress >= 99 ? "done" : safeProgress >= 89 ? "active" : ""}>07<b>Finish report</b></span>
        <i style={{ height: `${safeProgress}%` }} />
      </div>
      <div className="pro-loader-copy">
        <span>Analysis progress · estimated</span>
        <b>{label}</b>
        <div className="pro-progress-track" aria-hidden="true">
          <i style={{ width: `${safeProgress}%` }} />
        </div>
        <strong aria-hidden="true">{percentage}%</strong>
        <small aria-hidden="true">{seconds}s elapsed{seconds * 1000 > expectedDurationMs ? " · Still working on your inspection" : ""}</small>
      </div>
    </div>
  );
}
