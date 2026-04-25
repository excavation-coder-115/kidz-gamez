# Game Module Template

Use this checklist when adding a new game to the arcade:

- [ ] Create folder: `src/games/<game-id>/`
- [ ] Add manifest (`manifest.ts` or `manifest.json`) with metadata.
- [ ] Export mount/unmount functions for the game runtime.
- [ ] Define learning objectives and difficulty.
- [ ] Emit standardized session events (`start`, `score`, `end`).
- [ ] Add route integration in the main app router.
- [ ] Add QA checklist for accessibility and kid-safe content.
