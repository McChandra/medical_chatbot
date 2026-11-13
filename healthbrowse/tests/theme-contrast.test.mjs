import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync(new URL('../dist/theme.css', import.meta.url), 'utf8');
const dark = css.match(/:root\[data-theme=dark\]\s*\{([^}]+)\}/)?.[1];
assert.ok(dark, 'Dark theme tokens must be declared in one root block');
const tokens = Object.fromEntries([...dark.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map(([, name, value]) => [name, value]));
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a, b) {
  assert.ok(tokens[a] && tokens[b], `Missing color token: ${a} / ${b}`);
  const values = [luminance(tokens[a]), luminance(tokens[b])].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
const backgrounds = ['paper', 'surface', 'elevated', 'panel', 'wash', 'tag', 'hover', 'danger-bg'];

test('dark normal text, links and error copy meet 4.5:1 across their dark surfaces', () => {
  for (const foreground of ['ink', 'dim', 'link', 'danger']) {
    for (const background of backgrounds) {
      const actual = contrast(foreground, background);
      assert.ok(actual >= 4.5, `${foreground}/${background}: ${actual}`);
    }
  }
  for (const background of ['action', 'action-hover']) {
    assert.ok(contrast('on-action', background) >= 4.5, `Primary button: ${background}`);
  }
});

test('meaningful input boundaries and focus rings meet 3:1 against adjacent dark surfaces', () => {
  for (const foreground of ['control-border', 'focus']) {
    for (const background of backgrounds) {
      assert.ok(contrast(foreground, background) >= 3, `${foreground}/${background}`);
    }
  }
  // Decorative separators are deliberately excluded: they do not identify controls.
});

test('disabled field text stays legible and surface elevation increases in luminance', () => {
  assert.ok(contrast('disabled', 'panel') >= 4.5);
  assert.ok(luminance(tokens.paper) < luminance(tokens.surface));
  assert.ok(luminance(tokens.surface) < luminance(tokens.elevated));
  for (const token of ['paper', 'surface', 'elevated', 'ink']) {
    assert.notEqual(tokens[token].toLowerCase(), '#000000');
    assert.notEqual(tokens[token].toLowerCase(), '#ffffff');
  }
});
