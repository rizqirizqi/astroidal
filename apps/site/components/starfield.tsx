import { useEffect, useRef } from "react";

type Spectral = "logic" | "contract" | "text";
type Role = "changed" | "neighbor";
type CloudKind = "directory" | "logic";

interface SkyNode {
  id: string;
  name: string;
  spectral: Spectral;
  role: Role;
  x: number;
  y: number;
  r: number;
}

interface Cloud {
  label: string;
  kind: CloudKind;
  nodes: SkyNode[];
}

interface Edge {
  from: SkyNode;
  to: SkyNode;
  crosses: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Drag {
  node: SkyNode;
  dx: number;
  dy: number;
}

interface Down {
  x: number;
  y: number;
  node: SkyNode | null;
  was: SkyNode | null;
  moved: boolean;
}

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

const SEEDS: Array<{
  name: string;
  spectral: Spectral;
  role: Role;
  x: number;
  y: number;
}> = [
  { name: "graph", spectral: "logic", role: "changed", x: 0.16, y: 0.46 },
  { name: "layout", spectral: "text", role: "changed", x: 0.23, y: 0.36 },
  { name: "rank", spectral: "contract", role: "changed", x: 0.3, y: 0.5 },
  { name: "score", spectral: "logic", role: "changed", x: 0.14, y: 0.6 },
  { name: "scope", spectral: "logic", role: "neighbor", x: 0.34, y: 0.4 },
  { name: "diff", spectral: "text", role: "changed", x: 0.24, y: 0.66 },
  { name: "findings", spectral: "logic", role: "changed", x: 0.48, y: 0.62 },
  { name: "severity", spectral: "contract", role: "changed", x: 0.56, y: 0.52 },
  { name: "review.md", spectral: "text", role: "changed", x: 0.62, y: 0.7 },
  { name: "packets", spectral: "logic", role: "changed", x: 0.52, y: 0.76 },
  { name: "neighbor", spectral: "logic", role: "neighbor", x: 0.68, y: 0.6 },
  { name: "skill", spectral: "logic", role: "changed", x: 0.74, y: 0.3 },
  { name: "lenses", spectral: "text", role: "changed", x: 0.82, y: 0.22 },
  { name: "prompt", spectral: "contract", role: "changed", x: 0.88, y: 0.38 },
  { name: "init", spectral: "logic", role: "neighbor", x: 0.78, y: 0.44 },
  { name: "install", spectral: "logic", role: "changed", x: 0.92, y: 0.28 },
  { name: "caller", spectral: "logic", role: "neighbor", x: 0.42, y: 0.28 },
  { name: "parse", spectral: "logic", role: "changed", x: 0.5, y: 0.34 },
  { name: "excerpt", spectral: "text", role: "changed", x: 0.64, y: 0.18 },
];

const LINKS = [
  [0, 1],
  [1, 2],
  [0, 3],
  [2, 4],
  [3, 5],
  [6, 7],
  [7, 8],
  [6, 9],
  [7, 10],
  [8, 10],
  [11, 12],
  [12, 13],
  [13, 14],
  [12, 15],
  [16, 17],
  [17, 1],
];

const CLOUD_SEEDS: Array<{ label: string; kind: CloudKind; indexes: number[] }> = [
  { label: "cli", kind: "directory", indexes: [0, 1, 2, 3, 4, 5] },
  { label: "review", kind: "logic", indexes: [6, 7, 8, 9, 10] },
  { label: "skills", kind: "directory", indexes: [11, 12, 13, 14, 15] },
];

function createSky() {
  const nodes: SkyNode[] = SEEDS.map((seed, index) => ({
    id: `n${index}`,
    name: seed.name,
    spectral: seed.spectral,
    role: seed.role,
    x: (seed.x - 0.5) * 1600,
    y: (seed.y - 0.5) * 980,
    r: seed.role === "neighbor" ? 3.4 : 5.2,
  }));
  const clouds: Cloud[] = CLOUD_SEEDS.map((cloud) => ({
    label: cloud.label,
    kind: cloud.kind,
    nodes: cloud.indexes.map((index) => nodes[index]).filter((node) => node != null),
  }));
  const cloudOf = new Map<SkyNode, Cloud>();
  clouds.forEach((cloud) => {
    cloud.nodes.forEach((node) => cloudOf.set(node, cloud));
  });
  const edges: Edge[] = LINKS.flatMap(([fromIndex, toIndex]) => {
    const from = nodes[fromIndex];
    const to = nodes[toIndex];
    if (!from || !to) return [];
    return [{ from, to, crosses: cloudOf.get(from) !== cloudOf.get(to) }];
  });
  const random = mulberry32(42);
  const dust = Array.from({ length: 110 }, () => ({
    x: (random() - 0.5) * 2200,
    y: (random() - 0.5) * 1400,
    s: random() * 1.3 + 0.25,
    a: random(),
  }));
  return { nodes, clouds, edges, dust };
}

function mulberry32(seed: number) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const tip = tipRef.current;
    const parent = canvas?.parentElement?.parentElement;
    if (!canvas || !tip || !parent) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const { nodes, clouds, edges, dust } = createSky();
    const camera = { x: 0, y: 0, scale: 1 };
    let selected: SkyNode | null = null;
    let hover: SkyNode | null = null;
    let drag: Drag | null = null;
    let pan: Point | null = null;
    let down: Down | null = null;
    let moved = false;
    let paintFrame = 0;

    function resizeCanvas() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const bounds = canvas!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas!.height = Math.max(1, Math.floor(bounds.height * ratio));
      if (!moved) fitCamera();
      draw();
    }

    function fitCamera() {
      const width = canvas!.clientWidth || 800;
      const height = canvas!.clientHeight || 600;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      nodes.forEach((node) => {
        minX = Math.min(minX, node.x - 120);
        minY = Math.min(minY, node.y - 48);
        maxX = Math.max(maxX, node.x + 150);
        maxY = Math.max(maxY, node.y + 36);
      });
      const spanX = Math.max(maxX - minX + 160, 280);
      const spanY = Math.max(maxY - minY + 160, 220);
      camera.scale = Math.min(
        1.25,
        Math.max(0.38, Math.min((width - 48) / spanX, (height - 48) / spanY)),
      );
      camera.x = -((minX + maxX) / 2);
      camera.y = -((minY + maxY) / 2);
    }

    function toScreen(x: number, y: number): Point {
      return {
        x: canvas!.clientWidth / 2 + (x + camera.x) * camera.scale,
        y: canvas!.clientHeight / 2 + (y + camera.y) * camera.scale,
      };
    }

    function toWorld(x: number, y: number): Point {
      return {
        x: (x - canvas!.clientWidth / 2) / camera.scale - camera.x,
        y: (y - canvas!.clientHeight / 2) / camera.scale - camera.y,
      };
    }

    function colorFor(node: SkyNode) {
      if (node.role === "neighbor") return "#7E8BA3";
      if (node.spectral === "contract") return "#D2B4FF";
      if (node.spectral === "logic") return "#00F2FE";
      return "#C5D0E2";
    }

    function traceShape(node: SkyNode, x: number, y: number, radius: number) {
      context!.beginPath();
      if (node.spectral === "contract" && node.role === "changed") {
        context!.moveTo(x, y - radius);
        context!.lineTo(x + radius, y);
        context!.lineTo(x, y + radius);
        context!.lineTo(x - radius, y);
        context!.closePath();
        return;
      }
      if (node.spectral === "text" && node.role === "changed") {
        const side = radius * 1.7;
        context!.rect(x - side / 2, y - side / 2, side, side);
        return;
      }
      context!.arc(x, y, radius, 0, Math.PI * 2);
    }

    function draw() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;
      const ctx = context!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const wash = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.1,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.72,
      );
      wash.addColorStop(0, "rgba(127,0,255,0.13)");
      wash.addColorStop(0.42, "rgba(11,15,25,0)");
      wash.addColorStop(1, "rgba(5,7,12,0.45)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, width, height);
      dust.forEach((star) => {
        const point = toScreen(star.x, star.y);
        ctx.globalAlpha = 0.2 + star.a * 0.55;
        ctx.fillStyle = star.a > 0.82 ? "#00F2FE" : "#E8EEF8";
        ctx.beginPath();
        ctx.arc(point.x, point.y, star.s, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      clouds.forEach((cloud) => drawCloud(cloud));
      edges.forEach((edge) => {
        if (!edgeActive(edge)) return;
        const start = toScreen(edge.from.x, edge.from.y);
        const end = toScreen(edge.to.x, edge.to.y);
        const bend = curvePoint(start, end);
        const hot = edgeTouches(edge, hover) || edgeTouches(edge, selected);
        ctx.strokeStyle = hot
          ? "rgba(0,242,254,0.95)"
          : edge.crosses
            ? "rgba(0,242,254,0.62)"
            : "rgba(0,242,254,0.35)";
        ctx.lineWidth = hot ? 1.8 : edge.crosses ? 1.45 : 1.05;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(bend.x, bend.y, end.x, end.y);
        ctx.stroke();
      });
      nodes.forEach((node) => {
        const point = toScreen(node.x, node.y);
        const color = colorFor(node);
        const radius = node.r * (hover === node ? 1.35 : 1);
        const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 6);
        glow.addColorStop(0, color);
        glow.addColorStop(1, "rgba(11,15,25,0)");
        ctx.fillStyle = glow;
        ctx.globalAlpha = node.role === "neighbor" ? 0.35 : 0.85;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        traceShape(node, point.x, point.y, radius);
        if (node.role === "neighbor") {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.25;
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.fill();
        }
        if (selected !== node) return;
        ctx.strokeStyle = "rgba(232,238,248,0.85)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + 7, 0, Math.PI * 2);
        ctx.stroke();
      });
      const taken: Array<{ x: number; y: number; w: number; h: number }> = [];
      clouds.forEach((cloud) => {
        const top = cloud.nodes.reduce<Point | null>((best, node) => {
          const point = toScreen(node.x, node.y);
          if (!best || point.y < best.y) return point;
          return best;
        }, null);
        if (!top) return;
        paintLabel(
          cloud.label,
          top.x,
          top.y - 28,
          cloud.kind === "logic" ? "#D2B4FF" : "rgba(0,242,254,0.9)",
          "12px JetBrains Mono, ui-monospace, monospace",
          "center",
          true,
          taken,
        );
      });
      nodes.forEach((node) => {
        if (node.role !== "changed") return;
        const forced = node === hover || node === selected;
        if (!forced) return;
        const point = toScreen(node.x, node.y);
        const anchor = cloudAnchor(node);
        const dx = point.x - anchor.x;
        const dy = point.y - anchor.y;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        paintLabel(
          trimName(node.name),
          point.x + (dx / length) * (node.r + 10),
          point.y + (dy / length) * (node.r + 10) + 4,
          forced ? "#E8EEF8" : "rgba(232,238,248,0.9)",
          "12px JetBrains Mono, ui-monospace, monospace",
          dx >= 0 ? "left" : "right",
          forced,
          taken,
        );
      });
    }

    function drawCloud(cloud: Cloud) {
      const points = cloud.nodes.map((node) => toScreen(node.x, node.y));
      if (points.length === 0) return;
      const hull = points.length < 3 ? points : convexHull(points);
      const center = hull.reduce(
        (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
        { x: 0, y: 0 },
      );
      center.x /= hull.length;
      center.y /= hull.length;
      const pad = cloud.kind === "logic" ? 42 : points.length === 1 ? 22 : 34;
      const expanded = hull.map((point) => {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        return { x: point.x + (dx / length) * pad, y: point.y + (dy / length) * pad };
      });
      const ctx = context!;
      if (expanded.length === 1) {
        const only = expanded[0];
        if (!only) return;
        ctx.beginPath();
        ctx.arc(only.x, only.y, pad + 18, 0, Math.PI * 2);
      } else traceBlob(expanded);
      ctx.fillStyle = cloud.kind === "logic" ? "rgba(127,0,255,0.14)" : "rgba(0,242,254,0.055)";
      ctx.fill();
      ctx.strokeStyle = cloud.kind === "logic" ? "rgba(210,180,255,0.72)" : "rgba(0,242,254,0.32)";
      ctx.lineWidth = cloud.kind === "logic" ? 1.4 : 1;
      ctx.setLineDash(cloud.kind === "logic" ? [5, 5] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function traceBlob(points: Point[]) {
      const ctx = context!;
      function mid(a: Point, b: Point) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      const first = points[0];
      const second = points[1 % points.length];
      if (!first || !second) return;
      ctx.beginPath();
      const start = mid(first, second);
      ctx.moveTo(start.x, start.y);
      for (let index = 0; index < points.length; index += 1) {
        const current = points[(index + 1) % points.length];
        const next = points[(index + 2) % points.length];
        if (!current || !next) continue;
        const target = mid(current, next);
        ctx.quadraticCurveTo(current.x, current.y, target.x, target.y);
      }
      ctx.closePath();
    }

    function convexHull(points: Point[]) {
      const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
      function cross(origin: Point, a: Point, b: Point) {
        return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
      }
      const lower: Point[] = [];
      sorted.forEach((point) => {
        while (lower.length >= 2) {
          const origin = lower[lower.length - 2];
          const previous = lower[lower.length - 1];
          if (!origin || !previous || cross(origin, previous, point) > 0) break;
          lower.pop();
        }
        lower.push(point);
      });
      const upper: Point[] = [];
      for (let index = sorted.length - 1; index >= 0; index -= 1) {
        const point = sorted[index];
        if (!point) continue;
        while (upper.length >= 2) {
          const origin = upper[upper.length - 2];
          const previous = upper[upper.length - 1];
          if (!origin || !previous || cross(origin, previous, point) > 0) break;
          upper.pop();
        }
        upper.push(point);
      }
      lower.pop();
      upper.pop();
      return lower.concat(upper);
    }

    function paintLabel(
      text: string,
      x: number,
      y: number,
      fill: string,
      font: string,
      align: CanvasTextAlign,
      force: boolean,
      taken: Array<{ x: number; y: number; w: number; h: number }>,
    ) {
      const ctx = context!;
      ctx.font = font;
      const width = Math.min(168, ctx.measureText(text).width);
      const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
      const box = { x: left, y: y - 12, w: width, h: 15 };
      if (!force) {
        const hits = taken.some(
          (other) =>
            box.x < other.x + other.w + 6 &&
            box.x + box.w + 6 > other.x &&
            box.y < other.y + other.h + 4 &&
            box.y + box.h + 4 > other.y,
        );
        if (hits) return;
      }
      taken.push(box);
      ctx.textAlign = align;
      ctx.shadowColor = "rgba(11,15,25,0.95)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = fill;
      ctx.fillText(text, x, y);
      ctx.textAlign = "left";
      ctx.shadowBlur = 0;
    }

    function cloudAnchor(node: SkyNode) {
      const cloud = clouds.find((item) => item.nodes.includes(node));
      if (!cloud || cloud.nodes.length === 0) return toScreen(node.x, node.y);
      const sum = cloud.nodes.reduce(
        (point, item) => ({ x: point.x + item.x, y: point.y + item.y }),
        { x: 0, y: 0 },
      );
      return toScreen(sum.x / cloud.nodes.length, sum.y / cloud.nodes.length);
    }

    function curvePoint(start: Point, end: Point) {
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: midX + (-dy / length) * 14, y: midY + (dx / length) * 14 };
    }

    function edgeActive(edge: Edge) {
      if (edge.crosses) return true;
      if (!hover && !selected) return edges.length <= 80;
      return edgeTouches(edge, hover) || edgeTouches(edge, selected);
    }

    function edgeTouches(edge: Edge, node: SkyNode | null) {
      return Boolean(node) && (edge.from === node || edge.to === node);
    }

    function trimName(name: string) {
      return name.length > 28 ? `${name.slice(0, 27)}...` : name;
    }

    function nodeAt(x: number, y: number) {
      let found: SkyNode | null = null;
      let best = Infinity;
      for (const node of nodes) {
        const point = toScreen(node.x, node.y);
        const dx = x - point.x;
        const dy = y - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const limit = Math.max(32, node.r * 6 + 14);
        if (distance > limit || distance >= best) continue;
        best = distance;
        found = node;
      }
      return found;
    }

    function localPoint(event: PointerEvent | WheelEvent): Point {
      const bounds = canvas!.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    function showTip(node: SkyNode | null, x: number, y: number) {
      if (!node) {
        tip!.hidden = true;
        return;
      }
      tip!.hidden = false;
      const width = canvas!.clientWidth;
      let left = x + 14;
      if (left > width - 220) left = Math.max(8, x - 220);
      tip!.style.left = `${left}px`;
      tip!.style.top = `${Math.max(8, y + 14)}px`;
      const kind = node.role === "neighbor" ? "orbit" : node.spectral;
      tip!.textContent = `${node.name} · ${kind}`;
    }

    function scheduleDraw() {
      if (paintFrame) return;
      paintFrame = window.requestAnimationFrame(() => {
        paintFrame = 0;
        draw();
      });
    }

    function zoom(factor: number, screenX?: number, screenY?: number) {
      const width = canvas!.clientWidth || 1;
      const height = canvas!.clientHeight || 1;
      const originX = typeof screenX === "number" ? screenX : width / 2;
      const originY = typeof screenY === "number" ? screenY : height / 2;
      const before = toWorld(originX, originY);
      const next = Math.max(0.34, Math.min(2.8, camera.scale * factor));
      if (next === camera.scale) return;
      camera.scale = next;
      camera.x = (originX - width / 2) / camera.scale - before.x;
      camera.y = (originY - height / 2) / camera.scale - before.y;
      moved = true;
      scheduleDraw();
    }

    function fit() {
      moved = false;
      fitCamera();
      scheduleDraw();
    }

    function handlePointerMove(event: PointerEvent) {
      const point = localPoint(event);
      if (down && (Math.abs(point.x - down.x) > 4 || Math.abs(point.y - down.y) > 4)) down.moved = true;
      if (drag) {
        const world = toWorld(point.x, point.y);
        drag.node.x = world.x + drag.dx;
        drag.node.y = world.y + drag.dy;
        canvas!.style.cursor = "grabbing";
        scheduleDraw();
        return;
      }
      if (pan) {
        moved = true;
        camera.x += (point.x - pan.x) / camera.scale;
        camera.y += (point.y - pan.y) / camera.scale;
        pan.x = point.x;
        pan.y = point.y;
        canvas!.style.cursor = "grabbing";
        scheduleDraw();
        return;
      }
      const next = nodeAt(point.x, point.y);
      if (next !== hover) {
        hover = next;
        canvas!.style.cursor = hover ? "pointer" : "grab";
        scheduleDraw();
      }
      showTip(hover, point.x, point.y);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const point = localPoint(event);
      const node = nodeAt(point.x, point.y);
      if (event.pointerType === "touch" && !node) return;
      event.preventDefault();
      down = { x: point.x, y: point.y, node, was: selected, moved: false };
      try {
        canvas!.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture needs a trusted event. Drag still tracks the move.
      }
      if (node) {
        const world = toWorld(point.x, point.y);
        drag = { node, dx: node.x - world.x, dy: node.y - world.y };
        if (selected !== node) {
          selected = node;
          scheduleDraw();
        }
        return;
      }
      pan = { x: point.x, y: point.y };
    }

    function handlePointerUp() {
      if (down && !down.moved) {
        const sameStar = down.node && down.was === down.node;
        if (sameStar || (!down.node && selected)) {
          selected = null;
          scheduleDraw();
        }
      }
      drag = null;
      pan = null;
      down = null;
      canvas!.style.cursor = hover ? "pointer" : "grab";
    }

    function handlePointerLeave() {
      canvas!.style.cursor = "grab";
      if (hover) {
        hover = null;
        scheduleDraw();
      }
      tip!.hidden = true;
    }

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const point = localPoint(event);
      zoom(event.deltaY > 0 ? 0.92 : 1.08, point.x, point.y);
    }

    function handleKeyDown(event: KeyboardEvent) {
      const step = 48 / camera.scale;
      if (event.key === "ArrowLeft") camera.x += step;
      else if (event.key === "ArrowRight") camera.x -= step;
      else if (event.key === "ArrowUp") camera.y += step;
      else if (event.key === "ArrowDown") camera.y -= step;
      else if (event.key === "+" || event.key === "=") zoom(1.12);
      else if (event.key === "-" || event.key === "_") zoom(0.9);
      else if (event.key === "Escape") {
        if (!selected) return;
        selected = null;
      } else if (event.key === "0") fit();
      else return;
      event.preventDefault();
      moved = true;
      scheduleDraw();
    }

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(parent);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(paintFrame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Constellation. Drag a star to move it. Drag the empty sky to pan."
        className={`h-full w-full cursor-grab touch-pan-y ${FOCUS}`}
      />
      <p
        ref={tipRef}
        hidden
        className="pointer-events-none absolute z-10 max-w-[220px] rounded-[10px] border border-white/15 bg-[#0B0F19]/95 px-2.5 py-2 font-brand-secondary text-xs leading-snug text-brand-text"
      />
    </div>
  );
}
