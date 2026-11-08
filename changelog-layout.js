(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NightReaperChangelog = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';
  const ESC = '\x1b';
  const INNER_WIDTH = 38;
  const RESET = `${ESC}[0m`;
  const COLOR = { brand: '1;36', archive: '0;90', executor: '1;37', accent: '1;35', update: '1;33', body: '0;37' };
  const paint = (code, value) => `${ESC}[${code}m${value}${RESET}`;
  function visibleLength(value) {
    return Array.from(String(value ?? '').replace(/\x1b\[[0-9;]*m/g, '')).length;
  }
  function center(value, width = INNER_WIDTH) {
    let text = Array.from(String(value ?? '').trim());
    if (text.length > width) text = [...text.slice(0, Math.max(0, width - 1)), '…'];
    const left = Math.max(0, Math.floor((width - text.length) / 2));
    const right = Math.max(0, width - text.length - left);
    return `${' '.repeat(left)}${text.join('')}${' '.repeat(right)}`;
  }
  function centeredBody(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').split('\n').map(line => {
      if (!line.trim()) return '';
      const length = visibleLength(line);
      if (length >= INNER_WIDTH) return line;
      return `${' '.repeat(Math.floor((INNER_WIDTH - length) / 2))}${line}`;
    }).join('\n');
  }
  // In underlined Changelog rows, an icon/marker should touch its label.
  // Removing only the first separator after a known leading symbol avoids an
  // underline segment running through a visually empty space in Discord.
  function tightenIconSpacing(value) {
    // ANSI color/style sequences may precede the marker, so keep them while
    // removing only the visible separator between the icon and its label.
    return String(value ?? '').replace(/^[ \t]*(?:\x1b\[[0-9;]*m)*(\[[\^!+*~\-]\]|[✦✧✓◈▸◆◇✚])[ \t]+(?=\S)/gm, (match, marker) => {
      const prefix = match.slice(0, match.indexOf(marker));
      return `${prefix}${marker}`;
    });
  }
  const NAME_COLOR_CYCLE = ['1;31', '1;33', '1;32', '1;36', '1;34', '1;35'];
  function rainbowName(value) {
    const source = String(value ?? '');
    const graphemes = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source), part => part.segment)
      : Array.from(source);
    let colorIndex = 0;
    return graphemes.map(character => {
      if (/^\s+$/u.test(character)) return character;
      const color = NAME_COLOR_CYCLE[colorIndex++ % NAME_COLOR_CYCLE.length];
      return `${ESC}[${color}m${character}${RESET}`;
    }).join('');
  }
  function buildHeader(executorName) {
    const name = String(executorName || 'EXECUTOR').replace(/[\r\n]+/g, ' ').trim() || 'EXECUTOR';
    const divider = center('───────  ✦  ───────');
    return [
      paint(COLOR.brand, center('✦ NIGHTREAPER ✦')),
      paint(COLOR.archive, center('EXECUTOR ARCHIVE')),
      rainbowName(center(name)),
      paint(COLOR.accent, divider),
      paint(COLOR.update, center('✧ CẬP NHẬT · CHANGELOG ✧'))
    ].join('\n');
  }
  function formatBrandedChangelog(itemOrName, rawSummary, options = {}) {
    const item = itemOrName && typeof itemOrName === 'object' ? itemOrName : { name: itemOrName };
    const executorName = item.name || options.executorName || 'EXECUTOR';
    const summary = String(rawSummary ?? item.summary ?? '').replace(/\r\n?/g, '\n').trim();
    const header = buildHeader(executorName);
    const max = Number.isFinite(options.maxLength) ? Math.max(500, options.maxLength) : 3800;
    const ansiOnly = summary.match(/^```ansi[ \t]*\n([\s\S]*?)\n```$/i);
    const rawAnsiOnly = !ansiOnly && !summary.includes('```') && /\x1b\[[0-9;]*m/.test(summary);
    if (!summary) {
      const empty = paint(COLOR.archive, center('Chưa có nội dung cập nhật mới'));
      return `\`\`\`ansi\n${header}\n\n${empty}\n\`\`\``;
    }
    if (ansiOnly || rawAnsiOnly) {
      const bodySource = ansiOnly ? ansiOnly[1] : summary;
      const body = centeredBody(bodySource);
      const availableBody = Math.max(0, max - header.length - 22);
      const combined = `${header}\n\n${body.slice(0, availableBody)}`;
      return `\`\`\`ansi\n${combined}\n\`\`\``;
    }
    // Keep ordinary Markdown outside ANSI so lists/links remain native Discord Markdown.
    const headerBlock = `\`\`\`ansi\n${header}\n\`\`\``;
    const maxBody = Number.isFinite(options.maxBodyLength) ? Math.max(500, options.maxBodyLength) : 3500;
    return `${headerBlock}\n\n${summary.slice(0, maxBody)}`;
  }
  return { formatBrandedChangelog, buildHeader, rainbowName, center, centeredBody, tightenIconSpacing, INNER_WIDTH };
});
