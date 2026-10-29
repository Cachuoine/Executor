/* Safe Discord Markdown preview with ANSI SGR rendering for terminal-style fenced blocks. */
(() => {
  const ESC = '\u001b';
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  function normalizeAnsiEscapes(value) {
    return String(value ?? '')
      .replace(/\\u001b/gi, ESC)
      .replace(/\\x1b/gi, ESC)
      .replace(/\\033/g, ESC)
      .replace(/\\e(?=\[)/g, ESC);
  }
  function inline(source) {
    let s = source;
    const stash = [];
    const hold = html => { const key = `\u0000${stash.length}\u0000`; stash.push(html); return key; };
    s = s.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code class="discord-inline-code">${code}</code>`));
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_, label, url) => {
      // Both label and URL have already been HTML-escaped by render().
      return hold(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    });
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<u>$1</u>').replace(/~~(.+?)~~/g, '<del>$1</del>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, n) => stash[Number(n)] || '');
  }
  // Discord's commonly used ANSI palette (not standard terminal/Xterm shades).
  // 90–97 and 256/RGB sequences remain supported in preview, but may render differently in Discord clients.
  const BASIC = {
    30:'#8e9297',31:'#ed4245',32:'#3ba55c',33:'#faa61a',34:'#5865f2',35:'#eb459e',36:'#00b0f4',37:'#ffffff',
    90:'#666666',91:'#f14c4c',92:'#23d18b',93:'#f5f543',94:'#3b8eea',95:'#d670d6',96:'#29b8db',97:'#ffffff'
  };
  const DISCORD_BACKGROUNDS = {40:'#232d3f',41:'#e67e22',42:'#95a5a6',43:'#1abc9c',44:'#7f8c8d',45:'#5865f2',46:'#bdc3c7',47:'#ffffff'};
  function xtermColor(n) {
    n = Math.max(0, Math.min(255, Number(n) || 0));
    const base = ['#000000','#800000','#008000','#808000','#000080','#800080','#008080','#c0c0c0','#808080','#ff0000','#00ff00','#ffff00','#0000ff','#ff00ff','#00ffff','#ffffff'];
    if (n < 16) return base[n];
    if (n >= 232) { const gray = 8 + (n - 232) * 10; return `rgb(${gray},${gray},${gray})`; }
    const cube = n - 16, levels = [0,95,135,175,215,255];
    return `rgb(${levels[Math.floor(cube / 36) % 6]},${levels[Math.floor(cube / 6) % 6]},${levels[cube % 6]})`;
  }
  function renderAnsi(escapedCode) {
    const current = { fg: '', bg: '', bold: false, dim: false, italic: false, underline: false, strike: false, reverse: false, hidden: false, blink: false };
    let output = '', lastIndex = 0;
    const ansiSequence = new RegExp(`${ESC}\\[([0-9;:]*)m`, 'g');
    function append(raw) {
      if (!raw) return;
      const styles = [];
      let fg = current.fg, bg = current.bg;
      if (current.reverse) [fg, bg] = [bg, fg];
      if (fg) styles.push(`color:${fg}`);
      if (bg) styles.push(`background-color:${bg}`);
      if (current.bold) styles.push('font-weight:700');
      if (current.dim) styles.push('opacity:.68');
      if (current.italic) styles.push('font-style:italic');
      const decorations = [];
      if (current.underline) decorations.push('underline');
      if (current.strike) decorations.push('line-through');
      if (decorations.length) styles.push(`text-decoration:${decorations.join(' ')}`);
      if (current.hidden) styles.push('visibility:hidden');
      if (current.blink) styles.push('animation:ansiBlink 1s steps(2,start) infinite');
      output += styles.length ? `<span style="${styles.join(';')}">${raw}</span>` : raw;
    }
    let match;
    while ((match = ansiSequence.exec(escapedCode))) {
      append(escapedCode.slice(lastIndex, match.index));
      const normalizedParams = (match[1] || '0')
        .replace(/(^|[;:])(38|48):2::?(\d+):(\d+):(\d+)/g, '$1$2;2;$3;$4;$5')
        .replace(/(^|[;:])(38|48):5:(\d+)/g, '$1$2;5;$3');
      const params = normalizedParams.split(/[;:]/).map(v => v === '' ? 0 : Number(v));
      for (let i = 0; i < params.length; i++) {
        const n = params[i];
        if (n === 0) Object.assign(current, { fg:'', bg:'', bold:false, dim:false, italic:false, underline:false, strike:false, reverse:false, hidden:false, blink:false });
        else if (n === 1) current.bold = true;
        else if (n === 21) current.underline = true;
        else if (n === 2) current.dim = true;
        else if (n === 3) current.italic = true;
        else if (n === 4) current.underline = true;
        else if (n === 5 || n === 6) current.blink = true;
        else if (n === 7) current.reverse = true;
        else if (n === 8) current.hidden = true;
        else if (n === 9) current.strike = true;
        else if (n === 22) { current.bold = false; current.dim = false; }
        else if (n === 23) current.italic = false;
        else if (n === 24) current.underline = false;
        else if (n === 25) current.blink = false;
        else if (n === 27) current.reverse = false;
        else if (n === 28) current.hidden = false;
        else if (n === 29) current.strike = false;
        else if (n === 39) current.fg = '';
        else if (n === 49) current.bg = '';
        else if (BASIC[n]) current.fg = BASIC[n];
        else if (n >= 40 && n <= 47) current.bg = DISCORD_BACKGROUNDS[n] || '';
        else if (n >= 100 && n <= 107) current.bg = BASIC[n - 10] || '';
        else if ((n === 38 || n === 48) && params[i + 1] === 5 && params[i + 2] !== undefined) {
          current[n === 38 ? 'fg' : 'bg'] = xtermColor(params[i + 2]); i += 2;
        } else if ((n === 38 || n === 48) && params[i + 1] === 2 && params.length >= i + 5) {
          const rgb = params.slice(i + 2, i + 5).map(v => Math.max(0, Math.min(255, Number(v) || 0)));
          current[n === 38 ? 'fg' : 'bg'] = `rgb(${rgb.join(',')})`; i += 4;
        }
      }
      lastIndex = ansiSequence.lastIndex;
    }
    append(escapedCode.slice(lastIndex));
    return output;
  }
  function render(value) {
    const normalized = normalizeAnsiEscapes(String(value ?? '')).replace(/\r\n?/g, '\n');
    const source = escapeHtml(normalized);
    const chunks = source.split(/```([^\n`]*)\n([\s\S]*?)```/g);
    let out = '';
    for (let i = 0; i < chunks.length; i++) {
      if (i % 3 === 1) {
        const lang = chunks[i].trim().toLowerCase();
        const code = chunks[i + 1] || '';
        const safeLang = lang.replace(/[^a-zA-Z0-9_+#.-]/g, '');
        const rawCode = code.replace(/\n$/, '');
        const codeHtml = lang === 'ansi' ? renderAnsi(rawCode) : rawCode;
        out += `<pre class="discord-code-block${lang === 'ansi' ? ' discord-ansi-block' : ''}"><code${safeLang ? ` data-language="${safeLang}"` : ''}>${codeHtml}</code></pre>`;
        i++; continue;
      }
      const lines = (chunks[i] || '').split('\n');
      let paragraph = [], list = false, quote = false;
      const closeParagraph = () => { if (paragraph.length) { out += `<p>${paragraph.join('<br>')}</p>`; paragraph = []; } };
      const close = () => { closeParagraph(); if (list) { out += '</ul>'; list = false; } if (quote) { out += '</blockquote>'; quote = false; } };
      for (const line of lines) {
        if (!line.trim()) { close(); continue; }
        if (/^\s*[-*] /.test(line)) {
          closeParagraph(); if (quote) { out += '</blockquote>'; quote = false; }
          if (!list) { out += '<ul>'; list = true; }
          out += `<li>${inline(line.replace(/^\s*[-*] /, ''))}</li>`;
        } else if (/^&gt; ?/.test(line)) {
          closeParagraph(); if (list) { out += '</ul>'; list = false; }
          if (!quote) { out += '<blockquote>'; quote = true; }
          out += `<p>${inline(line.replace(/^&gt; ?/, ''))}</p>`;
        } else {
          if (list || quote) close();
          paragraph.push(inline(line));
        }
      }
      close();
    }
    return out || '<p class="discord-description-empty">Chưa có mô tả.</p>';
  }
  window.DiscordDescription = { render, escapeHtml };
})();
