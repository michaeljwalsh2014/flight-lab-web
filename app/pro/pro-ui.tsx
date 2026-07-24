"use client";

export function SpinningPlane({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`pro-plane-orbit ${compact ? "compact" : ""}`} aria-hidden="true">
      <div className="pro-orbit-ring ring-one" />
      <div className="pro-orbit-ring ring-two" />
      <div className="pro-plane-3d">
        <span className="pro-plane-wing wing-left" />
        <span className="pro-plane-wing wing-right" />
        <span className="pro-plane-body" />
        <span className="pro-plane-fold" />
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
      <SpinningPlane compact />
      <div className="pro-loader-copy">
        <span>Flight Lab intelligence</span>
        <b>{label}</b>
        <div className="pro-progress-track" aria-label={`${safeProgress}% complete`}>
          <i style={{ width: `${safeProgress}%` }} />
        </div>
        <strong>{safeProgress}%</strong>
      </div>
    </div>
  );
}
