import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  it('preserves insertion order under capacity', () => {
    const rb = new RingBuffer<number>(5);
    [1, 2, 3].forEach((n) => rb.push(n));
    expect(rb.toArray()).toEqual([1, 2, 3]);
    expect(rb.length).toBe(3);
  });

  it('overwrites oldest when full', () => {
    const rb = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => rb.push(n));
    expect(rb.toArray()).toEqual([3, 4, 5]);
    expect(rb.length).toBe(3);
  });

  it('throws on non-positive capacity', () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(-1)).toThrow();
  });
});
