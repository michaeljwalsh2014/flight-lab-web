import { freePeriod } from "@/app/daily-period";
export function exhaustedUsageMessage(feature: string, resetsAt = freePeriod().resetsAt) {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" }).format(new Date(resetsAt));
  return `You've run out of ${feature} for this daily allowance. More usage is available at 6 a.m. Central on ${date}.`;
}
