/**
 * Halaman: kesehatan mesin cerita.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA HALAMAN INI ADA
 * ---------------------------------------------------------------------------
 * Setiap giliran cerita bergantung pada model luar. Ketika model gagal,
 * simulator cadangan mengambil alih TANPA SATU PUN galat terlihat pemain,
 * sehingga satu-satunya korban adalah kualitas cerita - dan korban seperti itu
 * tidak pernah dilaporkan siapa pun. Dulu jejaknya hanya baris log warn yang
 * hilang begitu log platform bergulir.
 *
 * Kejadian itu kini tersimpan di tabel `engine_events`, dan halaman ini yang
 * membacanya: berapa sering simulator menulis cerita, mengapa, dan kapan.
 *
 * Yang TIDAK diperlihatkan di sini sengaja juga perlu dipahami: mode uji di
 * mana seluruh mesinnya simulator BUKAN degradasi, jadi tidak terekam.
 * Yang tercatat hanya penyerahan mesin AI ke simulator - kejadian yang
 * benar-benar menurunkan kualitas cerita.
 */

import { esc, escOr, formatTime, html, pill, table, type SafeHtml } from '../html';
import type { AdminPageContext } from './context';
import type { EngineEventKind, EngineEventRow } from '../../repositories/engineEventRepository';

/** Label dan warna tiap jenis kejadian. */
const JENIS: Record<EngineEventKind, { label: string; tone: '' | 'off' | 'draft' }> = {
  engine_failed: { label: 'Panggilan model gagal', tone: 'off' },
  scene_rejected: { label: 'Adegan ditolak validator', tone: 'off' },
  simulator_used: { label: 'Simulator mengambil alih', tone: 'draft' },
  events_skipped: { label: 'Sebagian peristiwa dibuang', tone: '' },
};

function labelJenis(kind: string): string {
  return JENIS[kind as EngineEventKind]?.label ?? kind;
}

function toneJenis(kind: string): '' | 'off' | 'draft' {
  return JENIS[kind as EngineEventKind]?.tone ?? '';
}

export async function engineList(ctx: AdminPageContext): Promise<SafeHtml> {
  const [events, counts] = await Promise.all([
    ctx.engineEvents.recent(50),
    ctx.engineEvents.countsByKind(),
  ]);

  const total = [...counts.values()].reduce((jumlah, angka) => jumlah + angka, 0);

  const stats = (Object.keys(JENIS) as EngineEventKind[]).map((kind) =>
    html`<div class="stat">
  <b>${String(counts.get(kind) ?? 0)}</b>
  <span>${esc(JENIS[kind].label)}</span>
</div>`,
  );

  const baris = events.map(
    (event: EngineEventRow) => html`<tr>
  <td class="muted mono">${esc(formatTime(event.createdAt, 'minute'))}</td>
  <td>${pill(labelJenis(event.kind), toneJenis(event.kind))}</td>
  <td>${escOr(event.detail, '—')}</td>
  <td class="muted mono">${escOr(event.journeyId, '—')}</td>
  <td class="muted mono">${escOr(event.turnId, '—')}</td>
</tr>`,
  );

  return html`<h1>Mesin cerita</h1>
<p class="sub">
  Setiap giliran cerita ditulis model luar, dengan simulator sebagai cadangan.
  Ketika model gagal, pengambilalihannya TERJADI TANPA GALAT yang terlihat
  pemain, dan kualitas ceritanya yang menanggung. Halaman ini memperlihatkan
  kejadian itu: berapa sering, mengapa, dan kapan.
</p>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(total)}</b><span>Total kejadian tercatat</span></div>
  ${stats}
</div>

<div class="card">
  ${table(
    ['Waktu', 'Jenis', 'Rincian', 'Perjalanan', 'Turn'],
    baris,
    'Belum ada kejadian. Artinya: selama ini seluruh giliran ditulis mesin AI dan tidak ada yang diserahkan ke simulator.',
  )}
</div>

<h2>Cara membaca jenisnya</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    <strong>Panggilan model gagal</strong> - jaringan, batas waktu, atau kunci
    API bermasalah. Satu kali dicoba ulang; bila tetap gagal, giliran jatuh ke
    simulator.
  </p>
  <p class="sub">
    <strong>Adegan ditolak validator</strong> - model menjawab, tetapi isi
    adegannya tidak sah (id asing, bentuk salah). Ini biasanya masalah prompt,
    bukan masalah jaringan.
  </p>
  <p class="sub">
    <strong>Simulator mengambil alih</strong> - giliran yang benar-benar ditulis
    simulator, jadi pemain melihat cerita yang lebih sederhana. Angka inilah
    yang paling perlu dijaga tetap kecil.
  </p>
  <p class="sub" style="margin-bottom:0">
    <strong>Sebagian peristiwa dibuang</strong> - adegan DITERIMA, tetapi satu
    dua peristiwanya dibuang (mis. status hubungan yang tidak dikenal).
    Gilirannya sah; hanya isinya yang berkurang.
  </p>
</div>`;
}
