# T09 — Telemetry events and funnel instrumentation

## Description
Instrument and validate required events for setup-to-launch funnel metrics.

## Deliverables
- Telemetry bus adapter in kernel context.
- Event emitters for:
  - `profile_created`
  - `vehicle_saved`
  - `cabinet_interacted`
  - `game_runtime_loaded`
- Event payload shape definitions and documentation.
- Dev-mode event inspector/debug panel.

## Acceptance criteria
- Required events emit exactly once per qualifying user action.
- Event payload includes profile ID, manifest/game ID (where applicable), timestamp.
- Missing telemetry transport does not break gameplay paths.

## Meaningful tests
- Unit: payload builder includes mandatory fields.
- Unit: duplicate suppression where expected.
- Integration: full happy-path journey produces all required events in order.
- E2E: parent setup -> profile create -> cabinet interaction -> runtime loaded trace.

## Blocker dependencies
- Depends on T02, T05, and T08 user flows.
