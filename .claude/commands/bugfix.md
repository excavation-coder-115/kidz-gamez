---
description: Create a bugfix spec with regression protection (Bugfix → Design → Tasks)
argument-hint: [bug description]
allowed-tools: Read, Write, Glob, Grep
---

Read the full SDD rules from `.speq/RULES.md` (specifically the Bugfix Workflow section) before proceeding.

Read all steering docs from `.specs/steering/` (if they exist).

You are creating a **Bugfix Spec** for:

**$ARGUMENTS**

Follow these rules exactly:

1. **Create the spec directory**: `.specs/specs/{bugfix-name}/` using kebab-case.

2. **Generate and save `bugfix.md` to disk immediately** (replaces requirements.md) with these sections:
   - **Current Behavior**: Exactly what the system does now (the bug)
   - **Expected Behavior**: What it should do instead (EARS notation)
   - **Reproduction Steps**: Numbered steps to reproduce
   - **Unchanged Behavior** (CRITICAL): EARS-format list of existing correct behaviors that MUST NOT change: `WHEN [condition] THE SYSTEM SHALL CONTINUE TO [existing behavior]`
   - **Root Cause Analysis**: Identified or suspected cause
   - **Affected Components**: Specific files and modules
   - **Test Cases**: Regression test for the fix + tests for unchanged behaviors
   - **Write the file immediately.**

3. The **Unchanged Behavior** section is the most important. Be thorough — a regression is worse than the original bug. Think about adjacent features, other user roles, and edge cases that currently work.

4. Tell the user the file has been saved and ask for review. After approval, **re-read `bugfix.md` from disk** (user may have edited it directly), then **generate and save `design.md`** to disk immediately (focused on fix approach). After design approval, **re-read `design.md` from disk**, then **generate and save `tasks.md`** to disk immediately.

Each phase: write the file to disk → ask for review → wait for approval → re-read from disk before advancing.
