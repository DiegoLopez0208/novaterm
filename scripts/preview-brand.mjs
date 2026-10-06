import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const concepts = [
  ['geometric', '01 / GEOMETRIC', 'Custom N + cursor', 'A quiet, recognizable monogram.'],
  ['retro', '02 / RETRO', 'Pixel prompt', 'A direct nod to early terminals.'],
  ['industrial', '03 / INDUSTRIAL', 'Cut prompt', 'A bold command-line silhouette.'],
];
const cards = concepts.map(([name, label, title, description], index) => {
  const svg = readFileSync(`assets/brand/${name}.svg`, 'utf8');
  const symbol = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
  const x = 32 + index * 380;
  const miniature = [16, 24, 32, 64].map((size, position) => `<svg x="${x + 28 + position * 74}" y="434" width="${size}" height="${size}" viewBox="0 0 512 512">${symbol}</svg>`).join('');
  return `<rect x="${x}" y="112" width="356" height="440" rx="16" fill="#ffffff" stroke="#d6d8d0"/>
    <text x="${x + 28}" y="149" class="label">${label}</text>
    <svg x="${x + 82}" y="180" width="192" height="192" viewBox="0 0 512 512">${symbol}</svg>
    <text x="${x + 28}" y="408" class="title">${title}</text>${miniature}
    <text x="${x + 28}" y="530" class="description">${description}</text>`;
}).join('');
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="612" viewBox="0 0 1200 612">
  <style>text{font-family:Segoe UI,Arial,sans-serif;fill:#15191d}.label{font-size:11px;letter-spacing:2px;fill:#626a60}.title{font-size:20px;font-weight:600}.description{font-size:12px;fill:#626a60}</style>
  <rect width="1200" height="612" fill="#f0f1e9"/>
  <text x="32" y="51" font-size="26" font-weight="600">NovaTerm / mark exploration</text>
  <text x="32" y="80" class="description">Flat geometry. Three directions. Native SVG, shown at app-icon and taskbar sizes.</text>
  ${cards}
  <text x="32" y="589" class="description">16 · 24 · 32 · 64 px / all artwork uses filled paths on a shared 512-unit grid.</text>
</svg>`;
writeFileSync('assets/brand/proposals.svg', board);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 612 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0">${board}</body></html>`);
  await page.screenshot({ path: 'assets/brand/proposals.png' });
} finally { await browser.close(); }
console.log('Saved assets/brand/proposals.svg and proposals.png');
