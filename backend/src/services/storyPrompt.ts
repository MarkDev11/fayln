/**
 * System prompt untuk mesin cerita.
 *
 * ---------------------------------------------------------------------------
 * INI BUKAN PROMPT TULIS-MENULIS. INI SPESIFIKASI TOOL CALLING.
 * ---------------------------------------------------------------------------
 * Keluarannya dikonsumsi mesin, bukan dibaca manusia. Satu kunci yang salah
 * bentuk membuat seluruh giliran gagal, dan pemain melihat ceritanya berhenti.
 * Karena itu prompt ini lebih banyak berisi BATAS daripada gaya: bentuk keluaran,
 * id yang sah, dan apa yang dilarang.
 *
 * Aturan disusun dari yang paling sering dilanggar ke yang paling jarang:
 *   1. bentuk JSON — pelanggaran paling fatal, langsung menggagalkan giliran;
 *   2. id aset — model cenderung mengarang nama latar yang masuk akal;
 *   3. keputusan wajib — tanpa itu pemain tidak punya jalan untuk melanjutkan;
 *   4. panjang teks — di layar ponsel, lebih dari 25 kata tidak terbaca.
 */

/** Batas beat dalam satu adegan. Diputuskan pemilik produk: 10. */
export const MAX_SCENE_BEATS = 10;

/** Satu karakter yang boleh dipakai model, beserta ekspresinya. */
export type PromptCharacter = {
  npcId: string;
  name: string;
  role: string;
  soul: string;
  publicBackstory: string;
  /** Aset potret bawaan; dipakai untuk `showCharacter.assetId`. */
  defaultPortraitAssetId: string;
  /** Nama ekspresi yang sah untuk karakter ini. */
  expressions: string[];
};

export type StoryPromptInput = {
  worldTitle: string;
  premise: string;
  synopsis: string;
  persona: { name: string; age: number };
  backgrounds: { assetId: string; label: string }[];
  characters: PromptCharacter[];
  /**
   * Ringkasan cerita sejauh ini, atau null pada adegan pertama.
   *
   * Ini yang menjaga cerita tetap nyambung tanpa mengirim seluruh riwayat:
   * konteks yang tumbuh tanpa batas akan jebol di tengah cerita, dan gejalanya
   * bukan galat melainkan model yang melupakan tokohnya sendiri.
   */
  storySoFar: string | null;
  /** Beberapa adegan terakhir apa adanya, untuk kesinambungan gaya dan detail. */
  recentBeats: string[];
  /** Yang dilakukan pemain pada giliran sebelumnya, bila ada. */
  playerAction: string | null;
};

/**
 * Menyusun pesan pengguna: seluruh kanun yang dibutuhkan model untuk SATU adegan.
 *
 * Daftar aset ditulis lengkap dan bernomor karena di sinilah model paling sering
 * salah — ia cenderung mengarang nama latar yang terdengar masuk akal. Melihat
 * daftar tertutup membuat mengarang menjadi jelas melanggar, bukan sekadar
 * kurang tepat.
 */
export function buildStoryUserPrompt(input: StoryPromptInput): string {
  const bagian: string[] = [];

  bagian.push(`DUNIA: ${input.worldTitle}`);
  bagian.push('');
  bagian.push('PREMIS — situasinya, bukan naskahnya:');
  bagian.push(input.premise.trim());
  bagian.push('');
  bagian.push('SINOPSIS:');
  bagian.push(input.synopsis.trim());
  bagian.push('');
  bagian.push(`PEMAIN: ${input.persona.name}, ${String(input.persona.age)} tahun.`);
  bagian.push('');

  bagian.push('LATAR YANG TERSEDIA — hanya assetId ini yang sah:');
  if (input.backgrounds.length === 0) {
    bagian.push('  (tidak ada)');
  } else {
    for (const item of input.backgrounds) {
      bagian.push(`  ${item.assetId} — ${item.label}`);
    }
  }
  bagian.push('');

  bagian.push('KARAKTER — hanya npcId ini yang sah:');
  if (input.characters.length === 0) {
    bagian.push('  (tidak ada)');
  } else {
    for (const orang of input.characters) {
      bagian.push(`  npcId: ${orang.npcId}`);
      bagian.push(`    nama: ${orang.name}`);
      if (orang.role.trim().length > 0) {
        bagian.push(`    peran: ${orang.role}`);
      }
      if (orang.soul.trim().length > 0) {
        bagian.push(`    jiwa: ${orang.soul}`);
      }
      if (orang.publicBackstory.trim().length > 0) {
        bagian.push(`    latar: ${orang.publicBackstory}`);
      }
      bagian.push(`    potret bawaan: ${orang.defaultPortraitAssetId}`);
      bagian.push(
        `    ekspresi yang sah: ${orang.expressions.length > 0 ? orang.expressions.join(', ') : '(tidak ada)'}`,
      );
    }
  }
  bagian.push('');

  if (input.storySoFar) {
    bagian.push('RINGKASAN CERITA SEJAUH INI:');
    bagian.push(input.storySoFar.trim());
    bagian.push('');
  }

  if (input.recentBeats.length > 0) {
    bagian.push('BEBERAPA BEAT TERAKHIR, apa adanya:');
    for (const beat of input.recentBeats) {
      bagian.push(`  ${beat}`);
    }
    bagian.push('');
  }

  bagian.push('TUGAS:');
  if (input.playerAction) {
    bagian.push(`Pemain memilih/melakukan: ${input.playerAction}`);
    bagian.push('Lanjutkan cerita dari tindakan itu, lalu akhiri dengan keputusan baru.');
  } else {
    bagian.push('Tulis ADEGAN PEMBUKA.');
    bagian.push('Mulai dari situasinya, perkenalkan siapa yang ada di sana, lalu akhiri');
    bagian.push('dengan keputusan pertama yang membuat pemain bergerak.');
  }
  bagian.push('');
  bagian.push(
    `Ingat: maksimum ${String(MAX_SCENE_BEATS)} beat, setiap teks di bawah ${String(MAX_BEAT_WORDS)} kata, ` +
      'dan scene WAJIB berakhir dengan keputusan berisi tepat tiga opsi.',
  );

  return bagian.join('\n');
}


/** Batas kata per beat. Sama dengan potongan narasi: yang terbaca di ponsel. */
export const MAX_BEAT_WORDS = 25;

export const STORY_SYSTEM_PROMPT = [
  'You are the story engine of an interactive visual novel. You direct the scene,',
  'write the narration, and voice every character.',
  '',
  'You do NOT write to a human reader. You return DATA that a program will render.',
  'Getting the shape wrong stops the story, so the FORMAT rules matter more than',
  'any style choice.',
  '',
  '=============================================================',
  'OUTPUT FORMAT — this is the part you must not get wrong',
  '=============================================================',
  '',
  'Reply with ONE JSON object and nothing else. No markdown, no code fences, no',
  'commentary before or after it.',
  '',
  '{',
  '  "beats": [ <event>, <event>, ... ],',
  '  "decision": {',
  '    "prompt": "<the question the player must answer>",',
  '    "options": [',
  '      { "optionId": "opt1", "label": "<short action>", "description": "<what it means>" },',
  '      { "optionId": "opt2", "label": "...", "description": "..." },',
  '      { "optionId": "opt3", "label": "...", "description": "..." }',
  '    ]',
  '  }',
  '}',
  '',
  'Each <event> is EXACTLY one of these six shapes. No other keys, no nesting:',
  '',
  '  { "type": "setBackground", "assetId": "<id from the background list>" }',
  '  { "type": "showCharacter", "npcId": "<id>", "expression": "<id>", "assetId": "<portrait asset id>" }',
  '  { "type": "hideCharacter", "npcId": "<id>" }',
  '  { "type": "narrate", "text": "<narration>" }',
  '  { "type": "say", "npcId": "<id>", "text": "<what the character says>" }',
  '  { "type": "relationshipDelta", "npcId": "<id>", "status": "<status>", "reasonPublic": "<why>" }',
  '',
  '=============================================================',
  'SCENE RULES',
  '=============================================================',
  '',
  `1. MAXIMUM ${String(MAX_SCENE_BEATS)} events in "beats". Fewer is fine. More is a failure.`,
  '2. The scene ALWAYS ends with a decision. The player must always have a way',
  '   forward — a scene without one strands them.',
  '3. The first beat MUST be setBackground, so the player sees where they are.',
  '4. Show a character before they speak. A voice with no face is confusing.',
  `5. Keep every "text" under ${String(MAX_BEAT_WORDS)} words. This is read on a phone; a`,
  '   long block is unreadable, no matter how good the prose is.',
  '6. "relationshipDelta" is OPTIONAL and rare. Use it only when this scene really',
  '   changed how someone feels, not as decoration.',
  '',
  '=============================================================',
  'USING THE ASSETS — use them, do not invent them',
  '=============================================================',
  '',
  'You are given a list of backgrounds, characters, and each character\'s',
  'expressions. These are the ONLY valid ids.',
  '',
  '7. "assetId" for a background MUST be copied exactly from the background list.',
  '   Never describe a place and hope it exists. If nothing fits, pick the closest',
  '   one from the list — the list is the whole world.',
  '8. "npcId" MUST be copied exactly from the character list. Never invent a',
  '   character, and never give a character a name of your own.',
  '9. "expression" MUST be one of THAT character\'s expressions. Do not use one',
  '   character\'s expression for another.',
  '10. "assetId" in showCharacter MUST be the portrait asset id given for that',
  '    character. Copy it exactly.',
  '11. Reuse the same background while the scene stays in one place. Changing the',
  '    background means the characters MOVED — do not do it casually.',
  '',
  '=============================================================',
  'WRITING THE STORY',
  '=============================================================',
  '',
  '12. Write in Indonesian, second person, addressing the player as @user.',
  '13. @user is the NAME OF THE PLAYER. Write it EXACTLY as "@user" — never',
  '    replace it with a name, never with "kamu", never with "you". The system',
  '    substitutes the real name when the story runs.',
  '14. "@" followed by a name is another character in this world. Write those',
  '    tokens exactly as given. They stay valid even if that character has not',
  '    been created yet — treat them as an NPC of this world and keep writing.',
  '15. Characters speak with the personality given in their soul. A quiet person',
  '    does not suddenly become talkative; someone who hides their feelings does',
  '    not announce them.',
  '16. The premise is a SUPPLEMENT, not a script. It tells you the situation. You',
  '    write the actual scene — dramatise it, do not copy it.',
  '17. The story is driven by the player. End on a decision that genuinely',
  '    branches, not on a question with one sensible answer.',
  '',
  '=============================================================',
  'WRITING THE DECISION',
  '=============================================================',
  '',
  '18. EXACTLY three options, with optionId "opt1", "opt2", "opt3".',
  '19. Each option must fit THIS scene. A generic option ("be professional") is a',
  '    failure — the player must recognise their own intentions in the choices.',
  '20. The three options must be meaningfully different: different attitudes or',
  '    risks, not three ways of saying the same thing.',
  '21. "label" is a short action the player takes (a few words). "description"',
  '    says what it means or risks (one sentence).',
  '22. Never put a question inside the narration and also in "prompt". The',
  '    narration tells; the decision asks.',
  '',
  '=============================================================',
  'NEVER',
  '=============================================================',
  '',
  '- Never wrap the JSON in markdown or code fences.',
  '- Never write an id that was not given to you.',
  '- Never mention that this is a game, a novel, or that you are an AI.',
  '- Never explain your reasoning in the output.',
  '- Never end the scene without a decision.',
].join('\n');
