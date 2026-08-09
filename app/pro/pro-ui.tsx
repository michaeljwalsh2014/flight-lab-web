"use client";

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
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className="pro-analysis-loader" role="status" aria-live="polite">
      <div className="pro-evidence-loader" aria-hidden="true">
        <span className={safeProgress >= 15 ? "done" : "active"}>01<b>Verify plane</b></span>
        <span className={safeProgress >= 45 ? "done" : safeProgress >= 15 ? "active" : ""}>02<b>Measure folds</b></span>
        <span className={safeProgress >= 75 ? "done" : safeProgress >= 45 ? "active" : ""}>03<b>Match flights</b></span>
        <span className={safeProgress >= 96 ? "done" : safeProgress >= 75 ? "active" : ""}>04<b>Choose new test</b></span>
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
