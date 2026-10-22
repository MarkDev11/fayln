#!/usr/bin/env node
/**
 * Buktikan halaman web benar-benar TER-RENDER, bukan berhenti di skeleton.
 *
 * Mengapa bukan `--virtual-time-budget`: opsi itu membekukan jam virtual, sehingga
 * `requestAnimationFrame` tidak pernah maju dan halaman berhenti selamanya di
 * kerangka pemuatan. Gejalanya menipu: ukuran tangkapan layar identik berulang
 * kali walau budget dinaikkan, port menjawab 200, dan bundle tersaji normal —
 * semua pemeriksaan dangkal lolos padahal halaman kosong.
 *
 * Jalan keluarnya: lewat CDP, tunggu teks penanda benar-benar muncul di
 * `document.body.innerText`, baru keluar 0 (dan memotret bila diminta).
 * Keluar 1 bila ada penanda yang tidak ditemukan — cocok dipakai sebagai gerbang.
 *
 * Pemakaian:
 *   node scripts/verify-render.mjs
 *   node scripts/verify-render.mjs --shot "$TEMP/beranda.png"
 *   node scripts/verify-render.mjs --expect "Top 10 Minggu Ini,Terbaru Dirilis"
 *   node scripts/verify-render.mjs --url http://127.0.0.1:8081/world/w_bosku-mantan
 *   node scripts/verify-render.mjs --width 1280 --height 900
 *   node scripts/verify-render.mjs --theme light
 *   node scripts/verify-render.mjs --settle 6000
 *
 * Tanpa dependensi — memakai WebSocket bawaan Node 22. Set CHROME_PATH bila
 * Chrome tidak ada di lokasi bawaan.
 */

const args = process.argv.slice(2);
function ambil(nilai, bawaan) {
  const i = args.indexOf(nilai);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : bawaan;
}

const url = ambil('--url', 'http://127.0.0.1:8081/');
const expectArg = ambil('--expect', '');
const markers = (expectArg ? expectArg.split(',') : ['Top 10 Minggu Ini', 'Terbaru Dirilis'])
  .map((s) => s.trim())
  .filter(Boolean);
const shot = ambil('--shot', null);
const settle = Number(ambil('--settle', '2500'));
const lebar = Number(ambil('--width', '390'));
const tinggi = Number(ambil('--height', '844'));
const tema = ambil('--theme', null);
const BATAS_MS = Number(ambil('--timeout', '45000'));
/*
 * Port CDP 0 = Chrome memilih port kosong sendiri lalu menuliskannya ke
 * `<profil>/DevToolsActivePort`.
 *
 * Mengapa bukan port tetap: port tetap dapat SUDAH DIPEGANG instance Chrome
 * lain (mis. sisa pemeriksaan sebelumnya yang prosesnya tidak ikut mati).
 * Skrip lalu menempel ke instance itu — beserta profil dan SESI LOGIN-nya —
 * dan melaporkan halaman yang sama sekali bukan halaman yang baru dimuat.
 * Terukur: RENDER GAGAL dengan teks Beranda "100.000" padahal profil baru
 * seharusnya menampilkan layar Masuk. Alat ukur yang memeriksa instance yang
 * salah lebih berbahaya daripada tidak ada alat ukur.
 */
const PORT_CDP = ambil('--cdp-port', '0');

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const fs = await import('node:fs');
const { spawn } = await import('node:child_process');
const os = await import('node:os');
const path = await import('node:path');

const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'fayln-cdp-'));

console.log(`URL      : ${url}`);
console.log(`Penanda  : ${markers.join(' | ')}`);

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${PORT_CDP}`,
  `--user-data-dir=${profil}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' });

function bersihkan() {
  try { chrome.kill(); } catch { /* abaikan */ }
  try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* abaikan */ }
}
process.on('exit', bersihkan);
process.on('SIGINT', () => process.exit(1));
process.on('SIGTERM', () => process.exit(1));

/** Tunggu Chrome menuliskan port CDP-nya, lalu ambil target halaman. */
async function portCdp() {
  if (PORT_CDP !== '0') {
    return Number(PORT_CDP);
  }
  const berkas = path.join(profil, 'DevToolsActivePort');
  const mulai = Date.now();
  while (Date.now() - mulai < 20000) {
    try {
      const isi = fs.readFileSync(berkas, 'utf8').split('\n')[0]?.trim();
      if (isi && /^\d+$/.test(isi)) {
        return Number(isi);
      }
    } catch { /* Chrome belum menulis berkasnya */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chrome tidak menuliskan port CDP dalam 20 detik');
}

async function cariTarget(port) {
  const mulai = Date.now();
  while (Date.now() - mulai < 20000) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const daftar = await res.json();
      const halaman = daftar.find((t) => t.type === 'page');
      if (halaman) return halaman;
    } catch { /* Chrome belum siap */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Chrome CDP tidak merespons dalam 20 detik');
}

const port = await portCdp();
const target = await cariTarget(port);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = (e) => reject(new Error(`WebSocket gagal: ${e.message ?? 'tidak diketahui'}`));
});

let idPesan = 0;
const menunggu = new Map();
function kirim(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++idPesan;
    menunggu.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.onmessage = (peristiwa) => {
  const pesan = JSON.parse(peristiwa.data);
  if (pesan.id && menunggu.has(pesan.id)) {
    const { resolve, reject } = menunggu.get(pesan.id);
    menunggu.delete(pesan.id);
    if (pesan.error) reject(new Error(pesan.error.message));
    else resolve(pesan.result);
  }
};

await kirim('Page.enable');
await kirim('Runtime.enable');

if (tema) {
  // Pakai emulasi media, bukan localStorage: tidak bergantung pada nama kunci
  // penyimpanan yang bisa berubah.
  await kirim('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: tema }],
  });
}

await kirim('Page.navigate', { url });

// Ukuran ponsel: `--window-size` di Chrome headless Windows tertahan di lebar
// minimum 500px, sedangkan Emulation.setDeviceMetricsOverride benar-benar
// menghormati 390px.
await kirim('Emulation.setDeviceMetricsOverride', {
  width: lebar,
  height: tinggi,
  deviceScaleFactor: 2,
  mobile: true,
});

// Tunggu load + settle (gambar lambat, animasi).
await new Promise((r) => setTimeout(r, settle));

async function bacaTeks() {
  const hasil = await kirim('Runtime.evaluate', {
    expression: 'document.body ? document.body.innerText : ""',
    returnByValue: true,
  });
  return hasil?.result?.value ?? '';
}

const mulai = Date.now();
let teks = '';
let teksTerkini = '';
while (Date.now() - mulai < BATAS_MS) {
  teksTerkini = await bacaTeks();
  const semua = markers.every((m) => teksTerkini.includes(m));
  if (semua) { teks = teksTerkini; break; }
  await new Promise((r) => setTimeout(r, 500));
}
teks = teksTerkini;

const hilang = markers.filter((m) => !teks.includes(m));
for (const m of markers) {
  console.log(`[${hilang.includes(m) ? 'GAGAL' : 'LULUS'}] penanda: "${m}"`);
}
console.log(`Panjang teks halaman: ${teks.length} karakter`);

if (shot) {
  const hasil = await kirim('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  fs.writeFileSync(shot, Buffer.from(hasil.data, 'base64'));
  console.log(`Tangkapan layar: ${shot}`);
}

ws.close();
console.log(hilang.length === 0 ? 'RENDER OK' : 'RENDER GAGAL');
process.exit(hilang.length === 0 ? 0 : 1);
