#!/usr/bin/env node
/**
 * Membuktikan halaman Profil TERISI dari data akun setelah mendaftar.
 *
 * Yang diperiksa, berurutan, dan masing-masing harus terlihat di layar:
 *   1. Profil terisi nama dan usia dari pendaftaran.
 *   2. Akibat langsungnya: memulai cerita TIDAK lagi membuka lembar persona.
 *   3. Permintaan pembuatan perjalanan benar-benar berangkat.
 *
 * Langkah 2 dan 3 penting karena langkah 1 saja tidak cukup: mengisi kolom di
 * layar tidak menolong bila `isComplete` masih salah.
 *
 * Pemakaian:
 *   node scripts/verify-profile-adopted.mjs --email a@b.com --password rahasia123
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function parseArgs(argv) {
  const out = { url: 'http://127.0.0.1:8081/', port: 9388, email: null, password: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') out.url = next();
    else if (a === '--port') out.port = Number(next());
    else if (a === '--email') out.email = next();
    else if (a === '--password') out.password = next();
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (u) =>
  new Promise((res, rej) => {
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
      .on('error', rej);
  });

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.email || !opts.password) {
    console.error('Perlu --email dan --password akun uji.');
    process.exit(2);
  }

  const profile = path.join(os.tmpdir(), `fayln-adopt-${process.pid}`);
  fs.rmSync(profile, { recursive: true, force: true });
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${opts.port}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let target = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      const l = await getJson(`http://127.0.0.1:${opts.port}/json/list`);
      target = l.find((t) => t.type === 'page');
      if (target) break;
    } catch {
      /* belum siap */
    }
    await sleep(250);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  let id = 0;
  const pending = new Map();
  const posts = [];

  ws.addEventListener('message', (ev) => {
    let m;
    try {
      m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    } catch {
      return;
    }
    if (m.method === 'Network.requestWillBeSent') {
      const r = m.params.request;
      if (r.method === 'POST') {
        posts.push({ at: Date.now(), url: r.url, body: String(r.postData||'').slice(0,200) });
      }
    }
    if (m.method === 'Network.responseReceived') {
      const hit = posts.find((x) => x.at && !x.status);
      if (hit && m.params.response) hit.status = m.params.response.status;
    }
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result ?? {});
      pending.delete(m.id);
    }
  });

  const send = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      pending.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r?.result?.value;
  };

  let failures = 0;
  const check = (ok, label) => {
    console.log(`  ${ok ? 'OK  ' : 'MISS'} ${label}`);
    if (!ok) failures += 1;
  };

  const text = async () => String(await evaluate('document.body.innerText'));
  const setV = (tid, v) => `(() => {
    const el = document.querySelector('[data-testid="${tid}"]');
    if (!el) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, ${JSON.stringify(v)});
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(v)} }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;
  const clk = (tid) => `(() => {
    const el = document.querySelector('[data-testid="${tid}"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    for (const [T, t] of [[PointerEvent, 'pointerdown'], [MouseEvent, 'mousedown'], [PointerEvent, 'pointerup'], [MouseEvent, 'mouseup'], [MouseEvent, 'click']]) el.dispatchEvent(new T(t, o));
    return true;
  })()`;
  const clkText = (label) => `(() => {
    const nodes = Array.from(document.querySelectorAll('div,span,a,button'));
    const hit = nodes.reverse().find((n) => n.innerText && n.innerText.trim() === ${JSON.stringify(label)});
    if (!hit) return false;
    const el = hit.closest('[role="button"]') || hit;
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    for (const [T, t] of [[PointerEvent, 'pointerdown'], [MouseEvent, 'mousedown'], [PointerEvent, 'pointerup'], [MouseEvent, 'mouseup'], [MouseEvent, 'click']]) el.dispatchEvent(new T(t, o));
    return true;
  })()`;

  /*
   * Menekan TAB di bilah bawah, bukan teks apa pun yang kebetulan sama.
   *
   * Versi sebelumnya memakai `clkText('Pengaturan')` — mencari elemen mana pun
   * yang teksnya persis "Pengaturan". Itu DUA kali menyesatkan:
   *
   *   1. Label tab berasal dari kamus (`tabs.settings`). Bila teksnya berubah,
   *      pencarian gagal tanpa galat dan pemeriksaan "membuka halaman
   *      Pengaturan" cukup dilaporkan MISS — padahal aplikasinya baik.
   *   2. Halaman Pengaturan punya JUDUL "Pengaturan" juga. Setelah muat ulang,
   *      elemen yang lebih dulu ditemukan bisa jadi judul halaman, bukan tab,
   *      sehingga tekanan tidak berpindah ke mana-mana.
   *
   * Karena itu tab dicari SECARA STRUKTURAL: `react-navigation` selalu membungkus
   * setiap tab dengan `role="tab"` plus `aria-label`. Label itu sendiri diambil
   * dari `tabBarAccessibilityLabel` di `app/(tabs)/_layout.tsx`, jadi mengandalkan
   * `aria-label` tetap benar walau teks tampilannya berubah.
   *
   * `data-testid` sengaja TIDAK dipakai: menambahnya berarti menambah kode uji ke
   * dalam komponen produksi (dan `Tabs.Screen` tidak meneruskan `testID` ke bilah
   * bawah dengan andal). `aria-label` sudah menjadi kontrak aksesibilitas yang
   * memang dimiliki tab, jadi alat ukur cukup membacanya.
   */
  const clkTab = (label) => `(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    let hit = tabs.find((n) => n.getAttribute('aria-label') === ${JSON.stringify(label)});
    if (!hit) {
      hit = tabs.find((n) => (n.innerText || '').trim() === ${JSON.stringify(label)});
    }
    if (!hit) {
      return 'TAB-TIDAK-ADA(ada ' + tabs.length + ' tab: ' +
        tabs.map((n) => n.getAttribute('aria-label') || (n.innerText || '').trim()).join(' | ') + ')';
    }
    const r = hit.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    for (const [T, t] of [[PointerEvent, 'pointerdown'], [MouseEvent, 'mousedown'], [PointerEvent, 'pointerup'], [MouseEvent, 'mouseup'], [MouseEvent, 'click']]) hit.dispatchEvent(new T(t, o));
    return 'OK';
  })()`;

  /*
   * Menunggu halaman Pengaturan benar-benar terbuka, dengan jeda dan percobaan
   * ulang tekanan. Satu tekanan bisa mendarat sebelum bilah tab selesai
   * terpasang setelah muat ulang; mencoba lagi lebih jujur daripada langsung
   * melaporkan kegagalan.
   */
  const bukaTab = async (label) => {
    for (let i = 0; i < 12; i += 1) {
      const hasil = await evaluate(clkTab(label));
      if (i === 0) console.log(`  ..   tekan tab ${label}: ${hasil}`);
      if (await waitFor(`document.body.innerText.includes('Profil')`, 2500)) return true;
      await sleep(600);
    }
    return false;
  };

  /*
   * Menekan tombol yang SUNGGUH menangani tekanannya.
   *
   * Struktur `StickyActionBar` adalah
   *   View[testid=world-action-bar] > View > BUTTON[role=button] > View
   * sehingga `bar.querySelector('[role="button"]')` tanpa langkah tambahan
   * mengenai elemen yang benar, TETAPI menekan elemen pembungkusnya tidak
   * melakukan apa pun: React Native Web memasang penanganan pada `<button>`-nya,
   * bukan pada `View` di luarnya. Kesalahan ini dulu menghasilkan laporan
   * "tidak ada POST" yang menyesatkan — aplikasinya benar, alat ukurnya salah.
   */
  const clkButton = (tid) => `(() => {
    const root = document.querySelector('[data-testid="${tid}"]');
    if (!root) return 'TIDAK-ADA-TESTID';
    const btn = root.matches('[role="button"]') ? root : root.querySelector('[role="button"]');
    if (!btn) return 'TIDAK-ADA-TOMBOL';
    btn.scrollIntoView({ block: 'center' });
    const r = btn.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    for (const [T, t] of [[PointerEvent, 'pointerdown'], [MouseEvent, 'mousedown'], [PointerEvent, 'pointerup'], [MouseEvent, 'mouseup'], [MouseEvent, 'click']]) btn.dispatchEvent(new T(t, o));
    return 'OK';
  })()`;
  const waitFor = async (predicate, timeoutMs = 25000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(`(() => { try { return Boolean(${predicate}); } catch { return false; } })()`)) {
        return true;
      }
      await sleep(400);
    }
    return false;
  };

  try {
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 1000,
      deviceScaleFactor: 2,
      mobile: true,
    });

    console.log(`--- ${opts.url} ---`);
    await send('Page.navigate', { url: opts.url });
    await waitFor(`document.body.innerText.includes('Masuk')`, 45000);

    await evaluate(setV('login-email', opts.email));
    await evaluate(setV('login-password', opts.password));
    await evaluate(clk('login-submit'));
    check(await waitFor(`document.body.innerText.includes('Semua Cerita')`), 'masuk sampai Beranda');

    // Buka tab Pengaturan lewat bilah bawah.
    const atSettings = await bukaTab('Pengaturan');
    check(atSettings, 'membuka halaman Pengaturan');
    await waitFor(`(() => {
      const n = document.querySelectorAll('input');
      return n[1] && n[1].value.length > 0;
    })()`, 15000);

    /*
     * Inti pemeriksaannya. Nilai dibaca dari atribut `value` INPUT, bukan dari
     * teks halaman: teks label "Nama" selalu ada, jadi keberadaannya tidak
     * membuktikan apa pun tentang isi kolomnya.
     */
    const values = await evaluate(`JSON.stringify(
      Array.from(document.querySelectorAll('input')).map((n) => n.value)
    )`);
    const parsed = JSON.parse(values ?? '[]');
    const nama = parsed[1] ?? '';
    const usia = parsed[2] ?? '';

    check(nama.length > 0, `kolom Nama terisi dari akun (${JSON.stringify(nama)})`);
    check(usia.length > 0, `kolom Usia terisi dari akun (${JSON.stringify(usia)})`);
    check(
      !(await text()).includes('Lengkapi nama dan usia supaya kamu tidak perlu mengisinya lagi'),
      'peringatan "profil belum lengkap" hilang',
    );

    // Kembali ke Beranda, buka dunia, dan mulai cerita.
    await evaluate(clkTab('Beranda'));
    await waitFor(`document.body.innerText.includes('Semua Cerita')`);
    await evaluate(`(() => {
      const c = document.querySelector('[data-testid^="story-card-"]');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      for (const [T, t] of [[PointerEvent, 'pointerdown'], [MouseEvent, 'mousedown'], [PointerEvent, 'pointerup'], [MouseEvent, 'mouseup'], [MouseEvent, 'click']]) c.dispatchEvent(new T(t, o));
      return true;
    })()`);
    check(await waitFor(`document.body.innerText.includes('Mulai Perjalanan')`), 'membuka layar dunia');

    /*
     * Inti perbaikan penyimpanan: halaman DIMUAT ULANG, lalu kolom Nama harus
     * tetap terisi. Bila `createKeyValueStore()` masih mengembalikan penyimpanan
     * memori, muat ulang akan mengosongkan profil dan pemeriksaan ini GAGAL.
     */
    await send('Page.reload', { ignoreCache: false });
    await waitFor(`document.body.innerText.includes('Semua Cerita')`, 45000);
    const atSettings2 = await bukaTab('Pengaturan');
    check(atSettings2, 'membuka halaman Pengaturan setelah muat ulang');
    /*
     * Tunggu kolomnya benar-benar terisi. Profil dibaca dari penyimpanan secara
     * asinkron; membaca terlalu cepat akan melihat keadaan kosong sementara dan
     * menyimpulkan "tidak bertahan" padahal datanya ada.
     */
    await waitFor(`(() => {
      const n = document.querySelectorAll('input');
      return n[1] && n[1].value.length > 0;
    })()`, 15000);
    const afterReload = JSON.parse(
      (await evaluate(`JSON.stringify(
        Array.from(document.querySelectorAll('input')).map((n) => n.value)
      )`)) ?? '[]',
    );
    check(
      (afterReload[1] ?? '').length > 0,
      `profil BERTAHAN setelah muat ulang (Nama: ${JSON.stringify(afterReload[1] ?? '')})`,
    );

    await evaluate(clkTab('Beranda'));
    await waitFor(`document.body.innerText.includes('Semua Cerita')`);
    await evaluate(`(() => {
      const c = document.querySelector('[data-testid^="story-card-"]');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      for (const [T, t] of [[PointerEvent, 'pointerdown'], [MouseEvent, 'mousedown'], [PointerEvent, 'pointerup'], [MouseEvent, 'mouseup'], [MouseEvent, 'click']]) c.dispatchEvent(new T(t, o));
      return true;
    })()`);
    await waitFor(`document.body.innerText.includes('Mulai Perjalanan')`);

    posts.length = 0;
    /*
     * Sebelum menekan, CATAT apa yang benar-benar dikirim tombolnya. Bila
     * `aria-disabled` bernilai true, handler-nya tidak akan berjalan sama
     * sekali -- dan itu menjelaskan "tidak ada POST" tanpa perlu menebak.
     */
    const barState = await evaluate(`(() => {
      const bar = document.querySelector('[data-testid="world-action-bar"]');
      if (!bar) return 'bar-tidak-ada';
      const btn = bar.querySelector('[role="button"]');
      return JSON.stringify({
        barText: bar.innerText,
        disabled: btn ? btn.getAttribute('aria-disabled') : null,
        labelBtn: btn ? btn.getAttribute('aria-label') : null,
      });
    })()`);
    console.log('  ..   keadaan tombol sebelum ditekan: ' + barState);

    const clicked = await evaluate(clkButton('world-action-bar'));
    console.log('  ..   klik terkirim: ' + clicked);

    // Lembar persona TIDAK boleh muncul lagi sekarang.
    await sleep(1500);
    check(
      !(await text()).includes('Tentukan siapa kamu di dalam cerita ini'),
      'lembar persona TIDAK muncul lagi (profil sudah lengkap)',
    );

    // Beri waktu permintaan benar-benar terkirim.
    for (let i = 0; i < 40 && posts.length === 0; i += 1) {
      await sleep(500);
    }
    check(posts.length > 0, 'permintaan pembuatan perjalanan BENAR-BENAR terkirim');

    if (failures > 0) {
      console.log(`\nHASIL: GAGAL — ${failures} pemeriksaan tidak terpenuhi.`);
      console.log('Cuplikan DOM:\n' + (await text()).slice(0, 400));
      console.log('POST tercatat:\n' + JSON.stringify(posts, null, 2));
      process.exitCode = 1;
    } else {
      console.log('\nHASIL: OK — profil terisi dari akun dan cerita bisa dimulai.');
    }
  } finally {
    ws.close();
    chrome.kill();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(2);
});
