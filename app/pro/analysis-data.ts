/** Validate known fields while retaining older records and unknown future metadata. */
export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const id = (value: unknown) => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string");
export function validAnalysisRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const textFields = ["planeName", "range", "headline", "detail", "nextTest", "recommendationId", "reason", "model", "modelVersion", "source", "engine", "profile", "summary", "inspectionSummary", "planeStyle", "lastFlight", "ageRange", "throwStrength", "noseAlignment", "wingDihedral", "foldDefinition"];
  if (textFields.some(key => key in value && typeof value[key] !== "string")) return false;
  if (["evidence", "observations", "issues", "uncertainties"].some(key => key in value && !strings(value[key]))) return false;
  if ("planeId" in value && !id(value.planeId)) return false;
  if (["score", "confidence", "symmetry", "symmetryScore", "outline", "foldVisibility", "texture", "visibleBuildRisk", "releaseConfidence", "curve", "stability"].some(key => key in value && (!finite(value[key]) || Number(value[key]) < 0 || Number(value[key]) > 100))) return false;
  if (["viewCount", "localViewsAnalyzed", "sampledFrames", "airtime", "relativeSpeed"].some(key => key in value && (!finite(value[key]) || Number(value[key]) < 0))) return false;
  if (["recognizable", "canReview"].some(key => key in value && typeof value[key] !== "boolean")) return false;
  const enums: Record<string, string[]> = {
    scanMode: ["quick", "multiview"], deepInspection: ["used", "unavailable", "off", "not-applicable"],
    releaseStrength: ["gentle", "normal", "strong", "uncertain"], driftDirection: ["left", "right", "straight"],
    baselineSource: ["saved", "entered", "none"],
  };
  if (Object.entries(enums).some(([key, choices]) => key in value && !choices.includes(String(value[key])))) return false;
  if ("savedAt" in value && (typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt)))) return false;
  if ("baselineFeet" in value && value.baselineFeet !== null && (!finite(value.baselineFeet) || Number(value.baselineFeet) <= 0)) return false;
  for (const key of ["signals", "vision"]) {
    if (key in value && !(key === "vision" && value[key] === null) && !validAnalysisRecord(value[key])) return false;
  }
  if ("history" in value) {
    const history = value.history;
    if (!isRecord(history) || !Number.isSafeInteger(history.count) || Number(history.count) < 0 || !finite(history.best) || Number(history.best) < 0 || !finite(history.average) || Number(history.average) < 0) return false;
  }
  return true;
}
export function validCoachTest(value: unknown): boolean {
  return isRecord(value) && id(value.planeId) && typeof value.action === "string" && typeof value.recommendationId === "string" && ["better", "same", "worse"].includes(String(value.result)) && typeof value.createdAt === "string";
}
export function validReportCollection(value: unknown): value is Record<string, Record<string, unknown>> {
  return isRecord(value) && Object.entries(value).every(([key, report]) =>
    (key === "custom" || /^[1-9]\d*$/.test(key)) && validAnalysisRecord(report) &&
    (!("planeId" in report) || report.planeId === (key === "custom" ? null : Number(key))));
}
export function validContext(value: unknown): boolean {
  return isRecord(value) && ["plane", "flight", "videoInspection"].every(key => !(key in value) || (key === "videoInspection" && value[key] === null) || validAnalysisRecord(value[key])) &&
    (!("coachMemory" in value) || (Array.isArray(value.coachMemory) && value.coachMemory.every(validCoachTest)));
}
export function readableReport(value: unknown): boolean {
  return validAnalysisRecord(value) && "planeId" in value &&
    ["planeName", "range", "headline", "detail", "nextTest", "recommendationId"].every(key => typeof value[key] === "string") &&
    typeof value.confidence === "number" && typeof value.score === "number" && Array.isArray(value.evidence);
}
