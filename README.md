# gta-game

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/noon-stucco7a/gta-game/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/noon-stucco7a/gta-game/reward.svg)](https://make.fun/bounty/gta6-01)

**Marina Heat** — an original open-world crime game set in the sun-soaked city of
Port Solano, built for the make.fun GTA 6 bounty. Everything in it is invented:
the city, Dario Venn, Rosa Delgado, the cars, the story, the art and the sound.
It plays in a desktop browser from static files with no network request, on
keyboard and mouse, with no library or engine — plain canvas and WebAudio.

## The game

Explore Port Solano on foot and by car: a full grid city of tower blocks, parks,
parking lots and plazas, with traffic that follows the lanes, pedestrians on the
sidewalks, cars to steal, and a harbour with piers along the south shore.

- **Wanted system** — witnessed theft, collisions, gunfire and worse raise your
  stars; PSPD interceptors hunt you, ram you, shoot at three stars and bust you
  if they pin you. Break their line of sight to lose the heat.
- **Three story missions** from Rosa's Cantina: a timed harbour delivery, a hot
  yellow Vireo GT to move across town, and a three-bag harbour run — with
  dialogue, objectives, timers and cash rewards, plus free roam and replays.
- **Combat and driving** — mouse-aimed shooting on foot, five stealable vehicle
  types with their own speed and handling, crash damage, repairs at Tito's
  Fix-It Garage, healing at St. Marina Hospital and the cantina.
- **HUD and minimap** — health, cash, wanted stars, objective panel, dialogue
  box, speedometer, bust meter, and a live minimap with police blips and the
  mission marker.
- **Start screen, pause and saving** — progress, money and story state save to
  localStorage automatically; Continue picks up where you left off.
- **Synthesised sound** — engine, sirens, gunshots, crashes and jingles, all
  WebAudio, no audio files. M mutes.

Controls: WASD/arrows move and drive · E enter/exit cars, talk, confirm ·
mouse aim · click/J shoot · Shift sprint · Space handbrake · Esc pause · M mute.

## Layout

- `main.ts` — the entry program: copies `game/` and `screenshots/` to the
  output and writes `dossier.json` with the vendored library.
- `game/index.html` — the page; `game/src/` holds the game, one job per file:
  `config.js` (city and tuning constants), `random.js` (seeded RNG),
  `world.js` (city generation and collision), `entities.js` (traffic,
  pedestrians, police, bullets), `missions.js` (Rosa's three jobs),
  `render.js` (world, HUD, minimap, screens), `audio.js` (WebAudio synth),
  `input.js` (keyboard and mouse), `game.js` (the main loop and state).
- `screenshots/` — four real renders of the game: a police chase, harbour
  driving, the harbour-run mission, and the title screen.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## Run it

```sh
node serve.ts            # serves game/ at http://localhost:8080
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # build the entry output
```
