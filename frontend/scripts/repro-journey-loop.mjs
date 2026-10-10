#!/usr/bin/env node
/**
 * Membuktikan apakah memilih opsi benar-benar MEMBAWA CERITA MAJU, atau
 * memutar ulang narasi awal.
 *
 * Mengapa skrip ini ada: pemilik produk melaporkan "milih malah looping ke
 * narasi awal". Uji unit tidak dapat menangkapnya — reducer diuji dengan aksi
 * yang disuntikkan tangan, bukan lewat jalur sungguhan (login → buka pemain →
 * tekan opsi → tunggu giliran → lihat hasilnya). Di sini jalur itu dijalankan
 * utuh, lalu teks narasi dan label pilihan dibandingkan SEBELUM dan SESUDAH.
 *
 * Yang diukur bukan "tidak ada galat", melainkan: apakah narasi berubah dan
 * apakah pertanyaan yang sama muncul lagi.
 *
 * Tanpa dependensi: `fetch` bawaan Node 22 + WebSocket untuk CDP.
 *
 * Pemakaian:
 *   node scripts/repro-journey-loop.mjs
 *   node scripts/repro-journey-loop.mjs --url http://127.0.0.1:8081 --world w_bosku-mantan
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const API = process.env.API_URL ?? 'https://fayln-api.marky.blitz.cloud';

function parseArgs(argv) {
  const out = { url: 'http://127.0.0.1:8081', port: 9444, world: 'w_bosku-mantan', timeout: 90 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') out.url = next();
    else if (a === '--port') out.port = Number(next());
    else if (a === '--world') out.world = next();
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
    ws.addEventListener('error', () => reject(new Error('gagal membuka WebSocket CDP')), { once: true });
  });

  let id = 0;
  const pending = new Map();
  const pendengar = [];
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
      return;
    }
    // Peristiwa (bukan balasan): teruskan ke pendengar.
    if (msg.method) {
      for (const f of pendengar) f(msg);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  return { send, close: () => ws.close(), on: (f) => pendengar.push(f) };
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

/**
 * Membaca keadaan layar pemain: baris dialog yang sedang tampil dan label
 * pilihan yang terlihat. Dipakai untuk membandingkan sebelum vs sesudah.
 */
const BACA_LAYAR = `(() => {
  const teks = document.body.innerText;
  const tombol = Array.from(document.querySelectorAll('[role="button"]'));
  const opsi = tombol
    .map((b) => (b.getAttribute('aria-label') || '').trim())
    .filter((s) => /^Pilihan \\d+\\./.test(s));
  return {
    opsi,
    // Kalimat terakhir yang tampak di kotak dialog.
    cuplikan: teks.replace(/\\s+/g, ' ').slice(0, 700),
  };
})()`;

/** Menekan tombol pilihan ke-`n` lewat `aria-label` yang berpola "Pilihan n.". */
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
 * Mengetuk kotak dialog sampai pilihan muncul.
 *
 * Adegan dibaca baris demi baris: pemain harus mengetuk untuk melanjutkan.
 * Tanpa langkah ini, skrip berhenti di baris pertama dan salah menyimpulkan
 * "pilihan tidak pernah muncul" — padahal pilihan itu memang belum sampai.
 */
const KETUK_DIALOG = `(() => {
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

/** Mengetuk maju sampai pilihan muncul; mengembalikan jumlah ketukan. */
async function majuSampaiPilihan(cdp, maxKetuk = 40) {
  for (let i = 0; i < maxKetuk; i += 1) {
    if (await evaluate(cdp, ADA_PILIHAN)) return i;
    await evaluate(cdp, KETUK_DIALOG);
    await sleep(260);
  }
  return -1;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome tidak ditemukan di: ${CHROME}`);
    process.exit(2);
  }

  /* ---- 1. Siapkan akun + perjalanan lewat API ---- */
  const stamp = Date.now();
  const email = `loop${stamp}@contoh.test`;
  const sandi = 'rahasia12345';

  console.log(`\n=== REPRODUKSI: apakah memilih MEMUTAR ULANG cerita? ===`);
  console.log(`API   : ${API}`);

  const reg = await fetch(`${API}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: sandi, displayName: 'Uji Loop', age: null }),
  });
  const token = (await reg.json())?.token;
  if (!token) throw new Error('registrasi gagal');

  const buat = await fetch(`${API}/v1/journeys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `loop${stamp}0000`,
      worldId: opts.world,
      persona: { name: 'Arfan', age: 24 },
      responseLocale: 'id-ID',
    }),
  });
  const dibuat = await buat.json();
  const journeyId = dibuat?.journeyId;
  if (!journeyId) throw new Error(`perjalanan gagal dibuat: ${JSON.stringify(dibuat).slice(0, 200)}`);

  const beatPembuka = dibuat.opening?.beats?.length ?? 0;
  console.log(`journey: ${journeyId} (${beatPembuka} beat pembuka)\n`);

  /* ---- 2. Jalankan peramban ---- */
  const profile = path.join(os.tmpdir(), `fayln-loop-${process.pid}`);
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
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp = null;
  try {
    cdp = await connect(opts.port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    /*
     * Rekam permintaan jaringan.
     *
     * Tanpa ini, "beat server tidak bertambah" punya dua arti yang sangat
     * berbeda: aplikasi memang tidak mengirim, ATAU klik sintetis saya yang
     * tidak sampai. Yang pertama cacat aplikasi; yang kedua cacat alat ukur.
     * Jaringan yang direkam memisahkan keduanya.
     */
    const permintaan = [];
    cdp.on((msg) => {
      if (msg.method === 'Network.requestWillBeSent') {
        const url = msg.params?.request?.url ?? '';
        if (url.includes('/v1/')) {
          permintaan.push(`${msg.params.request.method} ${url.replace(/^https?:\/\/[^/]+/, '')}`);
        }
      }
    });

    /* ---- 3. Pasang token, lalu buka pemain ---- */
    await cdp.send('Page.navigate', { url: `${opts.url}/` });
    await waitFor(cdp, `document.readyState === 'complete'`, { timeoutMs: 30000 });
    await evaluate(cdp, `localStorage.setItem('fayln.sessionToken', ${JSON.stringify(token)}); true`);

    await cdp.send('Page.navigate', { url: `${opts.url}/player/${journeyId}` });
    await waitFor(cdp, `document.body.innerText.includes('Perjalanan') || document.body.innerText.length > 40`, {
      timeoutMs: 40000,
    });

    /* ---- 4. Ketuk maju sampai pilihan pertama muncul ---- */
    const ketukan = await majuSampaiPilihan(cdp, 60);
    const adaOpsi = ketukan >= 0;

    if (!adaOpsi) {
      console.log('GAGAL: pilihan pertama tidak pernah muncul setelah 60 ketukan.');
      const t = await evaluate(cdp, 'document.body.innerText');
      console.log('Cuplikan DOM:\n' + String(t).slice(0, 500));
      process.exitCode = 1;
      return;
    }
    console.log(`pilihan pertama muncul setelah ${ketukan} ketukan.\n`);

    const sebelum = await evaluate(cdp, BACA_LAYAR);
    console.log('--- SEBELUM memilih ---');
    console.log('  opsi :', sebelum.opsi.join(' | '));
    console.log('  layar:', sebelum.cuplikan.slice(0, 220));

    /*
     * Jumlah beat di SERVER, bukan di layar.
     *
     * Ini yang memisahkan dua kemungkinan yang gejalanya sama persis:
     *   (a) server MENAMBAH beat, tetapi layar tidak maju  -> bug frontend
     *   (b) server MENOLAK giliran, layar mengulang        -> bug pengiriman/aturan
     * Tanpa angka ini, keduanya tampak seperti "loop" yang sama.
     */
    const beatServer = async () => {
      const r = await fetch(`${API}/v1/journeys/${journeyId}/session`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      return Array.isArray(d?.beats) ? d.beats.length : -1;
    };
    const beatSebelum = await beatServer();
    console.log(`  beat di server: ${beatSebelum}`);

    /* ---- 5. Pilih opsi pertama, tunggu giliran selesai ---- */
    const reqSebelum = permintaan.length;
    const diklik = await evaluate(cdp, KLIK_OPSI(1));
    console.log(`\n  opsi 1 diklik: ${diklik}`);

    // Apakah aplikasi masuk keadaan "AI sedang menulis"? Itu tanda kirimannya jalan.
    await sleep(1200);
    const sedangMenulis = await evaluate(
      cdp,
      `/menulis|Menyusun|sebentar|Menunggu/i.test(document.body.innerText)`,
    );
    console.log(`  keadaan "sedang menulis" terlihat: ${sedangMenulis}`);

    /*
     * Tunggu sampai SERVER benar-benar menambah beat.
     *
     * Versi sebelumnya menunggu gejala di layar ("tombol pilihan hilang").
     * Itu menipu: giliran butuh ~25-35 detik, sedangkan penantiannya hanya
     * 25 detik dan pilihan lama masih terlihat selama proses. Akibatnya skrip
     * membandingkan layar SEBELUM giliran selesai, melihat pertanyaan yang sama,
     * lalu menuduh aplikasi "loop" — padahal aplikasinya baik-baik saja.
     * Yang benar: tanyakan langsung ke server, karena serverlah pemegang
     * kebenarannya.
     */
    const tungguServerMaju = async (batasMs) => {
      const deadline = Date.now() + batasMs;
      while (Date.now() < deadline) {
        const n = await beatServer();
        if (n > beatSebelum) return n;
        await sleep(1500);
      }
      return await beatServer();
    };

    const beatSetelahGiliran = await tungguServerMaju(opts.timeout * 1000);
    const serverMaju = beatSetelahGiliran > beatSebelum;
    console.log(`\n  giliran selesai di server: ${serverMaju} (${beatSebelum} -> ${beatSetelahGiliran})`);

    // Baru sesudah server menambah beat, ketuk maju ke pilihan berikutnya.
    const ketukan2 = serverMaju ? await majuSampaiPilihan(cdp, 80) : -1;

    const beatSesudah = await beatServer();

    const sesudah = await evaluate(cdp, BACA_LAYAR);
    console.log('\n--- SESUDAH memilih ---');
    console.log(`  (pilihan berikutnya setelah ${ketukan2} ketukan)`);
    console.log('  opsi :', sesudah.opsi.join(' | '));
    console.log('  layar:', sesudah.cuplikan.slice(0, 220));
    console.log(`  beat di server: ${beatSesudah}`);

    const terkirim = permintaan.slice(reqSebelum);
    console.log(`  permintaan /v1/ sesudah klik: ${terkirim.length}`);
    for (const p of terkirim.slice(0, 6)) console.log(`    - ${p}`);

    /* ---- 6. Putuskan ---- */
    const opsiSama =
      sebelum.opsi.length > 0 &&
      sesudah.opsi.length > 0 &&
      JSON.stringify(sebelum.opsi) === JSON.stringify(sesudah.opsi);
    const layarSama = sebelum.cuplikan === sesudah.cuplikan;

    console.log('\n=== PUTUSAN ===');
    console.log(`  permintaan /v1/ terkirim  : ${terkirim.length}`);
    console.log(`  beat server bertambah     : ${serverMaju} (${beatSebelum} -> ${beatSesudah})`);
    console.log(`  pilihan berikutnya ketemu : ${ketukan2 >= 0} (setelah ${ketukan2} ketukan)`);
    console.log(`  label opsi identik        : ${opsiSama}`);
    console.log(`  cuplikan layar identik    : ${layarSama}`);

    if (opsiSama && terkirim.length === 0) {
      console.log('\n  >> ALAT UKUR SALAH, BUKAN APLIKASI: klik sintetis tidak menghasilkan');
      console.log('     permintaan apa pun. Teknik kliknya yang harus diperbaiki.');
      process.exitCode = 2;
    } else if (opsiSama && serverMaju) {
      console.log('\n  >> LOOP DI FRONTEND: server SUDAH menambah cerita, tetapi layar');
      console.log('     menampilkan pertanyaan yang sama. Kerusakannya di pemutar, bukan di API.');
      process.exitCode = 1;
    } else if (opsiSama && !serverMaju) {
      console.log('\n  >> GILIRAN TERKIRIM TETAPI DITOLAK: server tidak menambah beat.');
      process.exitCode = 1;
    } else if (opsiSama) {
      console.log('\n  >> MENCURIGAKAN: label opsi sama, tetapi layarnya berbeda.');
    } else {
      console.log('\n  >> TIDAK LOOP: pilihan berganti, cerita berlanjut.');
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
