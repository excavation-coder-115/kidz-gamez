# T04 — Manifest loader and typed parsing

## Description
Create typed manifest ingestion pipeline backed by JSON Schema validation and runtime-safe parsing for `GameManifestV1`.

## Deliverables
- Manifest loader service (local static source for v1).
- Validator wiring for `src/schemas/game-manifest.v1.schema.json`.
- Typed parse output mapped to `GameManifestV1`.
- Error reporting strategy for invalid manifests.

## Acceptance criteria
- Loader returns only validated manifests.
- Invalid manifest entries are excluded and logged with actionable reasons.
- Loader supports deterministic ordering for cabinet rendering.

## Meaningful tests
- Unit: valid manifest fixture parses successfully.
- Unit: invalid enum values (cabinetType/vehicleSupport/launchMode) are rejected.
- Unit: malformed age bands are rejected.
- Integration: mixed valid/invalid manifest list yields only valid entries.

## Blocker dependencies
- Depends on T01 kernel service injection.
