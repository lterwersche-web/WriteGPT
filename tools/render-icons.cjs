// Erzeugt die PNG-Icons aus icons/icon.svg (einmalig ausführen: node tools/render-icons.cjs)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
  // Maskable: Hintergrund ohne runde Ecken (das iPad/Android rundet selbst)
  const maskable = svg.replace(' rx="114"', '');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (markup, size, file) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(root, 'icons', file), omitBackground: true });
  };
  await render(maskable, 180, 'icon-180.png'); // Apple: ohne Transparenz, iOS rundet selbst
  await render(svg, 192, 'icon-192.png');
  await render(svg, 512, 'icon-512.png');
  await render(maskable, 512, 'icon-maskable-512.png');
  await browser.close();
  console.log('Icons erstellt ✓');
})();
