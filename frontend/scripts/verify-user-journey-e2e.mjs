#!/usr/bin/env node
/**
 * UJI ALUR PENGGUNA UTUH — dari "Mulai Perjalanan" sampai beberapa giliran.
 *
 * Mengapa skrip ini ada: uji lain memotong jalurnya.
 *   - `verify-journey-flow-5x.mjs` menembak API langsung; ia membuktikan MESIN-nya
 *     benar, bukan bahwa PENGGUNA melihatnya.
 *   - `verify-creating-state.mjs` berhenti di layar "AI SEDANG MEMBUAT DUNIA".
 *   - `repro-journey-loop.mjs` membuat perjalanan lewat API lalu melompat ke
 *     `/player/...` — jadi tombol "Mulai Perjalanan" tidak pernah ditekan.
 *
 * Skrip ini menjalankan SATU jalur tanpa potongan:
 *   masuk -> Beranda -> pilih cerita -> Mulai Perjalanan -> isi lembar persona
 *   -> layar pembuatan dunia -> adegan pertama -> ketuk maju sampai keputusan
 *   -> pilih opsi pertama -> ulangi beberapa kali
 *
 * Yang diukur di setiap putaran:
 *   - TEKS narasi (harus berbeda tiap putaran)
 *   - GAMBAR LATAR (src `/assets/background/...`, harus berganti bila cerita pindah)
 *   - PERTANYAAN keputusan (harus berbeda)
 *
 * Tanpa dependensi: `fetch` bawaan Node + WebSocket untuk CDP.
 *
 * Pemakaian:
 *   node scripts/verify-user-journey-e2e.mjs --world w_2d6fb908-... --rounds 3
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
    port: 9455,
    world: 'w_2d6fb908-c27e-4406-a34f-caefd04499c6',
    rounds: 3,
    // Dunia ini hanya mendukung en-US.
    locale: 'en-US',
    timeout: 120,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') out.url = next();
    else if (a === '--port') out.port = Number(next());
    else if (a === '--world') out.world = next();
    else if (a === '--rounds') out.rounds = Number(next());
    else if (a === '--locale') out.locale = next();
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

/**
 * Mengisi input.
 *
 * `data-testid` diutamakan; placeholder hanya cadangan. Label yang TERLIHAT di
 * layar ("Email", "Kata sandi") BUKAN placeholder — mencarinya lewat placeholder
 * gagal tanpa galat, dan itu membuat skrip melaporkan "masuk gagal" padahal
 * kolomnya hanya tidak ditemukan.
 */
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

/** Ringkasan elemen yang ada di layar, untuk laporan saat langkah gagal. */
const DUMP_LAYAR = `(() => ({
  url: location.href,
  inputs: Array.from(document.querySelectorAll('input')).map((i) => ({ ph: i.placeholder, tid: i.getAttribute('data-testid') })),
  tombol: Array.from(document.querySelectorAll('[role="button"],button')).map((b) => ({ tid: b.getAttribute('data-testid'), txt: (b.innerText || '').trim().slice(0, 30) })),
  teks: (document.body.innerText || '').split('\\n').map((s) => s.trim()).filter(Boolean).slice(0, 12),
}))()`;

/** Menekan elemen ber-`data-testid`. */
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

/** Menekan elemen lewat teks tampak persis. */
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

/** Menekan tombol pilihan ke-`n` lewat `aria-label` berpola "Pilihan n.". */
const KLIK_OPSI = (n) => `(() => {
  const tombol = Array.from(document.querySelectorAll('[role="button"]'));
  const hit = tombol.find((b) => (b.getAttribute('aria-label') || '').trim().startsWith('Pilihan ${n}.'));
  if (!hit) return false;
  const r = hit.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  hit.dispatchEvent(new PointerEvent('pointerdown', o));
  hit.dispatchEvent(new MouseEvent('mousedown', o));
  hit.dispatchEvent(new PointerEvent('pointerup', o));
  hit.dispatchEvent(new MouseEvent('mouseup', o));
  hit.dispatchEvent(new MouseEvent('click', o));
  return true;
})()`;

/**
 * Mengetuk kotak dialog untuk memajukan beat.
 *
 * Sasaran ketukan HARUS `[data-testid="player-dialogue"]`. Menebak elemen
 * "div besar yang berisi teks" tidak mengenai penangan ketuknya, sehingga
 * skrip menyimpulkan "keputusan tidak pernah muncul" padahal ceritanya hanya
 * belum dimajukan.
 */
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

/**
 * Membaca keadaan layar.
 *
 * Latar dibaca dari `<img>` DI DALAM `[data-testid="player-stage"]`.
 * Menyaring lewat `/assets/background/` tidak menemukan apa pun: alamat gambar
 * di layar berbentuk `/v1/media/<id>`, bukan jalur berkas. Akibatnya pengukuran
 * latar selalu kosong, dan laporan "latar tidak pernah berganti" tidak berdasar.
 *
 * Narasi dibaca dari `[data-testid="player-dialogue"]`, bukan seluruh badan
 * halaman — badan halaman juga memuat label kendali, yang membuat dua putaran
 * tampak berbeda hanya karena tombolnya.
 */
const BACA_LAYAR = `(() => {
  const panggung = document.querySelector('[data-testid="player-stage"]');
  const gambar = panggung ? Array.from(panggung.querySelectorAll('img')) : [];
  const latar = gambar.map((i) => (i.currentSrc || i.src || '').split('/').pop()).filter(Boolean);
  const dialog = document.querySelector('[data-testid="player-dialogue"]');
  const narasi = dialog ? (dialog.innerText || '').trim() : '';
  const opsi = Array.from(document.querySelectorAll('[role="button"]'))
    .map((b) => (b.getAttribute('aria-label') || '').trim())
    .filter((s) => s.startsWith('Pilihan '));
  return { latar, narasi, opsi };
})()`;

/**
 * Mengetuk maju sampai tombol pilihan muncul.
 *
 * Sekaligus MENGUMPULKAN setiap kalimat yang tampil di kotak dialog. Membaca
 * hanya kalimat TERAKHIR saat keputusan muncul tidak cukup: dua putaran bisa
 * berakhir dengan kalimat penutup yang sama meski isi adegannya berbeda jauh.
 */
async function majuSampaiPilihan(cdp, maks = 80) {
  const terlihat = [];
  for (let i = 0; i < maks; i += 1) {
    const ada = await evaluate(cdp, ADA_PILIHAN);
    if (ada) return { ketukan: i, terlihat };
    const baris = await evaluate(
      cdp,
      `(() => { const d = document.querySelector('[data-testid="player-dialogue"]'); return d ? (d.innerText || '').trim() : ''; })()`,
    );
    if (baris && !terlihat.includes(baris)) terlihat.push(baris);
    await evaluate(cdp, KETUK_MAJU);
    await sleep(260);
  }
  return { ketukan: -1, terlihat };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome tidak ditemukan di: ${CHROME}\nSet CHROME_PATH bila lokasinya berbeda.`);
    process.exit(2);
  }

  /*
   * Bangunkan backend lebih dulu.
   *
   * Aplikasi paket gratis TIDUR setelah menganggur, dan halaman gerbangnya
   * menjawab 503 untuk SEMUA rute — termasuk `/v1/auth/register`. Tanpa
   * penantian ini, skrip melaporkan "registrasi gagal: HTTP 503" dan itu
   * terbaca seperti cacat aplikasi, padahal bukan.
   */
  const tungguBangun = async (batasMs = 120000) => {
    const deadline = Date.now() + batasMs;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`${API}/v1/meta`);
        if (r.ok) return true;
      } catch {
        /* jaringan belum siap */
      }
      await sleep(3000);
    }
    return false;
  };
  if (!(await tungguBangun())) throw new Error(`backend tidak bangun di ${API}`);
  await sleep(3000);

  /* ---------- Akun uji ---------- */
  const stamp = Math.floor(Date.now() / 1000);
  const email = `e2e${stamp}@contoh.test`;
  const sandi = 'rahasia12345';

  const reg = await fetch(`${API}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: sandi, displayName: 'Uji E2E', age: null }),
  });
  if (!reg.ok) throw new Error(`registrasi gagal: HTTP ${reg.status}`);
  const { token } = await reg.json();

  const profil = await fetch(`${API}/v1/worlds/${opts.world}`).then((r) => r.json());
  console.log(`=== UJI ALUR PENGGUNA UTUH ===`);
  console.log(`API   : ${API}`);
  console.log(`akun  : ${email}`);
  console.log(`dunia : "${profil.title}" (${(profil.assetManifest?.backgrounds || []).length} latar)\n`);

  const profile = path.join(os.tmpdir(), `fayln-e2e-${process.pid}`);
  fs.rmSync(profile, { recursive: true, force: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${opts.port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=420,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  const keluhan = [];

  try {
    cdp = await connect(opts.port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    /* ---------- 1. Masuk lewat antarmuka, bukan dengan menempel token ---------- */
    await cdp.send('Page.navigate', { url: `${opts.url}/login` });
    const adaForm = await waitFor(
      cdp,
      `document.querySelector('[data-testid="login-email"]') !== null`,
      { timeoutMs: 60000, every: 700 },
    );
    if (!adaForm) {
      console.log('layar Masuk tidak muncul:', JSON.stringify(await evaluate(cdp, DUMP_LAYAR)));
      throw new Error('form Masuk tidak ditemukan');
    }

    /*
     * Beri React waktu memasang penangan sebelum menyentuh form.
     *
     * Elemen input muncul SEBELUM React selesai hidrasi. Mengisi dan menekan
     * tombol pada saat itu tidak menghasilkan apa pun — tanpa galat, tanpa
     * permintaan jaringan — sehingga skrip melaporkan "masuk gagal" padahal
     * formnya belum siap menerima. Terukur: dengan jeda 2,5 detik, masuk
     * berhasil dan `POST /v1/auth/login` benar-benar terkirim.
     */
    await sleep(2500);

    const isiForm = async () => {
      await evaluate(cdp, SET_INPUT('login-email', 'nama@contoh.com', email));
      await evaluate(cdp, SET_INPUT('login-password', 'Minimal 8 karakter', sandi));
      return evaluate(
        cdp,
        `Array.from(document.querySelectorAll('input')).map((i) => i.value).join('|')`,
      );
    };

    let terisi = await isiForm();
    if (!terisi.includes(email)) {
      // Satu percobaan ulang: hidrasi bisa lebih lambat pada muatan pertama.
      await sleep(2000);
      terisi = await isiForm();
    }
    if (!terisi.includes(email)) {
      console.log('nilai form:', JSON.stringify(terisi));
      throw new Error('kolom Masuk tidak menerima isian');
    }

    await evaluate(cdp, CLICK_BY_TESTID('login-submit'));

    /* Berhasil bila form Masuk MENGHILANG — bukan dari alamat tertentu. */
    const masuk = await waitFor(
      cdp,
      `document.querySelector('[data-testid="login-email"]') === null`,
      { timeoutMs: 45000, every: 700 },
    );
    console.log(`1. masuk lewat antarmuka   : ${masuk ? 'OK' : 'GAGAL'}`);
    if (!masuk) {
      console.log('keadaan layar:', JSON.stringify(await evaluate(cdp, DUMP_LAYAR)));
      throw new Error('tidak keluar dari layar Masuk');
    }

    /* ---------- 2. Pilih cerita dari katalog ---------- */
    const adaKartu = await waitFor(
      cdp,
      `document.querySelector('[data-testid="story-card-${opts.world}"]') !== null`,
      { timeoutMs: 45000, every: 700 },
    );
    if (!adaKartu) {
      console.log('katalog tidak memuat kartu dunia:', JSON.stringify(await evaluate(cdp, DUMP_LAYAR)));
      throw new Error('kartu cerita tidak muncul di Beranda');
    }
    await evaluate(cdp, CLICK_BY_TESTID(`story-card-${opts.world}`));

    const diDunia = await waitFor(cdp, `location.pathname.startsWith('/world/')`, {
      timeoutMs: 45000,
      every: 600,
    });
    console.log(`2. pilih cerita            : ${diDunia ? 'OK' : 'GAGAL'}`);
    if (!diDunia) throw new Error('tidak sampai ke halaman dunia');

    /* ---------- 3. Mulai Perjalanan ---------- */
    const adaTombol = await waitFor(cdp, `document.body.innerText.includes('Mulai Perjalanan')`, {
      timeoutMs: 30000,
      every: 600,
    });
    if (!adaTombol) {
      console.log('halaman dunia:', JSON.stringify(await evaluate(cdp, DUMP_LAYAR)));
      throw new Error('tombol "Mulai Perjalanan" tidak ditemukan');
    }
    await evaluate(cdp, CLICK_BY_TEXT('Mulai Perjalanan'));
    await sleep(1500);

    /* Lembar persona terbuka SESUDAH tombol ditekan, bukan sebelumnya. */
    const lembar = await waitFor(cdp, `document.body.innerText.includes('Buat & mulai')`, {
      timeoutMs: 8000,
      every: 400,
    });
    if (lembar) {
      const namaOk = await evaluate(cdp, SET_INPUT('persona-name', 'Nama yang dipakai di cerita', 'Arfan'));
      const umurOk = await evaluate(cdp, SET_INPUT('persona-age', 'Contoh: 24', '24'));
      if (!namaOk || !umurOk) {
        console.log('lembar persona:', JSON.stringify(await evaluate(cdp, DUMP_LAYAR)));
        throw new Error('kolom lembar persona tidak ditemukan');
      }
      await evaluate(cdp, CLICK_BY_TEXT('Buat & mulai'));
    }
    console.log(`3. mulai perjalanan        : ${lembar ? 'lembar persona diisi' : 'profil sudah lengkap'}`);

    /* ---------- 4. Layar pembuatan dunia ---------- */
    const forge = await waitFor(cdp, `document.body.innerText.includes('AI SEDANG MEMBUAT DUNIA')`, {
      timeoutMs: 20000,
      every: 500,
    });
    console.log(`4. layar "AI SEDANG MEMBUAT DUNIA" : ${forge ? 'OK' : 'TIDAK TERLIHAT'}`);
    if (!forge) keluhan.push('layar pembuatan dunia tidak terlihat');

    /* ---------- 5. Adegan pertama ---------- */
    const adegan = await waitFor(cdp, `location.pathname.startsWith('/player/')`, {
      timeoutMs: opts.timeout * 1000,
      every: 1000,
    });
    console.log(`5. adegan pertama siap     : ${adegan ? 'OK' : 'GAGAL'}`);
    if (!adegan) throw new Error('layar pemain tidak pernah muncul');

    await sleep(2500);

    /* ---------- 6. Beberapa keputusan ---------- */

    /*
     * Jumlah beat menurut SERVER — bukan menurut layar.
     *
     * Menunggu "tombol pilihan hilang" menipu: giliran memakan 25–35 detik, dan
     * pilihan LAMA tetap terlihat selama proses berjalan. Skrip yang menunggu
     * gejala di layar akan membandingkan keadaan SEBELUM giliran selesai, lalu
     * melihat pertanyaan yang sama dan menuduh aplikasi "loop". Kesalahan itu
     * sudah pernah terjadi pada skrip lain di repositori ini. Serverlah pemegang
     * kebenarannya, jadi server yang ditanya.
     */
    const journeyId = await evaluate(cdp, `location.pathname.split('/').pop()`);
    let beatTerakhir = -1;
    const beatServer = async () => {
      /*
       * Tahan gangguan sesaat. Backend paket gratis bisa menjawab 503 di tengah
       * pengujian; melempar galat di sini akan menghentikan seluruh uji dan
       * menyembunyikan hasil yang sudah terkumpul. Nilai terakhir yang diketahui
       * dipakai sebagai gantinya, dan penantian tetap dibatasi waktu.
       */
      for (let i = 0; i < 3; i += 1) {
        try {
          const r = await fetch(`${API}/v1/journeys/${journeyId}/session`, {
            headers: { authorization: `Bearer ${token}` },
          });
          if (r.ok) {
            const d = await r.json();
            beatTerakhir = (d.beats || []).length;
            return beatTerakhir;
          }
        } catch {
          /* coba lagi */
        }
        await sleep(2000);
      }
      return beatTerakhir;
    };

    const segmen = [];
    for (let r = 1; r <= opts.rounds; r += 1) {
      const { ketukan, terlihat } = await majuSampaiPilihan(cdp, 80);
      if (ketukan < 0) {
        console.log(
          `\n   putaran ${r}: keputusan tidak muncul. Keadaan layar:`,
          JSON.stringify(await evaluate(cdp, DUMP_LAYAR)),
        );
        keluhan.push(`putaran ${r}: keputusan tidak pernah muncul`);
        break;
      }

      const sebelum = await evaluate(cdp, BACA_LAYAR);
      const opsi1 = (sebelum.opsi[0] || '').replace(/^Pilihan 1\.\s*/, '');
      console.log(`\n--- PUTARAN ${r} (${ketukan} ketukan, ${terlihat.length} kalimat) ---`);
      console.log(`   latar      : ${sebelum.latar.join(', ') || '(tidak ada gambar latar)'}`);
      console.log(`   kalimat    : ${JSON.stringify(terlihat[0] || '').slice(0, 90)}`);
      console.log(`   opsi 1     : "${opsi1}"`);

      segmen.push({
        latar: sebelum.latar.join('+'),
        teks: terlihat.join(' | '),
        opsi: sebelum.opsi.join(' | '),
      });

      if (r === opts.rounds) break;

      const beatSebelum = await beatServer();
      await evaluate(cdp, KLIK_OPSI(1));

      /* Tunggu sampai SERVER benar-benar menambah beat. */
      let beatSesudah = beatSebelum;
      const batas = Date.now() + opts.timeout * 1000;
      while (Date.now() < batas) {
        beatSesudah = await beatServer();
        if (beatSesudah > beatSebelum) break;
        await sleep(1500);
      }
      if (beatSesudah <= beatSebelum) {
        console.log(`   !! server tidak menambah beat (${beatSebelum} -> ${beatSesudah})`);
        keluhan.push(`putaran ${r}: giliran tidak sampai ke server`);
        break;
      }
      console.log(`   giliran selesai di server : ${beatSebelum} -> ${beatSesudah} beat`);

      /*
       * Server sudah maju, tetapi LAYAR belum tentu: lembar pilihan lama masih
       * terpasang selama giliran berjalan. Menunggu sampai pilihannya BERUBAH
       * (atau hilang) — bukan sekadar "ada pilihan" — sebab kalau tidak,
       * `majuSampaiPilihan` langsung berhenti di pilihan lama dan putaran
       * berikutnya membaca layar yang sama persis.
       */
      const opsiLama = JSON.stringify(sebelum.opsi);
      await waitFor(
        cdp,
        `!(${ADA_PILIHAN}) || JSON.stringify(Array.from(document.querySelectorAll('[role="button"]')).map((b)=>(b.getAttribute('aria-label')||'').trim()).filter((s)=>s.startsWith('Pilihan '))) !== ${JSON.stringify(opsiLama)}`,
        { timeoutMs: 30000, every: 600 },
      );
      await sleep(800);
    }

    /* ---------- 7. Penilaian ---------- */
    console.log(`\n=== PENILAIAN (${segmen.length} putaran) ===`);

    const semuaTeks = segmen.map((s) => s.teks);
    const teksUnik = new Set(semuaTeks).size;
    const latarUnik = new Set(segmen.map((s) => s.latar)).size;
    const opsiUnik = new Set(segmen.map((s) => s.opsi)).size;

    console.log(`   teks berbeda tiap putaran    : ${teksUnik} dari ${segmen.length}`);
    console.log(`   latar berbeda                : ${latarUnik} dari ${segmen.length}`);
    console.log(`   opsi berbeda                 : ${opsiUnik} dari ${segmen.length}`);

    const lulusTeks = teksUnik === segmen.length && segmen.length > 1;
    const lulusOpsi = opsiUnik === segmen.length;

    console.log(`\n   HASIL: ${lulusTeks && lulusOpsi ? 'LULUS' : 'PERIKSA'}`);
    if (!lulusTeks) keluhan.push('teks narasi ada yang identik antar putaran');
    if (!lulusOpsi) keluhan.push('opsi keputusan ada yang identik antar putaran');
    if (latarUnik === 1 && segmen.length > 1) {
      keluhan.push('latar tidak pernah berganti (periksa apakah dunia punya latar untuk tujuan cerita)');
    }

    if (keluhan.length > 0) {
      console.log('\n   CATATAN:');
      for (const k of keluhan) console.log(`     - ${k}`);
    }
  } finally {
    cdp?.close();
    chrome.kill();
    await sleep(400);
    fs.rmSync(profile, { recursive: true, force: true });
  }


}

main().catch((err) => {
  console.error(`\nGAGAL: ${err.message}`);
  process.exitCode = 1;
});
