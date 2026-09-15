"use client";

import { useEffect, useRef, useState } from "react";

const PROGRESS_TICK_MS = 90;
const WORKING_PROGRESS_LIMIT = 98;

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
}: {
  progress: number;
  label: string;
}) {
  const targetProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const [safeProgress, setSafeProgress] = useState(0);
  const targetRef = useRef(targetProgress);

  useEffect(() => {
    targetRef.current = Math.max(targetRef.current, targetProgress);
  }, [targetProgress]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSafeProgress((current) => {
        const target = targetRef.current;
        if (current >= 100) {
          window.clearInterval(timer);
          return 100;
        }

        // Server-side AI does not expose meaningful percentage updates. Keep one
        // calm, monotonic cadence between real milestones so the loader never
        // races to a milestone and then appears frozen. Reserve 100% for a real
        // completion signal from the task.
        if (target >= 100) return current + 1;
        return Math.min(WORKING_PROGRESS_LIMIT, current + 1);
      });
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="pro-analysis-loader" role="status" aria-live="polite">
      <div className="pro-evidence-loader" aria-hidden="true">
        <span className={safeProgress >= 12 ? "done" : "active"}>01<b>Verify video</b></span>
        <span className={safeProgress >= 27 ? "done" : safeProgress >= 12 ? "active" : ""}>02<b>Find plane</b></span>
        <span className={safeProgress >= 42 ? "done" : safeProgress >= 27 ? "active" : ""}>03<b>Measure folds</b></span>
        <span className={safeProgress >= 58 ? "done" : safeProgress >= 42 ? "active" : ""}>04<b>Build depth</b></span>
        <span className={safeProgress >= 74 ? "done" : safeProgress >= 58 ? "active" : ""}>05<b>Inspect views</b></span>
        <span className={safeProgress >= 89 ? "done" : safeProgress >= 74 ? "active" : ""}>06<b>Match flights</b></span>
        <span className={safeProgress >= 99 ? "done" : safeProgress >= 89 ? "active" : ""}>07<b>Finish report</b></span>
        <i style={{ height: `${safeProgress}%` }} />
      </div>
      <div className="pro-loader-copy">
        <span>Evidence pipeline</span>
        <b>{label}</b>
        <div className="pro-progress-track" aria-label={`${safeProgress}% complete`}>
          <i style={{ width: `${safeProgress}%` }} />
        </div>
        <strong>{safeProgress}%</strong>
      </div>
    </div>
  );
}
