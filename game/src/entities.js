// entities.js — the living city: traffic cars that follow the lanes and turn at
// intersections, parked cars waiting to be stolen, pedestrians who stroll the
// sidewalks and flee from trouble, police interceptors that hunt the player, and
// the bullets and particles that fly between them.

import { CAR_TYPES, HEAT } from './config.js';
import { makeRng, range, pick, chance } from './random.js';
import { roadCentersX, roadCentersY, nearestRoadCenter, collideCircle, isRoad } from './world.js';

const LANE_OFF = 33;

let nextId = 1;

export function makeCar(x, y, angle, typeKey, driver, rng) {
  const type = CAR_TYPES[typeKey];
  return {
    id: nextId++,
    x, y, angle, speed: 0,
    typeKey, type, driver,
    color: pick(rng, type.colors),
    health: 100,
    decideKey: '',
    stuckTime: 0,
    reverseTime: 0,
    fireTimer: range(rng, 0.3, 1),
    sirenPhase: rng() * Math.PI * 2,
  };
}

export function makeParkedCars(world, rng) {
  const cars = [];
  const spots = [...world.parkedSpots];
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const spot of spots.slice(0, 30)) {
    const typeKey = pick(rng, ['sedan', 'sedan', 'hatch', 'sports', 'truck', 'van']);
    cars.push(makeCar(spot.x, spot.y, spot.angle, typeKey, 'parked', rng));
  }
  return cars;
}

function laneTarget(car) {
  // The point the car steers for: far ahead, centred on its lane of its road.
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  const tx = car.x + hx * 420;
  const ty = car.y + hy * 420;
  if (Math.abs(hx) > Math.abs(hy)) {
    const roadY = nearestRoadCenter(car.y, roadCentersY);
    return { x: tx, y: roadY + (hx > 0 ? LANE_OFF : -LANE_OFF) };
  }
  const roadX = nearestRoadCenter(car.x, roadCentersX);
  return { x: roadX + (hy > 0 ? -LANE_OFF : LANE_OFF), y: ty };
}

function obstacleAhead(G, car, dist) {
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const f = dx * hx + dy * hy;
    const l = -dx * hy + dy * hx;
    if (f > 0 && f < dist && Math.abs(l) < 30) return true;
  }
  if (G.player.car && G.player.car !== car) {
    // the player's car is in G.cars too; covered above
  }
  return false;
}

function pedAhead(G, car, dist) {
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const f = dx * hx + dy * hy;
    const l = -dx * hy + dy * hx;
    if (f > 0 && f < dist && Math.abs(l) < 26) return true;
  }
  return false;
}

export function spawnTrafficCar(G, rng) {
  const p = G.player;
  for (let tries = 0; tries < 12; tries++) {
    const horizontal = chance(rng, 0.5);
    const center = horizontal ? pick(rng, roadCentersY) : pick(rng, roadCentersX);
    const along = range(rng, 80, horizontal ? G.world.w - 80 : G.world.h - 380);
    const dir = chance(rng, 0.5) ? 1 : -1;
    let x, y, angle;
    if (horizontal) {
      angle = dir > 0 ? 0 : Math.PI;
      x = along;
      y = center + (dir > 0 ? LANE_OFF : -LANE_OFF);
    } else {
      angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      x = center + (dir > 0 ? -LANE_OFF : LANE_OFF);
      y = along;
    }
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < 340 || d > 950) continue; // near the player, but never on top of them
    const car = makeCar(x, y, angle, pick(rng, ['sedan', 'sedan', 'hatch', 'truck', 'van']), 'traffic', rng);
    car.speed = car.type.topSpeed * 0.5;
    return car;
  }
  return null;
}

export function updateTrafficCar(G, car, dt) {
  const rng = G.rng;
  // Decide turns at intersections.
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  if (Math.abs(hx) > Math.abs(hy)) {
    for (const cx of roadCentersX) {
      const ahead = (cx - car.x) * hx;
      if (ahead > 0 && ahead < 30) {
        const key = `${cx},${Math.round(car.y)}`;
        if (car.decideKey !== key) {
          car.decideKey = key;
          const roll = rng();
          if (roll < 0.24) car.angle += Math.PI / 2;
          else if (roll < 0.48) car.angle -= Math.PI / 2;
        }
      }
    }
  } else {
    for (const cy of roadCentersY) {
      const ahead = (cy - car.y) * hy;
      if (ahead > 0 && ahead < 30) {
        const key = `${Math.round(car.x)},${cy}`;
        if (car.decideKey !== key) {
          car.decideKey = key;
          const roll = rng();
          if (roll < 0.24) car.angle += Math.PI / 2;
          else if (roll < 0.48) car.angle -= Math.PI / 2;
        }
      }
    }
  }
  // Roads end at the harbour and the city edge: turn around there. Only when
  // running straight along an axis, never mid-turn.
  const aheadX = car.x + Math.cos(car.angle) * 90;
  const aheadY = car.y + Math.sin(car.angle) * 90;
  const axisAligned = Math.abs(hx) > 0.9 || Math.abs(hy) > 0.9;
  if (axisAligned && !isRoad(aheadX, aheadY) && Math.abs(car.speed) > 0) {
    const target = laneTarget(car);
    if (!isRoad(target.x, target.y)) car.angle += Math.PI;
  }

  const target = laneTarget(car);
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  car.angle = turnToward(car.angle, want, 2.2 * dt);

  let desired = car.type.topSpeed * 0.52;
  if (obstacleAhead(G, car, 88)) desired = 0;
  else if (obstacleAhead(G, car, 130) || pedAhead(G, car, 62)) desired = car.type.topSpeed * 0.22;
  car.speed = approach(car.speed, desired, (desired < car.speed ? 320 : 130) * dt);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const res = collideCircle(G.world, car.x, car.y, car.type.radius);
  car.x = res.x;
  car.y = res.y;
}

export function spawnPoliceCar(G, rng) {
  const p = G.player;
  const angle = rng() * Math.PI * 2;
  const dist = range(rng, 560, 680);
  let x = p.x + Math.cos(angle) * dist;
  let y = p.y + Math.sin(angle) * dist;
  // Police arrive by road: snap to the nearest road centre cross.
  x = nearestRoadCenter(x, roadCentersX);
  y = nearestRoadCenter(y, roadCentersY);
  x = Math.max(50, Math.min(G.world.w - 50, x));
  y = Math.max(50, Math.min(G.world.h - 340, y));
  const car = makeCar(x, y, Math.atan2(p.y - y, p.x - x), 'police', 'police', rng);
  return car;
}

export function updatePoliceCar(G, car, dt) {
  const p = G.player;
  const target = p.car ?? p;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  const stars = G.stars();

  let desired = Math.min(car.type.topSpeed, 295 + stars * 14);
  // Beside a player on foot, an interceptor stops and its officer works the bust.
  if (!p.car && dist < 62) desired = 0;
  if (car.reverseTime > 0) {
    car.reverseTime -= dt;
    desired = -110;
  }

  const want = Math.atan2(dy, dx);
  car.angle = turnToward(car.angle, want, (car.reverseTime > 0 ? 3.2 : 2.0) * dt);
  car.speed = approach(car.speed, desired, (desired < car.speed ? 380 : 240) * dt);
  const ox = car.x;
  const oy = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const res = collideCircle(G.world, car.x, car.y, car.type.radius);
  car.x = res.x;
  car.y = res.y;
  if (res.hit && Math.abs(car.speed) > 60) {
    car.speed *= 0.4;
    car.stuckTime += dt;
    if (car.stuckTime > 0.55) {
      car.reverseTime = 0.7;
      car.stuckTime = 0;
    }
  } else {
    car.stuckTime = Math.max(0, car.stuckTime - dt);
  }
  if (Math.hypot(car.x - ox, car.y - oy) < 0.01 && Math.abs(car.speed) > 200) car.speed = 0;

  // At three stars and up, officers fire on an armed player on foot.
  car.fireTimer -= dt;
  if (stars >= 3 && !p.car && dist < 250 && dist > 40 && car.fireTimer <= 0) {
    car.fireTimer = range(G.rng, 0.8, 1.3);
    const spread = range(G.rng, -0.14, 0.14);
    const a = Math.atan2(p.y - car.y, p.x - car.x) + spread;
    G.bullets.push({ x: car.x, y: car.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.55, from: 'police', dmg: 6 });
    G.sfx.shot();
  }
}

export function spawnPed(G, rng) {
  const p = G.player;
  for (let tries = 0; tries < 10; tries++) {
    const block = pick(rng, G.world.blocks);
    const side = Math.floor(rng() * 4);
    const t = rng();
    let x, y;
    if (side === 0) { x = block.x + t * block.w; y = block.y - 12; }
    else if (side === 1) { x = block.x + t * block.w; y = block.y + block.h + 12; }
    else if (side === 2) { x = block.x - 12; y = block.y + t * block.h; }
    else { x = block.x + block.w + 12; y = block.y + t * block.h; }
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < 260 || d > 900) continue;
    return {
      id: nextId++, x, y, angle: rng() * Math.PI * 2, speed: 0,
      state: 'walk', tx: x, ty: y, panic: 0, threatX: 0, threatY: 0,
      color: pick(rng, ['#e4572e', '#17a398', '#f2c14e', '#6c5ce7', '#d64580', '#2e86ab', '#f6f7eb', '#8c5e3c']),
      downTime: 0, block,
    };
  }
  return null;
}

function pickPedTarget(G, ped) {
  const rng = G.rng;
  const block = chance(rng, 0.72) ? ped.block : pick(rng, G.world.blocks);
  ped.block = block;
  const side = Math.floor(rng() * 4);
  const t = rng();
  if (side === 0) { ped.tx = block.x + t * block.w; ped.ty = block.y - 12; }
  else if (side === 1) { ped.tx = block.x + t * block.w; ped.ty = block.y + block.h + 12; }
  else if (side === 2) { ped.tx = block.x - 12; ped.ty = block.y + t * block.h; }
  else { ped.tx = block.x + block.w + 12; ped.ty = block.y + t * block.h; }
}

export function scarePeds(G, x, y, radius) {
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.state = 'flee';
      ped.panic = range(G.rng, 2.5, 4.5);
      ped.threatX = x;
      ped.threatY = y;
    }
  }
}

export function updatePed(G, ped, dt) {
  if (ped.state === 'down') {
    ped.downTime += dt;
    return;
  }
  let speed = 52;
  let tx = ped.tx;
  let ty = ped.ty;
  if (ped.state === 'flee') {
    ped.panic -= dt;
    if (ped.panic <= 0) ped.state = 'walk';
    const dx = ped.x - ped.threatX;
    const dy = ped.y - ped.threatY;
    const d = Math.hypot(dx, dy) || 1;
    tx = ped.x + (dx / d) * 120;
    ty = ped.y + (dy / d) * 120;
    speed = 128;
  } else if (Math.hypot(ped.tx - ped.x, ped.ty - ped.y) < 8) {
    pickPedTarget(G, ped);
    return;
  }
  const want = Math.atan2(ty - ped.y, tx - ped.x);
  ped.angle = turnToward(ped.angle, want, 6 * dt);
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  const res = collideCircle(G.world, ped.x, ped.y, 10);
  ped.x = res.x;
  ped.y = res.y;
}

export function updateBullets(G, dt) {
  const kept = [];
  for (const b of G.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    let dead = false;
    for (const bd of G.world.buildings) {
      if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { dead = true; break; }
    }
    if (dead) {
      spawnParticles(G, b.x, b.y, 3, '#ffd98a', 60, 0.25);
      continue;
    }
    if (b.from === 'player') {
      for (const car of G.cars) {
        if (Math.hypot(car.x - b.x, car.y - b.y) < car.type.radius) {
          damageCar(G, car, 16, b.x, b.y);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const ped of G.peds) {
          if (ped.state !== 'down' && Math.hypot(ped.x - b.x, ped.y - b.y) < 13) {
            knockDownPed(G, ped, 'shot');
            dead = true;
            break;
          }
        }
      }
    } else if (!G.player.car && Math.hypot(G.player.x - b.x, G.player.y - b.y) < 13) {
      G.hurtPlayer(b.dmg);
      dead = true;
    }
    if (!dead) kept.push(b);
  }
  G.bullets = kept;
}

export function damageCar(G, car, amount, x, y) {
  car.health -= amount;
  spawnParticles(G, x, y, 5, '#ffb347', 90, 0.3);
  if (car.driver === 'police') G.addHeat(HEAT.hitPoliceCar * 0.25, 'shot a police car');
  if (car.health <= 0 && car.speed !== 0) {
    car.speed = 0;
  }
}

export function knockDownPed(G, ped, cause) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downTime = 0;
  spawnParticles(G, ped.x, ped.y, 6, '#e8e2c8', 70, 0.35);
  scarePeds(G, ped.x, ped.y, 190);
  if (cause === 'car') G.addHeat(HEAT.hitPedestrian, 'hit a pedestrian');
  else G.addHeat(HEAT.hitPedestrian * 0.8, 'shot a pedestrian');
}

export function spawnParticles(G, x, y, count, color, speed, life) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    G.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.6 + Math.random() * 0.8), maxLife: life,
      color, size: 2 + Math.random() * 3,
    });
  }
}

export function updateParticles(G, dt) {
  G.particles = G.particles.filter((pt) => {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    return pt.life > 0;
  });
}

export function turnToward(angle, want, maxStep) {
  let diff = want - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return want;
  return angle + Math.sign(diff) * maxStep;
}

export function approach(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}
