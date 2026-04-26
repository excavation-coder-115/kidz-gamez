# T06 — Builder scene with snap modules

## Description
Build the initial builder experience using constrained snap modules that produce vehicle graph output compatible with validator contracts.

## Deliverables
- Builder scene with module palette.
- Socket-based snapping and transform editing controls.
- Enforced maximum part count (60).
- Export action producing `VehicleGraphV1` payload.

## Acceptance criteria
- User can place/remove modules and export a graph payload.
- Builder prevents exceeding part cap.
- Exported payload includes required transform fields.

## Meaningful tests
- Unit: socket placement rules reject incompatible module/socket pairs.
- Unit: part cap enforcement blocks placement at 61st node.
- Integration: edit flow (add/remove/rotate) produces stable graph output.
- E2E: user builds, exports, and saves a vehicle to garage.

## Blocker dependencies
- Depends on T05 garage save flow and T07 validator interfaces.
