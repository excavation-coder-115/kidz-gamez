# T08 — Lobby launch interaction and lifecycle handoff

## Description
Implement explicit cabinet interaction flow and robust lifecycle handoff from lobby to game runtime and back to hub spawn.

## Deliverables
- Interaction prompt and input handling near cabinet entities.
- Launch gate invocation + runtime handoff.
- Return-to-hub spawn behavior on runtime exit.
- Error fallback modal for failed runtime initialization.

## Acceptance criteria
- Child can approach eligible cabinet and launch via explicit input.
- Ineligible cabinet interaction shows lock reason and blocks launch.
- Exiting runtime returns player to configured hub spawn.

## Meaningful tests
- Unit: interaction radius + prompt state transitions.
- Integration: eligible launch path executes kernel lifecycle correctly.
- Integration: failed runtime init returns to stable lobby state.
- E2E: launch game, exit game, confirm hub respawn.

## Blocker dependencies
- Depends on T01 lifecycle, T03 age policy, T04 manifests.
