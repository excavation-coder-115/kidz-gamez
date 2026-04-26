# T03 — Age policy and cabinet locking UI

## Description
Implement age policy evaluation and lock-state UI behavior so cabinets are visible but blocked with explanations when outside the child profile age band.

## Deliverables
- Age policy service (`canLaunch` policy helpers).
- Lock state annotations on cabinet cards/entities.
- Explanation tooltip/modal for locked entries.
- Shared display component for lock reason.

## Acceptance criteria
- Eligible games are launchable; ineligible games are visible and non-launchable.
- Locked cabinet reason references child profile age band and game range.
- Policy check is enforced by kernel route handoff (not only UI).

## Meaningful tests
- Unit: age policy boundary checks (equal min/max, below/above range).
- Unit: lock reason formatter outputs deterministic text.
- Integration: direct route navigation to ineligible game is blocked serverlessly.
- E2E: child sees locked cabinet with explanation and cannot bypass via URL.

## Blocker dependencies
- Depends on T01 plugin launch gating and T02 profile data.
- Depends on T04 manifest age-band fields.
