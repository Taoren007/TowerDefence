import Phaser from 'phaser';

type IsoPoint = { x: number; y: number; };

export class WorldScene extends Phaser.Scene {
  private isoOrigin: IsoPoint = { x: 400, y: 150 };
  private tileWidth = 64;
  private tileHeight = 32; // iso diamond height
  private mapCols = 10;
  private mapRows = 10;
  private hero?: Phaser.GameObjects.Image;
  private marker?: Phaser.GameObjects.Image;

  constructor() {
    super('World');
  }

  create(): void {
    const tilesKey = this.textures.exists('tiles') ? 'tiles' : 'fallback-tile';
    const heroKey = this.textures.exists('hero') ? 'hero' : 'fallback-hero';

    // Simple height map for demo
    const heights: number[][] = [];
    for (let r = 0; r < this.mapRows; r += 1) {
      heights[r] = [];
      for (let c = 0; c < this.mapCols; c += 1) {
        heights[r][c] = (r + c) % 3 === 0 ? 4 : (r + c) % 3 === 1 ? 2 : 0;
      }
    }

    // Draw isometric tiles
    for (let r = 0; r < this.mapRows; r += 1) {
      for (let c = 0; c < this.mapCols; c += 1) {
        const screen = this.isoToScreen(c, r);
        const yOffset = -heights[r][c];
        const img = this.add.image(screen.x, screen.y + yOffset, tilesKey);
        img.setOrigin(0.5, 0.5);
        img.setDisplaySize(this.tileWidth, this.tileHeight);
      }
    }

    // Hero
    const start = this.isoToScreen(0, 0);
    this.hero = this.add.image(start.x, start.y - 8, heroKey);
    this.hero.setDisplaySize(28, 40);
    this.hero.setDepth(1000);

    // Marker for hover
    const markerKey = this.textures.exists('marker') ? 'marker' : heroKey;
    this.marker = this.add.image(start.x, start.y, markerKey).setAlpha(0.6);
    this.marker.setDisplaySize(18, 18);

    // Camera controls
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.cameras.main.scrollX -= (p.velocity.x) * 0.2;
      this.cameras.main.scrollY -= (p.velocity.y) * 0.2;
    });

    // Click-to-move
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const worldPoint = new Phaser.Math.Vector2(p.worldX, p.worldY);
      const { c, r } = this.screenToIso(worldPoint.x, worldPoint.y);
      const clampedC = Phaser.Math.Clamp(Math.round(c), 0, this.mapCols - 1);
      const clampedR = Phaser.Math.Clamp(Math.round(r), 0, this.mapRows - 1);
      const dest = this.isoToScreen(clampedC, clampedR);
      this.tweens.add({
        targets: this.hero,
        x: dest.x,
        y: dest.y - 8,
        duration: 250 + Phaser.Math.Distance.Between(this.hero!.x, this.hero!.y, dest.x, dest.y),
        ease: 'Sine.easeInOut'
      });
      this.marker!.setPosition(dest.x, dest.y);
    });

    // Resize handling keeps iso origin centered
    this.scale.on('resize', this.onResize, this);
    this.onResize();
  }

  private onResize(): void {
    const { width } = this.scale.gameSize;
    this.isoOrigin.x = width * 0.5;
  }

  private isoToScreen(c: number, r: number): IsoPoint {
    const x = (c - r) * (this.tileWidth / 2) + this.isoOrigin.x;
    const y = (c + r) * (this.tileHeight / 2) + this.isoOrigin.y;
    return { x, y };
  }

  private screenToIso(x: number, y: number): { c: number; r: number } {
    const cx = x - this.isoOrigin.x;
    const cy = y - this.isoOrigin.y;
    const c = (cx / (this.tileWidth / 2) + cy / (this.tileHeight / 2)) / 2;
    const r = (cy / (this.tileHeight / 2) - cx / (this.tileWidth / 2)) / 2;
    return { c, r };
  }
}

