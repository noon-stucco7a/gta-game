// render.js — everything the player sees: the sunlit streets of Port Solano drawn
// from the camera, cars and people sorted by depth, the HUD with its health bar,
// money, wanted stars and objective panel, the minimap with police blips and the
// mission marker, and the title, pause and end screens.

import { VIEW_W, VIEW_H, CITY_H, WORLD_W, WORLD_H, COLORS } from './config.js';
import { makeRng } from './random.js';

export function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------- the world

export function drawWorld(ctx, G) {
  const cam = G.camera;
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + VIEW_W, y1 = cam.y + VIEW_H;
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Harbour water with slow wave lines, and the sand promenade above it.
  if (y1 > CITY_H - 20) {
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, CITY_H - 16 - y0, VIEW_W, 26);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(0, CITY_H + 8 - y0, VIEW_W, VIEW_H);
    ctx.fillStyle = COLORS.waterDeep;
    for (let wy = CITY_H + 30; wy < WORLD_H; wy += 44) {
      if (wy < y0 - 10 || wy > y1 + 10) continue;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, wy - y0 + Math.sin(G.time * 0.7 + wy) * 2, VIEW_W, 3);
    }
    ctx.globalAlpha = 1;
    // Piers: wooden decks reaching into the harbour.
    for (const p of G.world.piers) {
      ctx.fillStyle = '#8c6a4a';
      ctx.fillRect(p.x - x0, p.y - y0, p.w, p.h);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let py = p.y + 14; py < p.y + p.h; py += 22) ctx.fillRect(p.x - x0, py - y0, p.w, 3);
    }
  }

  drawRoads(ctx, G, x0, y0, x1, y1);
  drawBlocks(ctx, G, x0, y0, x1, y1);

  // Mission ground marker: a pulsing gold ring with a beam of light.
  const marker = G.markerPos;
  if (marker && marker.x > x0 - 60 && marker.x < x1 + 60 && marker.y > y0 - 60 && marker.y < y1 + 60) {
    const mx = marker.x - x0, my = marker.y - y0;
    const pulse = 1 + Math.sin(G.time * 4) * 0.12;
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(mx, my, 30 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    const grad = ctx.createLinearGradient(0, my - 190, 0, my);
    grad.addColorStop(0, 'rgba(255,201,60,0)');
    grad.addColorStop(1, 'rgba(255,201,60,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(mx - 9, my - 190, 18, 190);
  }

  // Uncollected cash bags (harbour-run mission).
  if (G.runner.active && G.runner.step && G.runner.step.kind === 'collect') {
    G.runner.step.points.forEach((p, i) => {
      if (i < G.runner.collected) return;
      const bx = p.x - x0, by = p.y - y0;
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.arc(bx, by, 15 + Math.sin(G.time * 5 + i) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('$', bx, by + 6);
    });
  }

  // Heal spots: a green cross that breathes.
  for (const h of G.world.healSpots) {
    const hx = h.x - x0, hy = h.y - y0;
    if (hx < -40 || hx > VIEW_W + 40 || hy < -40 || hy > VIEW_H + 40) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(hx, hy, 13 + Math.sin(G.time * 3) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e9e4f';
    ctx.fillRect(hx - 8, hy - 3, 16, 6);
    ctx.fillRect(hx - 3, hy - 8, 6, 16);
  }

  drawBuildings(ctx, G, x0, y0, x1, y1);
  drawTreesAndLamps(ctx, G, x0, y0, x1, y1);
  drawEntities(ctx, G, x0, y0);
}

function drawRoads(ctx, G, x0, y0, x1, y1) {
  ctx.fillStyle = COLORS.road;
  // Vertical and horizontal road bands; vertical roads stop at the waterline.
  const roadBottom = Math.min(VIEW_H, CITY_H - y0);
  for (let i = 0; i <= 6; i++) {
    const rx = i * 512 - x0;
    if (rx + 128 < 0 || rx > VIEW_W) continue;
    ctx.fillRect(rx, 0, 128, roadBottom);
  }
  for (let j = 0; j <= 5; j++) {
    const ry = j * 512 - y0;
    if (ry + 128 < 0 || ry > VIEW_H) continue;
    ctx.fillRect(0, ry, VIEW_W, 128);
  }
  // Lane dashes down the middle of every road.
  ctx.fillStyle = COLORS.laneMark;
  for (let i = 0; i <= 6; i++) {
    const cx = i * 512 + 64 - x0;
    if (cx < -10 || cx > VIEW_W + 10) continue;
    for (let y = -((y0 % 56) + 56) % 56; y < roadBottom; y += 56) ctx.fillRect(cx - 2, y, 4, 30);
  }
  for (let j = 0; j <= 5; j++) {
    const cy = j * 512 + 64 - y0;
    if (cy < -10 || cy > VIEW_H + 10) continue;
    for (let x = -((x0 % 56) + 56) % 56; x < VIEW_W; x += 56) ctx.fillRect(x, cy - 2, 30, 4);
  }
  // Crosswalk stripes at intersections.
  ctx.fillStyle = 'rgba(232,226,200,0.75)';
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 5; j++) {
      const ix = i * 512 - x0, iy = j * 512 - y0;
      if (ix + 128 < 0 || ix > VIEW_W || iy + 128 < 0 || iy > VIEW_H) continue;
      for (let s = 0; s < 4; s++) {
        ctx.fillRect(ix + 10 + s * 12, iy + 4, 7, 16);
        ctx.fillRect(ix + 10 + s * 12, iy + 108, 7, 16);
        ctx.fillRect(ix + 4, iy + 10 + s * 12, 16, 7);
        ctx.fillRect(ix + 108, iy + 10 + s * 12, 16, 7);
      }
    }
  }
}

function drawBlocks(ctx, G, x0, y0, x1, y1) {
  for (const b of G.world.blocks) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    const bx = b.x - x0, by = b.y - y0;
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(bx, by, b.w, b.h);
    const ix = bx + 20, iy = by + 20, iw = b.w - 40, ih = b.h - 40;
    if (b.type === 'park') {
      ctx.fillStyle = COLORS.grassDark;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = COLORS.parkPath;
      ctx.fillRect(ix + iw / 2 - 9, iy, 18, ih);
      ctx.fillRect(ix, iy + ih / 2 - 9, iw, 18);
    } else if (b.type === 'parking') {
      ctx.fillStyle = '#4a4f57';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.strokeStyle = 'rgba(232,226,200,0.5)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        ctx.strokeRect(ix + 24 + k * 84, iy + 8, 62, 52);
        ctx.strokeRect(ix + 24 + k * 84, iy + ih - 60, 62, 52);
      }
    } else if (b.type === 'plaza') {
      ctx.fillStyle = COLORS.plaza;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = COLORS.water;
      ctx.beginPath();
      ctx.arc(bx + b.w / 2, by + b.h / 2, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8e2c8';
      ctx.beginPath();
      ctx.arc(bx + b.w / 2, by + b.h / 2, 30, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(ix, iy, iw, ih);
    }
  }
}

function drawBuildings(ctx, G, x0, y0, x1, y1) {
  const sorted = [...G.world.buildings].sort((a, b) => a.y - b.y);
  for (const b of sorted) {
    if (b.x + b.w < x0 - 80 || b.x > x1 + 80 || b.y + b.h < y0 - 80 || b.y > y1 + 80) continue;
    const bx = b.x - x0, by = b.y - y0;
    const lift = b.height * 0.42;
    // Drop shadow, then the sunlit south wall, then the roof.
    ctx.fillStyle = COLORS.roofShadow;
    ctx.fillRect(bx + 10, by + 12, b.w, b.h);
    ctx.fillStyle = shade(b.color, 0.72);
    ctx.fillRect(bx, by + b.h - lift, b.w, lift + 2);
    ctx.fillStyle = b.color;
    ctx.fillRect(bx, by - lift, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(bx, by - lift, b.w, 5);
    // Windows on the wall.
    ctx.fillStyle = 'rgba(38,44,64,0.85)';
    const rows = Math.max(1, Math.floor(lift / 16));
    for (let r = 0; r < rows; r++) {
      for (let cx = 10; cx < b.w - 12; cx += 22) {
        if ((cx * 7 + r * 13 + b.x) % 5 === 0) ctx.fillStyle = 'rgba(255,205,110,0.95)';
        else ctx.fillStyle = 'rgba(38,44,64,0.85)';
        ctx.fillRect(bx + cx, by + b.h - lift + 6 + r * 16, 10, 8);
      }
    }
    if (b.name) {
      ctx.fillStyle = 'rgba(16,18,28,0.88)';
      const w = ctx.measureText(b.name).width;
      ctx.font = 'bold 15px Arial';
      const tw = ctx.measureText(b.name).width + 20;
      ctx.fillRect(bx + b.w / 2 - tw / 2, by + b.h - lift - 26, tw, 22);
      ctx.fillStyle = '#ffd98a';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, bx + b.w / 2, by + b.h - lift - 10);
      void w;
    }
  }
}

function drawTreesAndLamps(ctx, G, x0, y0, x1, y1) {
  for (const t of G.world.trees) {
    if (t.x < x0 - 30 || t.x > x1 + 30 || t.y < y0 - 30 || t.y > y1 + 30) continue;
    const tx = t.x - x0, ty = t.y - y0;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(tx + 4, ty + 5, t.r, t.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d4a2f';
    ctx.fillRect(tx - 2, ty - 2, 4, 8);
    ctx.fillStyle = '#3f7d3a';
    ctx.beginPath();
    ctx.arc(tx, ty - 6, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4c9147';
    ctx.beginPath();
    ctx.arc(tx - t.r * 0.35, ty - t.r * 0.55, t.r * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2f3339';
  for (const l of G.world.lamps) {
    if (l.x < x0 - 10 || l.x > x1 + 10 || l.y < y0 - 10 || l.y > y1 + 10) continue;
    ctx.fillRect(l.x - x0 - 2, l.y - y0 - 2, 4, 4);
  }
}

// ---------------------------------------------------------------- entities

function drawCar(ctx, car, sx, sy, time) {
  const t = car.type;
  const L = t.radius * 2;
  const W = t.radius * 1.08;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(3, 5, L * 0.52, W * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  // Cabin and glass.
  ctx.fillStyle = 'rgba(20,26,38,0.9)';
  roundRect(ctx, -L * 0.16, -W * 0.38, L * 0.36, W * 0.76, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,190,230,0.5)';
  roundRect(ctx, L * 0.2, -W * 0.34, L * 0.1, W * 0.68, 3);
  ctx.fill();
  // Headlights and tail lights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(L / 2 - 3, -W * 0.32, 3, 6);
  ctx.fillRect(L / 2 - 3, W * 0.32 - 6, 3, 6);
  ctx.fillStyle = '#c22f2f';
  ctx.fillRect(-L / 2, -W * 0.32, 3, 6);
  ctx.fillRect(-L / 2, W * 0.32 - 6, 3, 6);
  if (car.driver === 'police') {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-L * 0.05, -W / 2, L * 0.22, W);
    const flash = Math.sin(time * 10 + car.sirenPhase) > 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4060ff';
    roundRect(ctx, -6, -W * 0.3, 12, W * 0.6, 3);
    ctx.fill();
    ctx.fillStyle = '#10141c';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PSPD', L * 0.06, 3);
  }
  if (car.missionVehicle) {
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2.5;
    roundRect(ctx, -L / 2 - 3, -W / 2 - 3, L + 6, W + 6, 9);
    ctx.stroke();
  }
  // Damage smoke scorch marks.
  if (car.health < 45) {
    ctx.fillStyle = 'rgba(20,20,20,0.45)';
    ctx.beginPath();
    ctx.arc(L * 0.3, 0, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, ped, sx, sy) {
  ctx.save();
  ctx.translate(sx, sy);
  if (ped.state === 'down') {
    ctx.globalAlpha = Math.max(0.25, 1 - ped.downTime / 8);
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(0, -1, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx, G, sx, sy) {
  const p = G.player;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 4, 9, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Aim line toward the mouse while on foot.
  const aim = Math.atan2(G.input.mouse.y - sy, G.input.mouse.x - sx);
  ctx.rotate(aim);
  ctx.fillStyle = '#22262b';
  ctx.fillRect(6, -1.6, 13, 3.2); // pistol
  ctx.rotate(-aim);
  ctx.fillStyle = '#12808a'; // Dario's teal jacket
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(0, -1, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242c';
  ctx.fillRect(-5, -8.5, 10, 4); // hair
  ctx.restore();
}

function drawEntities(ctx, G, x0, y0) {
  const things = [];
  for (const car of G.cars) things.push({ y: car.y, kind: 'car', o: car });
  for (const ped of G.peds) things.push({ y: ped.y, kind: 'ped', o: ped });
  if (!G.player.car) things.push({ y: G.player.y, kind: 'player', o: G.player });
  things.sort((a, b) => a.y - b.y);
  for (const th of things) {
    const sx = th.o.x - x0, sy = th.o.y - y0;
    if (sx < -70 || sx > VIEW_W + 70 || sy < -70 || sy > VIEW_H + 70) continue;
    if (th.kind === 'car') drawCar(ctx, th.o, sx, sy, G.time);
    else if (th.kind === 'ped') drawPed(ctx, th.o, sx, sy);
    else drawPlayer(ctx, G, sx, sy);
  }
  // Bullets as short tracers.
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (const b of G.bullets) {
    ctx.moveTo(b.x - x0, b.y - y0);
    ctx.lineTo(b.x - x0 - b.vx * 0.02, b.y - y0 - b.vy * 0.02);
  }
  ctx.stroke();
  // Particles.
  for (const pt of G.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - x0 - pt.size / 2, pt.y - y0 - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- the HUD

export function drawHUD(ctx, G) {
  const p = G.player;
  // Top-left status panel: health, armour of cash, mission name.
  ctx.fillStyle = COLORS.hudPanel;
  roundRect(ctx, 14, 14, 252, 86, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('DARIO VENN', 26, 36);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 26, 46, 160, 13, 4);
  ctx.fill();
  ctx.fillStyle = p.health > 30 ? COLORS.ok : COLORS.danger;
  roundRect(ctx, 26, 46, 160 * Math.max(0, p.health / 100), 13, 4);
  ctx.fill();
  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 21px Arial';
  ctx.fillText(`$${G.progress.money.toLocaleString('en-US')}`, 26, 88);
  if (G.runner.active) {
    ctx.fillStyle = '#ffd98a';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(G.runner.active.title.toUpperCase(), 130, 88);
  }

  // Top-right wanted stars.
  const stars = G.stars();
  ctx.font = '30px Arial';
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? COLORS.gold : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', VIEW_W - 22 - (4 - i) * 32, 44);
  }
  if (stars > 0 && !G.policeSeesPlayer) {
    if (Math.sin(G.time * 6) > -0.2) {
      ctx.fillStyle = '#9fd8ff';
      ctx.font = 'bold 13px Arial';
      ctx.fillText('LOSING THE HEAT…', VIEW_W - 22, 70);
    }
  }

  drawMinimap(ctx, G);
  drawObjectivePanel(ctx, G);

  // Speedometer while driving.
  if (p.car) {
    ctx.fillStyle = COLORS.hudPanel;
    roundRect(ctx, VIEW_W - 224, VIEW_H - 246, 208, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.22)} MPH · ${p.car.type.name}`, VIEW_W - 120, VIEW_H - 224);
  }

  // Bust meter.
  if (G.bust > 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, VIEW_W / 2 - 130, 84, 260, 20, 6);
    ctx.fill();
    ctx.fillStyle = COLORS.danger;
    roundRect(ctx, VIEW_W / 2 - 130, 84, 260 * (G.bust / 100), 20, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', VIEW_W / 2, 99);
  }

  // Centre banner (mission titles, bag pickups).
  if (G.bannerTimer > 0) {
    ctx.globalAlpha = Math.min(1, G.bannerTimer / 0.8);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 8;
    ctx.fillText(G.bannerText, VIEW_W / 2, 130);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // Interaction prompt.
  if (G.prompt) {
    ctx.fillStyle = COLORS.hudPanel;
    const w = ctx.measureText(G.prompt).width + 36;
    ctx.font = 'bold 15px Arial';
    const tw = ctx.measureText(G.prompt).width + 36;
    roundRect(ctx, VIEW_W / 2 - tw / 2, VIEW_H - 52, tw, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(G.prompt, VIEW_W / 2, VIEW_H - 31);
    void w;
  }

  // Low-health vignette.
  if (p.health < 35 && G.mode === 'play') {
    ctx.fillStyle = `rgba(190,20,20,${0.12 + 0.08 * Math.sin(G.time * 5)})`;
    ctx.fillRect(0, 0, VIEW_W, 26);
    ctx.fillRect(0, VIEW_H - 26, VIEW_W, 26);
    ctx.fillRect(0, 0, 26, VIEW_H);
    ctx.fillRect(VIEW_W - 26, 0, 26, VIEW_H);
  }

  if (G.sfx.muted) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('SOUND OFF (M)', 16, VIEW_H - 14);
  }
}

function drawObjectivePanel(ctx, G) {
  const dlg = G.dialogue;
  if (dlg) {
    // Dialogue box: speaker in gold, their line wrapped below.
    ctx.fillStyle = 'rgba(10,10,18,0.82)';
    roundRect(ctx, 14, VIEW_H - 196, 470, 108, 10);
    ctx.fill();
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(dlg.who.toUpperCase(), 28, VIEW_H - 168);
    ctx.fillStyle = '#fff';
    ctx.font = '15px Arial';
    const lines = wrapText(ctx, dlg.text, 442);
    lines.forEach((line, i) => ctx.fillText(line, 28, VIEW_H - 144 + i * 20));
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px Arial';
    ctx.fillText('E / click ▸', 424, VIEW_H - 100);
    return;
  }
  if (!G.runner.active) return;
  ctx.fillStyle = COLORS.hudPanel;
  roundRect(ctx, 14, VIEW_H - 120, 470, 106, 10);
  ctx.fill();
  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('OBJECTIVE', 28, VIEW_H - 94);
  ctx.fillStyle = '#fff';
  ctx.font = '15px Arial';
  const lines = wrapText(ctx, G.runner.objectiveText(), 442);
  lines.forEach((line, i) => ctx.fillText(line, 28, VIEW_H - 70 + i * 20));
  if (G.runner.timer !== null) {
    const t = Math.max(0, G.runner.timer);
    const mm = Math.floor(t / 60);
    const ss = Math.floor(t % 60).toString().padStart(2, '0');
    ctx.fillStyle = t < 20 ? COLORS.danger : '#fff';
    ctx.font = 'bold 19px Arial';
    ctx.fillText(`${mm}:${ss}`, 424, VIEW_H - 94);
  }
}

function drawMinimap(ctx, G) {
  const mw = 180, mh = 168;
  const mx = VIEW_W - mw - 16, my = VIEW_H - mh - 16;
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  ctx.fillStyle = 'rgba(10,16,24,0.78)';
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.clip();
  // Water and roads.
  ctx.fillStyle = COLORS.waterDeep;
  ctx.fillRect(mx, my + CITY_H * sy, mw, mh - CITY_H * sy);
  ctx.strokeStyle = 'rgba(220,220,220,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(mx + (i * 512 + 64) * sx, my);
    ctx.lineTo(mx + (i * 512 + 64) * sx, my + mh);
    ctx.stroke();
  }
  for (let j = 0; j <= 5; j++) {
    ctx.beginPath();
    ctx.moveTo(mx, my + (j * 512 + 64) * sy);
    ctx.lineTo(mx + mw, my + (j * 512 + 64) * sy);
    ctx.stroke();
  }
  // Police blips flash blue and red.
  for (const car of G.cars) {
    if (car.driver !== 'police') continue;
    ctx.fillStyle = Math.sin(G.time * 9 + car.sirenPhase) > 0 ? '#ff5040' : '#4d7cff';
    ctx.beginPath();
    ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission car blip.
  if (G.missionCar && G.runner.step && G.runner.step.kind === 'board') {
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(mx + G.missionCar.x * sx - 3, my + G.missionCar.y * sy - 3, 6, 6);
  }
  // Mission marker.
  if (G.markerPos) {
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(mx + G.markerPos.x * sx, my + G.markerPos.y * sy, 4 + Math.sin(G.time * 5) * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const p = G.player;
  const px = mx + p.x * sx, py = my + p.y * sy;
  const ang = p.car ? p.car.angle : p.angle;
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('PORT SOLANO', mx + 8, my + 14);
}

// ---------------------------------------------------------------- screens

const skylineRng = makeRng(777);
const SKYLINE = [];
for (let layer = 0; layer < 2; layer++) {
  let x = -20;
  while (x < VIEW_W + 40) {
    const w = 40 + skylineRng() * 70;
    const h = (layer === 0 ? 130 : 200) + skylineRng() * 130;
    SKYLINE.push({ x, w, h, layer });
    x += w + 4 + skylineRng() * 22;
  }
}

export function drawTitle(ctx, G) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, COLORS.skyTop);
  grad.addColorStop(0.45, COLORS.skyMid);
  grad.addColorStop(0.75, COLORS.skyLow);
  grad.addColorStop(1, '#7a3b2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Sun low over the harbour.
  ctx.fillStyle = COLORS.sun;
  ctx.beginPath();
  ctx.arc(VIEW_W * 0.72, VIEW_H * 0.62, 58, 0, Math.PI * 2);
  ctx.fill();
  // Skyline silhouettes.
  for (const b of SKYLINE) {
    ctx.fillStyle = b.layer === 0 ? 'rgba(40,20,50,0.75)' : 'rgba(22,12,34,0.95)';
    ctx.fillRect(b.x, VIEW_H * 0.66 - b.h, b.w, b.h);
    if (b.layer === 1) {
      ctx.fillStyle = 'rgba(255,205,110,0.8)';
      for (let wy = VIEW_H * 0.66 - b.h + 12; wy < VIEW_H * 0.66 - 20; wy += 18) {
        for (let wx = b.x + 7; wx < b.x + b.w - 8; wx += 14) {
          if ((wx * 3 + wy * 7) % 4 === 0) ctx.fillRect(wx, wy, 5, 7);
        }
      }
    }
  }
  ctx.fillStyle = '#160d24';
  ctx.fillRect(0, VIEW_H * 0.66, VIEW_W, VIEW_H * 0.34);
  ctx.fillStyle = 'rgba(245,158,76,0.35)';
  ctx.fillRect(0, VIEW_H * 0.66, VIEW_W, 3);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd98a';
  ctx.font = 'bold 30px Arial';
  ctx.fillText('P O R T   S O L A N O', VIEW_W / 2, 120);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 96px Arial';
  ctx.fillText('MARINA HEAT', VIEW_W / 2, 218);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '17px Arial';
  const story = 'Dario Venn swore he was done with the life. Then Rosa Delgado called in an old favour, and Port Solano lit up: run her jobs, move her cars, dodge the PSPD, and own the night — on foot and behind the wheel.';
  wrapText(ctx, story, 760).forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 262 + i * 24));

  // Buttons (rects are also the click targets game.js reads).
  G.titleButtons = [];
  const bx = VIEW_W / 2 - 130;
  let by = 356;
  const addButton = (id, label, enabled) => {
    ctx.fillStyle = enabled ? 'rgba(255,201,60,0.92)' : 'rgba(90,90,100,0.5)';
    roundRect(ctx, bx, by, 260, 46, 9);
    ctx.fill();
    ctx.fillStyle = enabled ? '#22160a' : 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 19px Arial';
    ctx.fillText(label, VIEW_W / 2, by + 30);
    if (enabled) G.titleButtons.push({ id, x: bx, y: by, w: 260, h: 46 });
    by += 58;
  };
  addButton('new', 'NEW GAME', true);
  addButton('continue', 'CONTINUE', G.hasSave);
  addButton('how', G.showHow ? 'HIDE CONTROLS' : 'HOW TO PLAY', true);

  if (G.showHow) {
    ctx.fillStyle = 'rgba(10,10,20,0.85)';
    roundRect(ctx, VIEW_W / 2 - 330, 540, 660, 218, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '15px Arial';
    ctx.textAlign = 'left';
    const lines = [
      'WASD / Arrows — walk and drive        E — enter / exit car, talk, confirm',
      'Mouse — aim on foot                     Click / J — shoot (on foot)',
      'Shift — sprint                          Space — handbrake',
      'Follow the gold marker to work Rosa\'s jobs. Crime raises your wanted stars;',
      'police ram and bust you if they pin you. Lose them to cool the heat.',
      'Green crosses heal. Tito\'s garage repairs your ride. Esc — pause (game saves).',
      'M — mute.  Your money and story progress save automatically.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2 - 308, 572 + i * 26));
    ctx.textAlign = 'center';
  }
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '13px Arial';
  ctx.fillText('An original open-world crime game — every name, street and story invented for Port Solano.', VIEW_W / 2, VIEW_H - 18);
}

export function drawPause(ctx, G) {
  ctx.fillStyle = 'rgba(8,8,16,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', VIEW_W / 2, 300);
  ctx.font = '17px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Esc — resume      Enter — resume', VIEW_W / 2, 348);
  ctx.fillText('Your progress is saved. Close the tab and Continue picks it up here.', VIEW_W / 2, 380);
}

export function drawEndScreen(ctx, G) {
  const busted = G.endKind === 'busted';
  ctx.fillStyle = busted ? 'rgba(20,30,80,0.78)' : 'rgba(90,10,10,0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', VIEW_W / 2, 330);
  ctx.font = '19px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(G.endText, VIEW_W / 2, 380);
  ctx.font = 'bold 17px Arial';
  ctx.fillText('Press ENTER to get back up', VIEW_W / 2, 440);
}

export function drawStoryComplete(ctx, G) {
  ctx.fillStyle = 'rgba(24,18,6,0.8)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 54px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('THE NIGHT IS YOURS', VIEW_W / 2, 320);
  ctx.fillStyle = '#fff';
  ctx.font = '18px Arial';
  wrapText(ctx, 'All three of Rosa\'s jobs are done. Port Solano is yours to roam — the jobs can be run again from Rosa\'s Cantina for half pay, and the city keeps its money, cars and trouble ready.', 720)
    .forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 366 + i * 26));
  ctx.font = 'bold 17px Arial';
  ctx.fillText('Press ENTER to keep roaming', VIEW_W / 2, 470);
}
