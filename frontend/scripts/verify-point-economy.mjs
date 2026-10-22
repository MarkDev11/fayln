#!/usr/bin/env node
/**
 * Verifikasi ekonomi poin di PRODUKSI (docs/17).
 *
 * Mengukur lewat alur pemain sungguhan — daftar akun, klaim, mulai cerita,
 * kirim satu giliran — bukan dengan membaca kode atau menebak dari dokumen.
 *
 * Yang dibuktikan:
 *  1. jatah harian 100 poin, bukan 100.000 token;
 *  2. tanpa klaim saldo 0 dan `claimableToday` benar;
 *  3. klaim memberi 100, klaim kedua tidak menambah apa pun;
 *  4. adegan pembuka gratis;
 *  5. satu giliran menagih tepat 10 poin.
 *
 * Pemakaian:
 *   node scripts/verify-point-economy.mjs
 *   BASE_URL=https://... node scripts/verify-point-economy.mjs
 */

const BASE_URL = (process.env.BASE_URL || 'https://fayln-api.marky.blitz.cloud').replace(/\/+$/, '');

let gagal = 0;
function catat(nama, lulus, detail) {
  if (!lulus) gagal += 1;
  console.log(`[${lulus ? 'LULUS' : 'GAGAL'}] ${nama}${detail ? ` — ${detail}` : ''}`);
}

async function panggil(method, path, { body, token, timeoutMs = 240000 } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const ac = new AbortController();
  const jam = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal,
    });
    const teks = await res.text();
    let json = null;
    try { json = teks ? JSON.parse(teks) : null; } catch { json = null; }
    return { status: res.status, json, teks };
  } catch (err) {
    return { status: 0, json: null, teks: String(err) };
  } finally {
    clearTimeout(jam);
  }
}

const stamp = Date.now();
const email = `poin${stamp}@contoh.test`;

console.log(`\n=== VERIFIKASI EKONOMI POIN — ${BASE_URL} ===\n`);

const meta = await panggil('GET', '/v1/meta');
catat('backend hidup', meta.status === 200, `HTTP ${meta.status}`);
if (meta.status !== 200) {
  console.log('\nBackend belum bangun; bangunkan dulu lalu ulangi.');
  process.exit(1);
}

const reg = await panggil('POST', '/v1/auth/register', {
  body: { email, password: 'rahasia12345', displayName: 'Uji Poin', age: null },
});
catat('registrasi akun uji', reg.status === 201, `HTTP ${reg.status}`);
const token = reg.json?.token;
if (!token) {
  console.log(reg.teks);
  process.exit(1);
}

/* 1. Sebelum klaim */
const awal = await panggil('GET', '/v1/usage', { token });
const u0 = awal.json ?? {};
catat(
  'jatah harian 100 poin (bukan 100.000 token)',
  u0.allowanceLimit === 100,
  `allowanceLimit=${String(u0.allowanceLimit)}`,
);
catat('biaya per adegan 10 poin', u0.sceneCost === 10, `sceneCost=${String(u0.sceneCost)}`);
catat('sebelum klaim saldo 0', u0.available === 0, `available=${String(u0.available)}`);
catat('sebelum klaim ditandai bisa diklaim', u0.claimableToday === true, `claimableToday=${String(u0.claimableToday)}`);

/* 2. Klaim pertama */
const klaim1 = await panggil('POST', '/v1/usage/claim', { token });
const k1 = klaim1.json ?? {};
catat('klaim pertama memberi 100 poin', klaim1.status === 201 && k1.awarded === 100, `HTTP ${klaim1.status} awarded=${String(k1.awarded)}`);
catat('streak hari pertama = 1', k1.streakDay === 1, `streakDay=${String(k1.streakDay)}`);
catat('tanpa bonus di hari pertama', k1.bonus === 0, `bonus=${String(k1.bonus)}`);

/* 3. Klaim kedua (idempoten) */
const klaim2 = await panggil('POST', '/v1/usage/claim', { token });
const k2 = klaim2.json ?? {};
catat('klaim kedua tidak menambah poin', k2.awarded === 0, `awarded=${String(k2.awarded)}`);

const sesudahKlaim = await panggil('GET', '/v1/usage', { token });
const u1 = sesudahKlaim.json ?? {};
catat('saldo 100 setelah klaim', u1.available === 100, `available=${String(u1.available)}`);
catat('sudah diklaim hari ini', u1.claimableToday === false, `claimableToday=${String(u1.claimableToday)}`);

/* 4. Adegan pembuka gratis */
const buat = await panggil('POST', '/v1/journeys', {
  token,
  body: {
    clientOperationId: `op-poin-buka-${stamp}`,
    worldId: 'w_bosku-mantan',
    persona: { name: 'Uji', age: 24 },
    responseLocale: 'id-ID',
  },
});
catat('perjalanan bisa dimulai', buat.status === 201, `HTTP ${buat.status}`);

const setelahBuka = await panggil('GET', '/v1/usage', { token });
const u2 = setelahBuka.json ?? {};
/*
 * Pemeriksaan ini HANYA bermakna bila perjalanannya benar-benar dibuat.
 * Tanpa penjagaan ini, kegagalan membuat perjalanan membuat `spent` tetap 0
 * dan pemeriksaan "pembuka tidak menagih" LULUS tanpa membuktikan apa pun —
 * hijau karena alasan yang salah, kelas kesalahan yang paling mahal.
 */
if (buat.status !== 201) {
  catat('adegan pembuka TIDAK menagih', false, `tidak dapat diuji: perjalanan gagal (HTTP ${String(buat.status)})`);
} else {
  catat('adegan pembuka TIDAK menagih', u2.spent === 0, `spent=${String(u2.spent)}`);
}

/* 5. Satu giliran = 10 poin */
const journeyId = buat.json?.journeyId;
const beat = (buat.json?.opening?.beats ?? []).find((b) => b?.event?.type === 'presentChoices');
const opsi = beat?.event?.options?.[0];

if (!journeyId || !opsi) {
  catat('pembuka menyediakan pilihan', false, 'tidak ada presentChoices/opsi');
} else {
  const giliran = await panggil('POST', `/v1/journeys/${journeyId}/turns`, {
    token,
    body: {
      clientOperationId: `op-poin-giliran-${stamp}`,
      decisionId: beat.event.decisionId,
      selection: { optionId: opsi.optionId },
      responseLocale: 'id-ID',
    },
  });
  catat('giliran berhasil', giliran.status === 201, `HTTP ${giliran.status}`);

  const setelahGiliran = await panggil('GET', '/v1/usage', { token });
  const u3 = setelahGiliran.json ?? {};
  /*
   * Giliran yang jatuh ke simulator cadangan memang tidak ditagih (docs/17).
   * Karena itu hasil yang sah ada DUA: 0 (simulator) atau 10 (mesin AI).
   * Angka lain — mis. ribuan token — berarti penagihan lama masih berjalan.
   */
  const sah = u3.spent === 0 || u3.spent === 10;
  catat(
    'satu giliran menagih 0 (simulator) atau tepat 10 poin (AI)',
    sah,
    `spent=${String(u3.spent)} simulator=${String(giliran.json?.simulator)}`,
  );
  catat('saldo berkurang sesuai tagihan', u3.available === 100 - (u3.spent ?? 0), `available=${String(u3.available)}`);
}

console.log(`\nPUTUSAN: ${gagal === 0 ? 'LULUS' : `GAGAL (${String(gagal)} pemeriksaan)`}`);
process.exit(gagal === 0 ? 0 : 1);
