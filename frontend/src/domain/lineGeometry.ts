import type { LineElement } from "./elements";

export type Point = { x: number; y: number };
export type Segment = { a: Point; b: Point };

function normalize(dx: number, dy: number) {
  const length = Math.hypot(dx, dy);
  if (length <= 1e-7) return { x: 1, y: 0 };
  return { x: dx / length, y: dy / length };
}

export function getLineEndpoints(line: Pick<LineElement, "x" | "y" | "x2" | "y2">) {
  return {
    start: { x: line.x, y: line.y },
    end: { x: line.x2, y: line.y2 },
  };
}

export function getOrthogonalPolyline(line: Pick<LineElement, "x" | "y" | "x2" | "y2">): Point[] {
  const { start, end } = getLineEndpoints(line);
  if (Math.abs(start.x - end.x) < 1 || Math.abs(start.y - end.y) < 1) {
    return [start, end];
  }
  const midX = (start.x + end.x) / 2;
  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
}

export function getCurvePolyline(line: Pick<LineElement, "x" | "y" | "x2" | "y2">, steps = 36): Point[] {
  const { start, end } = getLineEndpoints(line);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const horizontalDominant = Math.abs(dx) >= Math.abs(dy);
  const lead = Math.max(30, Math.min(180, distance * 0.42));
  const bend = Math.max(26, Math.min(170, distance * 0.26));
  const nx = -dy / distance;
  const ny = dx / distance;

  const c1 = horizontalDominant
    ? { x: start.x + Math.sign(dx || 1) * lead + nx * bend, y: start.y + ny * bend * 0.9 }
    : { x: start.x + nx * bend * 0.9, y: start.y + Math.sign(dy || 1) * lead + ny * bend };
  const c2 = horizontalDominant
    ? { x: end.x - Math.sign(dx || 1) * lead + nx * bend, y: end.y + ny * bend * 0.9 }
    : { x: end.x + nx * bend * 0.9, y: end.y - Math.sign(dy || 1) * lead + ny * bend };

  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const nt = 1 - t;
    points.push({
      x:
        nt * nt * nt * start.x +
        3 * nt * nt * t * c1.x +
        3 * nt * t * t * c2.x +
        t * t * t * end.x,
      y:
        nt * nt * nt * start.y +
        3 * nt * nt * t * c1.y +
        3 * nt * t * t * c2.y +
        t * t * t * end.y,
    });
  }
  return points;
}

export function getLinePolyline(
  line: Pick<LineElement, "x" | "y" | "x2" | "y2" | "lineRoute" | "startAnchor" | "endAnchor">,
) {
  if (line.lineRoute === "orthogonal") {
    return getOrthogonalPolyline(line);
  }
  if (line.lineRoute === "curve") {
    return getCurvePolyline(line);
  }
  const { start, end } = getLineEndpoints(line);
  return [start, end];
}

export function getLineSegmentsFromPoints(points: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    segments.push({ a, b });
  }
  return segments;
}

export function getLineSegments(
  line: Pick<LineElement, "x" | "y" | "x2" | "y2" | "lineRoute" | "startAnchor" | "endAnchor">,
) {
  return getLineSegmentsFromPoints(getLinePolyline(line));
}

export function getLineDirectionsFromPoints(points: Point[]) {
  const segments = getLineSegmentsFromPoints(points).filter((segment) => {
    const dx = segment.b.x - segment.a.x;
    const dy = segment.b.y - segment.a.y;
    return Math.hypot(dx, dy) > 1e-7;
  });

  const fallback = segments[0]
    ? normalize(segments[0].b.x - segments[0].a.x, segments[0].b.y - segments[0].a.y)
    : { x: 1, y: 0 };
  const first = segments[0];
  const last = segments[segments.length - 1];

  const startDir = first
    ? normalize(first.b.x - first.a.x, first.b.y - first.a.y)
    : fallback;
  const endDir = last
    ? normalize(last.b.x - last.a.x, last.b.y - last.a.y)
    : fallback;
  return { startDir, endDir };
}
