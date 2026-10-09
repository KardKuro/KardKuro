// 读 profile.json，生成 assets/terminal.svg —— 一段会自己打字的终端动画。
// 纯 SMIL，不带脚本：GitHub 用 <img> 显示 SVG，脚本不会跑，SMIL 会。
// 用法：node gen.js [profile.json] [out.svg]

const fs = require('fs');
const path = require('path');

const cfgPath = process.argv[2] || path.join(__dirname, 'profile.json');
const outPath = process.argv[3] || path.join(__dirname, 'assets', 'terminal.svg');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const C = {
  bg: '#0d1117', bar: '#161b22', border: '#30363d', title: '#7d8590',
  prompt: '#39c5cf', cmd: '#e6edf3', out: '#a8b1bb',
  key: '#e6edf3', dim: '#7d8590', accent: '#39c5cf', link: '#79c0ff',
};
const FONT = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`;
const FS = 14, CW = 8.4, LH = 22, PADX = 24, BAR = 34, TOP = BAR + 30, CURSOR_W = 8.4;

// 每个字符自己摆 x：不同系统的等宽字体宽度不一样，中文更不一样，
// 自己排版才能让光标永远贴在最后一个字后面。
const isWide = (cp) =>
  (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ||
  (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6);
// 宽度按像素算：汉字给一个字号宽，按两格英文排会显得字字之间漏风
const adv = (ch) => (isWide(ch.codePointAt(0)) ? FS : CW);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
const r2 = (n) => Math.round(n * 100) / 100;

// 固定种子的伪随机：打字节奏有点参差才像人，但每次生成结果一样，diff 才干净
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// —— 第一遍：排时间线和位置 ——
const items = []; // { t, y, segs:[{text,color,col}] } 或逐字 { t, x, y, ch, color }
const cursor = []; // [t, x, y]
let t = 0.5, y = TOP;
const maxW = cfg.width - PADX * 2;

cfg.session.forEach((step, i) => {
  if (i > 0) y += LH; // 段与段之间空一行
  items.push({ t, y, segs: [{ text: '$', color: C.prompt, x: 0 }] });
  let x = 2 * CW;
  cursor.push([t, PADX + x, y]);
  t += i === 0 ? 0.9 : 0.45;

  for (const ch of step.cmd) {
    items.push({ t, x: PADX + x, y, ch, color: C.cmd });
    x += adv(ch);
    cursor.push([t, PADX + x, y]);
    t += 0.055 + rand() * 0.07;
  }
  if (!step.out) return; // 最后一个空命令：停在这里闪光标
  t += 0.35;

  for (const line of step.out) {
    y += LH;
    const segs = [];
    let x = 0;
    for (const [text, kind] of typeof line === 'string' ? [[line, 'out']] : line) {
      segs.push({ text, color: C[kind] || C.out, x });
      for (const ch of text) x += adv(ch);
    }
    if (x > maxW) console.warn(`⚠ 这一行宽 ${r2(x)}px，超过 ${maxW}px 会被裁掉：${segs.map((s) => s.text).join('')}`);
    items.push({ t, y, segs });
    cursor.push([t, PADX, y + LH]);
    t += 0.06;
  }
  y += LH;
  t += 0.5;
});

const HOLD = 4.5;
const D = t + HOLD;
const H = y + 24;
const W = cfg.width;
const k = (s) => (s / D).toFixed(5);

// 出现：0 → 在 t 时刻点亮 → 保持到循环结束（整体淡出由外层 <g> 负责）
const appear = (s) =>
  `<animate attributeName='opacity' dur='${D.toFixed(2)}s' repeatCount='indefinite' values='0;0;1;1' keyTimes='0;${k(s)};${k(s + 0.01)};1'/>`;

const xs = (startX, text) => {
  const out = [];
  let x = startX;
  for (const ch of text) { out.push(r2(PADX + x)); x += adv(ch); }
  return out.join(' ');
};

// —— 第二遍：写 SVG ——
const body = [];
for (const it of items) {
  if (it.ch !== undefined) {
    if (it.ch === ' ') continue; // 空格不用画，位置已经算进去了
    body.push(`<text x='${r2(it.x)}' y='${it.y}' fill='${it.color}' opacity='0'>${appear(it.t)}${esc(it.ch)}</text>`);
  } else {
    const spans = it.segs
      .filter((s) => s.text.trim())
      .map((s) => {
        const lead = s.text.length - s.text.trimStart().length;
        const text = s.text.trim();
        return `<tspan x='${xs(s.x + lead * CW, text)}' fill='${s.color}'>${esc(text)}</tspan>`;
      })
      .join('');
    body.push(`<text y='${it.y}' opacity='0'>${appear(it.t)}${spans}</text>`);
  }
}

const cx = cursor.map((c) => r2(c[1])).join(';');
const cy = cursor.map((c) => c[2] - 13).join(';');
const ckt = cursor.map((c, i) => (i === 0 ? '0' : k(c[0]))).join(';');
const cursorEl =
  `<rect x='${r2(cursor[0][1])}' y='${cursor[0][2] - 13}' width='${CURSOR_W}' height='17' fill='${C.prompt}'>` +
  `<animate attributeName='x' calcMode='discrete' dur='${D.toFixed(2)}s' repeatCount='indefinite' values='${cx}' keyTimes='${ckt}'/>` +
  `<animate attributeName='y' calcMode='discrete' dur='${D.toFixed(2)}s' repeatCount='indefinite' values='${cy}' keyTimes='${ckt}'/>` +
  `<animate attributeName='opacity' calcMode='discrete' dur='1.06s' repeatCount='indefinite' values='1;0' keyTimes='0;0.5'/>` +
  `</rect>`;

const label = '终端会话：' + cfg.session.filter((s) => s.cmd).map((s) => s.cmd).join('、');
const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}' role='img' aria-label='${esc(label)}'>
<title>${esc(label)}</title>
<rect x='0.5' y='0.5' width='${W - 1}' height='${H - 1}' rx='10' fill='${C.bg}' stroke='${C.border}'/>
<path d='M0.5 ${BAR} V10.5 A10 10 0 0 1 10.5 0.5 H${W - 10.5} A10 10 0 0 1 ${W - 0.5} 10.5 V${BAR} Z' fill='${C.bar}'/>
<line x1='0.5' y1='${BAR}' x2='${W - 0.5}' y2='${BAR}' stroke='${C.border}'/>
<circle cx='20' cy='17' r='6' fill='#ff5f57'/><circle cx='40' cy='17' r='6' fill='#febc2e'/><circle cx='60' cy='17' r='6' fill='#28c840'/>
<text x='${W / 2}' y='22' text-anchor='middle' font-family="${FONT}" font-size='12' fill='${C.title}'>${esc(cfg.title)}</text>
<g font-family="${FONT}" font-size='${FS}' xml:space='preserve'>
<animate attributeName='opacity' dur='${D.toFixed(2)}s' repeatCount='indefinite' values='1;1;0' keyTimes='0;${k(D - 0.4)};1'/>
${body.join('\n')}
${cursorEl}
</g>
</svg>
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, svg);
console.log(`写好了 ${outPath}  ${W}×${H}  一轮 ${D.toFixed(1)}s  ${(svg.length / 1024).toFixed(1)} KB`);
