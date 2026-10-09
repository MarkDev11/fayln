#!/usr/bin/env node
/**
 * Membuktikan keadaan "Menyusun cerita…" benar-benar MUNCUL di layar.
 *
 * Mengapa bukan uji unit saja: uji unit memanggil `StartJourneySheet` dengan
 * `submitting` yang dipasang tangan. Itu membuktikan komponennya bereaksi,
 * tetapi TIDAK membuktikan bahwa layar dunia benar-benar pernah memasangnya —
 * dan justru di situ kesalahan yang mungkin terjadi (`creating` yang salah nama,
 * label tombol yang tidak pernah berubah).
 *
 * Skrip ini menjalankan jalur sungguhan: masuk, buka dunia terbit, tekan
 * "Mulai Perjalanan", lalu memantau DOM selama pembuatan berjalan. Pembuatan
 * memakan 19–24 detik, jadi keadaannya pasti sempat tertangkap.
 *
 * Tidak ada dependensi: memakai `WebSocket` bawaan Node 22 dan CDP.
 *
 * Pemakaian:
 *   node scripts/verify-creating-state.mjs
 *   node scripts/verify-creating-state.mjs --email a@b.com --password rahasia123
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function parseArgs(argv) {
  const out = {
    url: 'http://127.0.0.1:8081/',
    port: 9333,
    timeout: 60,
    email: null,
    password: null,
    shot: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') out.url = next();
    else if (a === '--port') out.port = Number(next());
    else if (a === '--timeout') out.timeout = Number(next());
    else if (a === '--email') out.email = next();
    else if (a === '--password') out.password = next();
    else if (a === '--shot') out.shot = next();
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
      /* endpoint belum siap */
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

/** Menjalankan potongan kode di halaman dan mengembalikan nilainya. */
async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return r?.result?.value;
}

/** Menunggu sampai `predicate` (kode JS) bernilai benar. */
async function waitFor(cdp, predicate, { timeoutMs = 30000, every = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await evaluate(cdp, `(() => { try { return Boolean(${predicate}); } catch { return false; } })()`);
    if (v) return true;
    await sleep(every);
  }
  return false;
}

/** Mengisi input lewat teks placeholder yang tampak. */
const setInputByPlaceholder = (placeholder, value) => `(() => {
  const el = Array.from(document.querySelectorAll('input')).find((n) => n.placeholder === ${JSON.stringify(placeholder)});
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

/** Menekan elemen ber-`data-testid` tertentu. */
const CLICK_BY_TESTID = (testId) => `(() => {
  const el = document.querySelector('[data-testid="' + ${JSON.stringify(testId)} + '"]');
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

/** Menemukan elemen lewat teks yang tampak, lalu menekannya. */
const CLICK_BY_TEXT = (text) => `(() => {
  const wanted = ${JSON.stringify(text)};
  const nodes = Array.from(document.querySelectorAll('div,span,a,button'));
  const hit = nodes.reverse().find((n) => n.innerText && n.innerText.trim() === wanted);
  if (!hit) return false;
  const target = hit.closest('[role="button"]') || hit;
  const r = target.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  target.dispatchEvent(new PointerEvent('pointerdown', opts));
  target.dispatchEvent(new MouseEvent('mousedown', opts));
  target.dispatchEvent(new PointerEvent('pointerup', opts));
  target.dispatchEvent(new MouseEvent('mouseup', opts));
  target.dispatchEvent(new MouseEvent('click', opts));
  return true;
})()`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome tidak ditemukan di: ${CHROME}\nSet CHROME_PATH bila lokasinya berbeda.`);
    process.exit(2);
  }
  if (!opts.email || !opts.password) {
    console.error('Perlu --email dan --password akun uji.');
    process.exit(2);
  }

  const profile = path.join(os.tmpdir(), `fayln-creating-${process.pid}`);
  fs.rmSync(profile, { recursive: true, force: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${opts.port}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp = null;
  let failures = 0;
  const check = (ok, label) => {
    console.log(`  ${ok ? 'OK  ' : 'MISS'} ${label}`);
    if (!ok) failures += 1;
  };

  try {
    cdp = await connect(opts.port);
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 900,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'light' }],
    });

    console.log(`--- ${opts.url} ---`);
    await cdp.send('Page.navigate', { url: opts.url });

    // 1. Gerbang sesi mengantar ke layar Masuk.
    const atLogin = await waitFor(cdp, `document.body.innerText.includes('Masuk')`, {
      timeoutMs: opts.timeout * 1000,
    });
    check(atLogin, 'gerbang sesi mengantar ke layar Masuk');
    if (!atLogin) throw new Error('layar Masuk tidak pernah muncul');

    /*
     * Elemen dicari lewat `data-testid`, bukan lewat `aria-label`.
     *
     * Terukur di DOM (lihat scripts/probe-login-dom.mjs): input pada
     * react-native-web TIDAK mendapat `aria-label`, karena `accessibilityLabel`
     * di situ menjadi teks label di sebelahnya, bukan atribut pada inputnya.
     * testID-nya ADA dan stabil, jadi itu yang dipakai.
     */
    const setInput = (testId, value) => `(() => {
      const el = document.querySelector('[data-testid="' + ${JSON.stringify(testId)} + '"]');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`;

    const emailSet = await evaluate(cdp, setInput('login-email', opts.email));
    const passSet = await evaluate(cdp, setInput('login-password', opts.password));
    check(emailSet && passSet, 'mengisi email dan kata sandi');

    await evaluate(cdp, CLICK_BY_TESTID('login-submit'));
    const loggedIn = await waitFor(
      cdp,
      `document.body.innerText.includes('Semua Cerita') || document.body.innerText.includes('Terbaru Dirilis')`,
      { timeoutMs: 30000 },
    );
    check(loggedIn, 'berhasil masuk sampai Beranda');
    if (!loggedIn) {
      console.log('Cuplikan DOM:\n' + String(await evaluate(cdp, 'document.body.innerText')).slice(0, 400));
      throw new Error('tidak sampai Beranda setelah masuk');
    }

    /*
     * Membuka dunia lewat KARTU KATALOG, bukan lewat pil "Mulai" di hero.
     *
     * Terukur di `HeroCard.tsx`: pil "Mulai" itu PENANDA VISUAL, bukan kontrol —
     * yang dapat ditekan adalah seluruh kartunya, dan testID-nya
     * `hero-<worldId>`. Pil itu juga tidak selalu berbunyi "Mulai"; ia berbunyi
     * "Lanjutkan" begitu dunia itu punya perjalanan. Kartu katalog stabil:
     * `story-card-<worldId>` selalu dapat ditekan.
     */
    const openedWorld = await evaluate(cdp, `(() => {
      const card = document.querySelector('[data-testid^="story-card-"]');
      if (!card) return false;
      const r = card.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      card.dispatchEvent(new PointerEvent('pointerdown', o));
      card.dispatchEvent(new MouseEvent('mousedown', o));
      card.dispatchEvent(new PointerEvent('pointerup', o));
      card.dispatchEvent(new MouseEvent('mouseup', o));
      card.dispatchEvent(new MouseEvent('click', o));
      return true;
    })()`);
    check(openedWorld, 'membuka dunia dari kartu katalog');
    if (!openedWorld) throw new Error('kartu katalog tidak ditemukan');

    // 4. Layar dunia siap.
    const atWorld = await waitFor(cdp, `document.body.innerText.includes('Mulai Perjalanan')`, {
      timeoutMs: 20000,
    });
    check(atWorld, 'layar dunia siap dengan tombol Mulai Perjalanan');
    if (!atWorld) throw new Error('layar dunia tidak siap');

    // 5. Isi lembar persona bila muncul, lalu tekan mulai.
    /*
     * Lembar persona hanya muncul bila profil belum lengkap — akun yang baru
     * dibuat selalu begitu. Tanpa mengisinya, `Buat & mulai` ditolak oleh
     * validasi dan permintaannya TIDAK PERNAH berangkat, sehingga keadaan
     * "menyusun cerita" wajar-wajar saja tidak muncul. Itu pelajaran dari
     * percobaan pertama: yang gagal bukan umpan baliknya, melainkan jalannya.
     */
    const sheetUp = await waitFor(cdp, `document.body.innerText.includes('Mulai perjalanan')`, {
      timeoutMs: 8000,
      every: 300,
    });

    if (sheetUp) {
      const nameSet = await evaluate(cdp, setInputByPlaceholder('Nama yang dipakai di cerita', 'Verifikator'));
      const ageSet = await evaluate(cdp, setInputByPlaceholder('Contoh: 24', '24'));
      check(nameSet && ageSet, 'mengisi lembar persona');
      await evaluate(cdp, CLICK_BY_TEXT('Buat & mulai'));
    } else {
      console.log('  OK   profil sudah lengkap — lembar persona dilewati');
      await evaluate(cdp, CLICK_BY_TEXT('Mulai Perjalanan'));
    }

    /*
     * Pemantauan ini inti skripnya. Yang dicari BUKAN "teksnya ada di bundel",
     * melainkan "layar pembuatan dunia benar-benar tampil di DOM saat pekerjaan
     * berjalan".
     *
     * Sejak perubahan ini, seluruh halaman dunia DIGANTIKAN oleh layar penuh
     * beranimasi gelombang. Karena itu yang diperiksa bukan lagi label tombol,
     * melainkan bahwa (a) pesan pembuatannya tampil, dan (b) sisa halaman dunia
     * SUDAH TIDAK ADA — kalau keduanya terlihat sekaligus, layarnya hanya
     * ditumpuk, bukan digantikan.
     */
    let sawForgeTitle = false;
    let sawForgeHint = false;
    let halamanLamaTersisa = false;
    const started = Date.now();
    while (Date.now() - started < 60000) {
      const text = String(await evaluate(cdp, 'document.body.innerText'));
      if (text.includes('AI SEDANG MEMBUAT DUNIA')) {
        sawForgeTitle = true;
        // Selama layar pembuatan tampil, judul bagian halaman dunia tidak boleh
        // ikut terlihat.
        if (text.includes('Sinopsis') || text.includes('Tokoh') === true) {
          halamanLamaTersisa = true;
        }
      }
      if (text.includes('Adegan pembuka disusun dari nol')) sawForgeHint = true;
      // Selesai: sudah pindah ke pemain.
      if (/Adegan|Bab|Pilihan/.test(text) && !text.includes('AI SEDANG MEMBUAT DUNIA')) break;
      await sleep(400);
    }
    const elapsed = Math.round((Date.now() - started) / 1000);

    check(sawForgeTitle, `layar "AI SEDANG MEMBUAT DUNIA" terlihat (dalam ${elapsed}s)`);
    check(sawForgeHint, 'keterangan prosesnya terlihat');
    check(!halamanLamaTersisa, 'halaman dunia benar-benar digantikan, bukan ditumpuk');
    check(elapsed >= 20, `jendela pembuatan cukup lebar untuk terlihat (${elapsed}s)`);

    if (opts.shot) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(opts.shot, Buffer.from(shot.data, 'base64'));
      console.log(`  screenshot: ${opts.shot}`);
    }

    if (failures > 0) {
      console.log(`\nHASIL: GAGAL — ${failures} pemeriksaan tidak terpenuhi.`);
      console.log('Cuplikan DOM:\n' + String(await evaluate(cdp, 'document.body.innerText')).slice(0, 800));
      process.exitCode = 1;
    } else {
      console.log('\nHASIL: OK — layar pembuatan dunia terbukti muncul di layar.');
    }
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
