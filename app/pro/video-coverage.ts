import type { TrackPoint } from "./flight-tracking";
export type FlightCoverage = {
  launch: "visible" | "outside_frame" | "not_recorded" | "uncertain";
  landing: "visible" | "outside_frame" | "not_recorded" | "uncertain";
  continuity: "visible" | "outside_frame" | "uncertain";
  confidence: number;
  evidence: string;
};
export function validCoverage(value: unknown): value is FlightCoverage {
  if (!value || typeof value !== "object") return false;
  const item = value as FlightCoverage;
  const states = ["visible", "outside_frame", "not_recorded", "uncertain"];
  return ["visible", "outside_frame", "uncertain"].includes(item.continuity) && states.includes(item.launch) && states.includes(item.landing) && Number.isFinite(item.confidence)
    && item.confidence >= 0 && item.confidence <= 100 && typeof item.evidence === "string" && item.evidence.length <= 1200;
}
export function coverageDecision(coverage?: FlightCoverage, confirmed = false) {
  if (confirmed) return "complete";
  if (!coverage || !validCoverage(coverage) || !coverage.evidence.trim()) return "uncertain";
  if (coverage.continuity === "visible" && coverage.launch === "visible" && coverage.landing === "visible" && coverage.confidence >= 85) return "complete";
  if (coverage.confidence >= 90 && [coverage.launch, coverage.landing, coverage.continuity].some(state => state === "outside_frame" || state === "not_recorded")) return "partial";
  return "uncertain";
}
export function coverageMessage(coverage?: FlightCoverage, confirmed = false) {
  const status = coverageDecision(coverage, confirmed);
  if (status === "complete") return confirmed ? "You confirmed that the trace includes release and ground contact." : "Release and ground contact are visible. No camera change is needed based on this review.";
  if (status === "partial") {
    const outside = coverage?.launch === "outside_frame" || coverage?.landing === "outside_frame" || coverage?.continuity === "outside_frame";
    return outside ? "I only saw part of the flight. The plane leaves or enters the picture during the flight. For a complete trace, move the camera farther back and film from the side with both launch and landing in frame." : "The recording misses release or landing. Record a little before release and keep filming until the plane touches the ground. Your camera position may already be fine.";
  }
  return "I couldn’t confirm both release and ground contact from the available evidence. This does not mean your camera was in the wrong position. Check the replay before recording again.";
}
export type ReferencePoint = { x: number; y: number };
export function calibratedFlightEstimates(points: TrackPoint[], aspect: number, interval: number, reference: ReferencePoint[], feet: number, complete: boolean) {
  if (!complete || reference.length !== 2 || !Number.isFinite(feet) || feet <= 0 || feet > 1000 || !Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(interval) || interval <= 0 || points.length < 6) return null;
  if (!reference.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return null;
  const span = Math.hypot((reference[1].x-reference[0].x)*aspect, reference[1].y-reference[0].y);
  if (span < .05) return null;
  const scale = feet/span;
  if (points.some((p,i) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.time) || !Number.isFinite(p.confidence) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || p.confidence < 58 || (i > 0 && (p.time <= points[i-1].time || p.time-points[i-1].time > interval*1.6)))) return null;
  // Window speeds avoid reporting a one-frame pixel jump as the peak.
  const speeds: number[] = [];
  for (let i=0;i<points.length;i++) {
    const j=points.findIndex((p,k)=>k>i && p.time-points[i].time>=.2);
    if (j<0 || points[j].time-points[i].time>.4) continue;
    speeds.push(Math.hypot((points[j].x-points[i].x)*aspect,points[j].y-points[i].y)*scale/(points[j].time-points[i].time));
  }
  if (speeds.length<3) return null;
  const robustPeaks = speeds.slice(1,-1).map((speed,i)=>[speeds[i],speed,speeds[i+2]].sort((a,b)=>a-b)[1]);
  return { distanceFeet: Math.abs(points.at(-1)!.x-points[0].x)*aspect*scale, peakMph: Math.max(...robustPeaks)*3600/5280 };
}

// Keep placement advice behind the same conservative coverage decision as the UI.
export function safeCoverageAdvice(text: string, coverage?: FlightCoverage) {
  if (coverageDecision(coverage) === "partial") return text;
  const placement = /(?:move|reposition|position|angle|farther|further|step back|wider|closer|re-?record|record again|another video|different video|new video|retake|(?:record|film) (?:a |the )?(?:new|another|complete|full)|film again|framing|cut off|cut-off|out of frame|off.?screen|miss(?:ed|ing) (?:the )?(?:launch|landing))/i;
  return placement.test(text) ? "Review the original replay to confirm release and ground contact; the available evidence does not establish a camera-position problem." : text;
}

export function reviewFrameTimes(duration: number, points: TrackPoint[] = []) {
  const end = Math.max(0, duration - .025);
  const startTrack = points[0]?.time;
  const endTrack = points.at(-1)?.time;
  const times = startTrack !== undefined && endTrack !== undefined
    ? [0, end, startTrack-.12, startTrack, startTrack+.12, endTrack-.12, endTrack, endTrack+.12, ...[.2,.4,.6,.8].map(f=>startTrack+(endTrack-startTrack)*f)]
    : Array.from({length:12},(_,i)=>end*i/11);
  return [...new Set(times.map(t=>Math.round(Math.max(0,Math.min(end,t))*1000)/1000))].sort((a,b)=>a-b);
}
