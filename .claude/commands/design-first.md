---
description: Create a spec starting from technical design (Design → Requirements → Tasks). Use when you know the architecture.
argument-hint: [feature + architectural intent]
allowed-tools: Read, Write, Glob, Grep
---

Read the full SDD rules from `.speq/RULES.md` before proceeding.

Read all steering docs from `.specs/steering/` (if they exist) to understand project context.

You are starting the **Design-First** spec workflow for this feature:

**$ARGUMENTS**

Follow these rules exactly:

1. **Create the spec directory**: `.specs/specs/{feature-name}/` using kebab-case.

2. **Generate and save `design.md` to disk immediately** (this is the design-first variant):
   - Validate and flesh out the architectural approach the user described
   - Define concrete components, interfaces, and data models
   - Show system/sequence diagrams in Mermaid
   - Include error handling, testing strategy, and design decisions table
   - Use real code signatures and types from the project's language
   - **Write the file immediately.**

3. Tell the user the file has been saved and ask: "I've saved `design.md` — review it in your IDE or here, then let me know your feedback or say **LGTM** to proceed to Requirements."

4. After approval, **re-read `design.md` from disk** (user may have edited it directly), then **derive and save `requirements.md`** to disk immediately:
   - Work backwards — every designed behavior becomes a testable EARS criterion
   - Requirements must be 100% achievable given the approved design
   - Do not add requirements that would force design changes

5. After requirements approval, **re-read `requirements.md` from disk**, then **generate and save `tasks.md`** to disk immediately, following the tasks phase rules.

Each phase: write the file to disk → ask for review → wait for approval → re-read from disk before advancing.
