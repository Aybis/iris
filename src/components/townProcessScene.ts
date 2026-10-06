import type { TownStage, TownTelemetry } from "../../shared/town";
import {
  COLORS,
  W,
  clamp,
  crate,
  flag,
  flower,
  line,
  pathPoint,
  person,
  plaque,
  polygon,
  rect,
  round,
  shadow,
  statusColor,
  text,
  tree,
} from "./townDrawing";
import type { Ctx, Hit, Point } from "./townDrawing";

export const processSceneHeight = (count: number) =>
  Math.max(620, Math.ceil(count / 3) * 235 + 150);
const position = (i: number): Point => {
  const row = Math.floor(i / 3),
    column = row % 2 ? 2 - (i % 3) : i % 3;
  return { x: 220 + column * 420, y: 175 + row * 235 };
};
function fit(c: Ctx, value: string, width: number) {
  c.font = '600 11px "DM Sans Variable", sans-serif';
  if (c.measureText(value).width <= width) return value;
  while (value.length && c.measureText(value + "…").width > width)
    value = value.slice(0, -1);
  return value + "…";
}
function road(c: Ctx, points: Point[]) {
  const xy = points.flatMap((p) => [p.x, p.y]);
  line(c, xy, COLORS.roadEdge, 30);
  line(c, xy, COLORS.road, 25);
  c.save();
  c.setLineDash([3, 17]);
  line(c, xy, "#c4b189", 2);
  c.restore();
}
function parcelLane(
  c: Ctx,
  points: Point[],
  t: number,
  active: boolean,
  color: string,
  phase = 0,
  scale = 0.48,
) {
  line(
    c,
    points.flatMap((p) => [p.x, p.y]),
    "#b3a582",
    3,
  );
  if (active) {
    const p = pathPoint((t * 0.3 + phase) % 1, points);
    crate(c, p.x - 5, p.y - 5, scale, color);
  }
}

function station(
  c: Ctx,
  stage: TownStage,
  i: number,
  t: number,
  active: boolean,
  hits: Hit[],
) {
  const { x, y } = position(i),
    { node, activity, color, status } = stage;
  const slow = status === "DEGRADED",
    failed = status === "DOWN",
    idle = status === "IDLE";
  const motion = active
    ? t * clamp(170 / Math.max(40, node.average_latency_ms), 0.1, 1.7)
    : 0;
  shadow(c, x - 106, y + 51, 224, 15);
  // Timber framing and a different roof color give each specialist a recognisable home.
  rect(c, x - 98, y - 31, 196, 83, "#eadab9");
  rect(c, x - 94, y - 25, 188, 76, "#f2e5c8");
  rect(c, x + 89, y - 27, 9, 79, "#c2ac87");
  polygon(
    c,
    [x - 116, y - 29, x - 79, y - 77, x + 79, y - 77, x + 116, y - 29],
    color,
  );
  for (let j = 0; j < 4; j++)
    line(
      c,
      [x - 100 - j * 4, y - 59 + j * 9, x + 100 + j * 4, y - 59 + j * 9],
      "#ffffff24",
      2,
    );
  rect(c, x - 117, y - 32, 234, 8, "#695d4d");
  rect(c, x - 99, y - 26, 8, 77, "#ac865e");
  rect(c, x + 90, y - 26, 8, 77, "#ac865e");
  rect(c, x - 105, y + 50, 210, 7, "#bca17a");
  flag(c, x + 108, y - 83, statusColor(status), active ? t : 0);
  round(c, x - 133, y - 101, 28, 25, "#354e3e", 5);
  text(
    c,
    String(i + 1).padStart(2, "0"),
    x - 119,
    y - 84,
    11,
    "#fff8df",
    "center",
    800,
  );
  text(
    c,
    stage.building.toUpperCase(),
    x - 96,
    y - 84,
    11,
    "#3d5547",
    "left",
    800,
  );

  if (activity === "transform") {
    // Turning mill: incoming raw crates emerge with a new payload color.
    rect(c, x - 56, y - 15, 78, 42, "#b8a18a");
    rect(c, x - 52, y - 11, 70, 34, "#7c7893");
    text(c, "{ }", x - 17, y + 12, 24, "#f3e7cc", "center", 800);
    c.save();
    c.translate(x + 57, y + 6);
    c.rotate(motion * 1.3);
    for (let j = 0; j < 4; j++) {
      c.rotate(Math.PI / 2);
      rect(c, 5, -6, 31, 12, "#9a7e59");
      rect(c, 12, -5, 23, 3, "#d7bc8a");
    }
    c.restore();
    rect(c, x + 52, y + 1, 10, 10, "#77634f");
    parcelLane(
      c,
      [
        { x: x - 88, y: y + 38 },
        { x: x - 20, y: y + 38 },
      ],
      motion,
      active,
      "#bf925b",
    );
    parcelLane(
      c,
      [
        { x: x + 4, y: y + 38 },
        { x: x + 80, y: y + 38 },
      ],
      motion,
      active,
      color,
      0.5,
    );
  } else if (activity === "aggregate") {
    // Three illustrative ingredient lanes merge into one larger bundle.
    rect(c, x - 20, y - 19, 48, 56, "#b6966a");
    rect(c, x - 16, y - 15, 40, 48, "#827054");
    for (let j = 0; j < 3; j++)
      parcelLane(
        c,
        [
          { x: x - 79, y: y - 12 + j * 23 },
          { x: x + 3, y: y + 17 },
        ],
        motion,
        active,
        ["#b18b56", "#719b94", "#a28dae"][j],
        j * 0.17,
      );
    parcelLane(
      c,
      [
        { x: x + 8, y: y + 17 },
        { x: x + 76, y: y + 17 },
      ],
      motion,
      active,
      "#c8a359",
      0.55,
      0.95,
    );
    person(c, x + 63, y - 9, motion, "#b3896e", active, !active || slow);
  } else if (activity === "route") {
    rect(c, x - 4, y - 18, 7, 61, "#987c58");
    for (let j = 0; j < 3; j++) {
      const dest = { x: x + 78, y: y - 14 + j * 26 };
      polygon(
        c,
        [
          x + 5,
          y - 21 + j * 17,
          x + 43,
          y - 21 + j * 17,
          x + 51,
          y - 15 + j * 17,
          x + 43,
          y - 9 + j * 17,
          x + 5,
          y - 9 + j * 17,
        ],
        ["#769ba6", "#b69b63", "#92946f"][j],
      );
      parcelLane(
        c,
        [{ x: x + 5, y: y + 12 }, dest],
        motion,
        active,
        ["#6e96ad", "#c49d60", "#91a36b"][j],
        j / 3,
      );
    }
    parcelLane(
      c,
      [
        { x: x - 79, y: y + 32 },
        { x: x + 5, y: y + 12 },
      ],
      motion,
      active,
      "#bc955d",
    );
    person(c, x - 35, y + 3, motion, "#6a8b9f", active, !active || slow);
  } else if (activity === "validate") {
    rect(c, x - 57, y - 17, 85, 54, "#bdab83");
    rect(c, x - 49, y - 17, 69, 54, "#8e9c85");
    for (let j = 0; j < 5; j++)
      rect(c, x - 49 + j * 16, y - 17, 4, 54, "#d5c59c");
    rect(
      c,
      x - 56,
      y + (failed || idle ? 9 : -15),
      84,
      8,
      failed ? "#b76551" : "#dccba3",
    );
    round(c, x - 19, y - 51, 32, 20, failed ? COLORS.red : COLORS.green, 4);
    text(c, failed ? "!" : "OK", x - 3, y - 37, 11, "#fff7de", "center", 800);
    person(c, x + 63, y + 23, motion, "#9a8f68", active, !active || slow);
    if (active) crate(c, x - 73 + Math.sin(motion) * 5, y + 29, 0.7);
  } else if (activity === "database") {
    for (let shelf = 0; shelf < 3; shelf++) {
      rect(c, x - 75, y - 15 + shelf * 19, 120, 4, "#b7996b");
      for (let j = 0; j < 7; j++)
        rect(
          c,
          x - 71 + j * 16,
          y - 28 + shelf * 19,
          10,
          13,
          ["#869b8a", "#b29472", "#8b8fa3"][j % 3],
        );
    }
    person(c, x + 65, y + 24, motion, "#839277", active, !active || slow);
    if (active) crate(c, x + 43, y + 26, 0.5, "#869b8a");
  } else if (activity === "request" || activity === "output") {
    rect(c, x - 75, y - 16, 35, 59, "#927d5e");
    rect(c, x - 70, y - 12, 25, 52, "#677263");
    const dx = active ? Math.sin(motion) * 12 : 0;
    rect(c, x - 9 + dx, y + 28, 64, 8, "#aa865e");
    for (const wx of [x + dx, x + 42 + dx]) {
      round(c, wx, y + 35, 12, 12, "#666450", 6);
      rect(c, wx + 4, y + 39, 4, 4, "#bcab83");
    }
    crate(c, x + dx, y + 8, 0.95, color);
    crate(c, x + 25 + dx, y + 15, 0.55);
    person(c, x + 73 + dx, y + 26, motion, color, active, !active || slow);
  } else {
    rect(c, x - 67, y + 17, 131, 11, "#b5976b");
    rect(c, x - 61, y + 28, 5, 17, "#8d7857");
    rect(c, x + 54, y + 28, 5, 17, "#8d7857");
    person(c, x - 30, y + 3, motion, color, active, !active || slow);
    crate(c, x + 9, y + 3, 0.85, color);
    crate(c, x + 41, y + 7, 0.62);
  }
  if (slow || failed) {
    round(c, x + 75, y - 74, 25, 25, failed ? COLORS.red : COLORS.amber, 5);
    text(c, "!", x + 87, y - 56, 17, "#fff7df", "center", 900);
  }
  if (idle) text(c, "PAUSED", x, y - 44, 10, "#fff5e1", "center", 800);
  plaque(
    c,
    fit(c, node.name, 232),
    x - 127,
    y + 64,
    254,
    `${idle ? "Idle" : node.average_latency_ms.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " ms avg"}  ·  ${node.error_count.toLocaleString()} errors`,
  );
  hits.push({
    type: "node",
    id: node.id,
    x: x - 135,
    y: y - 104,
    w: 273,
    h: 215,
    label: node.name,
    detail: `${stage.building} · ${idle ? "Flow stopped" : node.status} · ${node.average_latency_ms.toLocaleString()} ms`,
  });
}

export function drawProcessVillage(
  c: Ctx,
  telemetry: TownTelemetry,
  t: number,
  hits: Hit[],
) {
  const h = processSceneHeight(telemetry.stages.length),
    stages = telemetry.stages;
  rect(c, 0, 0, W, h, COLORS.grass);
  for (let y = 0; y < h; y += 29)
    for (let x = 0; x < W; x += 37) {
      const seed = (x * 3 + y * 7) % 17;
      if (seed < 6)
        rect(c, x + seed, y, 11, 2, seed % 2 ? "#c5d39f" : "#a3bb7e");
    }
  for (const x of [37, 1243])
    for (let y = 130; y < h - 70; y += 230) tree(c, x, y, 0.9, x % 3);
  for (let i = 0; i < 24; i++)
    flower(
      c,
      55 + ((i * 53) % 1170),
      310 + (i % 3) * 9,
      ["#efe7cb", "#e0b48c", "#f0d18f"][i % 3],
    );
  text(c, "THE PROCESS VILLAGE", 38, 30, 11, "#466247", "left", 800);
  text(c, telemetry.service.name, 38, 50, 14, "#3f5643", "left", 700);
  text(
    c,
    `${telemetry.system.global_tps.toFixed(1)} TPS · ${stages.length} stations · follow the numbered road`,
    W - 38,
    40,
    12,
    "#466247",
    "right",
    600,
  );
  const running =
    telemetry.system.global_tps > 0 &&
    telemetry.service.status !== "STOPPED" &&
    telemetry.service.status !== "ERROR";
  let blocked = false;
  for (let i = 0; i < stages.length - 1; i++) {
    const a = position(i),
      b = position(i + 1);
    const start = { x: a.x, y: a.y + 123 },
      end = { x: b.x, y: b.y + 123 };
    const points =
      Math.floor(i / 3) === Math.floor((i + 1) / 3)
        ? [start, end]
        : [
            start,
            { x: a.x + (Math.floor(i / 3) % 2 ? -145 : 145), y: start.y },
            { x: a.x + (Math.floor(i / 3) % 2 ? -145 : 145), y: end.y },
            end,
          ];
    road(c, points);
    const mid = pathPoint(0.5, points),
      right = end.x >= start.x;
    if (start.y === end.y)
      polygon(
        c,
        [
          mid.x + (right ? 7 : -7),
          mid.y,
          mid.x + (right ? -4 : 4),
          mid.y - 5,
          mid.x + (right ? -4 : 4),
          mid.y + 5,
        ],
        "#ae9469",
      );
    blocked = blocked || stages[i].status === "DOWN";
    if (running && !blocked && stages[i + 1].status !== "DOWN") {
      const count = Math.min(
        4,
        Math.max(1, Math.ceil(telemetry.system.global_tps / 12)),
      );
      const speed = clamp(
        180 / Math.max(80, stages[i + 1].node.average_latency_ms),
        0.08,
        1.6,
      );
      for (let j = 0; j < count; j++) {
        const at = pathPoint(
          (t * 0.085 * speed + j / count + i * 0.19) % 1,
          points,
        );
        crate(c, at.x - 6, at.y - 8, 0.68, stages[i].color);
        hits.push({
          type: "node",
          id: stages[i + 1].node.id,
          x: at.x - 10,
          y: at.y - 14,
          w: 30,
          h: 29,
          label: `Delivery to ${stages[i + 1].node.name}`,
          detail:
            "Illustrative message activity · select to inspect the receiving node",
        });
      }
    }
  }
  blocked = false;
  stages.forEach((stage, i) => {
    blocked = blocked || stage.status === "DOWN";
    station(c, stage, i, t, running && !blocked, hits);
  });
  if (!stages.length) {
    text(
      c,
      "No node telemetry supplied for this service",
      W / 2,
      270,
      21,
      "#456143",
      "center",
      700,
    );
    text(
      c,
      "Service-level worker and queue metrics remain available below.",
      W / 2,
      300,
      14,
      "#58745a",
      "center",
    );
  }
  const y = h - 55;
  const cards = [
    {
      x: 40,
      w: 350,
      type: "workshop" as const,
      label: `ACE CREW · ${telemetry.system.active_threads} / ${telemetry.system.max_threads} busy`,
      detail: "Worker capacity shared by this flow",
    },
    {
      x: 420,
      w: 400,
      type: "queue" as const,
      label: `MQ SILO · ${telemetry.queues.inbound_depth.toLocaleString()} waiting`,
      detail: "Inspect inbound queue depth",
    },
    {
      x: 850,
      w: 390,
      type: "queue" as const,
      id: "dlq",
      label: `REJECT BIN · ${telemetry.queues.dlq_count} dead letters`,
      detail: "Inspect failed messages and recovery tools",
    },
  ];
  for (const card of cards) {
    round(c, card.x, y, card.w, 36, "#f6efd7", 5);
    if (card.id === "dlq") crate(c, card.x + 15, y + 9, 0.9, "#b47a5c");
    else if (card.type === "workshop")
      person(c, card.x + 25, y + 20, t, "#698b84", running);
    else {
      rect(c, card.x + 17, y + 8, 20, 20, "#7d9a91");
      rect(
        c,
        card.x + 20,
        y + 25 - clamp(telemetry.queues.inbound_depth / 250) * 14,
        14,
        clamp(telemetry.queues.inbound_depth / 250) * 14,
        "#d6b96a",
      );
    }
    text(c, card.label, card.x + 48, y + 22, 11, "#425945", "left", 700);
    hits.push({ ...card, y, w: card.w, h: 36 });
  }
}
