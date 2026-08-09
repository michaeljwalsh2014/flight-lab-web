"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { MeshVertex, PlaneMeshData } from "./plane-reconstruction";

type Projected = MeshVertex & { screenX: number; screenY: number; depth: number };

function rotate(vertex: MeshVertex, yaw: number, pitch: number): MeshVertex {
  const cosY = Math.cos(yaw); const sinY = Math.sin(yaw);
  const x1 = vertex.x * cosY - vertex.y * sinY;
  const y1 = vertex.x * sinY + vertex.y * cosY;
  const cosP = Math.cos(pitch); const sinP = Math.sin(pitch);
  return { x: x1, y: y1 * cosP - vertex.z * sinP, z: y1 * sinP + vertex.z * cosP };
}

function normal(a: MeshVertex, b: MeshVertex, c: MeshVertex) {
  const ux = b.x - a.x; const uy = b.y - a.y; const uz = b.z - a.z;
  const vx = c.x - a.x; const vy = c.y - a.y; const vz = c.z - a.z;
  const x = uy * vz - uz * vy; const y = uz * vx - ux * vz; const z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

export default function ReconstructedPlaneModel({ model, planeName }: { model: PlaneMeshData | null; planeName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [yaw, setYaw] = useState(-.45);
  const [pitch, setPitch] = useState(.92);
  const [wireframe, setWireframe] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !model) return;
    const draw = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(300, canvas.clientWidth);
      const height = Math.max(230, canvas.clientHeight);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const gradient = context.createRadialGradient(width * .5, height * .42, 8, width * .5, height * .46, width * .64);
      gradient.addColorStop(0, "rgba(23,105,255,.27)"); gradient.addColorStop(1, "rgba(2,9,19,.96)");
      context.fillStyle = gradient; context.fillRect(0, 0, width, height);
      const scale = Math.min(width / 4.4, height / 4.3);
      const projected: Projected[] = model.vertices.map((vertex) => {
        const rotated = rotate(vertex, yaw, pitch);
        const perspective = 1 / (1 + (rotated.z + 1.6) * .075);
        return { ...rotated, screenX: width / 2 + rotated.x * scale * perspective, screenY: height / 2 - rotated.y * scale * perspective, depth: rotated.z };
      });
      const faces = model.triangles.map((triangle) => ({
        triangle,
        depth: triangle.reduce((sum, index) => sum + projected[index].depth, 0) / 3,
      })).sort((a, b) => a.depth - b.depth);
      for (const face of faces) {
        const [ia, ib, ic] = face.triangle;
        const a = projected[ia]; const b = projected[ib]; const c = projected[ic];
        const faceNormal = normal(a, b, c);
        const light = Math.max(0, faceNormal.x * -.25 + faceNormal.y * -.18 + faceNormal.z * .93);
        const brightness = Math.round(126 + light * 112);
        context.beginPath(); context.moveTo(a.screenX, a.screenY); context.lineTo(b.screenX, b.screenY); context.lineTo(c.screenX, c.screenY); context.closePath();
        context.fillStyle = `rgb(${Math.min(250, brightness + 8)}, ${Math.min(253, brightness + 17)}, ${Math.min(255, brightness + 23)})`;
        context.fill();
        if (wireframe) { context.strokeStyle = "rgba(20,91,145,.34)"; context.lineWidth = .7; context.stroke(); }
      }
      context.strokeStyle = "rgba(200,243,75,.78)"; context.lineWidth = 1.25;
      context.beginPath();
      for (let row = 0; row < model.stations; row += 1) {
        const point = projected[row * model.columns + 2];
        if (row === 0) context.moveTo(point.screenX, point.screenY); else context.lineTo(point.screenX, point.screenY);
      }
      context.stroke();
      context.fillStyle = "rgba(67,220,255,.8)"; context.font = "700 10px system-ui";
      context.fillText("RECONSTRUCTED MESH", 14, 22);
      context.fillStyle = "rgba(145,169,194,.8)"; context.font = "600 9px system-ui";
      context.fillText(`${model.vertices.length} vertices · ${model.triangles.length} faces`, 14, 38);
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [model, pitch, wireframe, yaw]);

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x; const dy = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setYaw((value) => value + dx * .012);
    setPitch((value) => Math.max(-.15, Math.min(1.42, value + dy * .009)));
  }

  return <div className="pro-scan-model" aria-label={model ? `Reconstructed 3D mesh of ${planeName}` : `3D reconstruction area for ${planeName}`}>
    <div className="pro-scan-model-stage reconstructed">
      {model ? <canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} aria-label={`Drag to rotate the reconstructed 3D model of ${planeName}`} /> : <div className="pro-mesh-placeholder"><i /><b>No 3D mesh yet</b><span>Capture the six guided angles to reconstruct this plane.</span></div>}
      <i className="model-axis model-axis-x">X</i><i className="model-axis model-axis-y">Y</i><i className="model-axis model-axis-z">Z</i>
    </div>
    <div className="pro-model-controls">
      <button type="button" onClick={() => setYaw((value) => value - .32)} disabled={!model}>← Rotate</button>
      <span>{model ? `${model.sourceViews} source views · drag the model` : "Waiting for scan"}</span>
      <button type="button" onClick={() => setYaw((value) => value + .32)} disabled={!model}>Rotate →</button>
      {model ? <button type="button" className="mesh-toggle" onClick={() => setWireframe((value) => !value)}>{wireframe ? "Hide mesh" : "Show mesh"}</button> : null}
    </div>
  </div>;
}
