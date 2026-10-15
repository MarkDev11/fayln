#!/usr/bin/env node
/**
 * APAKAH FITUR HUBUNGAN HIDUP? — diukur, bukan dikira.
 *
 * Menjalankan satu perjalanan sungguhan lewat API, lalu MENGHITUNG:
 *   - berapa kali hubungan berubah (`relationshipDelta`),
 *   - apakah setiap statusnya salah satu nilai yang sah,
 *   - berapa status berbeda yang muncul,
 *   - apakah `reasonPublic` selalu terisi.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA SKRIP INI ADA
 * ---------------------------------------------------------------------------
 * Fitur hubungan pernah MATI tanpa satu pun galat: prompt tidak memuat keadaan
 * hubungan maupun kosakata status, dan `status: peristiwa.status as never`
 * membuat nilai karangan model tersimpan apa adanya. Tidak ada uji yang memerah,
 * tidak ada log galat — hanya fitur yang tidak pernah terasa.
 *
 * Karena itu "sudah diperbaiki" harus dibuktikan dengan ANGKA pada perjalanan
 * nyata: berapa kali ia berubah, dan apakah perubahannya sah.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA GILIRANNYA BERSELANG-SELING
 * ---------------------------------------------------------------------------
 * Memilih opsi pertama terus-menerus menghasilkan pemain yang sopan dan datar —
 * tidak ada yang tersinggung, jadi tidak ada yang berubah, dan laporan "0
 * perubahan" akan salah dibaca sebagai "fiturnya mati". Giliran ganjil memakai
 * aksi bebas yang sengaja melewati batas, supaya ada sesuatu yang BENAR-BENAR
 * pantas mengubah perasaan tokoh.
 *
 * Pemakaian:
 *   node scripts/verify-relationship-alive.mjs --turns 6
 *   node scripts/verify-relationship-alive.mjs --world w_xxx --turns 8
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = (process.env.API_URL ?? 'https://fayln-api.marky.blitz.cloud').replace(/\/+$/, '');

/**
 * Status bawaan — CADANGAN saja, bukan daftar yang menutup.
 *
 * Status hubungan sekarang DATA: admin menambahnya lewat panel, dan setiap versi
 * dunia membawa salinan kosakatanya sendiri. Alat ukur ini dulu memakai daftar
 * delapan nilai yang ditulis di sini, sehingga status kesembilan yang SAH
 * dilaporkan sebagai "TIDAK SAH" — tuduhan palsu dari alat yang seharusnya
 * mengukur. Kosakata yang benar dibaca dari sesi (lihat `kosakataDariSesi`), dan
 * daftar ini hanya dipakai bila sesinya tidak memuatnya.
 */
const STATUS_BAWAAN = ['normal', 'hangat', 'waspada', 'tegang', 'renggang', 'dekat', 'sayang', 'cinta'];

/** Aksi bebas yang sengaja melewati batas sopan, untuk memicu perubahan. */
const AKSI_BERANI = [
  '*aku mendekatinya dan mengkabedonnya di depan tim*',
  '*aku memotong kalimatnya dan menertawakan idenya*',
  '*aku menyebut masa lalunya di depan semua orang*',
  '*aku mendekat terlalu dekat dan menyentuh tangannya*',
];

function parseArgs(argv) {
  const out = {
    world: 'w_2d6fb908-c27e-4406-a34f-caefd04499c6',
    turns: 6,
    locale: 'id-ID',
    timeout: 180,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--world') out.world = next();
    else if (a === '--turns') out.turns = Number(next());
    else if (a === '--locale') out.locale = next();
    else if (a === '--timeout') out.timeout = Number(next());
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const opId = (tag) => `${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function api(method, jalur, { token, body } = {}) {
  const res = await fetch(`${API}${jalur}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : null),
      ...(token ? { authorization: `Bearer ${token}` } : null),
    },
    ...(body ? { body: JSON.stringify(body) } : null),
  });
  const teks = await res.text();
  let json = null;
  try {
    json = JSON.parse(teks);
  } catch {
    /* biarkan null */
  }
  return { status: res.status, json, teks };
}

/** Membangunkan aplikasi yang tidur; halaman gerbangnya menjawab 503 untuk semua rute. */
async function tungguBangun(batasMs = 120000) {
  const deadline = Date.now() + batasMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${API}/v1/worlds`);
      if (r.ok) return true;
    } catch {
      /* jaringan belum siap */
    }
    await sleep(4000);
  }
  return false;
}

/** Meringkas seluruh beat menjadi angka yang dapat dibaca. */
function ringkas(beats, statusSah) {
  const delta = beats.filter((b) => b.event.type === 'relationshipDelta');
  const sah = delta.filter((b) => statusSah.includes(b.event.status));
  const tanpaAlasan = delta.filter((b) => String(b.event.reasonPublic ?? '').trim().length === 0);
  const statusUnik = new Set(delta.map((b) => b.event.status));
  return {
    totalBeat: beats.length,
    jumlahDelta: delta.length,
    sah: sah.length,
    tidakSah: delta.length - sah.length,
    tanpaAlasan: tanpaAlasan.length,
    statusUnik: [...statusUnik],
    nilaiTidakSah: delta
      .filter((b) => !statusSah.includes(b.event.status))
      .map((b) => b.event.status),
    rincian: delta.map((b) => ({
      npcId: b.event.npcId,
      status: b.event.status,
      reasonPublic: b.event.reasonPublic,
    })),
  };
}

/**
 * Kosakata yang berlaku, dibaca dari SESI.
 *
 * Inilah satu-satunya sumber yang tahu status apa saja yang sah untuk versi
 * dunia perjalanan ini. Menyalinnya ke dalam skrip berarti alat ukur ini akan
 * menyimpang dari kenyataan setiap kali admin menambah satu status — dan
 * menyimpangnya ke arah tuduhan palsu.
 */
function kosakataDariSesi(sesi) {
  const daftar = sesi?.relationVocabulary;
  if (!Array.isArray(daftar) || daftar.length === 0) {
    console.log('   catatan: sesi tidak memuat relationVocabulary — memakai delapan status bawaan.');
    return [...STATUS_BAWAAN];
  }
  return daftar.map((item) => item.relationId);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!(await tungguBangun())) throw new Error(`backend tidak bangun di ${API}`);
  await sleep(2000);

  const stamp = Math.floor(Date.now() / 1000);
  const email = `relasi${stamp}@contoh.test`;
  const sandi = 'rahasia12345';

  const reg = await api('POST', '/v1/auth/register', {
    body: { email, password: sandi, displayName: 'Arfan', age: 24 },
  });
  if (reg.status !== 201 || !reg.json?.token) {
    throw new Error(`registrasi gagal: HTTP ${reg.status} ${reg.teks.slice(0, 120)}`);
  }
  const token = reg.json.token;

  const profil = await api('GET', `/v1/worlds/${opts.world}`);
  console.log('=== APAKAH HUBUNGAN HIDUP? ===');
  console.log(`API   : ${API}`);
  console.log(`akun  : ${email}`);
  console.log(`dunia : "${profil.json?.title ?? '(tidak diketahui)'}"`);
  console.log(`giliran: ${String(opts.turns)}\n`);

  const dibuat = await api('POST', '/v1/journeys', {
    token,
    body: {
      clientOperationId: opId('buka'),
      worldId: opts.world,
      persona: { name: 'Arfan', age: 24 },
      responseLocale: opts.locale,
    },
  });
  if (dibuat.status !== 201) {
    throw new Error(`pembuatan perjalanan gagal: HTTP ${dibuat.status} ${dibuat.teks.slice(0, 160)}`);
  }
  const journeyId = dibuat.json.journeyId;
  console.log(`perjalanan: ${journeyId}\n`);

  /** Keputusan terakhir dari sebuah daftar beat. */
  const keputusanDari = (beats) =>
    [...beats].reverse().find((b) => b.event.type === 'presentChoices')?.event.decisionId;

  let decisionId = keputusanDari(dibuat.json.opening?.beats ?? []);
  let giliranSelesai = 0;
  /*
   * Berapa giliran yang jatuh ke simulator.
   *
   * Tanpa penghitung ini, PUTUSAN dapat berbunyi HIDUP berdasarkan perubahan
   * hubungan yang ditulis SIMULATOR — mesin cadangan, bukan mesin AI. Itu persis
   * kelas kesalahan yang alat ukur ini ada untuk mencegahnya.
   */
  let giliranSimulator = 0;

  for (let n = 1; n <= opts.turns; n += 1) {
    if (!decisionId) {
      console.log(`   giliran ${String(n)}: tidak ada keputusan tersisa — berhenti.`);
      break;
    }

    const berani = n % 2 === 1;
    const payload = {
      clientOperationId: opId(`giliran${String(n)}`),
      decisionId,
      responseLocale: opts.locale,
      ...(berani
        ? { customText: AKSI_BERANI[(n - 1) % AKSI_BERANI.length] }
        : { selection: { optionId: 'opt1' } }),
    };

    const sebelum = Date.now();
    const hasil = await api('POST', `/v1/journeys/${journeyId}/turns`, { token, body: payload });
    const detik = Math.round((Date.now() - sebelum) / 1000);

    if (hasil.status !== 201) {
      console.log(`   giliran ${String(n)}: GAGAL HTTP ${String(hasil.status)} — ${hasil.teks.slice(0, 100)}`);
      break;
    }

    const beats = hasil.json.beats ?? [];
    const delta = beats.filter((b) => b.event.type === 'relationshipDelta');
    const simulator = hasil.json.simulator === true;
    console.log(
      `   giliran ${String(n)} (${String(detik)} dtk) ${berani ? '[aksi berani]' : '[opsi 1]'}: ` +
        `${String(beats.length)} beat` +
        (delta.length > 0
          ? ` · HUBUNGAN → ${delta.map((b) => `${b.event.npcId}=${b.event.status}`).join(', ')}`
          : ' · tidak ada perubahan hubungan') +
        (simulator ? '  ← SIMULATOR (mesin AI gagal)' : ''),
    );

    giliranSelesai += 1;
    if (simulator) {
      giliranSimulator += 1;
    }
    decisionId = keputusanDari(beats);
  }

  const sesi = await api('GET', `/v1/journeys/${journeyId}/session`, { token });
  if (sesi.status !== 200) throw new Error(`sesi gagal dibaca: HTTP ${String(sesi.status)}`);

  /*
   * Kosakata dibaca dari SESI, bukan dari daftar di berkas ini: hanya sesi yang
   * tahu status apa saja yang sah untuk versi dunia perjalanan ini.
   */
  const statusSah = kosakataDariSesi(sesi.json);
  const angka = ringkas(sesi.json.beats ?? [], statusSah);

  console.log(`\n=== HASIL (${String(giliranSelesai)} giliran, ${String(angka.totalBeat)} beat) ===`);
  console.log(`   status sah untuk dunia   : ${String(statusSah.length)} — ${statusSah.join(', ')}`);
  console.log(`   giliran lewat SIMULATOR  : ${String(giliranSimulator)}`);
  console.log(`   perubahan hubungan       : ${String(angka.jumlahDelta)}`);
  console.log(`   status SAH               : ${String(angka.sah)}`);
  console.log(`   status TIDAK sah         : ${String(angka.tidakSah)}`);
  console.log(`   tanpa reasonPublic       : ${String(angka.tanpaAlasan)}`);
  console.log(`   status berbeda           : ${angka.statusUnik.length > 0 ? angka.statusUnik.join(', ') : '(tidak ada)'}`);

  if (angka.rincian.length > 0) {
    console.log('\n   rincian:');
    for (const d of angka.rincian) {
      console.log(`     ${d.npcId} → ${String(d.status)} — ${String(d.reasonPublic).slice(0, 70)}`);
    }
  }
  if (angka.nilaiTidakSah.length > 0) {
    console.log(`\n   NILAI TIDAK SAH yang lolos: ${angka.nilaiTidakSah.join(', ')}`);
  }

  /*
   * Penilaian.
   *
   * "Hidup" bukan berarti "banyak perubahan" — perubahan yang tidak sah atau
   * tanpa alasan lebih buruk daripada tidak ada perubahan. Yang dinilai:
   * ada perubahan, semuanya sah, dan semuanya punya alasan.
   *
   * DUA SYARAT LAGI, dan keduanya menutup cara alat ukur ini pernah berbohong:
   *
   *   - TIDAK ADA giliran yang jatuh ke simulator. Perubahan hubungan yang
   *     ditulis simulator berasal dari mesin cadangan, bukan mesin AI; ia TIDAK
   *     membuktikan apa pun tentang model.
   *   - Perjalanannya SELESAI. Putusan yang diambil setelah percobaan berhenti
   *     di tengah mengukur potongan yang kebetulan sempat berjalan, bukan
   *     perilaku fiturnya.
   */
  const lengkap = giliranSelesai >= opts.turns;
  const hidup =
    angka.jumlahDelta > 0 &&
    angka.tidakSah === 0 &&
    angka.tanpaAlasan === 0 &&
    giliranSimulator === 0 &&
    lengkap;
  console.log(`\n   PUTUSAN: ${hidup ? 'HIDUP' : 'BELUM'}`);
  if (angka.jumlahDelta === 0) {
    console.log('     - Tidak ada perubahan sama sekali dalam perjalanan ini.');
    console.log('       Periksa log: apakah ada baris "dibuang: relationshipDelta ..."?');
  }
  if (angka.tidakSah > 0) {
    console.log('     - Ada status tidak sah yang TERSIMPAN. Validator tidak berjalan.');
  }
  if (angka.tanpaAlasan > 0) {
    console.log('     - Ada perubahan tanpa alasan. FR-19 tidak ditegakkan.');
  }
  if (giliranSimulator > 0) {
    console.log(
      `     - ${String(giliranSimulator)} giliran jatuh ke SIMULATOR. Perubahan dari mesin` +
        ' cadangan tidak membuktikan apa pun tentang model — periksa log mesin AI.',
    );
  }
  if (!lengkap) {
    console.log(
      `     - Perjalanan berhenti di giliran ${String(giliranSelesai)} dari ${String(opts.turns)}.` +
        ' Jalankan ulang sampai selesai sebelum menyimpulkan.',
    );
  }

  console.log(`\n   perjalanan: ${journeyId}`);
  const berkas = path.join(os.tmpdir(), `fayln-relasi-${String(stamp)}.json`);
  fs.writeFileSync(berkas, JSON.stringify({ journeyId, angka }, null, 2));
  console.log(`   ringkasan : ${berkas}`);

  process.exitCode = hidup ? 0 : 1;
}

main().catch((err) => {
  console.error(`\nGAGAL: ${err.message}`);
  process.exitCode = 1;
});
