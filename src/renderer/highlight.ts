import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';

let registered = false;
function register(): void {
  if (registered) return;
  registered = true;
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('css', css);
  hljs.registerLanguage('xml', xml);
  hljs.registerLanguage('markdown', markdown);
  hljs.registerLanguage('python', python);
  hljs.registerLanguage('bash', bash);
  hljs.registerLanguage('go', go);
  hljs.registerLanguage('rust', rust);
  hljs.registerLanguage('java', java);
  hljs.registerLanguage('c', c);
  hljs.registerLanguage('cpp', cpp);
  hljs.registerLanguage('yaml', yaml);
  hljs.registerLanguage('sql', sql);
  hljs.registerLanguage('ruby', ruby);
  hljs.registerLanguage('php', php);
}

// File extension / basename → registered hljs language id.
const EXT_LANG: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  json: 'json',
  css: 'css',
  scss: 'css',
  less: 'css',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  rb: 'ruby',
  php: 'php',
};

const BASENAME_LANG: Record<string, string> = {
  dockerfile: 'bash',
  makefile: 'bash',
  '.bashrc': 'bash',
  '.zshrc': 'bash',
};

/** Resolve a file path to a registered highlight.js language, or null. */
export function languageFor(path: string): string | null {
  const base = (path.split('/').pop() ?? path).toLowerCase();
  if (BASENAME_LANG[base]) return BASENAME_LANG[base];
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : '';
  return EXT_LANG[ext] ?? null;
}

/** Highlight a single line of code, returning safe HTML. Falls back to escaped
 *  plain text when the language is unknown or highlighting fails. Highlighting
 *  is per-line, so multi-line constructs (block comments, template strings)
 *  aren't carried across lines — an accepted tradeoff for diff rendering. */
export function highlightLine(text: string, lang: string | null): string {
  if (!lang) return escapeHtml(text);
  register();
  if (!hljs.getLanguage(lang)) return escapeHtml(text);
  try {
    return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(text);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
