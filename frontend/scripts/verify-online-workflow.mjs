#!/usr/bin/env node
/**
 * Validasi menyeluruh: frontend terhubung ke backend ONLINE, dan seluruh alur
 * perjalanan berjalan dari awal sampai berulang.
 *
 * Skrip ini menembak backend produksi langsung dengan bentuk badan yang SAMA
 * seperti yang dikirim `HttpStoryGateway` — bukan badan karangan. Kalau salah
 * satu langkah putus, langkah itu dilaporkan GAGAL beserta status HTTP-nya,
 * bukan disembunyikan.
 *
 * Pemakaian:
 *   node scripts/verify-online-workflow.mjs
 *   BASE_URL=https://... node scripts/verify-online-workflow.mjs
 */

const BASE_URL = (process.env.BASE_URL || 'https://fayln-api.marky.blitz.cloud').replace(/\/+$/, '');

const hasil = [];
let gagal = 0;

function catat(nama, lulus, detail) {
  hasil.push({ nama, lulus, detail });
  if (!lulus) gagal += 1;
  const tanda = lulus ? 'LULUS' : 'GAGAL';
  console.log(`[${tanda}] ${nama}${detail ? ` — ${detail}` : ''}`);
}

async function panggil(method, path, { body, token, timeoutMs = 180000 } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const mulai = Date.now();
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
    try {
      json = teks ? JSON.parse(teks) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json, teks, ms: Date.now() - mulai };
  } catch (err) {
    return { status: 0, json: null, teks: String(err), ms: Date.now() - mulai };
  } finally {
    clearTimeout(jam);
  }
}

/** Cari event `presentChoices` pertama pada daftar beat. */
function cariPilihan(beats) {
  for (const b of beats || []) {
    const ev = b?.event;
    if (ev?.type === 'presentChoices' && ev.decisionId) return ev;
  }
  return null;
}

const stamp = Date.now();
const email = `wf${stamp}@contoh.test`;
const sandi = 'rahasia12345';

console.log(`\n=== VALIDASI ALUR ONLINE — ${BASE_URL} ===\n`);

/* ---------------------------------------------------------------- */
/* 0. Backend hidup?                                                 */
/* ---------------------------------------------------------------- */
const meta = await panggil('GET', '/v1/meta');
catat(
  '0. GET /v1/meta (backend bangun & mode identitas)',
  meta.status === 200,
  `HTTP ${meta.status}${meta.json ? ` | identityMode=${meta.json.identityMode} | simulator=${meta.json.storyEngine?.simulator}` : ''}`,
);

/* ---------------------------------------------------------------- */
/* 1. Akun pemain                                                    */
/* ---------------------------------------------------------------- */
const reg = await panggil('POST', '/v1/auth/register', {
  body: { email, password: sandi, displayName: 'Uji Alur', age: null },
});
const token = reg.json?.token || '';
catat('1. POST /v1/auth/register', reg.status === 201 && Boolean(token), `HTTP ${reg.status}`);

const me = await panggil('GET', '/v1/auth/me', { token });
catat('2. GET /v1/auth/me (token berlaku)', me.status === 200, `HTTP ${me.status}`);

if (!token) {
  console.log('\nToken tidak ada — sisa alur tidak dapat diuji.');
  process.exit(1);
}

/* ---------------------------------------------------------------- */
/* 2. Katalog (tanpa token, publik)                                  */
/* ---------------------------------------------------------------- */
const katalog = await panggil('GET', '/v1/worlds?limit=10');
const jumlahDunia = katalog.json?.items?.length ?? 0;
catat('3. GET /v1/worlds (katalog publik)', katalog.status === 200 && jumlahDunia > 0, `HTTP ${katalog.status} | ${jumlahDunia} dunia`);

const coverUri = katalog.json?.items?.[0]?.coverUri;
catat(
  '4. coverUri berupa URL ABSOLUT (gambar benar-benar termuat)',
  typeof coverUri === 'string' && /^https?:\/\//.test(coverUri),
  coverUri || '(kosong)',
);

if (coverUri) {
  const img = await panggil('GET', coverUri.replace(BASE_URL, ''));
  catat('5. Sampul dunia dapat diunduh', img.status === 200, `HTTP ${img.status} | ${img.teks.length} byte`);
}

for (const [nama, path] of [
  ['6. GET /v1/worlds/top', '/v1/worlds/top?limit=5'],
  ['7. GET /v1/worlds/new', '/v1/worlds/new?limit=5'],
  ['8. GET /v1/worlds/updated', '/v1/worlds/updated?limit=5'],
  ['9. GET /v1/genres', '/v1/genres'],
]) {
  const r = await panggil('GET', path);
  catat(nama, r.status === 200, `HTTP ${r.status}`);
}

const worldId = katalog.json?.items?.[0]?.worldId;
const detail = await panggil('GET', `/v1/worlds/${encodeURIComponent(worldId)}`);
catat(
  '10. GET /v1/worlds/:id (detail dunia)',
  detail.status === 200,
  `HTTP ${detail.status} | latar=${detail.json?.backgrounds?.length ?? '?'} karakter=${detail.json?.characters?.length ?? '?'}`,
);

/* ---------------------------------------------------------------- */
/* 3. MULAI PERJALANAN                                               */
/* ---------------------------------------------------------------- */
const operasi = `wf${stamp}0000`;
const buat = await panggil('POST', '/v1/journeys', {
  token,
  body: {
    clientOperationId: operasi,
    worldId,
    persona: { name: 'Arfan', age: 24 },
    responseLocale: 'id-ID',
  },
});
const journeyId = buat.json?.journeyId;
catat(
  '11. POST /v1/journeys (MULAI PERJALANAN)',
  buat.status === 201 && Boolean(journeyId),
  `HTTP ${buat.status} | ${buat.ms} ms | model=${buat.json?.opening?.modelId} | simulator=${buat.json?.opening?.simulator}`,
);

if (!journeyId) {
  console.log('\nPerjalanan tidak terbentuk — alur berulang tidak dapat diuji.');
  ringkas();
  process.exit(1);
}

const beatPembuka = buat.json?.opening?.beats?.length ?? 0;
catat('12. Adegan pembuka berisi beat', beatPembuka > 0, `${beatPembuka} beat`);

const adaPilihan = Boolean(cariPilihan(buat.json?.opening?.beats));
catat('13. Adegan pembuka menutup dengan PILIHAN', adaPilihan, adaPilihan ? 'presentChoices ditemukan' : 'tidak ada presentChoices');

/* ---------------------------------------------------------------- */
/* 4. Sesi & lanjutan                                                */
/* ---------------------------------------------------------------- */
const sesi = await panggil('GET', `/v1/journeys/${encodeURIComponent(journeyId)}/session`, { token });
catat(
  '14. GET /v1/journeys/:id/session',
  sesi.status === 200 && Array.isArray(sesi.json?.beats),
  `HTTP ${sesi.status} | ${sesi.json?.beats?.length ?? '?'} beat | simulator=${sesi.json?.simulator}`,
);
catat(
  '15. Sesi & pembuka SEPAKAT soal simulator',
  sesi.json?.simulator === buat.json?.opening?.simulator,
  `pembuka=${buat.json?.opening?.simulator} sesi=${sesi.json?.simulator}`,
);

const daftar = await panggil('GET', '/v1/journeys', { token });
const adaDiDaftar = (daftar.json?.items || []).some((j) => j.journeyId === journeyId);
catat('16. GET /v1/journeys (muncul di "Lanjutkan Bermain")', daftar.status === 200 && adaDiDaftar, `HTTP ${daftar.status} | ${daftar.json?.items?.length ?? 0} perjalanan`);

/* ---------------------------------------------------------------- */
/* 5. BERULANG: giliran demi giliran                                 */
/* ---------------------------------------------------------------- */
let beatsSebelumnya = sesi.json?.beats?.length ?? beatPembuka;
let pilihan = cariPilihan(sesi.json?.beats) || cariPilihan(buat.json?.opening?.beats);
let putaranLulus = 0;

for (let i = 1; i <= 3; i += 1) {
  if (!pilihan) {
    catat(`17.${i} Giliran ke-${i}`, false, 'tidak ada presentChoices untuk dijawab');
    break;
  }

  const opsi = pilihan.options?.[0];
  const giliran = await panggil('POST', `/v1/journeys/${encodeURIComponent(journeyId)}/turns`, {
    token,
    body: {
      clientOperationId: `wf${stamp}t${i}0000`,
      decisionId: pilihan.decisionId,
      selection: { optionId: opsi?.optionId },
      responseLocale: 'id-ID',
    },
  });

  const beatBaru = giliran.json?.beats?.length ?? 0;
  const lulus = giliran.status === 201 && beatBaru > 0;
  catat(
    `17.${i} Giliran ke-${i} (pilihan "${opsi?.label ?? opsi?.optionId}")`,
    lulus,
    `HTTP ${giliran.status} | ${giliran.ms} ms | ${beatBaru} beat baru | model=${giliran.json?.modelId}`,
  );
  if (!lulus) break;

  putaranLulus += 1;

  const sesi2 = await panggil('GET', `/v1/journeys/${encodeURIComponent(journeyId)}/session`, { token });
  const total = sesi2.json?.beats?.length ?? 0;
  catat(
    `17.${i}b Sesi bertambah setelah giliran (progres tersimpan)`,
    total > beatsSebelumnya,
    `${beatsSebelumnya} -> ${total} beat`,
  );
  beatsSebelumnya = total;

  pilihan = cariPilihan(giliran.json?.beats);
}

catat('18. Alur berulang berjalan >1 giliran', putaranLulus >= 2, `${putaranLulus} giliran berhasil`);

/* ---------------------------------------------------------------- */
/* 6. Operasi, posisi baca, kuota, laporan                           */
/* ---------------------------------------------------------------- */
/*
 * Token WAJIB di sini.
 *
 * `/v1/operations/` sengaja TIDAK publik: status operasi menyangkut isi cerita
 * seseorang, jadi server menuntut identitas. `HttpStoryGateway.request`
 * memasang header `Authorization` untuk SEMUA permintaan, termasuk yang ini —
 * jadi probe yang lupa token akan melihat 401 dan salah menuduh backend rusak.
 * Itu pernah terjadi; jangan diulang.
 */
const op = await panggil('GET', `/v1/operations/${encodeURIComponent(operasi)}`, { token });
catat(
  '19. GET /v1/operations/:id (status operasi)',
  op.status === 200,
  `HTTP ${op.status} | state=${op.json?.state} | model=${op.json?.result?.modelId}`,
);

const progres = await panggil('PUT', `/v1/journeys/${encodeURIComponent(journeyId)}/progress`, {
  token,
  body: {
    lastReadSequence: beatsSebelumnya,
    lastReadBeatId: '',
    decisionCount: putaranLulus,
    hasUnreadBeats: false,
  },
});
catat('20. PUT /v1/journeys/:id/progress (simpan posisi baca)', progres.status === 204, `HTTP ${progres.status}`);

const balik = await panggil('GET', `/v1/journeys/${encodeURIComponent(journeyId)}`, { token });
catat(
  '21. Posisi baca benar-benar tersimpan',
  balik.json?.lastReadSequence === beatsSebelumnya,
  `lastReadSequence=${balik.json?.lastReadSequence} (dikirim ${beatsSebelumnya})`,
);

const kuota = await panggil('GET', '/v1/usage', { token });
catat('22. GET /v1/usage (kuota token)', kuota.status === 200, `HTTP ${kuota.status}`);

const laporan = await panggil('POST', '/v1/reports', {
  token,
  body: { clientOperationId: `wf${stamp}rep0000`, category: 'technical', detail: 'Uji alur otomatis.', journeyId },
});
catat('23. POST /v1/reports (laporan pemain)', laporan.status === 201 || laporan.status === 200, `HTTP ${laporan.status}`);

/* ---------------------------------------------------------------- */
/* 7. Otorisasi: sesi milik orang lain harus ditolak                 */
/* ---------------------------------------------------------------- */
const email2 = `wf${stamp}b@contoh.test`;
const reg2 = await panggil('POST', '/v1/auth/register', {
  body: { email: email2, password: sandi, displayName: 'Penyusup', age: null },
});
const token2 = reg2.json?.token || '';
const curang = await panggil('GET', `/v1/journeys/${encodeURIComponent(journeyId)}/session`, { token: token2 });
catat('24. Akun lain DITOLAK membuka sesi ini', curang.status === 403 || curang.status === 404, `HTTP ${curang.status}`);

const tanpaToken = await panggil('GET', `/v1/journeys/${encodeURIComponent(journeyId)}/session`);
catat('25. Tanpa token DITOLAK', tanpaToken.status === 401, `HTTP ${tanpaToken.status}`);

/* ---------------------------------------------------------------- */
/* 8. Bersih-bersih                                                  */
/* ---------------------------------------------------------------- */
const hapus = await panggil('DELETE', `/v1/journeys/${encodeURIComponent(journeyId)}`, { token });
catat('26. DELETE /v1/journeys/:id (bersih-bersih)', hapus.status === 204 || hapus.status === 200, `HTTP ${hapus.status}`);

ringkas();

function ringkas() {
  const lulus = hasil.filter((h) => h.lulus).length;
  console.log(`\n=== RINGKASAN: ${lulus}/${hasil.length} pemeriksaan lulus ===`);
  if (gagal > 0) {
    console.log('\nYang GAGAL:');
    for (const h of hasil.filter((x) => !x.lulus)) console.log(`  - ${h.nama}: ${h.detail}`);
  }
  process.exit(gagal > 0 ? 1 : 0);
}
