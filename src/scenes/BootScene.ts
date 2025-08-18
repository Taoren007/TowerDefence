import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Attempt to load commonly named assets from /resources
    // If missing, load built-in tiny placeholders
    this.load.setBaseURL('/');

    // Tileset and player defaults (1x1 pixels scaled up later)
    this.load.image('fallback-tile', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBg6e5XwwAAAAASUVORK5CYII=');
    this.load.image('fallback-hero', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBg6e5XwwAAAAASUVORK5CYII=');

    // User-provided optional assets
    this.load.on('loaderror', (_file: any) => {});
    this.load.image('tiles', 'resources/tiles.png');
    this.load.image('hero', 'resources/hero.png');
    this.load.image('marker', 'resources/marker.png');
  }

  create(): void {
    this.scene.start('World');
  }
}

