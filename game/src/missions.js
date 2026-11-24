// missions.js — Rosa Delgado's three jobs for Dario Venn, the whole story of
// Marina Heat: a timed delivery, a hot car to move across town, and a harbour
// run for three bags of cash. A small state machine walks each mission's steps
// (go to a marker, board a car, collect the bags, deliver) and reports the
// objective line and the map marker the HUD draws.

import { CITY_H } from './config.js';
import { makeCar } from './entities.js';

export function buildMissions(world) {
  const L = world.landmarks;
  return [
    {
      id: 'first-delivery',
      title: 'First Delivery',
      reward: 300,
      intro: [
        { who: 'Rosa Delgado', text: 'Dario Venn. Back in Port Solano and already owing me a favour.' },
        { who: 'Rosa Delgado', text: 'A package waits at Harbor Warehouse 9. Fetch it, bring it home. Simple.' },
        { who: 'Dario Venn', text: 'Simple is my favourite kind of trouble.' },
      ],
      outro: [
        { who: 'Rosa Delgado', text: 'On time and in one piece. You still drive like you mean it.' },
      ],
      steps: [
        { kind: 'goto', x: L.warehouse.x, y: L.warehouse.y, r: 46, label: 'Pick up the package at Harbor Warehouse 9' },
        { kind: 'goto', x: L.cantina.x, y: L.cantina.y, r: 46, time: 150, label: "Bring the package back to Rosa's Cantina" },
      ],
    },
    {
      id: 'hot-cargo',
      title: 'Hot Cargo',
      reward: 500,
      intro: [
        { who: 'Rosa Delgado', text: 'A yellow Vireo GT sits in the north lot. Its owner... misplaced it.' },
        { who: 'Rosa Delgado', text: "Take it to Tito's Fix-It Garage. The owner will call it in, so expect company." },
        { who: 'Dario Venn', text: 'Company I can handle. Scratches, Tito will bill me for.' },
      ],
      outro: [
        { who: 'Tito', text: 'She purrs. Rosa said you might actually pull this off.' },
      ],
      steps: [
        { kind: 'board', label: 'Take the yellow Vireo GT from the marked lot' },
        { kind: 'goto', x: L.garage.x, y: L.garage.y, r: 60, needsMissionCar: true, label: "Deliver the Vireo GT to Tito's Fix-It Garage" },
      ],
    },
    {
      id: 'harbor-run',
      title: 'Harbor Run',
      reward: 900,
      intro: [
        { who: 'Rosa Delgado', text: 'Three bags of harbour money sit on the three piers. Collect them all.' },
        { who: 'Rosa Delgado', text: 'Every bag makes the PSPD more curious. Bring the money home, Dario.' },
        { who: 'Dario Venn', text: 'Three piers, three bags, one long night. On it.' },
      ],
      outro: [
        { who: 'Rosa Delgado', text: 'Every bag. Port Solano remembers who runs its nights now.' },
        { who: 'Dario Venn', text: 'Then let it remember us kindly, Rosa.' },
      ],
      steps: [
        {
          kind: 'collect', label: 'Collect the cash bags on the piers',
          points: [
            { x: 700, y: CITY_H + 170 },
            { x: 1600, y: CITY_H + 170 },
            { x: 2500, y: CITY_H + 170 },
          ],
        },
        { kind: 'goto', x: L.cantina.x, y: L.cantina.y, r: 46, label: "Get the money back to Rosa's Cantina" },
      ],
    },
  ];
}

export class MissionRunner {
  constructor(defs) {
    this.defs = defs;
    this.active = null; // mission def being run
    this.activeIndex = -1;
    this.stepIndex = 0;
    this.timer = null;
    this.collected = 0;
  }

  get step() {
    return this.active ? this.active.steps[this.stepIndex] : null;
  }

  start(G, index) {
    this.active = this.defs[index];
    this.activeIndex = index;
    this.stepIndex = 0;
    this.collected = 0;
    this.beginStep(G);
    G.say(this.active.intro);
    G.banner(`MISSION — ${this.active.title.toUpperCase()}`);
  }

  beginStep(G) {
    const step = this.step;
    this.timer = step && step.time ? step.time : null;
    if (step && step.kind === 'board') {
      // Hot Cargo: plant the yellow Vireo GT in a lot north of the cantina.
      const spot = G.world.parkedSpots.reduce((best, s) => {
        const d = Math.hypot(s.x - 1600, s.y - 500);
        return !best || d < best.d ? { s, d } : best;
      }, null);
      const pos = spot ? spot.s : { x: 1600, y: 420, angle: 0 };
      // Clear the spot so the Vireo never spawns inside another parked car.
      G.cars = G.cars.filter((c) => c.driver !== 'parked' || Math.hypot(c.x - pos.x, c.y - pos.y) > 44);
      G.missionCar = makeCar(pos.x, pos.y, pos.angle ?? 0, 'sports', 'parked', G.rng);
      G.missionCar.color = '#e8c832';
      G.missionCar.missionVehicle = true;
      G.cars.push(G.missionCar);
    }
    if (step && step.kind === 'collect') this.collected = 0;
  }

  marker() {
    const step = this.step;
    if (!step) return null;
    if (step.kind === 'board') return null; // game fills this from G.missionCar
    if (step.kind === 'collect') {
      const p = step.points[this.collected];
      return p ? { x: p.x, y: p.y } : null;
    }
    return { x: step.x, y: step.y };
  }

  objectiveText() {
    const step = this.step;
    if (!step) return '';
    if (step.kind === 'collect') return `${step.label} (${this.collected}/${step.points.length})`;
    return step.label;
  }

  // Returns 'complete' when the mission finished this frame, else null.
  update(G, dt) {
    const step = this.step;
    if (!step) return null;
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        G.failMission('Out of time.');
        this.clear();
        return null;
      }
    }
    const px = G.player.car ? G.player.car.x : G.player.x;
    const py = G.player.car ? G.player.car.y : G.player.y;

    if (step.kind === 'goto') {
      if (step.needsMissionCar && G.player.car !== G.missionCar) return null;
      if (Math.hypot(px - step.x, py - step.y) < step.r) return this.advance(G);
    } else if (step.kind === 'board') {
      if (G.player.car === G.missionCar) {
        if (!step.triggered) {
          step.triggered = true;
          G.addHeat(230, 'stole the Vireo GT');
          G.say([{ who: 'Dario Venn', text: 'And there it is — called in. Time to move.' }]);
        }
        return this.advance(G);
      }
    } else if (step.kind === 'collect') {
      const p = step.points[this.collected];
      if (p && Math.hypot(px - p.x, py - p.y) < 40) {
        this.collected++;
        G.sfx.pickup();
        G.addHeat(100, 'took a bag of harbour money');
        G.banner(`BAG COLLECTED — ${this.collected}/${step.points.length}`);
        if (this.collected >= step.points.length) return this.advance(G);
      }
    }
    return null;
  }

  advance(G) {
    this.stepIndex++;
    if (this.stepIndex >= this.active.steps.length) {
      const done = this.active;
      this.clear();
      return { completed: done };
    }
    this.beginStep(G);
    return null;
  }

  clear() {
    this.active = null;
    this.activeIndex = -1;
    this.stepIndex = 0;
    this.timer = null;
  }
}
