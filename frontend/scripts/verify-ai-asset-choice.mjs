#!/usr/bin/env node
/**
 * UJI PEMILIHAN ASET OLEH AI — apakah mesin cerita memakai LATAR YANG BENAR.
 *
 * Yang diukur bukan "apakah latar berganti", melainkan: ketika pemain menyebut
 * sebuah TEMPAT, apakah `setBackground` menunjuk berkas latar yang memang tempat
 * itu — bukan latar lain, dan bukan tidak berganti sama sekali.
 *
 * Mengapa uji ini perlu: uji alur lain hanya menghitung "berapa latar berbeda
 * terpakai". Angka itu naik meski AI memilih latar yang SALAH. Yang benar-benar
 * penting adalah kecocokan antara tempat yang diminta dan berkas yang dipakai.
 *
 * Pemakaian:
 *   node scripts/verify-ai-asset-choice.mjs
 *   node scripts/verify-ai-asset-choice.mjs --world w_... --locale id-ID
 */

const API = (process.env.API_URL ?? 'https://fayln-api.marky.blitz.cloud').replace(/\/+$/, '');

/**
 * Tempat yang akan diminta, beserta id latar yang SEHARUSNYA dipakai.
 *
 * Dua set terpisah supaya pengujian kedua memakai tempat yang BELUM pernah
 * disebut — kalau set yang sama diulang, hasilnya bisa lolos hanya karena model
 * menirukan percakapan sebelumnya.
 */
const SET = {
  a: [
    { tanya: 'Kedai Kopi Nyaman', assetId: 'bg_d4f59322-8' },
    { tanya: 'Pantai Berpasir Putih', assetId: 'bg_8f33c169-e' },
    { tanya: 'Stasiun Kereta Api', assetId: 'bg_70ffb30e-a' },
    { tanya: 'Taman Sakura Kota', assetId: 'bg_b6e3992d-e' },
  ],
  b: [
    { tanya: 'Mal Modern Beratap Kaca', assetId: 'bg_8346a4d1-c' },
    { tanya: 'Perpustakaan Modern Berjendela Besar', assetId: 'bg_e6ba03ad-d' },
    { tanya: 'Ruang Game Neon', assetId: 'bg_a38fe653-9' },
    { tanya: 'Pasar Malam Kuil', assetId: 'bg_03de1399-e' },
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* halaman gerbang, bukan JSON */
  }
  return { status: res.status, json, text };
}

/** Latar yang DIPAKAI pada sekumpulan beat, berurutan. */
function latarDipakai(beats) {
  const out = [];
  for (const b of beats || []) {
    const e = b?.event;
    if (e?.type === 'setBackground') out.push(e.assetId);
  }
  return out;
}

function keputusan(beats) {
  for (const b of beats || []) {
    const e = b?.event;
    if (e?.type === 'presentChoices') return e;
  }
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const opsi = { world: 'w_2d6fb908-c27e-4406-a34f-caefd04499c6', locale: 'id-ID', set: 'a' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--world') opsi.world = argv[++i];
    else if (argv[i] === '--locale') opsi.locale = argv[++i];
    else if (argv[i] === '--set') opsi.set = argv[++i];
  }
  const TARGET = SET[opsi.set] ?? SET.a;

  /* ---- Bangunkan backend dulu: halaman gerbang menjawab 503 untuk SEMUA rute ---- */
  for (let i = 0; i < 40; i += 1) {
    const m = await call('GET', '/v1/meta');
    if (m.status === 200) break;
    await sleep(3000);
  }

  const stamp = Math.floor(Date.now() / 1000);
  const email = `aset${stamp}@contoh.test`;
  const reg = await call('POST', '/v1/auth/register', {
    body: { email, password: 'rahasia12345', displayName: 'Uji Aset', age: null },
  });
  if (reg.status !== 201) throw new Error(`registrasi HTTP ${reg.status}: ${reg.text.slice(0, 160)}`);
  const token = reg.json.token;

  const dunia = (await call('GET', `/v1/worlds/${opsi.world}`)).json;
  const peta = new Map((dunia.assetManifest?.backgrounds || []).map((b) => [b.assetId, b.label]));

  console.log(`=== UJI PEMILIHAN ASET OLEH AI ===`);
  console.log(`dunia : "${dunia.title}" (${peta.size} latar) · set ${opsi.set}\n`);

  const buat = await call('POST', '/v1/journeys', {
    token,
    body: {
      clientOperationId: `aset${stamp}0000`,
      worldId: opsi.world,
      persona: { name: 'Arfan', age: 24 },
      responseLocale: opsi.locale,
    },
  });
  if (buat.status !== 201) throw new Error(`buat perjalanan HTTP ${buat.status}: ${buat.text.slice(0, 200)}`);
  const journeyId = buat.json.journeyId;

  const pembuka = buat.json.opening;
  const latarAwal = latarDipakai(pembuka.beats);
  console.log(`pembuka: latar = ${latarAwal.map((a) => peta.get(a) || a).join(', ') || '(tidak ada)'}`);
  console.log(`         ${pembuka.beats.filter((b) => b.event?.type === 'narrate').length} narasi\n`);

  let dec = keputusan(pembuka.beats);
  if (!dec) throw new Error('pembuka tidak menyediakan keputusan');

  const hasil = [];

  for (const [urutan, t] of TARGET.entries()) {
    const perintah = `Aku berdiri dan keluar dari kantor menuju ${t.tanya}.`;
    console.log(`--- ${urutan + 1}. meminta: "${t.tanya}" ---`);
    console.log(`   perintah: "${perintah}"`);

    const g = await call('POST', `/v1/journeys/${journeyId}/turns`, {
      token,
      body: {
        clientOperationId: `aset${stamp}t${urutan}0000`,
        decisionId: dec.decisionId,
        customText: perintah,
        responseLocale: opsi.locale,
      },
    });

    if (g.status !== 201) {
      console.log(`   GAGAL: HTTP ${g.status} — ${g.text.slice(0, 160)}\n`);
      hasil.push({ ...t, dipakai: [], cocok: false, catatan: `HTTP ${g.status}` });
      break;
    }

    const baru = g.json.beats || [];
    const dipakai = latarDipakai(baru);
    const narasi = baru
      .filter((b) => b.event?.type === 'narrate')
      .map((b) => b.event.text)
      .join(' ');

    console.log(`   beat baru : ${baru.length}`);
    console.log(`   latar dipakai : ${dipakai.map((a) => `${peta.get(a) || a}`).join(', ') || '(TIDAK ADA setBackground)'}`);
    console.log(`   narasi    : ${JSON.stringify(narasi.slice(0, 110))}`);

    const cocok = dipakai.includes(t.assetId);
    const pakaiLain = dipakai.filter((a) => a !== t.assetId);
    console.log(`   -> ${cocok ? 'COCOK' : dipakai.length === 0 ? 'TIDAK PINDAH' : 'SALAH LATAR'}\n`);

    hasil.push({
      ...t,
      dipakai,
      cocok,
      catatan: dipakai.length === 0 ? 'tidak ada setBackground' : pakaiLain.map((a) => peta.get(a) || a).join(', '),
    });

    dec = keputusan(baru);
    if (!dec) {
      console.log('   (tidak ada keputusan berikutnya — berhenti)');
      break;
    }
  }

  /* ---- Penilaian ---- */
  const cocok = hasil.filter((h) => h.cocok).length;
  console.log(`\n=== PENILAIAN (${hasil.length} permintaan) ===`);
  for (const h of hasil) {
    const dipakaiLabel = h.dipakai.map((a) => peta.get(a) || a).join(', ') || '(tidak ada)';
    console.log(`  ${h.cocok ? 'COCOK    ' : 'TIDAK    '} diminta "${h.tanya}"`);
    console.log(`            dipakai: ${dipakaiLabel}${h.cocok ? '' : `   [${h.catatan}]`}`);
  }
  console.log(`\n  HASIL: ${cocok}/${hasil.length} permintaan memakai latar yang BENAR`);
  if (cocok < hasil.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nGAGAL: ${err.message}`);
  process.exitCode = 1;
});
