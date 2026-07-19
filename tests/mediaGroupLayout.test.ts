import { describe, expect, it } from 'bun:test';
import { layoutMediaGroup } from '../src/utils/mediaGroupLayout';

describe('Telegram media group layout', () => {
  it('places a leading wide photo above the other three media items', () => {
    const layout = layoutMediaGroup([
      { width: 1600, height: 900 },
      { width: 900, height: 1600 },
      { width: 900, height: 1600 },
      { width: 900, height: 1600 },
    ]);

    expect(layout.items[0]).toMatchObject({ x: 0, y: 0, width: layout.width });
    expect(layout.items.slice(1).map(({ y }) => y)).toEqual([
      layout.items[1].y,
      layout.items[1].y,
      layout.items[1].y,
    ]);
    expect(layout.items.slice(1).reduce((width, item) => width + item.width, 0) + 4)
      .toBe(layout.width);
  });

  it('places a leading portrait beside two vertically stacked media items', () => {
    const layout = layoutMediaGroup([
      { width: 600, height: 1200 },
      { width: 1200, height: 900 },
      { width: 1200, height: 900 },
    ]);

    expect(layout.items[0].height).toBe(layout.height);
    expect(layout.items[1].x).toBe(layout.items[2].x);
    expect(layout.items[2].y).toBeGreaterThan(layout.items[1].y);
  });

  it('keeps ten-item albums inside one deterministic reference geometry', () => {
    const sizes = Array.from({ length: 10 }, (_, index) => ({
      width: index % 2 ? 900 : 1600,
      height: index % 2 ? 1600 : 900,
    }));
    const layout = layoutMediaGroup(sizes);

    expect(layout.items).toHaveLength(10);
    expect(layout.items.every((item) => (
      item.x >= 0
      && item.y >= 0
      && item.x + item.width <= layout.width
      && item.y + item.height <= layout.height
    ))).toBe(true);
    expect(layoutMediaGroup(sizes)).toEqual(layout);
  });
});
