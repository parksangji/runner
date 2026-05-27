import { describe, expect, it } from 'vitest';
import { languageFor, highlightLine } from './highlight';

describe('languageFor', () => {
  it('maps common extensions to registered languages', () => {
    expect(languageFor('src/app.ts')).toBe('typescript');
    expect(languageFor('src/app.tsx')).toBe('typescript');
    expect(languageFor('a/b/c.js')).toBe('javascript');
    expect(languageFor('main.py')).toBe('python');
    expect(languageFor('go.mod/main.go')).toBe('go');
    expect(languageFor('styles.scss')).toBe('css');
  });

  it('matches special basenames case-insensitively', () => {
    expect(languageFor('project/Dockerfile')).toBe('bash');
    expect(languageFor('Makefile')).toBe('bash');
  });

  it('returns null for unknown or extensionless files', () => {
    expect(languageFor('data.bin')).toBeNull();
    expect(languageFor('LICENSE')).toBeNull();
  });
});

describe('highlightLine', () => {
  it('escapes HTML when language is unknown', () => {
    expect(highlightLine('<script>&"', null)).toBe('&lt;script&gt;&amp;"');
  });

  it('escapes angle brackets and ampersands in highlighted output', () => {
    // Whatever the tokenizer does, the literal markup must be neutralized.
    const html = highlightLine('const x = a < b && c > d;', 'typescript');
    expect(html).not.toContain('<b');
    expect(html).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#)/);
  });

  it('wraps keywords in hljs token spans for a known language', () => {
    const html = highlightLine('const x = 1;', 'typescript');
    expect(html).toContain('hljs-keyword');
  });

  it('falls back to escaped text for an unregistered language id', () => {
    expect(highlightLine('a < b', 'cobol')).toBe('a &lt; b');
  });
});
