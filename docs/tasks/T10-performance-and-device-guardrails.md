# T10 — Performance budget and unsupported device handling

## Description
Enforce preload and runtime guardrails for desktop/modern tablet targets, and provide graceful messaging for unsupported environments.

## Deliverables
- Compressed preload budget policy (target <= 15 MB).
- Build-time asset budget report.
- Runtime capability check (WebGL/device support).
- Unsupported-device screen with actionable guidance.

## Acceptance criteria
- CI/build process fails when asset budget is exceeded.
- Unsupported environments show non-crashing guidance page.
- Target devices complete first interactive within budget target.

## Meaningful tests
- Unit: capability detection branch coverage for supported/unsupported cases.
- Integration: simulated unsupported device reaches guidance screen.
- Integration: asset budget checker fails on over-budget fixture.
- Performance: scripted measurement for initial interactive time on target profiles.

## Blocker dependencies
- Depends on T01 app bootstrapping and asset loader seams.
