# Kidz Gamez

A starter scaffold for a browser-based 3D arcade where kids can browse and launch educational games.

## Yes — Bun works great here

This project can be run with **Bun** as the package manager and script runner (recommended), while still staying compatible with npm if needed.

## What this scaffold includes

- A Vite + TypeScript web app with Three.js.
- A simple 3D "arcade hallway" scene with 3 selectable game cabinets.
- A side panel to show game details (`name`, `description`, `difficulty`, and route).
- A placeholder **Play** button where your router/game launcher can be integrated.

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
