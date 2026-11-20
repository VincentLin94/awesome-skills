/* 无头 WebGL 验收（原生版 / Blender 版通用）
 * 准备：cd <临时目录> && npm i playwright-core && npx playwright install chromium   （缓存在 ~/Library/Caches/ms-playwright）
 * 用法：node verify-web.js <index.html> <输出前缀> [房间id:时段 ...] [plan]
 *   例：node verify-web.js ./index.html /tmp/check living:dusk kitchen:day master:night plan
 * 输出：<前缀>_<房间>_<时段>.png、性能（draw call / 三角面 / fps）、页面报错；有报错时退出码 1
 * 原生版依赖 window.NATIVE 暴露的 setMode / goRoom / setView / info；Blender 版只截首屏。
 */
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const path = require('path');
(async () => {
  const [html, out, ...specs] = process.argv.slice(2);
  if (!html || !out) { console.log('usage: node verify-web.js <index.html> <out_prefix> [room:mode ...] [plan]'); process.exit(2); }
  const exe = execSync("ls -d ~/Library/Caches/ms-playwright/chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium 2>/dev/null | head -1", { shell: '/bin/bash' }).toString().trim();
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' @ ' + ((e.stack || '').split('\n')[1] || '').trim()));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 240)); });
  const t0 = Date.now();
  await page.goto('file://' + path.resolve(html), { waitUntil: 'load' });
  const native = await page.waitForFunction(() => window.NATIVE, null, { timeout: 30000 }).then(() => true).catch(() => false);
  console.log('load ms', Date.now() - t0, native ? '(native)' : '(no window.NATIVE, 等 12s 截首屏)');
  if (!native) { await page.waitForTimeout(12000); await page.screenshot({ path: out + '.png' }); }
  else {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out + '_start.png' });
    for (const s of specs) {
      if (s === 'plan') { await page.evaluate(() => window.NATIVE.setView('plan')); await page.waitForTimeout(1600); await page.screenshot({ path: out + '_plan.png' }); continue; }
      const [room, mode] = s.split(':');
      await page.evaluate(([r, m]) => { if (m) window.NATIVE.setMode(m); window.NATIVE.goRoom(r, true); }, [room, mode]);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${out}_${room}_${mode || 'cur'}.png` });
    }
    const perf = await page.evaluate(() => { const i = window.NATIVE.info(); return { calls: i.render.calls, tris: i.render.triangles, programs: i.programs.length, fps: Math.round(window.NATIVE.fps || 0) }; });
    console.log('perf', JSON.stringify(perf));
  }
  console.log('page errors:', JSON.stringify(errs));
  await browser.close();
  if (errs.length) process.exit(1);
})();
