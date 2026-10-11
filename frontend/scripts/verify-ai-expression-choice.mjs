#!/usr/bin/env node
/**
 * UJI PEMILIHAN EKSPRESI & POTRET OLEH AI.
 *
 * Mengukur dua hal yang BERBEDA dan sering tertukar:
 *   1. apakah AI memvariasikan EKSPRESI-nya (nama: "serius", "terkejut", …)
 *   2. apakah POTRET yang dipakai ikut berganti (berkas gambar)
 *
 * Mengapa dipisah: pemilik produk melaporkan "ekspresinya tidak pernah berganti,
 * memakai satu ekspresi saja". Terukur waktu itu: **3 ekspresi berbeda, tetapi
 * 1 potret saja**. Jadi AI memang tahu dan memvariasikan ekspresinya — yang tidak
 * pernah berganti adalah GAMBARNYA, karena prompt hanya memberi satu potret per
 * karakter tanpa pasangan ekspresi->potret. Angka "berapa ekspresi berbeda" saja
 * akan menyembunyikan cacat itu.
 *
 * Pemakaian:
 *   node scripts/verify-ai-expression-choice.mjs
 *   node scripts/verify-ai-expression-choice.mjs --world w_... --turns 6
 */

const API = (process.env.API_URL ?? 'https://fayln-api.marky.blitz.cloud').replace(/\/+$/, '');

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
    /* halaman gerbang paket gratis, bukan JSON */
  }
  return { status: res.status, json, text };
}

async function main() {
  const argv = process.argv.slice(2);
  const opsi = {
    world: 'w_2d6fb908-c27e-4406-a34f-caefd04499c6',
    locale: 'id-ID',
    turns: 6,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--world') opsi.world = argv[++i];
    else if (argv[i] === '--locale') opsi.locale = argv[++i];
    else if (argv[i] === '--turns') opsi.turns = Number(argv[++i]);
  }

  /* Backend paket gratis TIDUR dan menjawab 503 untuk SEMUA rute. */
  for (let i = 0; i < 40; i += 1) {
    const m = await call('GET', '/v1/meta');
    if (m.status === 200) break;
    await sleep(3000);
  }

  const stamp = Math.floor(Date.now() / 1000);
  const reg = await call('POST', '/v1/auth/register', {
    body: {
      email: `eks${stamp}@contoh.test`,
      password: 'rahasia12345',
      displayName: 'Uji Ekspresi',
      age: null,
    },
  });
  if (reg.status !== 201) throw new Error(`registrasi HTTP ${reg.status}: ${reg.text.slice(0, 160)}`);
  const token = reg.json.token;

  const dunia = (await call('GET', `/v1/worlds/${opsi.world}`)).json;
  const namaNpc = new Map((dunia.characters || []).map((c) => [c.npcId, c.name]));
  const bawaan = new Map(
    (dunia.characters || []).map((c) => [c.npcId, c.defaultPortraitAssetId]),
  );

  const buat = await call('POST', '/v1/journeys', {
    token,
    body: {
      clientOperationId: `eks${stamp}0000`,
      worldId: opsi.world,
      persona: { name: 'Arfan', age: 24 },
      responseLocale: opsi.locale,
    },
  });
  if (buat.status !== 201) throw new Error(`buat HTTP ${buat.status}: ${buat.text.slice(0, 200)}`);
  const journeyId = buat.json.journeyId;

  console.log(`=== UJI PEMILIHAN EKSPRESI & POTRET ===`);
  console.log(`dunia : "${dunia.title}"\n`);

  const dipakai = [];
  const catat = (beats) => {
    for (const b of beats || []) {
      const e = b?.event;
      if (e?.type === 'showCharacter') {
        dipakai.push({ npcId: e.npcId, expression: e.expression, assetId: e.assetId });
      }
    }
  };

  catat(buat.json.opening.beats);
  let dec = (buat.json.opening.beats || [])
    .map((b) => b.event)
    .find((e) => e?.type === 'presentChoices');

  for (let i = 0; i < opsi.turns && dec; i += 1) {
    const g = await call('POST', `/v1/journeys/${journeyId}/turns`, {
      token,
      body: {
        clientOperationId: `eks${stamp}t${i}0000`,
        decisionId: dec.decisionId,
        selection: { optionId: 'opt1' },
        responseLocale: opsi.locale,
      },
    });
    if (g.status !== 201) {
      console.log(`  giliran ${i + 1}: HTTP ${g.status}`);
      break;
    }
    catat(g.json.beats);
    dec = (g.json.beats || []).map((b) => b.event).find((e) => e?.type === 'presentChoices');
  }

  console.log(`total kemunculan karakter : ${dipakai.length}\n`);

  for (const npcId of new Set(dipakai.map((d) => d.npcId))) {
    const milik = dipakai.filter((d) => d.npcId === npcId);
    const ekspresi = new Set(milik.map((d) => d.expression));
    const potret = new Set(milik.map((d) => d.assetId));

    console.log(`${namaNpc.get(npcId) ?? npcId} — ${milik.length} kemunculan`);
    console.log(`  ekspresi berbeda : ${ekspresi.size}`);
    for (const e of ekspresi) console.log(`     - ${e}`);
    console.log(`  potret berbeda   : ${potret.size}`);
    for (const a of potret) {
      console.log(`     - ${a}${a === bawaan.get(npcId) ? '   <-- BAWAAN' : ''}`);
    }
    console.log();
  }

  const ekspresiUnik = new Set(dipakai.map((d) => d.expression)).size;
  const potretUnik = new Set(dipakai.map((d) => d.assetId)).size;
  const bawaanSaja = [...new Set(dipakai.map((d) => d.assetId))].every((a) =>
    [...bawaan.values()].includes(a),
  );

  console.log('=== PUTUSAN ===');
  console.log(`  AI memvariasikan ekspresi  : ${ekspresiUnik > 1 ? 'YA' : 'TIDAK'} (${ekspresiUnik} nilai)`);
  console.log(`  potret ikut berganti       : ${potretUnik > 1 ? 'YA' : 'TIDAK'} (${potretUnik} berkas)`);
  console.log(`  hanya potret bawaan dipakai: ${bawaanSaja ? 'YA  <-- CACAT' : 'TIDAK'}`);

  /*
   * Yang dinilai adalah KESESUAIAN keduanya: potret harus berganti seiring
   * ekspresi. Memvariasikan ekspresi saja tidak ada gunanya bila gambarnya tetap.
   */
  const lulus = ekspresiUnik > 1 && potretUnik > 1;
  console.log(`\n  HASIL: ${lulus ? 'LULUS' : 'GAGAL'}`);
  if (!lulus) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nGAGAL: ${err.message}`);
  process.exitCode = 1;
});
