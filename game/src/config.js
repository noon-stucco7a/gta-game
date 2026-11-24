// config.js — every constant that shapes Marina Heat: the city grid of Port Solano,
// the vehicle catalogue, the wanted-level tuning and the sunset palette.

export const VIEW_W = 1280;
export const VIEW_H = 800;

// City grid: blocks of BLOCK px separated by roads of ROAD px, ringed by a harbour to the south.
export const ROAD = 128;
export const BLOCK = 384;
export const PITCH = ROAD + BLOCK;
export const COLS = 6;
export const ROWS = 5;
export const CITY_W = ROAD + COLS * PITCH; // 3200
export const CITY_H = ROAD + ROWS * PITCH; // 2688
export const HARBOUR_H = 288; // water strip below the last road
export const WORLD_W = CITY_W;
export const WORLD_H = CITY_H + HARBOUR_H; // 2976

export const SAVE_KEY = 'marina-heat-save-v1';

// Vehicle catalogue: top speed (px/s), acceleration, grip, colour set and display name.
export const CAR_TYPES = {
  sedan: { name: 'Solano Sedan', topSpeed: 305, accel: 250, radius: 25, colors: ['#c94f42', '#4a7fb5', '#d8d3c3', '#5b6770', '#7a4a8c'] },
  hatch: { name: 'Pico Hatch', topSpeed: 280, accel: 265, radius: 23, colors: ['#e0a458', '#6aa84f', '#d8d3c3', '#b5533c'] },
  sports: { name: 'Vireo GT', topSpeed: 395, accel: 330, radius: 25, colors: ['#e8c832', '#c22f4e', '#2f6fb2', '#22262b'] },
  truck: { name: 'Bison Pickup', topSpeed: 245, accel: 205, radius: 28, colors: ['#8c6a4a', '#4f6157', '#a03d2d', '#d8d3c3'] },
  van: { name: 'Cargo Van', topSpeed: 230, accel: 190, radius: 28, colors: ['#d8d3c3', '#7d8a99', '#b5893c'] },
  police: { name: 'PSPD Interceptor', topSpeed: 350, accel: 300, radius: 25, colors: ['#1c2733'] },
};

// Wanted tuning: heat points per crime, one star per HEAT_PER_STAR points.
export const HEAT_PER_STAR = 100;
export const HEAT = {
  carTheft: 120,
  hitPedestrian: 160,
  shotFired: 35,
  hitPoliceCar: 110,
  hitTrafficCar: 30,
  missionFelony: 100,
  decayPerSecond: 11,
  sightRange: 540,
};

// Sun-soaked palette for Port Solano.
export const COLORS = {
  grass: '#79a85b',
  grassDark: '#6c9a50',
  sand: '#e3cf9e',
  water: '#2e7ea6',
  waterDeep: '#256a8f',
  road: '#3c4148',
  roadEdge: '#2f3339',
  laneMark: '#e8e2c8',
  sidewalk: '#cbbfa5',
  plaza: '#d9c9a3',
  parkPath: '#dcc9a0',
  roofShadow: 'rgba(46,32,20,0.35)',
  skyTop: '#2b1e4f',
  skyMid: '#b83a5e',
  skyLow: '#f59e4c',
  sun: '#ffd98a',
  hudPanel: 'rgba(12,14,22,0.62)',
  gold: '#ffc93c',
  danger: '#ff5348',
  ok: '#7dd069',
};

export const BUILDING_COLORS = [
  '#e8b4a0', '#d98e73', '#f0d0a8', '#c96f5a', '#e5c39a', '#b5c7d8',
  '#e8e0cc', '#d4a0b0', '#9fb8a4', '#f2e3b3', '#c98d5f', '#a8bfd0',
];

export const PED_COLORS = ['#e4572e', '#17a398', '#f2c14e', '#6c5ce7', '#d64580', '#2e86ab', '#f6f7eb', '#8c5e3c'];

export const CITY_NAME = 'Port Solano';
export const GAME_TITLE = 'MARINA HEAT';
