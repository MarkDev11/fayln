#!/usr/bin/env node
/**
 * TANGKAP LAYAR PANGGUNG — sekali pakai, untuk menilai komposisi.
 *
 * Menjalankan jalur pengguna yang sesungguhnya (masuk -> pilih cerita -> mulai
 * perjalanan -> adegan) lalu memotret layar pemain pada dua keadaan:
 *   1. saat ada karakter dan teksnya (narasi/ucapan),
 *   2. saat keputusan menunggu pilihan.
 *
 * Memakai API produksi, bukan data contoh: yang ingin dinilai adalah komposisi
 * di atas ASET yang sungguh ada, bukan di atas bidang warna bawaan mock.
 *
 * Pemakaian:
 *   node scripts/shot-stage.mjs --world w_2d6fb908-... --out "$TEMP/stage"
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const API = (process.env.API_URL ?? 'https://fayln-api.marky.blitz.cloud').replace(/\/+$/, '');

function parseArgs(argv) {
  const out = {
    url: 'http://127.0.0.1:8081',
    port: 9466,
    world: 'w_2d6fb908-c27e-4406-a34f-caefd04499c6',
    out: path.join(os.tmpdir(), 'fayln-stage'),
    timeout: 150,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') out.url = next();
    else if (a === '--port') out.port = Number(next());
    else if (a === '--world') out.world = next();
    else if (a === '--out') out.out = next();
    else if (a === '--timeout') out.timeout = Number(next());
  }
  return out;
}

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
  if (!target) throw new Error(`target CDP tidak muncul di port ${port}`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('gagal membuka WebSocket CDP')), {
      once: true,
    });
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
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
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

const SET_INPUT = (testId, placeholder, value) => `(() => {
  const byId = document.querySelector('[data-testid="' + ${JSON.stringify(testId)} + '"]');
  const el = byId || Array.from(document.querySelectorAll('input')).find((n) => n.placeholder === ${JSON.stringify(placeholder)});
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const CLICK_BY_TESTID = (testId) => `(() => {
  const el = document.querySelector('[data-testid="' + ${JSON.stringify(testId)} + '"]');
  if (!el) return false;
  const target = el.closest('[role="button"]') || el;
  const r = target.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  target.dispatchEvent(new PointerEvent('pointerdown', o));
  target.dispatchEvent(new MouseEvent('mousedown', o));
  target.dispatchEvent(new PointerEvent('pointerup', o));
  target.dispatchEvent(new MouseEvent('mouseup', o));
  target.dispatchEvent(new MouseEvent('click', o));
  return true;
})()`;

const CLICK_BY_TEXT = (text) => `(() => {
  const wanted = ${JSON.stringify(text)};
  const nodes = Array.from(document.querySelectorAll('div,span,a,button'));
  const hit = nodes.reverse().find((n) => n.innerText && n.innerText.trim() === wanted);
  if (!hit) return false;
  const target = hit.closest('[role="button"]') || hit;
  const r = target.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  target.dispatchEvent(new PointerEvent('pointerdown', o));
  target.dispatchEvent(new MouseEvent('mousedown', o));
  target.dispatchEvent(new PointerEvent('pointerup', o));
  target.dispatchEvent(new MouseEvent('mouseup', o));
  target.dispatchEvent(new MouseEvent('click', o));
  return true;
})()`;

const KETUK_MAJU = `(() => {
  const el = document.querySelector('[data-testid="player-dialogue"]');
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

const ADA_PILIHAN = `Array.from(document.querySelectorAll('[role="button"]')).some((b) => (b.getAttribute('aria-label')||'').startsWith('Pilihan 1.'))`;

/** Keadaan yang dibaca untuk laporan. */
const BACA = `(() => {
  const panggung = document.querySelector('[data-testid="player-stage"]');
  const gambar = panggung ? Array.from(panggung.querySelectorAll('img')) : [];
  const dialog = document.querySelector('[data-testid="player-dialogue"]');
  const hud = document.querySelector('[data-testid="player-hud"]');
  const nav = document.querySelector('[data-testid="player-nav"]');
  const scrim = document.querySelector('[data-testid="stage-scrim-bottom"]');
  return {
    url: location.pathname,
    jumlahGambar: gambar.length,
    lebarPanggung: panggung ? Math.round(panggung.getBoundingClientRect().width) : 0,
    tinggiPanggung: panggung ? Math.round(panggung.getBoundingClientRect().height) : 0,
    adaHud: Boolean(hud),
    adaNav: Boolean(nav),
    adaScrim: Boolean(scrim),
    scrimTinggi: scrim ? Math.round(scrim.getBoundingClientRect().height) : 0,
    dialogLatar: dialog ? getComputedStyle(dialog).backgroundColor : null,
    dialogAtas: dialog ? Math.round(dialog.getBoundingClientRect().top) : null,
    teksDialog: dialog ? (dialog.innerText || '').trim().slice(0, 120) : '',
    teksHud: hud ? (hud.innerText || '').trim().replace(/\\n/g, ' / ') : '',
  };
})()`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome tidak ditemukan di: ${CHROME}`);
    process.exit(2);
  }
  fs.mkdirSync(opts.out, { recursive: true });

  const stamp = Math.floor(Date.now() / 1000);
  const email = `shot${stamp}@contoh.test`;
  const sandi = 'rahasia12345';

  const reg = await fetch(`${API}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: sandi, displayName: 'Arfan', age: 24 }),
  });
  if (!reg.ok) throw new Error(`registrasi gagal: HTTP ${reg.status}`);
  const { token } = await reg.json();

  const profil = await fetch(`${API}/v1/worlds/${opts.world}`).then((r) => r.json());
  console.log(`dunia: "${profil.title}"`);
  console.log(`latar: ${(profil.assetManifest?.backgrounds || []).length}`);
  console.log(`potret: ${(profil.assetManifest?.portraits || []).length}`);

  const profileDir = path.join(os.tmpdir(), `fayln-shot-${process.pid}`);
  fs.rmSync(profileDir, { recursive: true, force: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${opts.port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  const potret = async (nama) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const berkas = path.join(opts.out, `${nama}.png`);
    fs.writeFileSync(berkas, Buffer.from(r.data, 'base64'));
    console.log(`  -> ${berkas}`);
    return berkas;
  };

  try {
    cdp = await connect(opts.port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    await cdp.send('Page.navigate', { url: `${opts.url}/login` });
    const adaForm = await waitFor(
      cdp,
      `document.querySelector('[data-testid="login-email"]') !== null`,
      { timeoutMs: 60000, every: 700 },
    );
    if (!adaForm) throw new Error('form Masuk tidak muncul');
    await sleep(2500);

    await evaluate(cdp, SET_INPUT('login-email', 'nama@contoh.com', email));
    await evaluate(cdp, SET_INPUT('login-password', 'Minimal 8 karakter', sandi));
    await evaluate(cdp, CLICK_BY_TESTID('login-submit'));

    const masuk = await waitFor(
      cdp,
      `document.querySelector('[data-testid="login-email"]') === null`,
      { timeoutMs: 45000, every: 700 },
    );
    console.log(`1. masuk: ${masuk ? 'OK' : 'GAGAL'}`);

    const adaKartu = await waitFor(
      cdp,
      `document.querySelector('[data-testid="story-card-${opts.world}"]') !== null`,
      { timeoutMs: 45000, every: 700 },
    );
    if (!adaKartu) throw new Error('kartu cerita tidak muncul');
    await evaluate(cdp, CLICK_BY_TESTID(`story-card-${opts.world}`));

    await waitFor(cdp, `location.pathname.startsWith('/world/')`, { timeoutMs: 30000, every: 600 });
    await waitFor(cdp, `document.body.innerText.includes('Mulai Perjalanan')`, {
      timeoutMs: 30000,
      every: 600,
    });
    await evaluate(cdp, CLICK_BY_TEXT('Mulai Perjalanan'));
    await sleep(1500);

    const lembar = await waitFor(cdp, `document.body.innerText.includes('Buat & mulai')`, {
      timeoutMs: 8000,
      every: 400,
    });
    if (lembar) {
      await evaluate(cdp, SET_INPUT('persona-name', 'Nama yang dipakai di cerita', 'Arfan'));
      await evaluate(cdp, SET_INPUT('persona-age', 'Contoh: 24', '24'));
      await evaluate(cdp, CLICK_BY_TEXT('Buat & mulai'));
    }
    console.log(`2. mulai perjalanan: ${lembar ? 'lembar persona diisi' : 'profil lengkap'}`);

    const adegan = await waitFor(cdp, `location.pathname.startsWith('/player/')`, {
      timeoutMs: opts.timeout * 1000,
      every: 1000,
    });
    if (!adegan) throw new Error('layar pemain tidak muncul');
    console.log('3. adegan pertama muncul');
    await sleep(3000);

    /* Potret keadaan awal. */
    console.log(JSON.stringify(await evaluate(cdp, BACA), null, 1));
    await potret('01-pembuka');

    /*
     * Maju sampai kalimat pertama yang berasal dari TOKOH.
     *
     * Ucapan tokoh dapat dikenali dari DOM-nya: selain kalimat dan petunjuk
     * "Ketuk untuk lanjut", ada baris NAMA pembicara di atasnya — tiga baris,
     * sedangkan narasi hanya dua. Itulah yang membedakan `say` dari `narrate`
     * tanpa perlu membuka state mesin.
     */
    let sudahKarakter = false;
    for (let i = 0; i < 60; i += 1) {
      const ada = await evaluate(cdp, ADA_PILIHAN);
      if (ada) break;

      const gambar = await evaluate(
        cdp,
        `(() => { const p = document.querySelector('[data-testid="player-stage"]'); return p ? p.querySelectorAll('img').length : 0; })()`,
      );
      const baris = await evaluate(
        cdp,
        `(() => { const d = document.querySelector('[data-testid="player-dialogue"]'); return d ? (d.innerText || '').trim().split('\\n').filter(Boolean).length : 0; })()`,
      );

      if (!sudahKarakter && gambar >= 2) {
        sudahKarakter = true;
        await sleep(1200);
        console.log('   potret tokoh tampil:');
        console.log(JSON.stringify(await evaluate(cdp, BACA), null, 1));
        await potret('02-karakter');
      }

      if (sudahKarakter && baris >= 3) {
        await sleep(1200);
        console.log('   ucapan tokoh (nama + kalimat):');
        console.log(JSON.stringify(await evaluate(cdp, BACA), null, 1));
        await potret('03-ucapan');
        break;
      }

      await evaluate(cdp, KETUK_MAJU);
      await sleep(300);
    }

    /* Maju sampai keputusan muncul. */
    for (let i = 0; i < 80; i += 1) {
      const ada = await evaluate(cdp, ADA_PILIHAN);
      if (ada) break;
      await evaluate(cdp, KETUK_MAJU);
      await sleep(280);
    }
    await sleep(900);
    console.log(JSON.stringify(await evaluate(cdp, BACA), null, 1));
    await potret('04-keputusan');

    /*
     * Nyalakan Auto, lalu potret.
     *
     * Dua hal yang dibuktikan sekaligus: (a) Auto DAPAT dinyalakan saat keputusan
     * sedang menunggu — bentuk lamanya menolak, dan tombolnya diam tanpa
     * penjelasan; (b) pengatur jeda muncul saat Auto menyala, yang sebelumnya
     * tidak ada sama sekali.
     */
    await evaluate(cdp, CLICK_BY_TESTID('player-hud-auto'));
    await sleep(900);
    const adaJeda = await evaluate(cdp, `document.querySelector('[data-testid="player-auto-delay"]') !== null`);
    const chip = await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('[data-testid^="auto-delay-"]')).map((n) => (n.innerText || '').trim())`,
    );
    console.log(`   Auto menyala, pengatur jeda tampil: ${String(adaJeda)}, chip: ${JSON.stringify(chip)}`);
    await potret('05-auto-jeda');

    console.log(`token: ${token.slice(0, 8)}…`);
  } finally {
    cdp?.close();
    chrome.kill();
    await sleep(400);
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`GAGAL: ${err.message}`);
  process.exitCode = 1;
});
