---
description: Analyze spec coverage - identify gaps between steering docs and feature specs
allowed-tools: Read, Glob
---

Run the coverage analysis to identify gaps:

1. Execute: `npx tsx .speq/lib/coverage/coverage.ts` (or compile and run `.speq/lib/coverage/coverage.js`)
2. Or use: `speq coverage` if the CLI is installed

The analysis shows:
- **Steering templates** (`.speq/templates/steering/*.md`) and their defined features
- **Specs** (`.speq/specs/*/`) and their phase completion
- **Gaps**: missing specs, incomplete specs, empty steering docs

Options:
- `--html` - Generate HTML report
- `--gaps-only` - Show only gaps
- `--verbose` - Show detailed gap information

Review the output and address any gaps by creating specs for missing features or completing existing ones.
