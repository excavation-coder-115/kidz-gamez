# T05 — Vehicle classes and garage persistence

## Description
Implement class-based vehicle selection and multi-save garage persistence tied to active child profiles.

## Deliverables
- Vehicle class registry and defaults.
- Garage UI for save/select/delete vehicle builds.
- Local persistence keyed by child profile ID.
- Restore active vehicle on session resume.

## Acceptance criteria
- Each child profile can store multiple vehicle builds.
- Active vehicle selection survives reload.
- Deleting a selected vehicle falls back to a valid default class.

## Meaningful tests
- Unit: persistence keying isolates vehicles across child profiles.
- Unit: fallback logic when active vehicle is missing/corrupt.
- Integration: save two vehicles, switch active, reload, verify active restored.
- E2E: profile swap updates available garage entries correctly.

## Blocker dependencies
- Depends on T02 profile persistence.
- Depends on vehicle graph structure from T07 for saved payload shape.
