export type TrackPoint = { x: number; y: number; time: number; confidence: number };
export type Candidate = { x: number; y: number; area: number; energy: number; frame: number; time: number };
const clampNumber = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

// Keep the image geometry: time and motion cannot supply missing depth.
export function projectSidePath(points: TrackPoint[], width: number, height: number, aspect: number) {
  const drawingWidth = Math.min(width - 120, (height - 100) * aspect);
  const drawingHeight = drawingWidth / aspect;
  return points.map(point => ({ ...point, x: (width - drawingWidth) / 2 + point.x * drawingWidth, y: (height - drawingHeight) / 2 + point.y * drawingHeight }));
}

export function isTrackingGap(previous: TrackPoint, next: TrackPoint, sampleInterval: number) {
  return next.time - previous.time > sampleInterval * 1.6;
}

export function buildBestTrack(frames: Candidate[][]) {
  type Node = Candidate & { score: number; length: number; previous: Node | null; velocityX: number; velocityY: number };
  const nodesByFrame: Node[][] = [];
  let best: Node | null = null;
  frames.forEach((candidates, frameIndex) => {
    const nodes = candidates.map((candidate) => {
      let bestPrevious: Node | null = null;
      let bestScore = -Infinity;
      for (let lookback = 1; lookback <= 3; lookback++) {
        const previousFrame = nodesByFrame[frameIndex - lookback] ?? [];
        for (const previous of previousFrame) {
          const predictedX = previous.x + previous.velocityX * lookback;
          const predictedY = previous.y + previous.velocityY * lookback;
          const predictionError = Math.hypot(candidate.x - predictedX, candidate.y - predictedY);
          const rawDistance = Math.hypot(candidate.x - previous.x, candidate.y - previous.y);
          if (rawDistance > .24 || predictionError > .18) continue;
          const areaChange = Math.abs(Math.log((candidate.area + 1) / (previous.area + 1)));
          const nextVelocityX = (candidate.x - previous.x) / lookback;
          const nextVelocityY = (candidate.y - previous.y) / lookback;
          const previousSpeed = Math.hypot(previous.velocityX, previous.velocityY);
          const nextSpeed = Math.hypot(nextVelocityX, nextVelocityY);
          let turnPenalty = 0;
          if (previousSpeed > .006 && nextSpeed > .006) {
            const similarity = clampNumber(
              (previous.velocityX * nextVelocityX + previous.velocityY * nextVelocityY) / (previousSpeed * nextSpeed),
              -1,
              1,
            );
            const turn = Math.acos(similarity);
            if (turn > Math.PI * .72) continue;
            turnPenalty = turn * 5.8;
          }
          const speedPenalty = previousSpeed > .006
            ? Math.abs(Math.log((nextSpeed + .006) / (previousSpeed + .006))) * 1.8
            : 0;
          const movementReward = Math.min(.08, rawDistance) * 13;
          const transition = previous.score + 3.1 + movementReward
            - predictionError * 31
            - areaChange * 1.25
            - turnPenalty
            - speedPenalty
            - (lookback - 1) * 1.7;
          if (transition > bestScore) {
            bestScore = transition;
            bestPrevious = previous;
          }
        }
      }
      const baseScore = Math.min(2.4, candidate.energy / Math.max(1, candidate.area) / 18);
      const node: Node = {
        ...candidate,
        score: bestPrevious ? bestScore + baseScore : baseScore,
        length: (bestPrevious?.length ?? 0) + 1,
        previous: bestPrevious,
        velocityX: bestPrevious ? (candidate.x - bestPrevious.x) / (candidate.frame - bestPrevious.frame) * .65 + bestPrevious.velocityX * .35 : 0,
        velocityY: bestPrevious ? (candidate.y - bestPrevious.y) / (candidate.frame - bestPrevious.frame) * .65 + bestPrevious.velocityY * .35 : 0,
      };
      if (!best || node.length > best.length || (node.length === best.length && node.score > best.score)) best = node;
      return node;
    });
    nodesByFrame.push(nodes);
  });

  const reversed: Candidate[] = [];
  let cursor = best as Node | null;
  while (cursor !== null) {
    const current: Node = cursor;
    reversed.push(current);
    cursor = current.previous;
  }
  return reversed.reverse();
}

export function cleanTrack(raw: Candidate[], totalSamples: number) {
  if (raw.length < 6) return [];
  const distances = raw.slice(1).map((point, index) => Math.hypot(point.x - raw[index].x, point.y - raw[index].y)).sort((a, b) => a - b);
  const medianStep = distances[Math.floor(distances.length / 2)] || .03;
  const stepFiltered: Candidate[] = [];
  raw.forEach((point) => {
    const previous = stepFiltered.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) < Math.max(.095, medianStep * 3.2)) {
      stepFiltered.push(point);
    }
  });
  if (stepFiltered.length < 6) return [];

  const first = stepFiltered[0];
  const last = stepFiltered.at(-1)!;
  const directX = last.x - first.x;
  const directY = last.y - first.y;
  const directLength = Math.hypot(directX, directY);
  if (directLength < .06) return [];
  const smoothed = stepFiltered.map((point, index, all) => {
    if (index === 0 || index === all.length - 1) return point;
    if (point.frame - all[index - 1].frame > 1 || all[index + 1].frame - point.frame > 1) return point;
    const from = index - 1;
    const to = index + 1;
    let weightTotal = 0;
    let xTotal = 0;
    let yTotal = 0;
    for (let nearbyIndex = from; nearbyIndex <= to; nearbyIndex++) {
      const weight = nearbyIndex === index ? 6 : 1;
      weightTotal += weight;
      xTotal += all[nearbyIndex].x * weight;
      yTotal += all[nearbyIndex].y * weight;
    }
    return { ...point, x: xTotal / weightTotal, y: yTotal / weightTotal };
  });

  return smoothed.map((point, index) => {
    const gap = index > 0 ? point.frame - smoothed[index - 1].frame : 1;
    return {
      x: point.x,
      y: point.y,
      time: point.time,
      confidence: Math.round(clampNumber(
        clampNumber(48 + point.energy / Math.max(1, point.area) * 1.8 + stepFiltered.length / totalSamples * 28, 0, 97) - (gap > 1 ? 25 : 0),
        0,
        97,
      )),
    };
  });
}

