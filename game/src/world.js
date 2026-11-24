// world.js — builds Port Solano: a grid of city blocks (towers, parks, parking lots,
// plazas and five hand-placed landmarks) between wide roads, with a harbour and
// piers along the south edge. Also owns the collision and road queries every
// mover in the game uses.

import {
  ROAD, BLOCK, PITCH, COLS, ROWS, CITY_W, CITY_H, WORLD_W, WORLD_H,
  BUILDING_COLORS,
} from './config.js';
import { makeRng, range, rangeInt, pick, chance } from './random.js';

export const roadCentersX = [];
export const roadCentersY = [];
for (let i = 0; i <= COLS; i++) roadCentersX.push(ROAD / 2 + i * PITCH);
for (let j = 0; j <= ROWS; j++) roadCentersY.push(ROAD / 2 + j * PITCH);

// Fixed landmark blocks, by [col, row]: the story of Marina Heat happens here.
const LANDMARK_BLOCKS = {
  '2,0': 'cantina',
  '3,2': 'police',
  '0,2': 'hospital',
  '5,1': 'garage',
  '4,4': 'warehouse',
};

const LANDMARK_BUILDINGS = {
  cantina: { name: "ROSA'S CANTINA", color: '#e2725b', w: 250, h: 150 },
  police: { name: 'PORT SOLANO PD', color: '#7d8a99', w: 280, h: 170 },
  hospital: { name: 'ST. MARINA HOSPITAL', color: '#e8e4da', w: 280, h: 170 },
  garage: { name: "TITO'S FIX-IT GARAGE", color: '#b5893c', w: 260, h: 160 },
  warehouse: { name: 'HARBOR WAREHOUSE 9', color: '#8c6a4a', w: 300, h: 190 },
};

export function buildWorld(seed = 20261124) {
  const rng = makeRng(seed);
  const world = {
    w: WORLD_W,
    h: WORLD_H,
    blocks: [],
    buildings: [],
    trees: [],
    props: [], // circle colliders that are not trees (fountains)
    lamps: [],
    parkedSpots: [],
    healSpots: [],
    piers: [],
    landmarks: {},
  };

  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const bx = ROAD + i * PITCH;
      const by = ROAD + j * PITCH;
      const landmark = LANDMARK_BLOCKS[`${i},${j}`] ?? null;
      const type = landmark ?? (chance(rng, 0.45) ? 'towers' : chance(rng, 0.36) ? 'park' : chance(rng, 0.55) ? 'parking' : 'plaza');
      const block = { x: bx, y: by, w: BLOCK, h: BLOCK, type, landmark };
      world.blocks.push(block);
      buildBlock(world, rng, block);
    }
  }

  // Street parking along a few avenues.
  for (const cy of [roadCentersY[1], roadCentersY[3]]) {
    for (let x = 260; x < CITY_W - 200; x += 190) {
      if (chance(rng, 0.55)) world.parkedSpots.push({ x, y: cy - ROAD / 2 + 20, angle: 0 });
      if (chance(rng, 0.55)) world.parkedSpots.push({ x: x + 80, y: cy + ROAD / 2 - 20, angle: Math.PI });
    }
  }

  // Harbour piers reaching into the water.
  for (const px of [700, 1600, 2500]) {
    world.piers.push({ x: px - 60, y: CITY_H, w: 120, h: 210 });
  }

  // Lamp posts at intersections.
  for (const cx of roadCentersX) for (const cy of roadCentersY) {
    world.lamps.push({ x: cx - ROAD / 2 + 8, y: cy - ROAD / 2 + 8 });
    world.lamps.push({ x: cx + ROAD / 2 - 8, y: cy + ROAD / 2 - 8 });
  }

  return world;
}

function buildBlock(world, rng, block) {
  const inset = 20;
  const ix = block.x + inset;
  const iy = block.y + inset;
  const iw = block.w - inset * 2;
  const ih = block.h - inset * 2;

  if (block.landmark) {
    const spec = LANDMARK_BUILDINGS[block.landmark];
    const bx = block.x + (block.w - spec.w) / 2;
    const by = block.y + 58;
    world.buildings.push({ x: bx, y: by, w: spec.w, h: spec.h, height: 34, color: spec.color, name: spec.name });
    // The landmark's front door, on the south sidewalk: where markers and people stand.
    world.landmarks[block.landmark] = { x: block.x + block.w / 2, y: by + spec.h + 42 };
    if (block.landmark === 'hospital' || block.landmark === 'cantina') {
      world.healSpots.push({ x: block.x + block.w / 2 + 90, y: by + spec.h + 42, kind: block.landmark });
    }
    if (block.landmark === 'warehouse') {
      for (let k = 0; k < 5; k++) {
        world.parkedSpots.push({ x: ix + 40 + k * 62, y: block.y + block.h - 44, angle: 0 });
      }
    }
    scatterTrees(world, rng, block, 3);
    return;
  }

  if (block.type === 'towers') {
    const cell = iw / 2;
    for (let cj = 0; cj < 2; cj++) {
      for (let ci = 0; ci < 2; ci++) {
        if (chance(rng, 0.18)) continue; // a courtyard gap
        const w = range(rng, 118, 152);
        const h = range(rng, 118, 152);
        world.buildings.push({
          x: ix + ci * cell + (cell - w) / 2,
          y: iy + cj * cell + (cell - h) / 2,
          w, h,
          height: rangeInt(rng, 26, 88),
          color: pick(rng, BUILDING_COLORS),
          name: null,
        });
      }
    }
    scatterTrees(world, rng, block, 2);
  } else if (block.type === 'park') {
    scatterTrees(world, rng, block, 16);
  } else if (block.type === 'parking') {
    for (let k = 0; k < 4; k++) {
      world.parkedSpots.push({ x: ix + 48 + k * 84, y: iy + 34, angle: Math.PI / 2 });
      world.parkedSpots.push({ x: ix + 48 + k * 84, y: iy + ih - 34, angle: -Math.PI / 2 });
    }
    scatterTrees(world, rng, block, 2);
  } else { // plaza
    world.props.push({ x: block.x + block.w / 2, y: block.y + block.h / 2, r: 30 }); // fountain
    world.buildings.push({
      x: block.x + 42, y: block.y + 42, w: 96, h: 64, height: 14,
      color: '#d96f32', name: 'TACO SOLANO',
    });
    scatterTrees(world, rng, block, 5);
  }
}

function scatterTrees(world, rng, block, count) {
  for (let k = 0; k < count; k++) {
    const x = range(rng, block.x + 30, block.x + block.w - 30);
    const y = range(rng, block.y + 30, block.y + block.h - 30);
    // Keep trees out of building footprints.
    if (world.buildings.some((b) => x > b.x - 16 && x < b.x + b.w + 16 && y > b.y - 16 && y < b.y + b.h + 16)) continue;
    world.trees.push({ x, y, r: range(rng, 9, 14) });
  }
}

export function isRoad(x, y) {
  if (y >= CITY_H) return false;
  const inBand = (v) => {
    const m = ((v % PITCH) + PITCH) % PITCH;
    return m < ROAD;
  };
  return inBand(x) || inBand(y);
}

export function isWater(world, x, y) {
  if (y <= CITY_H) return false;
  return !world.piers.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

export function nearestRoadCenter(v, centers) {
  let best = centers[0];
  let bestD = Infinity;
  for (const c of centers) {
    const d = Math.abs(c - v);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// Push a circle out of every building, tree, prop, the harbour water and the
// world edge. Returns the corrected position and whether anything was hit.
export function collideCircle(world, x, y, r) {
  let hit = false;
  x = Math.max(r, Math.min(world.w - r, x));
  if (y < r) y = r;

  // Water is a wall, except on the piers: hold the mover at the waterline.
  if (isWater(world, x, y)) {
    y = CITY_H + 2;
    hit = true;
  }
  if (y > world.h - r) { y = world.h - r; hit = true; }

  for (const b of world.buildings) {
    const nx = Math.max(b.x, Math.min(b.x + b.w, x));
    const ny = Math.max(b.y, Math.min(b.y + b.h, y));
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      } else {
        // Centre inside the rect: push out through the nearest face.
        const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  for (const list of [world.trees, world.props]) {
    for (const t of list) {
      const dx = x - t.x;
      const dy = y - t.y;
      const rr = r + t.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = t.x + (dx / d) * rr;
        y = t.y + (dy / d) * rr;
        hit = true;
      }
    }
  }
  return { x, y, hit };
}
