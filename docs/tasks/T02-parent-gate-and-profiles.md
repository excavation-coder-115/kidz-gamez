# T02 — Parent gate and child profiles

## Description
Build parent challenge gate plus profile management (create/read/select) to support age-banded launch policies and per-child progression.

## Deliverables
- Parent gate challenge UI.
- Child profile creation form (name + age band).
- Profile selection state in kernel context.
- Local persistence for parent and profiles.

## Acceptance criteria
- Parent challenge must pass before profile management is accessible.
- Parent can create at least one child profile.
- Active child profile is persisted and restored on reload.
- Invalid profile inputs show clear validation messages.

## Meaningful tests
- Unit: parent challenge validation logic for pass/fail paths.
- Unit: profile schema validation rejects invalid age bands.
- Integration: create profile -> reload page -> selected profile remains active.
- E2E: gated flow blocks child access until parent challenge is completed.

## Blocker dependencies
- Depends on T01 kernel context and route scaffolding.
