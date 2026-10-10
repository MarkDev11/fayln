#!/usr/bin/env node
/**
 * UJI ALUR 5 KEPUTUSAN — apakah cerita benar-benar MAJU dan BERAGAM, atau
 * memutar ulang beat yang sama.
 *
 * Alur yang dijalankan persis seperti yang diminta:
 *   register/login -> pilih cerita yang sudah ada di backend -> mulai perjalanan
 *   -> tangkap percakapan beat sampai keputusan muncul -> pilih satu rekomendasi
 *   -> periksa lagi beatnya -> ulangi sampai 5 kali
 *
 * KRITERIA LULUS (ditetapkan pemilik produk):
 *   1. Beat yang dihasilkan BERBEDA-BEDA tiap putaran
 *   2. Percakapannya BERBEDA
 *   3. Latarnya (background) BERBEDA-BEDA
 *   Gagal bila ada beat yang berulang / looping.
 *
 * Yang diukur adalah ISI BEAT dari server, bukan teks di layar. Teks di layar
 * bergantung pada posisi baca pemain, sehingga bisa "tampak sama" hanya karena
 * ketukan belum maju — itu bukan bukti looping.
 *
 * Pemakaian:
 *   node scripts/verify-journey-flow-5x.mjs
 *   node scripts/verify-journey-flow-5x.mjs --world w_2d6fb908-... --rounds 5
 */

const API = (process.env.API_URL ?? 'https://fayln-api.marky.blitz.cloud').replace(/\/+$/, '');

function parseArgs(argv) {
  const out = {
    // Dunia milik pemilik produk: 22 latar, 2 karakter (rina, daniel).
    world: 'w_2d6fb908-c27e-4406-a34f-caefd04499c6',
    rounds: 5,
    // Dunia ini hanya mendukung en-US.
    locale: 'en-US',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--world') out.world = next();
    else if (a === '--rounds') out.rounds = Number(next());
    else if (a === '--locale') out.locale = next();
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* biarkan null */
  }
  return { status: res.status, json, text };
}

/** Ambil teks percakapan dan latar dari sekumpulan beat. */
function ringkas(beats) {
  const texts = [];
  const bgs = [];
  const speakers = [];
  let decision = null;

  for (const b of beats || []) {
    const e = b?.event;
    if (!e) continue;
    if (e.type === 'narrate') texts.push(e.text);
    else if (e.type === 'say') {
      texts.push(e.text);
      speakers.push(e.npcId);
    } else if (e.type === 'setBackground') bgs.push(e.assetId);
    else if (e.type === 'presentChoices') {
      decision = {
        decisionId: e.decisionId,
        prompt: e.prompt,
        options: (e.options || []).map((o) => ({ optionId: o.optionId, label: o.label })),
      };
    }
  }
  return { texts, bgs, speakers, decision };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const stamp = Date.now();
  const email = `flow${stamp}@contoh.test`;
  const sandi = 'rahasia12345';

  console.log(`\n=== UJI ALUR ${opts.rounds} KEPUTUSAN ===`);
  console.log(`API   : ${API}`);
  console.log(`DUNIA : ${opts.world}\n`);

  /* ---- 1. Register ---- */
  const reg = await call('POST', '/v1/auth/register', {
    body: { email, password: sandi, displayName: 'Uji Alur', age: null },
  });
  const token = reg.json?.token;
  if (!token) throw new Error(`registrasi gagal (HTTP ${reg.status}): ${reg.text.slice(0, 200)}`);
  console.log(`1. register           : HTTP ${reg.status} — akun dibuat`);

  /* ---- 2. Pilih cerita yang sudah ada di backend ---- */
  const dunia = await call('GET', `/v1/worlds/${opts.world}`);
  if (dunia.status !== 200) throw new Error(`dunia tidak terbaca (HTTP ${dunia.status})`);
  const w = dunia.json;
  const man = w.assetManifest || {};
  console.log(`2. pilih cerita        : "${w.title}"`);
  console.log(`   latar tersedia      : ${(man.backgrounds || []).length}`);
  console.log(`   karakter            : ${(w.characters || []).map((c) => c.name).join(', ')}`);

  /* ---- 3. Mulai perjalanan ---- */
  const buat = await call('POST', '/v1/journeys', {
    token,
    body: {
      clientOperationId: `flow${stamp}0000`,
      worldId: opts.world,
      persona: { name: 'Arfan', age: 24 },
      responseLocale: opts.locale,
    },
  });
  const journeyId = buat.json?.journeyId;
  if (!journeyId) {
    throw new Error(`perjalanan gagal dibuat (HTTP ${buat.status}): ${buat.text.slice(0, 300)}`);
  }
  console.log(`3. mulai perjalanan    : HTTP ${buat.status} — ${journeyId}`);

  /* ---- 4. Putaran: tangkap beat -> pilih -> periksa lagi ---- */
  const segmen = [];
  let sudahDibaca = 0;
  let pilihanTerakhir = null;

  for (let ronde = 1; ronde <= opts.rounds + 1; ronde += 1) {
    const sesi = await call('GET', `/v1/journeys/${journeyId}/session`, { token });
    if (sesi.status !== 200) throw new Error(`sesi gagal (HTTP ${sesi.status})`);
    const beats = sesi.json?.beats || [];
    const baru = beats.slice(sudahDibaca);
    sudahDibaca = beats.length;

    const info = ringkas(baru);
    segmen.push({
      ronde,
      jumlahBeat: baru.length,
      texts: info.texts,
      bgs: info.bgs,
      speakers: info.speakers,
      decision: info.decision,
    });

    console.log(`\n--- PUTARAN ${ronde} ---`);
    console.log(`   beat baru   : ${baru.length}`);
    console.log(`   latar       : ${info.bgs.length > 0 ? info.bgs.join(', ') : '(tidak berubah)'}`);
    console.log(`   percakapan  : ${info.texts.length} baris`);
    for (const t of info.texts.slice(0, 4)) {
      console.log(`     - ${String(t).slice(0, 96)}`);
    }
    if (info.texts.length > 4) console.log(`     … dan ${info.texts.length - 4} baris lagi`);

    if (!info.decision) {
      console.log('   KEPUTUSAN   : tidak ada — alur berhenti di sini');
      break;
    }
    console.log(`   KEPUTUSAN   : "${info.decision.prompt}"`);
    console.log(`     opsi      : ${info.decision.options.map((o) => o.label).join(' | ')}`);

    if (ronde > opts.rounds) break;

    // Pilih rekomendasi pertama, seperti pemain yang menekan opsi 1.
    const opsi = info.decision.options[0];
    pilihanTerakhir = opsi?.label ?? null;
    console.log(`   -> memilih : "${opsi?.label}"`);

    const giliran = await call('POST', `/v1/journeys/${journeyId}/turns`, {
      token,
      body: {
        clientOperationId: `flow${stamp}t${ronde}0000`,
        decisionId: info.decision.decisionId,
        selection: { optionId: opsi?.optionId },
        responseLocale: opts.locale,
      },
    });
    if (giliran.status !== 201) {
      console.log(`   GAGAL mengirim giliran: HTTP ${giliran.status} — ${giliran.text.slice(0, 200)}`);
      break;
    }
  }
  void pilihanTerakhir;

  /* ---- 5. Penilaian ---- */
  console.log(`\n\n=== PENILAIAN (${segmen.length} segmen) ===`);

  // 5a. Tidak ada baris yang muncul di lebih dari satu segmen.
  const pemilik = new Map();
  const ulangan = [];
  for (const s of segmen) {
    for (const t of s.texts) {
      const kunci = String(t).trim().toLowerCase();
      if (pemilik.has(kunci)) ulangan.push({ teks: t, di: [pemilik.get(kunci), s.ronde] });
      else pemilik.set(kunci, s.ronde);
    }
  }
  const totalBaris = pemilik.size;
  console.log(`\n1. Percakapan unik`);
  console.log(`   total baris terkumpul : ${segmen.reduce((a, s) => a + s.texts.length, 0)}`);
  console.log(`   baris unik            : ${totalBaris}`);
  console.log(`   baris BERULANG        : ${ulangan.length}`);
  for (const u of ulangan.slice(0, 5)) {
    console.log(`     ! "${String(u.teks).slice(0, 70)}" (putaran ${u.di.join(' & ')})`);
  }

  // 5b. Latar berbeda tiap segmen.
  const latarPer = segmen.map((s) => s.bgs.join('+') || '(tidak ada)');
  const latarUnik = new Set(segmen.flatMap((s) => s.bgs));
  console.log(`\n2. Latar`);
  segmen.forEach((s) => console.log(`   putaran ${s.ronde}: ${s.bgs.join(', ') || '(tidak berubah)'}`));
  console.log(`   latar berbeda dipakai : ${latarUnik.size} dari ${(man.backgrounds || []).length} tersedia`);
  console.log(`   urutan latar unik     : ${new Set(latarPer).size === latarPer.length ? 'YA' : 'TIDAK'}`);

  // 5c. Prompt keputusan berbeda tiap putaran.
  const prompt = segmen.map((s) => s.decision?.prompt ?? '(tidak ada)');
  const promptUnik = new Set(prompt).size;
  console.log(`\n3. Pertanyaan keputusan`);
  prompt.forEach((p, i) => console.log(`   putaran ${i + 1}: "${String(p).slice(0, 70)}"`));
  console.log(`   pertanyaan unik       : ${promptUnik} dari ${prompt.length}`);

  // 5d. Jumlah beat tiap segmen.
  console.log(`\n4. Jumlah beat per segmen: ${segmen.map((s) => s.jumlahBeat).join(', ')}`);

  /* ---- 6. Putusan ---- */
  const lulusPercakapan = ulangan.length === 0 && totalBaris > 0;
  const lulusLatar = new Set(latarPer).size === latarPer.length;
  const lulusPrompt = promptUnik === prompt.length;
  const lulusSemua = lulusPercakapan && lulusLatar && lulusPrompt;

  console.log(`\n=== PUTUSAN ===`);
  console.log(`   percakapan berbeda & tidak ada yang berulang : ${lulusPercakapan ? 'LULUS' : 'GAGAL'}`);
  console.log(`   latar berbeda tiap putaran                   : ${lulusLatar ? 'LULUS' : 'GAGAL'}`);
  console.log(`   pertanyaan keputusan berbeda tiap putaran    : ${lulusPrompt ? 'LULUS' : 'GAGAL'}`);
  console.log(`\n   HASIL AKHIR: ${lulusSemua ? 'LULUS' : 'GAGAL'}`);

  if (!lulusSemua) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nGAGAL:', err.message);
  process.exit(2);
});
