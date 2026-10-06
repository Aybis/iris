export type TownSelection = {
  type: "apps" | "workshop" | "queue" | "channel" | "worker" | "node";
  id?: string;
};

export type Hit = TownSelection & {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  detail: string;
};
export type Point = { x: number; y: number };
export type Ctx = CanvasRenderingContext2D;

export const W = 1280;
export const H = 620;
export const COLORS = {
  ink: "#253c36",
  muted: "#586c57",
  grass: "#b5c890",
  grass2: "#a9be80",
  grass3: "#c4d29e",
  road: "#e5d1a8",
  roadEdge: "#bcad83",
  wood: "#907454",
  woodLight: "#c3a16a",
  paper: "#fff8e5",
  green: "#2e8767",
  amber: "#bc7b24",
  red: "#c5594d",
  water: "#82b6b8",
};
export const CHANNEL_COLORS = [
  "#558893",
  "#9c8760",
  "#6d869d",
  "#9f7d9d",
  "#6f987a",
];
export const DOCK_Y = [116, 217, 318, 419, 520];
export const key = (selection: TownSelection | null) =>
  selection ? `${selection.type}:${selection.id ?? ""}` : "";
export const clamp = (n: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, n));
export const statusColor = (status: string) =>
  status === "UNKNOWN" || status === "IDLE"
    ? "#71867d"
    : status === "UP" || status === "HEALTHY"
      ? COLORS.green
      : status === "DOWN" || status === "OUTAGE"
        ? COLORS.red
        : COLORS.amber;

export function rect(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
export function line(c: Ctx, points: number[], color: string, width = 2) {
  c.beginPath();
  c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}
export function polygon(c: Ctx, points: number[], color: string) {
  c.beginPath();
  c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.closePath();
  c.fillStyle = color;
  c.fill();
}
export function text(
  c: Ctx,
  value: string,
  x: number,
  y: number,
  size = 12,
  color = COLORS.ink,
  align: CanvasTextAlign = "left",
  weight = 600,
) {
  c.font = `${weight} ${size}px "DM Sans Variable", "Segoe UI", sans-serif`;
  c.fillStyle = color;
  c.textAlign = align;
  c.fillText(value, x, y);
}
export function round(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  radius = 7,
) {
  c.beginPath();
  c.roundRect(x, y, w, h, radius);
  c.fillStyle = color;
  c.fill();
}
export function shadow(c: Ctx, x: number, y: number, w: number, h = 8) {
  c.save();
  c.globalAlpha = 0.12;
  round(c, x, y, w, h, "#2f5038", h / 2);
  c.restore();
}

export function tree(c: Ctx, x: number, y: number, scale = 1, variation = 0) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  shadow(c, -23, 18, 54, 13);
  rect(c, -5, 4, 10, 25, "#82684e");
  rect(c, -5, 12, 4, 17, "#6e5845");
  const leaf = variation % 2 ? "#6c8d60" : "#7b9a66";
  polygon(
    c,
    [
      -12, -36, 14, -36, 14, -30, 25, -30, 25, -17, 32, -17, 32, 5, 24, 5, 24,
      15, -23, 15, -23, 6, -30, 6, -30, -17, -23, -17, -23, -29, -12, -29,
    ],
    leaf,
  );
  polygon(
    c,
    [
      -12, -36, 14, -36, 14, -30, 25, -30, 25, -18, 5, -18, 5, -10, -26, -10,
      -26, -21, -23, -21, -23, -29, -12, -29,
    ],
    variation % 2 ? "#82a16b" : "#95ae78",
  );
  rect(c, -14, -23, 8, 5, "#b3c48a");
  rect(c, 4, -30, 6, 4, "#b3c48a");
  rect(c, 15, 4, 10, 5, "#608250");
  c.restore();
}

export function bush(c: Ctx, x: number, y: number) {
  rect(c, x, y, 30, 10, "#86a468");
  rect(c, x + 4, y - 5, 22, 8, "#93ad71");
  rect(c, x + 6, y - 5, 7, 3, "#b8c98b");
}
export function flower(c: Ctx, x: number, y: number, color: string) {
  rect(c, x, y, 2, 6, "#7c9863");
  rect(c, x - 2, y - 3, 6, 4, color);
  rect(c, x, y - 5, 2, 8, color);
  rect(c, x, y - 2, 2, 2, "#f7e4a4");
}

export function crate(
  c: Ctx,
  x: number,
  y: number,
  scale = 1,
  accent = "#c49658",
) {
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.scale(scale, scale);
  rect(c, 0, 0, 18, 16, "#8b6b44");
  rect(c, 2, 2, 14, 12, accent);
  line(c, [3, 3, 15, 13], "#e9c888", 2);
  line(c, [3, 13, 15, 3], "#e9c888", 2);
  rect(c, 0, 0, 18, 2, "#efd092");
  rect(c, 0, 14, 18, 2, "#a27d4c");
  rect(c, 18, 2, 4, 14, "#a17948");
  c.restore();
}

export function person(
  c: Ctx,
  x: number,
  y: number,
  time: number,
  color = "#688d9e",
  working = false,
  tired = false,
) {
  const step = working ? Math.round(Math.sin(time * 6) * 2) : 0;
  shadow(c, x - 9, y + 12, 19, 5);
  rect(c, x - 5, y + 5, 4, 8 + step, "#55605b");
  rect(c, x + 2, y + 5, 4, 8 - step, "#55605b");
  rect(c, x - 6, y - 6, 13, 13, color);
  rect(c, x - 8, y - 2 - step, 3, 8, "#d9ac83");
  rect(c, x + 7, y - 2 + step, 3, 8, "#d9ac83");
  rect(c, x - 5, y - 16, 10, 11, "#e4bd94");
  rect(c, x - 6, y - 18, 12, 5, "#67503e");
  rect(c, x - 7, y - 13, 15, 3, "#b79865");
  rect(c, x + 2, y - 10, 2, 2, "#594f40");
  if (tired)
    text(
      c,
      "z",
      x + 12,
      y - 15 - Math.sin(time) * 2,
      13,
      "#73838c",
      "left",
      800,
    );
}

export function flag(
  c: Ctx,
  x: number,
  y: number,
  color: string,
  time: number,
) {
  rect(c, x, y, 3, 42, "#796b51");
  const flutter = Math.round(Math.sin(time * 2) * 2);
  polygon(
    c,
    [
      x + 3,
      y,
      x + 26,
      y + flutter,
      x + 22,
      y + 7,
      x + 26,
      y + 14 + flutter,
      x + 3,
      y + 14,
    ],
    color,
  );
  rect(c, x + 3, y + 2, 17, 3, "#ffffff35");
}

export function plaque(
  c: Ctx,
  value: string,
  x: number,
  y: number,
  w: number,
  sub?: string,
) {
  shadow(c, x + 2, y + 3, w, sub ? 45 : 26);
  round(c, x, y, w, sub ? 45 : 27, COLORS.paper, 5);
  text(c, value, x + w / 2, y + 18, 11, COLORS.ink, "center", 800);
  if (sub) text(c, sub, x + w / 2, y + 34, 10, "#737762", "center", 500);
}

export function pathPoint(progress: number, points: Point[]) {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let remaining = progress * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = remaining / lengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    remaining -= lengths[i];
  }
  return points.at(-1)!;
}
