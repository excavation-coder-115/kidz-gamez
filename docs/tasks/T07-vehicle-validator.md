# T07 — Vehicle validator and auto-fix pipeline

## Description
Implement shared validation + deterministic repair pipeline for vehicle graphs using schema and domain constraints.

## Deliverables
- Schema validation wiring for `src/schemas/vehicle-graph.v1.schema.json`.
- Domain rules (required core modules, transform sanity, parent references).
- Auto-fix engine for recoverable issues.
- `VehicleValidationResult` mapping for UI feedback.

## Acceptance criteria
- Valid graphs pass with no repairs.
- Recoverable invalid graphs are auto-fixed with warnings.
- Unrecoverable graphs fail with clear error list.
- Same input yields same repaired output (deterministic).

## Meaningful tests
- Unit: missing required module auto-fix inserts default part.
- Unit: invalid parent reference paths are either repaired or hard-failed predictably.
- Unit: deterministic output snapshot test for fixed invalid fixture.
- Integration: builder-exported graph validates before garage save.

## Blocker dependencies
- Depends on T04 schema tooling and T06 graph export contract.
