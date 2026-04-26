# Kidz Gamez V1 Execution Plan

## Scope and goals

This plan operationalizes the product direction for a 3D, vehicle-driven arcade lobby with parent safety controls and manifest-based game launch.

### V1 goals

- Parent can create child profiles and set age bands.
- Child can drive a custom vehicle in the lobby.
- Locked cabinets are visible with age-based explanations.

### KPI support goals (v1.1 recommended)

- Instrument core events to measure funnel conversion from setup to first game runtime load.

## Milestone plan

### Milestone 1 (Weeks 1-2): Kernel and safety skeleton

Deliverables:

- Kernel services:
  - routing
  - asset loader orchestration
  - input abstraction
  - scene lifecycle manager
- Parent challenge gate and child profile creation flow.
- Age policy service and lock/explanation UI.
- Manifest loader for local static manifests.

Exit criteria:

- Parent can create at least one child profile.
- Cabinet visibility/lock state is derived from profile age band.
- Plugin lifecycle hooks are callable (`onEnter`, `onExit`, `canLaunch`).

### Milestone 2 (Weeks 3-4): Lobby drive loop and persistence

Deliverables:

- Fixed chase camera and soft collision behavior.
- Class-based vehicle system with multi-save garage.
- Local persistence for profile-scoped active vehicle.
- Unsupported-device block screen with guidance.

Exit criteria:

- A profile can load and drive a selected saved vehicle.
- Vehicle selection persists across refresh.

### Milestone 3 (Weeks 5-6): Build-a-Vehicle shop v1

Deliverables:

- Snap-module builder with constrained module registry.
- Transform graph output validated against schema.
- Shared validator used by shop and lobby runtime.
- Auto-fix pipeline for invalid builds.
- Part cap enforced (<= 60 parts).

Exit criteria:

- Save/apply vehicle works end-to-end.
- Invalid builds are repaired deterministically.

### Milestone 4 (Weeks 7-8): Launch flow and telemetry hardening

Deliverables:

- Explicit cabinet interaction flow.
- Runtime launch handshake and hub return behavior.
- Event telemetry for:
  - `profile_created`
  - `vehicle_saved`
  - `cabinet_interacted`
  - `game_runtime_loaded`

Exit criteria:

- Required events are emitted in a full smoke journey.
- Parent setup to first runtime load can be measured.

## Architecture constraints

- Kernel is the authority for launch policy checks.
- Plugins integrate via strict lifecycle hooks.
- Vehicle graph payloads are schema-versioned.
- Validation logic is shared between creator and consumer paths.

## Risks and mitigations

1. Build graph corruption
   - Mitigation: strict schema + shared validator + deterministic auto-fix.
2. Heavy preload on some tablets
   - Mitigation: enforce compressed asset budget and preload auditing.
3. Age-lock bypass
   - Mitigation: centralize policy checks in kernel `canLaunch` path.
4. Scene memory leaks
   - Mitigation: lifecycle disposal contract and leak checks in dev.

## Task breakdown

Implementation-ready task cards are maintained in [`docs/tasks/`](./tasks/README.md), including detailed acceptance criteria, test plans, and blocker dependencies for sequencing.
