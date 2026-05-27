import { describe, it, expect } from 'vitest';
import {
  sanitize,
  DEFAULT_SETTINGS,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  SCROLLBACK_MIN,
  SCROLLBACK_MAX,
} from './settings';

describe('settings sanitize', () => {
  it('returns defaults for null/empty input', () => {
    expect(sanitize(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitize({})).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps font size to the allowed range', () => {
    expect(sanitize({ fontSize: 2 }).fontSize).toBe(FONT_SIZE_MIN);
    expect(sanitize({ fontSize: 999 }).fontSize).toBe(FONT_SIZE_MAX);
    expect(sanitize({ fontSize: 16 }).fontSize).toBe(16);
  });

  it('clamps scrollback to the allowed range', () => {
    expect(sanitize({ scrollback: 0 }).scrollback).toBe(SCROLLBACK_MIN);
    expect(sanitize({ scrollback: 10_000_000 }).scrollback).toBe(SCROLLBACK_MAX);
  });

  it('rounds fractional numbers', () => {
    expect(sanitize({ fontSize: 13.7 }).fontSize).toBe(14);
  });

  it('falls back to default font family when blank or non-string', () => {
    expect(sanitize({ fontFamily: '   ' }).fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
    expect(sanitize({ fontFamily: 42 as unknown as string }).fontFamily).toBe(
      DEFAULT_SETTINGS.fontFamily
    );
    expect(sanitize({ fontFamily: 'Menlo' }).fontFamily).toBe('Menlo');
  });

  it('coerces non-boolean cursorBlink to the default', () => {
    expect(sanitize({ cursorBlink: 'yes' as unknown as boolean }).cursorBlink).toBe(
      DEFAULT_SETTINGS.cursorBlink
    );
    expect(sanitize({ cursorBlink: false }).cursorBlink).toBe(false);
  });
});
