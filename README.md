# Shiftlight 3

A street-racing game for the browser, built to see how far a racing game can go in one HTML file:
a real-time engine synthesizer, true 3D vehicle physics, and a full-resolution renderer, with the
original Shiftlight LED dot-matrix look kept as a switchable cabinet mode.

Development happens in separate files; the build bundles each playable page into a single
self-contained HTML file you can open straight from disk or send to someone.

## What's here now: the Engine Lab

`dist/engine-lab.html` is a test bench for the game's engine sound. Open it in a browser and press
**Start the engine**.

- **18 engines**, from an inline three to a 19,000 rpm V10, a supercharged 1930s straight-eight and two
  rotaries. Every layout fires in its real firing order: cross-plane and flat-plane V8, even- and odd-fire
  V6 and V10, V12, boxer four with unequal headers, flat six.
- **Edit anything**: layout, displacement, redline, cams, turbo / twin turbo / three kinds of supercharger,
  boost, turbo size, anti-lag, blow-off valve or flutter, intake, five exhaust systems, pops and crackle,
  H-pattern or sequential gearbox, straight-cut gears, launch control, soft or hard limiter, nitrous.
- **Free rev or drive** through the gears with a real clutch, tyre slip and traction control, then listen
  from behind the car, in the cabin, or trackside as it flies past (Doppler comes from real propagation delay).

### How the sound is made

Nothing is sampled. `src/audio/engine-dsp.js` runs per sample, in an AudioWorklet:

1. Each cylinder's exhaust valve opens at its own crank angle and fires a blowdown pulse into its bank of pipe.
2. The pipes are 1-D acoustic waveguides (Kelly-Lochbaum scattering at every change of bore, lossy where
   there's packing, a closed-ish valve at one end and an open radiating tip at the other), run live.
   Their resonances are fixed in hertz, so an engine keeps its voice from idle to the limiter.
3. On top: flow rasp gated by each pulse, an intake/airbox model, afterfire and bangs fired *into* the
   pipes, turbo, supercharger and gear whine, blow-off, nitrous, the starter motor, and the listener.

`src/engine/engine-sim.js` is the engine and drivetrain: torque curves, turbo spool, limiter, two-step,
anti-lag, clutch, gearbox, driven-wheel slip and traction control. The game will drive the same synth
from its own physics.

## Layout

```
src/audio/engine-dsp.js     engine synthesizer (runs in an AudioWorklet)
src/engine/engine-sim.js    engine + drivetrain sim, layouts, presets
lab/                        Engine Lab page (template + UI)
tools/build.mjs             bundles a page into dist/*.html
test/                       offline audio renders and a headless browser run
dist/                       built single-file pages
```

## Build and test

```
npm run build          # dist/engine-lab.html
npm run test:audio     # renders every preset to test/out/*.wav, prints levels, CPU, gear and limiter checks
npm run test:orders    # order spectrum of every layout (shows the firing patterns survive into the sound)
npm run test:browser   # headless Chromium: start, rev, drive, swap engines, fail on any page error
```

## Roadmap

1. **Vertical slice**: Neon Loop at night in the rain, one car, the new renderer and 3D physics, with the
   LED dot-matrix mode as a toggle for side-by-side comparison.
2. **City and traffic**: a small grid town with a highway loop and on/off ramps.
3. **Career**: parts, tuning, dyno, drift, drag, ghosts, replays.
4. **Polish and performance tiers.**
