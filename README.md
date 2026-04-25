# Kidz Gamez

A browser-based 3D arcade project, now featuring a first playable motocross prototype inspired by classic MX-style gameplay.

## Yes — Bun works great here

This project can be run with **Bun** as the package manager and script runner (recommended), while still staying compatible with npm if needed.

## What this scaffold includes

- A Vite + TypeScript web app with Three.js.
- A first playable motocross prototype with rolling dirt terrain, jumps, simple bike physics, and trick scoring.
- AI bot riders for a light race simulation with lap and position tracking.
- On-screen HUD and keyboard controls for speed, jumps, tricks, and resets.

## Suggested repo organization

```txt
kidz-gamez/
├─ src/
│  ├─ main.ts                # Main arcade website entry (3D lobby)
│  ├─ style.css              # Global app styles
│  └─ games/                 # Future per-game manifests/components
├─ public/                   # Static assets (textures, audio, icons)
├─ docs/
│  ├─ architecture.md        # Product and technical architecture notes
│  └─ game-template.md       # Checklist for new game modules
└─ package.json
```

## Getting started (Bun)

1. Install dependencies:

   ```bash
   bun install
   ```

2. Run in development mode:

   ```bash
   bun run dev
   ```

3. Build for production:

   ```bash
   bun run build
   ```

4. Preview production build:

   ```bash
   bun run preview
   ```

## npm fallback (optional)

If Bun is unavailable in your environment, you can still use npm:

```bash
npm install
npm run dev
```

## Next steps

- Add routing (e.g., React Router, Vue Router, or a custom router) so each `route` opens a real game page.
- Move game metadata into JSON/TS manifests under `src/games/`.
- Add avatar or first-person controls so kids can "walk" in the arcade.
- Persist progress/profile data for each child.


## MX Mini Prototype controls

- `W`: Throttle
- `S`: Brake / reverse
- `A` / `D`: Steer
- `Space`: Jump
- `Q` / `E`: Air trick spin
- `R`: Reset rider
