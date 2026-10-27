# Shiftlight 3

A street-racing game for the browser, built to see how far a racing game can go in one HTML file:
a real-time engine synthesizer, true 3D vehicle physics, a full-resolution renderer and a living
city, with the original Shiftlight LED dot-matrix look kept as a switchable cabinet mode.

Development happens in separate files; the build bundles each playable page into a single
self-contained HTML file you can open straight from disk or send to someone.

## Play

Open `dist/shiftlight.html` in a desktop browser (Chrome, Edge, Firefox or Safari with WebGL2).
On the title, left and right choose the place; any other key starts.

| | Keyboard | Gamepad |
|---|---|---|
| Drive | arrows or WASD | left stick, triggers |
| Handbrake | Space | A |
| Nitrous | Shift or N | RB |
| Shift up / down (manual) | E / Q | B / X |
| Camera | C | Y |
| Look back | B | LB |
| Reset onto the road | R | View |
| LED matrix mode | L | — |
| Time of day | T | — |
| High beam | H | — |
| Menu | Esc | Start |

### Places

- **Neon Loop**: a street circuit. **Race** five rivals from a standing start (start lights on the
  gantry, 3, 5 or 8 laps, Relaxed / Racing / Hard), or **Practice** against the clock with a
  best-lap delta.
- **Shift City**: free roam. A 9 x 9 grid of streets inside a ring boulevard, an elevated ring
  expressway with sixteen ramps, districts from downtown towers to the neon quarter, a park, and
  traffic that drives it.

### Driving help

Four levels, from the menu: **Arcade Easy** (slows for corners, steers off walls, stays upright),
**Arcade**, **Sport**, **Simulation**. Automatic or manual gearbox. Eighteen engines from the
Engine Lab can be dropped into the car, each with its own synthesized sound.

## What's inside

**Renderer** (`src/render`): WebGL2, HDR, forward-clustered lights (thousands per level), cascaded
sun shadows, a headlight shadow map with a real low-beam cut-off, temporal upsampling with dynamic
resolution, screen-space reflections on wet roads, puddles and ripples, volumetric fog, rain and
splashes on the GPU, spray and tyre smoke, rain on the lens, motion blur, bloom, auto exposure,
and the LED dot-matrix pass. All materials are procedural; there are no textures.

**Cars** (`src/render/designs.js`, `carmodel.js`, `car.js`): bodies lofted from cross-sections, one
generator and one shader for every design (the SL-3 fastback you drive, a sedan, a hatchback, a
panel van and a taxi), clearcoat over metallic flake, lamps and panel gaps painted by the shader,
two levels of detail, drivers at the wheel. Every car on screen is drawn instanced.

**Physics** (`src/physics`): a 6-DOF body on four raycast suspensions, combined-slip tyres with
load sensitivity and temperature, a full powertrain (clutch, gearbox, differentials, turbo lag,
launch control, traction control), aero, and hull contacts with walls, the ground and other cars.
The assists sit between your hands and the car, never inside it.

**Traffic** (`src/world/lanes.js`, `src/game/traffic.js`): a lane graph built from the city map
(road lanes, connectors across every intersection with their conflicts, the expressway, ramps).
Each driver has a personality and follows the car ahead (an Intelligent Driver Model), stops for
red, runs an amber it can't stop for, only enters an intersection when nothing crossing its path
is in it and there is room on the far side, takes exits and ramps, changes lanes on the
expressway, signals, and brakes and honks for you. Near you every car is a full physics vehicle,
so a bump pushes it and a hard hit leaves a wreck.

**Rivals** (`src/game/race.js`): the same car and physics as yours, each with a pace, braking,
aggression, consistency and reaction time; matched to the power of the engine you chose and held
to their pace sector by sector. They pass, follow, give room and now and then make a mistake.

**Sound** (`src/audio`): the Engine Lab's waveguide engine synth for your car and the two nearest
rivals, an effects synth (tyres, road, wind, kerbs, impacts, scraping, traffic engines, horns), and
street and tunnel reverbs that cross-fade with where you are.

## The Engine Lab

`dist/engine-lab.html` is the test bench for the engine sound: 18 engines in their real firing
orders, every part editable (cams, turbos, superchargers, anti-lag, exhausts, gearboxes), free rev
or drive, listen from behind, in the cabin or trackside. Nothing is sampled: each cylinder fires a
blowdown pulse into 1-D acoustic waveguides that are the exhaust pipes, run live per sample.

## Layout

```
game/                 the game page (template + main loop)
src/render/           renderer, shaders, car models and designs, particles, lights
src/physics/          vehicle, tyres, powertrain, car-to-car contact
src/world/            Neon Loop track and town, Shift City map, geometry kit, lanes, road world
src/game/             levels, cameras, input, traffic, race, guide, bots
src/audio/            engine synth, effects synth, game audio graph
src/ui/               HUD (LED dot font), menu
lab/                  Engine Lab page
tools/build.mjs       bundles a page into dist/*.html
test/                 headless tests and screenshot harness
dist/                 built single-file pages
```

## Build and test

```
npm run build          # dist/shiftlight.html and dist/engine-lab.html
npm test               # vehicle physics, city physics, traffic and a full race, all headless
npm run test:traffic   # traffic flow, signals, deadlocks, physics near you, stopping and honking
npm run test:race      # a three-lap race: the grid holds, everyone finishes, places change
SHOTS='[{"name":"x","js":"__game.begin()"}]' node test/shot.mjs test/out   # screenshots (headless GPU)
```

## Roadmap

1. **Vertical slice**: Neon Loop at night in the rain, the renderer, 3D physics, the LED toggle. Done.
2. **City and traffic**: Shift City, the expressway and ramps, traffic with personality, rivals and
   races on Neon Loop. Done.
3. **Career**: parts, tuning, dyno, drift, drag, ghosts, replays.
4. **Polish and performance tiers.**
