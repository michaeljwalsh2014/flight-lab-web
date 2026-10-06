/** Heuristic evidence quality, never a probability of correctness. */
export function evidenceLabel(value: number): string {
  return value >= 80 ? "Stronger evidence" : value >= 62 ? "Some evidence" : "Limited evidence";
}
