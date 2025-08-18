# Isometric RPG Template (Phaser 3 + Vite)

## Quick start

- Put your PNG assets into `public/resources/` (e.g., `public/resources/tiles.png`, `public/resources/hero.png`, `public/resources/marker.png`).
- Install deps and start the dev server:

```bash
npm i
npm run dev
```

Open the printed URL. If assets are missing, placeholders render so the app still runs.

## Controls

- Drag mouse to pan the camera.
- Click any tile to move the hero there.

## Asset expectations

- `tiles.png`: diamond tile image. Any PNG will be scaled to 64x32 for isometric.
- `hero.png`: character sprite (single frame).
- `marker.png`: optional click marker.

Adjust map size and tile dimensions in `src/scenes/WorldScene.ts`.
