const CENTRAL = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
function centralParts(date: Date) {
  return Object.fromEntries(CENTRAL.formatToParts(date).map(part => [part.type, part.value]));
}
function sixAM(localDate: number) {
  // At noon UTC, Chicago is either 6 a.m. (standard) or 7 a.m. (daylight time).
  // Resolving each date separately keeps both spring and fall DST resets at 6 a.m.
  const noon = new Date(localDate + 12 * 3600000);
  return new Date(noon.getTime() + (6 - Number(centralParts(noon).hour)) * 3600000);
}
export function freePeriod(now = new Date()) {
  const local = centralParts(now);
  const date = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day));
  const todayReset = sixAM(date);
  const afterReset = now.getTime() >= todayReset.getTime();
  const start = date - (afterReset ? 0 : 86400000);
  return { period: new Date(start).toISOString().slice(0, 10), resetsAt: (afterReset ? sixAM(date + 86400000) : todayReset).toISOString() };
}
