---
description: Implement a specific task from an existing spec
argument-hint: [spec-name] [task-number]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

Read the full SDD rules from `.speq/RULES.md` before proceeding.

The user wants to implement a task from this spec:

**$ARGUMENTS**

Follow this strict load order before writing any code:

## Step 0: Branch Check

Before loading any context, run `git branch --show-current` to check the active branch.

If the current branch is `main`, `master`, `develop`, `trunk`, or any name that looks like a production or shared base branch:
- Warn the user: "⚠️ You're on `<branch>`. Implementing directly on this branch is not recommended."
- Suggest: "Create a feature branch first: `git checkout -b feat/{spec-name}`"
- **Do not proceed** until the user confirms the branch or switches to a new one.

## Step 1: Load Steering Context

Read all files in `.specs/steering/` (if the directory exists). These define project-wide conventions, tech stack, and architecture that must be respected.

## Step 2: Load Spec Context

Identify the spec name and task number from `$ARGUMENTS`. If no spec name is provided, list available specs in `.specs/specs/` and ask the user to choose. If no task number is provided, show the task list and ask which task to implement.

Read all three spec files in order:
1. `.specs/specs/{spec-name}/requirements.md`
2. `.specs/specs/{spec-name}/design.md`
3. `.specs/specs/{spec-name}/tasks.md`

## Step 3: Confirm Scope

Before writing any code, state:
- Which task you are implementing (title and number)
- Which requirement(s) it maps to (from the `_Requirements: X.Y_` reference)
- Which files you expect to create or modify

## Step 4: Implement

Implement only the specified task. Follow the design exactly. Do not implement other tasks, even if they seem related.

Write tests alongside the implementation as specified in the task.

## Step 5: Commit the Task

After marking the task `- [x]` in `tasks.md`, stage and commit all changes:

```
git add -A
git commit -m "feat(<spec-name>): task N — <task title>"
```

Use the spec folder name as `<spec-name>` and the task's title from `tasks.md` as `<task title>`.

## Step 6: Check for Spec Completion

Re-read `tasks.md` from disk. If **all tasks are now `- [x]`**:

1. Push the branch: `git push -u origin <branch>`
2. Open a pull request with:
   - **Title:** the spec name in title case (e.g. "User Authentication")
   - **Body:** a summary of what was built, referencing `.specs/specs/{spec-name}/`
   - If the `gh` CLI is available, use: `gh pr create --title "..." --body "..."`
   - Otherwise, print the push command and instruct the user to open a PR manually
3. Check if `requirements.md` has a `<!-- source: {tracker}:{issue-id} -->` comment. If so and MCP tools are available, offer to update the linked issue status.

If tasks remain, suggest the next incomplete task.
