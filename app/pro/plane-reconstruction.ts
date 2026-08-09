export type ReconstructionView = "top" | "nose" | "left" | "right" | "underside" | "tail";

export type MeshVertex = { x: number; y: number; z: number };

export type PlaneMeshData = {
  vertices: MeshVertex[];
  triangles: Array<[number, number, number]>;
  stations: number;
  columns: number;
  sourceViews: number;
  silhouetteCoverage: number;
  estimatedDihedral: number;
  estimatedThickness: number;
  leftRightBalance: number;
};

type ImageSample = {
  width: number;
  height: number;
  mask: Uint8Array;
  bounds: { left: number; right: number; top: number; bottom: number };
};

const fallbackProfile = [.05, .22, .54, .84, 1, .91, .76, .59, .42, .24, .11];

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function largestConnectedMask(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best: number[] = [];
  let bestScore = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0; let tail = 0;
    queue[tail++] = start; visited[start] = 1;
    const component: number[] = [];
    let centerDistance = 0;
    while (head < tail) {
      const position = queue[head++]; component.push(position);
      const x = position % width; const y = Math.floor(position / width);
      centerDistance += Math.hypot(x - width / 2, y - height / 2);
      const neighbors = [position - 1, position + 1, position - width, position + width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= mask.length || visited[neighbor] || !mask[neighbor]) continue;
        const neighborX = neighbor % width;
        if (Math.abs(neighborX - x) > 1) continue;
        visited[neighbor] = 1; queue[tail++] = neighbor;
      }
    }
    const averageDistance = centerDistance / Math.max(1, component.length);
    const score = component.length / (1 + averageDistance / Math.max(width, height));
    if (score > bestScore) { bestScore = score; best = component; }
  }
  const selected = new Uint8Array(mask.length);
  let left = width; let right = 0; let top = height; let bottom = 0;
  for (const position of best) {
    selected[position] = 1;
    const x = position % width; const y = Math.floor(position / width);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { mask: selected, count: best.length, bounds: { left, right, top, bottom } };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("One scan photo could not be read."));
    image.src = url;
  });
}

async function sampleImage(url: string, maxDimension = 420): Promise<ImageSample> {
  const image = await loadImage(url);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(24, Math.round(image.naturalWidth * scale));
  const height = Math.max(24, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("3D reconstruction is unavailable in this browser.");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const cornerSize = Math.max(3, Math.round(Math.min(width, height) * .06));
  let bgR = 0; let bgG = 0; let bgB = 0; let bgCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inCorner = (x < cornerSize || x >= width - cornerSize) && (y < cornerSize || y >= height - cornerSize);
      if (!inCorner) continue;
      const index = (y * width + x) * 4;
      bgR += pixels[index]; bgG += pixels[index + 1]; bgB += pixels[index + 2]; bgCount += 1;
    }
  }
  bgR /= bgCount; bgG /= bgCount; bgB /= bgCount;
  const bgLight = (bgR + bgG + bgB) / 3;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = pixels[index]; const g = pixels[index + 1]; const b = pixels[index + 2];
      const distance = Math.hypot(r - bgR, g - bgG, b - bgB);
      const light = (r + g + b) / 3;
      const paperLike = light > bgLight + 17 && light > 142;
      const different = distance > 38;
      if (!(paperLike || different)) continue;
      mask[y * width + x] = 1;
    }
  }
  const connected = largestConnectedMask(mask, width, height);
  const coverage = connected.count / (width * height);
  if (coverage < .025 || coverage > .88) {
    return { width, height, mask, bounds: { left: 0, right: width - 1, top: 0, bottom: height - 1 } };
  }
  return { width, height, mask: connected.mask, bounds: connected.bounds };
}

function profileFromTop(sample: ImageSample) {
  const { left, right, top, bottom } = sample.bounds;
  const center = (left + right) / 2;
  const span = Math.max(1, right - left);
  const length = Math.max(1, bottom - top);
  const leftWidths: number[] = [];
  const rightWidths: number[] = [];
  for (let station = 0; station < fallbackProfile.length; station += 1) {
    const yCenter = Math.round(top + length * station / (fallbackProfile.length - 1));
    const radius = Math.max(2, Math.round(length * .025));
    let rowLeft = sample.width; let rowRight = -1;
    for (let y = Math.max(0, yCenter - radius); y <= Math.min(sample.height - 1, yCenter + radius); y += 1) {
      for (let x = Math.max(0, left); x <= Math.min(sample.width - 1, right); x += 1) {
        if (!sample.mask[y * sample.width + x]) continue;
        rowLeft = Math.min(rowLeft, x); rowRight = Math.max(rowRight, x);
      }
    }
    if (rowRight <= rowLeft) {
      leftWidths.push(fallbackProfile[station]); rightWidths.push(fallbackProfile[station]);
    } else {
      leftWidths.push(clamp((center - rowLeft) / (span / 2), .03, 1.15));
      rightWidths.push(clamp((rowRight - center) / (span / 2), .03, 1.15));
    }
  }
  const totalLeft = leftWidths.reduce((sum, value) => sum + value, 0);
  const totalRight = rightWidths.reduce((sum, value) => sum + value, 0);
  const balance = Math.round(clamp(100 - Math.abs(totalLeft - totalRight) / Math.max(totalLeft, totalRight) * 100, 0, 100));
  return { leftWidths, rightWidths, balance, coverage: clamp(span * length / (sample.width * sample.height), 0, 1) };
}

function aspect(sample?: ImageSample) {
  if (!sample) return .14;
  const width = Math.max(1, sample.bounds.right - sample.bounds.left);
  const height = Math.max(1, sample.bounds.bottom - sample.bounds.top);
  return clamp(height / width, .03, .65);
}

export async function reconstructPlaneMesh(photos: Partial<Record<ReconstructionView, string>>): Promise<PlaneMeshData> {
  if (!photos.top) throw new Error("Capture the top view before building the 3D model.");
  const entries = Object.entries(photos).filter((entry): entry is [ReconstructionView, string] => Boolean(entry[1]));
  const samples = new Map<ReconstructionView, ImageSample>();
  await Promise.all(entries.map(async ([view, url]) => samples.set(view, await sampleImage(url))));
  const top = samples.get("top");
  if (!top) throw new Error("The top view could not be reconstructed.");
  const profile = profileFromTop(top);
  const noseAspect = aspect(samples.get("nose"));
  const tailAspect = aspect(samples.get("tail"));
  const leftAspect = aspect(samples.get("left"));
  const rightAspect = aspect(samples.get("right"));
  const undersideAspect = aspect(samples.get("underside"));
  const dihedral = clamp((noseAspect * .62 + tailAspect * .38) * .7, .035, .34);
  const thickness = clamp((leftAspect + rightAspect + undersideAspect) / 3 * .42, .035, .24);
  const sideTilt = clamp((rightAspect - leftAspect) * .24, -.09, .09);
  const stations = fallbackProfile.length;
  const lateral = [-1, -.5, 0, .5, 1];
  const vertices: MeshVertex[] = [];
  for (let row = 0; row < stations; row += 1) {
    const progress = row / (stations - 1);
    const taper = Math.sin(Math.PI * progress);
    const ridge = thickness * (.48 + taper * .52);
    for (const column of lateral) {
      const sideWidth = column < 0 ? profile.leftWidths[row] : profile.rightWidths[row];
      const x = column * sideWidth * 1.52;
      const foldRidge = ridge * (1 - Math.abs(column));
      const wingRise = dihedral * Math.pow(Math.abs(column), 1.35) * (.58 + taper * .42);
      const z = foldRidge + wingRise + sideTilt * column;
      vertices.push({ x, y: 1.75 - progress * 3.5, z });
    }
  }
  const triangles: Array<[number, number, number]> = [];
  for (let row = 0; row < stations - 1; row += 1) {
    for (let column = 0; column < lateral.length - 1; column += 1) {
      const a = row * lateral.length + column;
      const b = a + 1;
      const c = (row + 1) * lateral.length + column;
      const d = c + 1;
      triangles.push([a, c, b], [b, c, d]);
    }
  }
  return {
    vertices, triangles, stations, columns: lateral.length, sourceViews: entries.length,
    silhouetteCoverage: Math.round(profile.coverage * 100), estimatedDihedral: Math.round(dihedral * 100),
    estimatedThickness: Math.round(thickness * 100), leftRightBalance: profile.balance,
  };
}

export async function photoToDataUrl(url: string, maxDimension = 760) {
  const image = await loadImage(url);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the scan photos.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", .76);
}
