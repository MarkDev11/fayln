#!/usr/bin/env node
/**
 * Menangkap layar halaman "Perjalanan" dan halaman detail perjalanan.
 *
 * Dipakai untuk membuktikan sampul benar-benar TAMPIL, bukan sekadar "DTO-nya
 * berisi coverUri". Perbedaan keduanya nyata: sebelumnya DTO juga "berisi"
 * sesuatu (`coverAssetId`) dan tidak ada satu pun galat yang muncul.
 *
 * Pemakaian:
 *   node scripts/shot-journey-images.mjs
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const API = process.env.API_URL ?? 'https://fayln-api.marky.blitz.cloud';
const URL_APP = process.env.APP_URL ?? 'http://127.0.0.1:8081';
const KELUARAN = process.env.OUT_DIR ?? path.join(process.cwd(), '..', '..', '.workbuddy-ai', 'artifacts');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getJson = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });

async function connect(port) {
  let target = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await getJson(`http://127.0.0.1:${port}/json/list`);
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch {
      /* belum siap */
    }
    await sleep(250);
  }
  if (!target) throw new Error('target CDP tidak muncul');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket CDP gagal')), { once: true });
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
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  return { send, close: () => ws.close() };
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
}

async function waitFor(cdp, predicate, { timeoutMs = 30000, every = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await evaluate(
      cdp,
      `(() => { try { return Boolean(${predicate}); } catch { return false; } })()`,
    );
    if (v) return true;
    await sleep(every);
  }
  return false;
}

/** Menghitung berapa gambar yang BENAR-BENAR termuat (naturalWidth > 0). */
const HITUNG_GAMBAR = `(() => {
  const imgs = Array.from(document.querySelectorAll('img'));
  return {
    total: imgs.length,
    termuat: imgs.filter((i) => i.naturalWidth > 0).length,
    contoh: imgs.map((i) => (i.currentSrc || i.src || '').slice(0, 90)).filter(Boolean).slice(0, 3),
  };
})()`;

async function main() {
  const port = 9455;
  const stamp = Date.now();
  const email = `shot${stamp}@contoh.test`;

  console.log(`\n=== TANGKAP LAYAR SAMPUL PERJALANAN ===`);
  console.log(`API: ${API}\nAPP: ${URL_APP}`);

  const reg = await fetch(`${API}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'rahasia12345', displayName: 'Uji Sampul', age: null }),
  });
  const token = (await reg.json())?.token;
  if (!token) throw new Error('registrasi gagal');

  const buat = await fetch(`${API}/v1/journeys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `shot${stamp}0000`,
      worldId: 'w_bosku-mantan',
      persona: { name: 'Arfan', age: 24 },
      responseLocale: 'id-ID',
    }),
  });
  const journeyId = (await buat.json())?.journeyId;
  if (!journeyId) throw new Error('perjalanan gagal dibuat');
  console.log(`journey: ${journeyId}`);

  fs.mkdirSync(KELUARAN, { recursive: true });

  const profile = path.join(os.tmpdir(), `fayln-shot-${process.pid}`);
  fs.rmSync(profile, { recursive: true, force: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=430,932',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp = null;
  try {
    cdp = await connect(port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 430,
      height: 932,
      deviceScaleFactor: 2,
      mobile: true,
    });

    // Pasang token, lalu buka halaman Perjalanan.
    await cdp.send('Page.navigate', { url: `${URL_APP}/` });
    await waitFor(cdp, `document.readyState === 'complete'`, { timeoutMs: 30000 });
    await evaluate(cdp, `localStorage.setItem('fayln.sessionToken', ${JSON.stringify(token)}); true`);

    await cdp.send('Page.navigate', { url: `${URL_APP}/journey` });
    await waitFor(cdp, `document.body.innerText.includes('Perjalanan')`, { timeoutMs: 40000 });
    // Beri waktu gambar benar-benar selesai dimuat.
    await sleep(4000);

    const daftar = await evaluate(cdp, HITUNG_GAMBAR);
    console.log(`\nHALAMAN PERJALANAN  -> gambar total=${daftar.total}, termuat=${daftar.termuat}`);
    for (const c of daftar.contoh) console.log(`   ${c}`);

    let shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const p1 = path.join(KELUARAN, 'perjalanan-daftar.png');
    fs.writeFileSync(p1, Buffer.from(shot.data, 'base64'));
    console.log(`   disimpan: ${p1}`);

    // Halaman detail perjalanan.
    await cdp.send('Page.navigate', { url: `${URL_APP}/journey/${journeyId}` });
    await waitFor(cdp, `document.body.innerText.includes('Mulai Perjalanan') || document.body.innerText.includes('Lanjutkan')`, {
      timeoutMs: 40000,
    });
    await sleep(4000);

    const detail = await evaluate(cdp, HITUNG_GAMBAR);
    console.log(`\nHALAMAN DETAIL      -> gambar total=${detail.total}, termuat=${detail.termuat}`);
    for (const c of detail.contoh) console.log(`   ${c}`);

    shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const p2 = path.join(KELUARAN, 'perjalanan-detail.png');
    fs.writeFileSync(p2, Buffer.from(shot.data, 'base64'));
    console.log(`   disimpan: ${p2}`);

    const lulus = daftar.termuat > 0 && detail.termuat > 0;
    console.log(`\nHASIL: ${lulus ? 'OK — sampul benar-benar TAMPIL di kedua halaman' : 'GAGAL — ada halaman yang tidak memuat gambar'}`);
    if (!lulus) process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(2);
});
