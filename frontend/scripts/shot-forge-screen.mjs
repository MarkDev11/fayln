#!/usr/bin/env node
/**
 * Menangkap layar "AI SEDANG MEMBUAT DUNIA" selagi benar-benar tampil.
 *
 * Skrip ini HANYA untuk pengambilan bukti visual. Pemeriksaan kelulusannya ada
 * di scripts/verify-creating-state.mjs; berkas ini tidak menggantikannya,
 * melainkan melengkapinya dengan gambar.
 *
 * Jalankan akun yang BELUM punya perjalanan di w dunia tersebut; kalau tidak,
 * pembuatannya ditolak CONFLICT dan layar pembuatan tidak pernah muncul.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME = process.env.CHROME_PATH ?? String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
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

const email = process.argv[2];
const outPath = process.argv[3];
if (!email || !outPath) {
  console.error('pakai: node shot-forge-screen.mjs <email> <keluaran.png>');
  process.exit(2);
}

const profile = path.join(os.tmpdir(), `forge-shot-${process.pid}`);
fs.rmSync(profile, { recursive: true, force: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=9444',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let cdp = null;
try {
  let target = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await getJson('http://127.0.0.1:9444/json/list');
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

  const tap = (opts) => `(() => {
    const r = ${opts};
    if (!r) return false;
    const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    r.el.dispatchEvent(new PointerEvent('pointerdown', o));
    r.el.dispatchEvent(new MouseEvent('mousedown', o));
    r.el.dispatchEvent(new PointerEvent('pointerup', o));
    r.el.dispatchEvent(new MouseEvent('mouseup', o));
    r.el.dispatchEvent(new MouseEvent('click', o));
    return true;
  })()`;

  const tapTestId = (testId) =>
    evaluate(
      tap(`(() => {
        const el = document.querySelector('[data-testid="' + ${JSON.stringify(testId)} + '"]');
        return el ? { el, ...el.getBoundingClientRect().toJSON() } : null;
      })()`),
    );

  const tapText = (text) =>
    evaluate(
      tap(`(() => {
        const wanted = ${JSON.stringify(text)};
        const nodes = Array.from(document.querySelectorAll('div,span,a,button'));
        const hit = nodes.reverse().find((n) => n.innerText && n.innerText.trim() === wanted);
        if (!hit) return null;
        const el = hit.closest('[role="button"]') || hit;
        return { el, ...el.getBoundingClientRect().toJSON() };
      })()`),
    );

  const setInput = (testId, value) => `(() => {
    const el = document.querySelector('[data-testid="' + ${JSON.stringify(testId)} + '"]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  });

  await send('Page.navigate', { url: 'http://127.0.0.1:8081/' });
  await waitFor(`document.body.innerText.includes('Masuk')`);
  await evaluate(setInput('login-email', email));
  await evaluate(setInput('login-password', 'rahasia123'));
  await tapTestId('login-submit');
  await waitFor(
    `document.body.innerText.includes('Semua Cerita') || document.body.innerText.includes('Terbaru Dirilis')`,
  );

  await evaluate(
    `(() => {
      const c = document.querySelector('[data-testid^="story-card-"]');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      c.dispatchEvent(new PointerEvent('pointerdown', o));
      c.dispatchEvent(new MouseEvent('mousedown', o));
      c.dispatchEvent(new PointerEvent('pointerup', o));
      c.dispatchEvent(new MouseEvent('mouseup', o));
      c.dispatchEvent(new MouseEvent('click', o));
      return true;
    })()`,
  );
  await waitFor(`document.body.innerText.includes('Mulai Perjalanan')`);
  await tapText('Mulai Perjalanan');

  const terlihat = await waitFor(`document.body.innerText.includes('AI SEDANG MEMBUAT DUNIA')`, 25000);
  console.log('FORGE_VISIBLE =', terlihat);
  if (!terlihat) {
    console.log('Cuplikan DOM:\n' + String(await evaluate('document.body.innerText')).slice(0, 400));
  }

  // Beri waktu gelombangnya bergerak sedikit sebelum ditangkap.
  await sleep(1500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log('shot:', outPath);

  /*
   * Bila diminta, tunggu sampai adegan pertama siap lalu tangkap layar pemain.
   *
   * Pembuatannya 27-89 detik, jadi batasnya jauh lebih longgar daripada langkah
   * lain di skrip ini.
   */
  if (process.argv[4]) {
    const kePemain = await waitFor(
      `document.body.innerText.includes('Ketuk untuk lanjut') ||
       document.body.innerText.includes('Auto')`,
      120000,
    );
    console.log('PLAYER_VISIBLE =', kePemain);
    // Beri waktu potret dan latar selesai dimuat.
    await sleep(2500);
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(process.argv[4], Buffer.from(shot2.data, 'base64'));
    console.log('shot pemain:', process.argv[4]);
  }
} finally {
  if (cdp) cdp.close();
  chrome.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
}
