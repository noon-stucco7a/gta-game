// game.js — Marina Heat's conductor: the main loop and game state, Dario on foot
// and behind the wheel, car theft and crashes, the wanted heat and the bust, the
// mission glue, saving to localStorage, and the staged scenes the screenshots
// are taken from (?shot=drive, ?shot=chase, ?shot=mission).

import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, SAVE_KEY, HEAT } from './config.js';
import { makeRng } from './random.js';
import { Input } from './input.js';
import { SoundFX } from './audio.js';
import { buildWorld, collideCircle } from './world.js';
import {
  makeCar, makeParkedCars, spawnTrafficCar, spawnPed, spawnPoliceCar,
  updateTrafficCar, updatePoliceCar, updatePed, updateBullets, updateParticles,
  knockDownPed, spawnParticles, damageCar,
} from './entities.js';
import { buildMissions, MissionRunner } from './missions.js';
import { drawWorld, drawHUD, drawTitle, drawPause, drawEndScreen, drawStoryComplete } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? 20261124) || 20261124;
const shot = params.get('shot');

const world = buildWorld(seed);
const runner = new MissionRunner(buildMissions(world));

const G = {
  mode: 'title',
  time: 0,
  world,
  rng: makeRng(seed ^ 0x9e3779b9),
  runner,
  input: new Input(canvas),
  sfx: new SoundFX(),
  cars: [],
  peds: [],
  bullets: [],
  particles: [],
  player: { x: world.landmarks.cantina.x, y: world.landmarks.cantina.y + 26, angle: -Math.PI / 2, health: 100, car: null, fireTimer: 0, invuln: 0 },
  camera: { x: 0, y: 0 },
  heat: 0,
  bust: 0,
  policeSeesPlayer: false,
  lastSeenAt: -99,
  progress: { money: 250, nextMission: 0, storyDone: false },
  dialogue: null,
  dialogueQueue: [],
  dialogueTimer: 0,
  bannerText: '',
  bannerTimer: 0,
  prompt: null,
  markerPos: null,
  missionCar: null,
  hasSave: false,
  showHow: false,
  titleButtons: [],
  endKind: '',
  endText: '',
  pendingStoryEnd: false,
  spawnTimer: 0,
  policeTimer: 0,
  saveTimer: 0,
  lastShotHeatAt: -9,
};

G.stars = () => (G.heat <= 0 ? 0 : Math.min(5, Math.ceil(G.heat / 100)));
G.addHeat = (amount) => {
  if (G.mode !== 'play') return;
  G.heat = Math.min(500, G.heat + amount);
};
G.banner = (text) => {
  G.bannerText = text;
  G.bannerTimer = 2.6;
};
G.say = (lines) => {
  G.dialogueQueue.push(...lines);
  if (!G.dialogue) advanceDialogue();
};
G.hurtPlayer = (amount) => {
  const p = G.player;
  if (p.invuln > 0 || G.mode !== 'play') return;
  p.invuln = 0.3;
  p.health -= amount;
  spawnParticles(G, p.x, p.y, 5, '#ff5348', 80, 0.3);
  if (p.health <= 0) doWasted();
};
G.failMission = (why) => {
  if (!runner.active) return;
  runner.clear();
  if (G.missionCar) {
    G.missionCar.missionVehicle = false;
    G.missionCar = null;
  }
  G.banner(`MISSION FAILED — ${why.toUpperCase()}`);
  G.sfx.missionFailed();
};

function advanceDialogue() {
  G.dialogue = G.dialogueQueue.shift() ?? null;
  G.dialogueTimer = 4.2;
  if (!G.dialogue && G.pendingStoryEnd) {
    G.pendingStoryEnd = false;
    G.mode = 'complete';
  }
}

// ------------------------------------------------------------------ saving

function saveGame() {
  if (shot) return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: G.progress.money,
      nextMission: G.progress.nextMission,
      storyDone: G.progress.storyDone,
      x: G.player.x,
      y: G.player.y,
      health: G.player.health,
    }));
    G.hasSave = true;
  } catch { /* storage unavailable: play on without it */ }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ flow

function resetWorldPopulation() {
  G.cars = makeParkedCars(world, G.rng);
  G.peds = [];
  G.bullets = [];
  G.particles = [];
  G.missionCar = null;
  for (let i = 0; i < 10; i++) {
    const car = spawnTrafficCar(G, G.rng);
    if (car) G.cars.push(car);
  }
  for (let i = 0; i < 14; i++) {
    const ped = spawnPed(G, G.rng);
    if (ped) G.peds.push(ped);
  }
}

function startGame(fromSave) {
  G.sfx.ensure();
  resetWorldPopulation();
  const p = G.player;
  p.car = null;
  p.health = 100;
  p.x = world.landmarks.cantina.x;
  p.y = world.landmarks.cantina.y + 26;
  G.heat = 0;
  G.bust = 0;
  runner.clear();
  G.dialogue = null;
  G.dialogueQueue = [];
  G.progress = { money: 250, nextMission: 0, storyDone: false };
  if (fromSave) {
    const s = readSave();
    if (s) {
      G.progress.money = s.money ?? 250;
      G.progress.nextMission = s.nextMission ?? 0;
      G.progress.storyDone = !!s.storyDone;
      p.x = s.x ?? p.x;
      p.y = s.y ?? p.y;
      p.health = Math.max(40, s.health ?? 100);
    }
  }
  snapCamera();
  G.mode = 'play';
  if (!fromSave) {
    G.say([
      { who: 'Rosa Delgado', text: 'Dario. You came. Walk to the gold marker when you are ready to work — or just take in Port Solano.' },
    ]);
  }
}

function snapCamera() {
  const p = G.player;
  G.camera.x = Math.max(0, Math.min(WORLD_W - VIEW_W, p.x - VIEW_W / 2));
  G.camera.y = Math.max(0, Math.min(WORLD_H - VIEW_H, p.y - VIEW_H / 2));
}

function doBusted() {
  const fine = Math.min(150, G.progress.money);
  G.progress.money -= fine;
  G.endKind = 'busted';
  G.endText = `The PSPD finally pinned you. Fine: $${fine}. Any job you were running is blown.`;
  G.mode = 'end';
  G.sfx.setEngine(false);
  G.sfx.setSiren(false);
  if (runner.active) G.failMission('you got busted');
}

function doWasted() {
  const fee = Math.min(200, G.progress.money);
  G.progress.money -= fee;
  G.endKind = 'wasted';
  G.endText = `You wake up at St. Marina Hospital. Treatment: $${fee}. Any job you were running is blown.`;
  G.mode = 'end';
  G.sfx.setEngine(false);
  G.sfx.setSiren(false);
  if (runner.active) G.failMission('you got wasted');
}

function respawn() {
  const at = G.endKind === 'busted' ? world.landmarks.police : world.landmarks.hospital;
  const p = G.player;
  if (p.car) {
    p.car.driver = 'parked';
    p.car = null;
  }
  p.x = at.x;
  p.y = at.y + 24;
  p.health = 100;
  G.heat = 0;
  G.bust = 0;
  G.cars = G.cars.filter((c) => c.driver !== 'police');
  snapCamera();
  G.mode = 'play';
  saveGame();
}

function completeMission(mission) {
  const replay = G.progress.storyDone;
  const reward = replay ? Math.round(mission.reward / 2) : mission.reward;
  let bonus = 0;
  if (mission.id === 'hot-cargo' && G.missionCar && G.missionCar.health > 70) bonus = 100;
  G.progress.money += reward + bonus;
  G.banner(bonus ? `MISSION COMPLETE — $${reward} + $${bonus} NO-SCRATCH BONUS` : `MISSION COMPLETE — $${reward}`);
  G.sfx.cashRegister();
  G.say(mission.outro);
  const idx = runner.defs.indexOf(mission);
  G.progress.nextMission = (idx + 1) % runner.defs.length;
  if (idx === runner.defs.length - 1 && !G.progress.storyDone) {
    G.progress.storyDone = true;
    G.pendingStoryEnd = true;
  }
  if (G.missionCar) {
    G.missionCar.missionVehicle = false;
    G.missionCar = null;
  }
  saveGame();
}

// ------------------------------------------------------------------ updates

function playerPos() {
  return G.player.car ?? G.player;
}

function updatePlay(dt) {
  const p = G.player;
  const input = G.input;

  // Dialogue advances on its own clock or on demand; it never blocks the city.
  // An E that advances dialogue must not also exit a car or start a mission.
  G._eConsumed = false;
  if (G.dialogue) {
    G.dialogueTimer -= dt;
    if (input.wasPressed('KeyE') || input.mouse.clicked || G.dialogueTimer <= 0) {
      advanceDialogue();
      G._eConsumed = true;
    }
  }

  // Staged screenshot scenes keep the player's car rolling so the shot has motion.
  if (G.cruise && p.car) p.car.speed = Math.max(p.car.speed, G.cruise);

  if (p.car) updateDriving(dt);
  else updateOnFoot(dt);

  // Wanted heat: seen by police it holds; hidden, it cools.
  const starsBefore = G.stars();
  G.policeSeesPlayer = G.cars.some(
    (c) => c.driver === 'police' && Math.hypot(c.x - playerPos().x, c.y - playerPos().y) < HEAT.sightRange,
  );
  if (G.policeSeesPlayer) G.lastSeenAt = G.time;
  if (G.heat > 0 && G.time - G.lastSeenAt > 3.5) {
    G.heat = Math.max(0, G.heat - HEAT.decayPerSecond * dt);
    if (G.stars() === 0 && starsBefore > 0) G.banner('YOU LOST THE HEAT');
  }

  manageTraffic(dt);
  managePeds(dt);
  managePolice(dt);
  updateBust(dt);

  for (const car of G.cars) {
    if (car.driver === 'traffic') updateTrafficCar(G, car, dt);
    else if (car.driver === 'police') updatePoliceCar(G, car, dt);
    if (car.health < 55 && car.health > 0 && Math.random() < dt * 6) {
      spawnParticles(G, car.x + Math.cos(car.angle) * 18, car.y + Math.sin(car.angle) * 18, 1, '#555a60', 26, 0.8);
    }
  }
  for (const ped of G.peds) updatePed(G, ped, dt);
  G.peds = G.peds.filter((ped) => ped.state !== 'down' || ped.downTime < 7);
  updateBullets(G, dt);
  updateParticles(G, dt);

  const result = runner.update(G, dt);
  if (result && result.completed) completeMission(result.completed);

  // The map marker: the mission target, or Rosa's door when there is work to take.
  const m = runner.marker();
  if (m) G.markerPos = m;
  else if (runner.step && runner.step.kind === 'board' && G.missionCar) G.markerPos = { x: G.missionCar.x, y: G.missionCar.y };
  else if (!runner.active) G.markerPos = { x: world.landmarks.cantina.x, y: world.landmarks.cantina.y };
  else G.markerPos = null;

  // Camera follows with a look-ahead in the facing direction.
  const focus = playerPos();
  const lead = p.car ? { x: Math.cos(p.car.angle) * p.car.speed * 0.32, y: Math.sin(p.car.angle) * p.car.speed * 0.32 } : { x: 0, y: 0 };
  const tx = Math.max(0, Math.min(WORLD_W - VIEW_W, focus.x + lead.x - VIEW_W / 2));
  const ty = Math.max(0, Math.min(WORLD_H - VIEW_H, focus.y + lead.y - VIEW_H / 2));
  G.camera.x += (tx - G.camera.x) * Math.min(1, 5 * dt);
  G.camera.y += (ty - G.camera.y) * Math.min(1, 5 * dt);

  // Sirens swell as the law closes in.
  let nearestCop = Infinity;
  for (const c of G.cars) {
    if (c.driver === 'police') nearestCop = Math.min(nearestCop, Math.hypot(c.x - focus.x, c.y - focus.y));
  }
  G.sfx.setSiren(nearestCop < 620, nearestCop === Infinity ? 0 : 1 - nearestCop / 620);

  G.saveTimer -= dt;
  if (G.saveTimer <= 0) {
    G.saveTimer = 8;
    saveGame();
  }
  p.invuln = Math.max(0, p.invuln - dt);
  p.fireTimer = Math.max(0, p.fireTimer - dt);
}

function updateOnFoot(dt) {
  const p = G.player;
  const input = G.input;
  let mx = 0, my = 0;
  if (input.down('KeyW', 'ArrowUp')) my -= 1;
  if (input.down('KeyS', 'ArrowDown')) my += 1;
  if (input.down('KeyA', 'ArrowLeft')) mx -= 1;
  if (input.down('KeyD', 'ArrowRight')) mx += 1;
  const len = Math.hypot(mx, my) || 1;
  const sprint = input.down('ShiftLeft', 'ShiftRight') ? 1.55 : 1;
  const speed = 168 * sprint;
  if (mx !== 0 || my !== 0) {
    p.angle = Math.atan2(my, mx);
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    const res = collideCircle(world, p.x, p.y, 11);
    p.x = res.x;
    p.y = res.y;
  } else {
    // Idle: face the mouse.
    p.angle = Math.atan2(input.mouse.y + G.camera.y - p.y, input.mouse.x + G.camera.x - p.x);
  }

  // Shooting: toward the mouse, on click/hold or J.
  if ((input.mouse.down || input.down('KeyJ')) && p.fireTimer <= 0 && !G.dialogue) {
    p.fireTimer = 0.14;
    const wx = input.mouse.x + G.camera.x;
    const wy = input.mouse.y + G.camera.y;
    const a = Math.atan2(wy - p.y, wx - p.x);
    G.bullets.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * 780, vy: Math.sin(a) * 780, life: 0.5, from: 'player', dmg: 0 });
    spawnParticles(G, p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, 2, '#ffd98a', 40, 0.12);
    G.sfx.shot();
    if (G.time - G.lastShotHeatAt > 0.9) {
      G.lastShotHeatAt = G.time;
      G.addHeat(HEAT.shotFired);
    }
    scarePedsNear(p.x, p.y, 210);
  }

  // Healing at the hospital and the cantina.
  for (const h of world.healSpots) {
    if (Math.hypot(p.x - h.x, p.y - h.y) < 32 && p.health < 100) {
      p.health = Math.min(100, p.health + 26 * dt);
      if (Math.random() < dt * 4) spawnParticles(G, p.x, p.y - 8, 1, '#7dd069', 22, 0.5);
    }
  }

  computeFootPrompt(dt);
}

function scarePedsNear(x, y, radius) {
  for (const ped of G.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.state = 'flee';
      ped.panic = 3;
      ped.threatX = x;
      ped.threatY = y;
    }
  }
}

function nearestEnterableCar() {
  const p = G.player;
  let best = null;
  for (const car of G.cars) {
    if (car.driver === 'player' || Math.abs(car.speed) > 6) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < 48 && (!best || d < best.d)) best = { car, d };
  }
  return best ? best.car : null;
}

function computeFootPrompt(dt) {
  const p = G.player;
  const input = G.input;
  G.prompt = null;
  if (G.dialogue) return;

  const car = nearestEnterableCar();
  const cantina = world.landmarks.cantina;
  const nearCantina = Math.hypot(p.x - cantina.x, p.y - cantina.y) < 52;

  if (car) {
    G.prompt = `E — Enter ${car.missionVehicle ? 'the Vireo GT' : car.type.name}`;
    if (input.wasPressed('KeyE') && !G._eConsumed) {
      enterCar(car);
      return;
    }
  }
  if (nearCantina && !runner.active) {
    const next = runner.defs[G.progress.nextMission];
    G.prompt = G.progress.storyDone
      ? `E — Run "${next.title}" again for Rosa (half pay)`
      : `E — Talk to Rosa: "${next.title}"`;
    if (input.wasPressed('KeyE') && !G._eConsumed) {
      runner.start(G, G.progress.nextMission);
    }
  }
  void dt;
}

function enterCar(car) {
  const p = G.player;
  p.car = car;
  const wasPolice = car.driver === 'police';
  car.driver = 'player';
  p.x = car.x;
  p.y = car.y;
  G.sfx.door();
  G.sfx.setEngine(true, 0);
  if (!car.countedTheft) {
    car.countedTheft = true;
    if (car.missionVehicle) {
      // The mission runner calls this one in itself.
    } else if (wasPolice) {
      G.addHeat(240);
      G.banner('YOU STOLE A POLICE INTERCEPTOR');
    } else {
      const witnessed = G.peds.some((ped) => ped.state !== 'down' && Math.hypot(ped.x - car.x, ped.y - car.y) < 280)
        || G.cars.some((c) => c.driver === 'police' && Math.hypot(c.x - car.x, c.y - car.y) < 360);
      if (witnessed) {
        G.addHeat(HEAT.carTheft);
        G.banner('CAR THEFT — WITNESSED');
      }
    }
  }
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  car.driver = 'parked';
  car.speed = 0;
  // Step out on the car's left side.
  const sx = car.x + Math.cos(car.angle - Math.PI / 2) * (car.type.radius + 15);
  const sy = car.y + Math.sin(car.angle - Math.PI / 2) * (car.type.radius + 15);
  const res = collideCircle(world, sx, sy, 11);
  p.x = res.x;
  p.y = res.y;
  p.car = null;
  G.sfx.door();
  G.sfx.setEngine(false);
}

function updateDriving(dt) {
  const p = G.player;
  const input = G.input;
  const car = p.car;
  const t = car.type;

  if (input.wasPressed('KeyE') && !G.dialogue && !G._eConsumed) {
    // Tito's garage repairs the ride while you sit in it.
    const g = world.landmarks.garage;
    if (Math.hypot(car.x - g.x, car.y - g.y) < 78 && car.health < 100 && G.progress.money >= 50) {
      G.progress.money -= 50;
      car.health = 100;
      G.banner('TITO FIXED HER UP — $50');
      G.sfx.cashRegister();
      saveGame();
    } else if (Math.abs(car.speed) < 40) {
      exitCar();
      return;
    }
  }
  G.prompt = null;
  const g = world.landmarks.garage;
  if (Math.hypot(car.x - g.x, car.y - g.y) < 78 && car.health < 100) {
    G.prompt = G.progress.money >= 50 ? 'E — Repair at Tito\'s ($50)' : 'E — Repair at Tito\'s ($50 — you are short)';
  } else if (Math.abs(car.speed) < 40) {
    G.prompt = 'E — Exit vehicle';
  }

  const fwd = input.down('KeyW', 'ArrowUp');
  const back = input.down('KeyS', 'ArrowDown');
  const left = input.down('KeyA', 'ArrowLeft');
  const right = input.down('KeyD', 'ArrowRight');
  const brake = input.down('Space');

  if (car.health <= 0) {
    car.speed = approachNum(car.speed, 0, 300 * dt);
  } else if (fwd) {
    car.speed = Math.min(t.topSpeed, car.speed + t.accel * dt);
  } else if (back) {
    car.speed = Math.max(-130, car.speed - t.accel * 0.8 * dt);
  } else {
    car.speed = approachNum(car.speed, 0, 120 * dt);
  }
  if (brake) car.speed = approachNum(car.speed, 0, 460 * dt);

  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  if (steer !== 0 && car.speed !== 0) {
    const grip = brake ? 1.5 : 1;
    car.angle += steer * grip * 2.05 * dt * Math.max(-1, Math.min(1, car.speed / 105));
  }

  const ox = car.x, oy = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const res = collideCircle(world, car.x, car.y, t.radius);
  if (res.hit) {
    car.x = res.x;
    car.y = res.y;
    const impact = Math.abs(car.speed);
    if (impact > 150) {
      damageCar(G, car, (impact - 130) * 0.09, car.x, car.y);
      G.sfx.crash(Math.min(1, impact / 320));
      spawnParticles(G, car.x, car.y, 10, '#ffb347', 120, 0.4);
      if (impact > 300) G.hurtPlayer(6);
    }
    car.speed *= -0.22;
  }
  void ox; void oy;

  // Car on car, and car on pedestrian.
  for (const other of G.cars) {
    if (other === car) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    const min = t.radius + other.type.radius - 3;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const nx = (other.x - car.x) / d, ny = (other.y - car.y) / d;
      other.x += nx * push;
      other.y += ny * push;
      car.x -= nx * push;
      car.y -= ny * push;
      const rel = Math.abs(car.speed);
      if (rel > 90) {
        damageCar(G, other, (rel - 80) * 0.07, other.x, other.y);
        damageCar(G, car, (rel - 80) * 0.04, car.x, car.y);
        G.sfx.crash(Math.min(1, rel / 300));
        if (other.driver === 'police') G.addHeat(HEAT.hitPoliceCar);
        else if (other.driver === 'traffic') G.addHeat(HEAT.hitTrafficCar);
        car.speed *= 0.45;
      } else {
        car.speed *= 0.8;
      }
    }
  }
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < t.radius + 9) {
      if (Math.abs(car.speed) > 55) {
        knockDownPed(G, ped, 'car');
        G.sfx.crash(0.5);
        car.speed *= 0.82;
      } else {
        ped.state = 'flee';
        ped.panic = 2;
        ped.threatX = car.x;
        ped.threatY = car.y;
      }
    }
  }

  p.x = car.x;
  p.y = car.y;
  G.sfx.setEngine(true, Math.abs(car.speed) / t.topSpeed);
}

function approachNum(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

// ------------------------------------------------------------------ population

function manageTraffic(dt) {
  const p = playerPos();
  G.spawnTimer -= dt;
  const traffic = G.cars.filter((c) => c.driver === 'traffic');
  if (traffic.length < 11 && G.spawnTimer <= 0) {
    G.spawnTimer = 0.5;
    const car = spawnTrafficCar(G, G.rng);
    if (car) G.cars.push(car);
  }
  G.cars = G.cars.filter((c) => {
    if (c.driver !== 'traffic') return true;
    return Math.hypot(c.x - p.x, c.y - p.y) < 1200;
  });
}

function managePeds(dt) {
  void dt;
  const p = playerPos();
  const near = G.peds.filter((ped) => Math.hypot(ped.x - p.x, ped.y - p.y) < 1150);
  G.peds = near;
  if (G.peds.length < 15) {
    const ped = spawnPed(G, G.rng);
    if (ped) G.peds.push(ped);
  }
}

function managePolice(dt) {
  const stars = G.stars();
  const police = G.cars.filter((c) => c.driver === 'police');
  if (stars === 0) {
    // The heat is gone: interceptors give up and rejoin traffic.
    for (const c of police) c.driver = 'traffic';
    return;
  }
  G.policeTimer -= dt;
  if (police.length < stars && G.policeTimer <= 0) {
    G.policeTimer = 2.2;
    G.cars.push(spawnPoliceCar(G, G.rng));
  }
}

function updateBust(dt) {
  const p = G.player;
  const focus = playerPos();
  let nearest = Infinity;
  for (const c of G.cars) {
    if (c.driver === 'police') nearest = Math.min(nearest, Math.hypot(c.x - focus.x, c.y - focus.y));
  }
  const pinned = (!p.car && nearest < 82) || (p.car && Math.abs(p.car.speed) < 30 && nearest < 98);
  if (pinned && G.stars() > 0) {
    G.bust = Math.min(100, G.bust + 30 * dt);
    if (G.bust >= 100) doBusted();
  } else {
    G.bust = Math.max(0, G.bust - 42 * dt);
  }
}

// ------------------------------------------------------------------ staged scenes for screenshots

function applyShotScene(name) {
  if (name === 'start') return;
  startGame(false);
  G.dialogue = null;
  G.dialogueQueue = [];
  const p = G.player;
  if (name === 'drive') {
    const car = makeCar(1470, 609, 0, 'sports', 'player', G.rng);
    car.color = '#c22f4e';
    car.countedTheft = true;
    G.cars.push(car);
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    car.speed = 120;
    G.cruise = 150;
    runner.start(G, 0);
    G.dialogue = null;
    G.dialogueQueue = [];
  } else if (name === 'chase') {
    const car = makeCar(1500, 609, 0, 'sedan', 'player', G.rng);
    car.color = '#4a7fb5';
    car.countedTheft = true;
    G.cars.push(car);
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    car.speed = 210;
    G.cruise = 205;
    G.heat = 260; // three stars
    for (const [dx, dy, a] of [[-170, -55, 0.2], [-260, 70, -0.15], [-120, 130, 0.5]]) {
      const cop = makeCar(car.x + dx, car.y + dy, a, 'police', 'police', G.rng);
      cop.speed = 200;
      G.cars.push(cop);
    }
    runner.start(G, 0);
    G.dialogue = null;
    G.dialogueQueue = [];
    G.banner('MISSION — FIRST DELIVERY');
  } else if (name === 'mission') {
    p.x = 1560;
    p.y = 2830;
    runner.start(G, 2);
    G.dialogue = null;
    G.dialogueQueue = [];
  }
  snapCamera();
}

// ------------------------------------------------------------------ main loop

G.hasSave = !!readSave();
if (shot) applyShotScene(shot);
window.__MARINA__ = G;

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  G.time += dt;
  if (G.bannerTimer > 0) G.bannerTimer -= dt;

  const input = G.input;
  if (input.wasPressed('KeyM')) {
    G.sfx.ensure();
    G.sfx.setMuted(!G.sfx.muted);
  }

  if (G.mode === 'title') {
    if (input.mouse.clicked) {
      G.sfx.ensure();
      for (const b of G.titleButtons) {
        if (input.mouse.x >= b.x && input.mouse.x <= b.x + b.w && input.mouse.y >= b.y && input.mouse.y <= b.y + b.h) {
          G.sfx.click();
          if (b.id === 'new') startGame(false);
          else if (b.id === 'continue') startGame(true);
          else if (b.id === 'how') G.showHow = !G.showHow;
        }
      }
    }
    if (input.wasPressed('Enter')) startGame(G.hasSave);
    drawTitle(ctx, G);
  } else if (G.mode === 'play') {
    if (input.wasPressed('Escape')) {
      G.mode = 'pause';
      saveGame();
    } else {
      updatePlay(dt);
    }
    drawWorld(ctx, G);
    drawHUD(ctx, G);
  } else if (G.mode === 'pause') {
    if (input.wasPressed('Escape', 'Enter')) G.mode = 'play';
    drawWorld(ctx, G);
    drawHUD(ctx, G);
    drawPause(ctx, G);
  } else if (G.mode === 'end') {
    updateParticles(G, dt);
    if (input.wasPressed('Enter')) respawn();
    drawWorld(ctx, G);
    drawEndScreen(ctx, G);
  } else if (G.mode === 'complete') {
    if (input.wasPressed('Enter')) G.mode = 'play';
    drawWorld(ctx, G);
    drawHUD(ctx, G);
    drawStoryComplete(ctx, G);
  }

  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
