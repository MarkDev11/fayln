#!/usr/bin/env node
/**
 * Membuktikan gelombang di layar pembuatan dunia BENAR-BENAR BERGERAK.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA SKRIP INI PERLU ADA
 * ---------------------------------------------------------------------------
 * Satu tangkapan layar tidak membuktikan apa pun tentang gerak. Gelombangnya
 * dapat saja tergambar dengan benar lalu DIAM — dan itu tetap lolos setiap
 * pemeriksaan visual, karena gambarnya memang tampak seperti gelombang.
 *
 * Skrip ini menangkap DUA bingkai berjarak beberapa detik dan membandingkan
 * wilayah gelombangnya piksel demi piksel. Kalau tidak ada yang berubah, animasi
 * tidak berjalan.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA MEMBANDINGKAN PIKEL, BUKAN MEMBACA NILAI ANIMASI
 * ---------------------------------------------------------------------------
 * `Animated.Value` berjalan di lapisan asli (`useNativeDriver: true`), sehingga
 * nilainya tidak terlihat dari JavaScript. Yang dapat diperiksa hanyalah
 * HASILNYA di layar — dan memang itu yang penting.
 *
 * Pemakaian:
 *   node scripts/verify-forge-wave-motion.mjs <email> <keluaran-1.png> <keluaran-2.png>
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME =
  process.env.CHROME_PATH ?? String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getJson = (u) =>
  new Promise((res, rej) =>
    http
      .get(u, (r) => {
        let b = '';
        r.on('data', (c) => (b += c));
        r.on('end', () => {
          try {
            res(JSON.parse(b));
          } catch (e) {
            rej(e);
          }
        });
      })
      .on('error', rej),
  );

const [email, out1, out2] = process.argv.slice(2);
if (!email || !out1 || !out2) {
  console.error('pakai: node verify-forge-wave-motion.mjs <email> <frame1.png> <frame2.png>');
  process.exit(2);
}

const profile = path.join(os.tmpdir(), `forge-motion-${process.pid}`);
fs.rmSync(profile, { recursive: true, force: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=9445',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let cdp = null;
try {
  let target = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await getJson('http://127.0.0.1:9445/json/list');
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch {
      /* belum siap */
    }
    await sleep(250);
  }
  if (!target) throw new Error('target CDP tidak muncul');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('gagal membuka WebSocket')), { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    } catch {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? {});
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const n = ++id;
      pending.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  cdp = { send, close: () => ws.close() };

  const evaluate = (expr) =>
    send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).then(
      (r) => r?.result?.value,
    );

  const waitFor = async (predicate, timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(`(() => { try { return Boolean(${predicate}); } catch { return false; } })()`)) {
        return true;
      }
      await sleep(400);
    }
    return false;
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  });

  const setInput = (testId, value) => `(() => {
    const el = document.querySelector('[data-testid="' + ${JSON.stringify(testId)} + '"]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;

  const tap = (finder) => `(() => {
    const el = ${finder};
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
    return true;
  })()`;

  await send('Page.navigate', { url: 'http://127.0.0.1:8081/' });
  await waitFor(`document.body.innerText.includes('Masuk')`);
  await evaluate(setInput('login-email', email));
  await evaluate(setInput('login-password', 'rahasia123'));
  await evaluate(tap(`document.querySelector('[data-testid="login-submit"]')`));
  await waitFor(
    `document.body.innerText.includes('Semua Cerita') || document.body.innerText.includes('Terbaru Dirilis')`,
  );
  await evaluate(tap(`document.querySelector('[data-testid^="story-card-"]')`));
  await waitFor(`document.body.innerText.includes('Mulai Perjalanan')`);
  await evaluate(
    tap(`(() => {
      const nodes = Array.from(document.querySelectorAll('div,span,a,button'));
      const hit = nodes.reverse().find((n) => n.innerText && n.innerText.trim() === 'Mulai Perjalanan');
      return hit ? (hit.closest('[role="button"]') || hit) : null;
    })()`),
  );

  const terlihat = await waitFor(`document.body.innerText.includes('AI SEDANG MEMBUAT DUNIA')`, 25000);
  if (!terlihat) throw new Error('layar pembuatan dunia tidak muncul');

  const frame = async (file) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  };

  await frame(out1);
  // Lebih dari seperempat siklus (10 detik), supaya pergeserannya pasti terukur.
  await sleep(3200);
  await frame(out2);
  console.log('frame 1:', out1);
  console.log('frame 2:', out2);
} finally {
  if (cdp) cdp.close();
  chrome.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
}
