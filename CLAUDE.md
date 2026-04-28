# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **Bun** (`bun@1.2.13`). npm works as a fallback but prefer Bun.

- `bun install` — install dependencies
- `bun run dev` — Vite dev server
- `bun run build` — typecheck (`tsc --noEmit`), Vite build, then asset budget check
- `bun run check` — typecheck only
- `bun test` — run full Bun test suite (tests use `bun:test`)
- `bun test tests/t04-manifest-loader.test.ts` — run a single test file
- `bun test --test-name-pattern "kernel"` — filter by test name
- `bun run build:asset-budget` — verify `dist/` total ≤ 15 MB
- `bun run perf:first-interactive` — measure first-interactive against the desktop-mid profile (2500 ms budget)

## Architecture

Browser-based 3D arcade lobby (Vite + TypeScript + Three.js). The product target is a parent-gated, profile-scoped lobby where kids drive a custom vehicle and launch per-game "cabinets". The codebase implements V1 of `docs/v1-execution-plan.md`, broken into tasks T01–T10 under `docs/tasks/`.

### Boot flow (`src/main.ts`)

1. Probe WebGL + device via `runtime-guardrails.decideBootPath` — may short-circuit to an "unsupported device" panel.
2. Otherwise mount the Three.js MX prototype scene into `#scene-root`.

The MX prototype in `main.ts` is the current playable surface; the kernel/plugin system below is the V1 architecture being built up around it.

### Kernel + plugin model (`src/kernel.ts`, `src/contracts/arcade.ts`)

`ArcadePlugin` is the unit of game integration. Each plugin declares an `id`, `route`, optional `manifest`, and lifecycle: `canLaunch(profile)`, `createScene(ctx)`, `onEnter`, `onExit`. `PluginRegistry` enforces unique ids/routes; `Kernel` drives navigation and emits typed `KernelLogEvent`s with codes `DUPLICATE_PLUGIN_ID | ROUTE_NOT_FOUND | CAN_LAUNCH_DENIED | LIFECYCLE_FAILURE`. On lifecycle failure the kernel falls back to the lobby/hub (see `lobby-launch.ts` and the recent fix `f3aea4c`).

`KernelContext` injects the active `ChildProfile`, an `agePolicy.canLaunch` resolver, and a `telemetry.emit` sink — plugins must go through this context rather than reaching for globals.

### Domain modules (under `src/`)

- `parent-gate.ts`, `profile-store.ts` — parent challenge gate and child profile CRUD.
- `age-policy.ts` — derives launch permission and cabinet lock state from `manifest.ageBand` vs profile.
- `manifest-loader.ts` + `schemas/game-manifest.v1.schema.json` — typed loader for `GameManifestV1`.
- `garage-store.ts`, `vehicle-validator.ts`, `builder-scene.ts` + `schemas/vehicle-graph.v1.schema.json` — vehicle class system, snap-module builder, and shared validator/auto-fix used by both shop and lobby runtime. Part cap is 60.
- `lobby-launch.ts` — interaction/launch handoff from lobby cabinet to plugin scene; on non-lifecycle launch failures it returns to lobby instead of unsupported-hub.
- `telemetry.ts` — funnel events; canonical event list lives in `docs/telemetry-events.md`.
- `device-capability.ts` + `runtime-guardrails.ts` — capability probing and boot-path decision; pairs with the asset/perf budget scripts.

### Schema versioning

`GameManifestV1` and `VehicleGraphV1` are explicitly versioned (`schemaVersion: 1`). When evolving these, add a new versioned type rather than mutating V1, and keep JSON schemas in `src/schemas/` aligned with the TS contracts in `src/contracts/arcade.ts`.

### Tests

Tests are colocated under `tests/` and named `tNN-*.test.ts`, mapping 1:1 to the task docs in `docs/tasks/TNN-*.md`. Use `bun:test` (`describe`, `test`, `expect`) — not Jest/Vitest. When adding behavior to a task module, extend the matching `tNN` file.

### Scripts

`scripts/check-asset-budget.mjs` and `scripts/measure-first-interactive.mjs` are CI-style guardrails wired into `package.json`. The asset budget runs as part of `bun run build`; the perf script is run on demand.
