# Kidz Gamez Architecture (Initial)

## Product vision

A parent can host multiple kid-friendly games in one 3D arcade website. Kids can navigate the lobby, read game info, and launch the game they want to play.

## Core modules

1. **Arcade Lobby (website shell)**
   - Renders the 3D environment and interactable game portals/cabinets.
   - Owns navigation and user profile context.

2. **Game Catalog**
   - Registry of games with metadata (title, age range, category, route, learning goals).
   - Future: remote config endpoint for dynamic updates.

3. **Game Runtime**
   - Individual game modules mounted by route.
   - Shared contracts for score reporting and progress events.

## Example future interfaces

```ts
export interface GameManifest {
  id: string;
  name: string;
  route: string;
  description: string;
  minAge?: number;
  maxAge?: number;
  tags: string[];
}

export interface GameSessionEvent {
  gameId: string;
  type: 'start' | 'checkpoint' | 'score' | 'end';
  value?: number;
  timestamp: number;
}
```

## Scaling path

- **Phase 1**: Static manifests in repo and local storage.
- **Phase 2**: API-backed profile and game catalog.
- **Phase 3**: Parent dashboard, moderation controls, and achievements.
