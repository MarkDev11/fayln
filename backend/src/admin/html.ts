/**
 * Renderer HTML untuk panel admin.
 *
 * Tanpa framework dan tanpa CDN — mengikuti pendekatan yang sama dengan situs
 * portofolio dan mockup: satu berkas, nol resource eksternal, dapat dibuka dan
 * diperiksa siapa pun.
 *
 * ATURAN YANG TIDAK BOLEH DILANGGAR: setiap nilai yang berasal dari database atau
 * masukan pengguna WAJIB melewati `esc()`. Judul dunia, nama karakter, dan kode
 * promosi semuanya dapat memuat `<script>`. Satu tempat yang lupa di-escape sudah
 * cukup untuk menjadikan panel ini jalan masuk XSS.
 *
 * Sebaliknya, potongan HTML yang dibuat fungsi di berkas ini TIDAK boleh di-escape
 * lagi. Karena `html()` meng-escape string apa pun yang disisipkan, fungsi yang
 * mengembalikan HTML utuh harus membungkus hasilnya dengan `safe()`. Lihat
 * penjelasan di `safe()` — kelalaian di sini menghasilkan halaman yang menampilkan
 * markup sebagai teks, tanpa galat.
 */

/**
 * Meng-escape teks agar aman disisipkan ke HTML.
 *
 * Mengembalikan `SafeHtml`, bukan `string` biasa. Sebabnya penting: kode di
 * panel ini terbiasa menulis `${esc(nilai)}` di dalam template `html`. Bila
 * hasilnya berupa string, `html` akan meng-escape-nya SEKALI LAGI dan hasilnya
 * `&amp;lt;` alih-alih `&lt;`. Dengan menandainya aman, `esc()` boleh dipakai
 * berulang kali tanpa merusak keluaran — sifat yang membuat kesalahan ini tidak
 * mungkin terulang.
 *
 * Bandingkan `safe()`: `esc` untuk nilai dari luar, `safe` untuk potongan HTML
 * yang sudah kita bangun sendiri.
 */
export function esc(value: unknown): SafeHtml {
  if (value === null || value === undefined) {
    return safe('');
  }
  return safe(
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;'),
  );
}

/**
 * Meng-escape nilai untuk disisipkan ke dalam atribut.
 *
 * Sama dengan `esc`, tetapi juga membuang karakter kontrol. Nilai yang masuk ke
 * atribut seperti `value="..."` tidak boleh memuat baris baru.
 */
export function escAttr(value: unknown): SafeHtml {
  return safe(String(esc(value)).replace(/[\r\n\t]/g, ' '));
}

/**
 * Penanda "ini sudah HTML aman, jangan di-escape lagi".
 *
 * Kenapa ini perlu: `html()` meng-escape setiap string yang disisipkan. Itu
 * benar untuk judul dunia atau kode promosi, tetapi SALAH untuk potongan HTML
 * yang dihasilkan fungsi lain di berkas ini — `table()`, `statusPill()`, atau
 * `html` bersarang. Tanpa penanda ini, hasilnya ter-escape DUA kali:
 * `<td>` menjadi `&lt;td&gt;`, lalu `&amp;lt;td&amp;gt;`. Halamannya tidak
 * melempar galat apa pun — hanya menampilkan markup mentah sebagai teks, dan
 * penyebabnya sulit dilacak karena tidak ada satu baris pun yang "salah".
 *
 * Jadi: setiap fungsi yang MENGEMBALIKAN HTML utuh wajib membungkus hasilnya
 * dengan `safe()`. Nilai dari database TIDAK boleh dibungkus — nilai itu harus
 * melewati `esc()` seperti biasa.
 */
const SAFE = Symbol('html-safe');

/**
 * Potongan HTML yang sudah aman dan tidak boleh di-escape ulang.
 *
 * Sengaja dibuat sebagai subclass `String`, bukan objek biasa. Dengan begitu
 * nilai ini tetap berperilaku sebagai teks di mana pun: bisa dirangkai dengan
 * `+`, disisipkan ke template literal biasa, dibandingkan, atau dipakai sebagai
 * `value` atribut — tanpa berubah menjadi `[object Object]`. Penanda `SAFE`
 * hanya dipakai `html()` untuk tahu bahwa isinya tidak perlu di-escape lagi.
 */
export class SafeHtml extends String {
  readonly [SAFE] = true as const;

  constructor(value: string) {
    super(value);
  }
}

/** Menandai potongan HTML buatan sendiri agar tidak di-escape ulang. */
export function safe(markup: string | SafeHtml): SafeHtml {
  return markup instanceof SafeHtml ? markup : new SafeHtml(markup);
}

function isSafe(value: unknown): value is SafeHtml {
  return value instanceof SafeHtml;
}

/**
 * Membuat potongan HTML dari nilai yang bersumber dari kode.
 *
 * Mengembalikan `SafeHtml`, sehingga hasil `html` dapat disarangkan ke `html`
 * lain — mis. baris tabel yang dibangun di dalam `.map()` — tanpa ter-escape
 * ulang. Untuk memperoleh `string` biasa, ambil `.value` atau lewat `layout()`.
 *
 * Nilai yang disisipkan diperlakukan menurut jenisnya:
 * - `SafeHtml` (hasil `safe()` atau `html` bersarang) — disisipkan apa adanya.
 * - Larik — anggotanya digabung APA ADANYA, tanpa di-escape. Larik selalu
 *   dipakai untuk kumpulan potongan yang sudah dibangun pemanggil (baris tabel,
 *   daftar `<option>`), jadi meng-escape isinya justru merusak keluarannya.
 *   Nilai mentah di dalam potongan itu tetap wajib lewat `esc()` sendiri.
 * - Selain itu — di-escape dengan `esc()`.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = '';
  strings.forEach((part, index) => {
    out += part;
    if (index < values.length) {
      const value = values[index];
      if (isSafe(value)) {
        out += String(value);
      } else if (Array.isArray(value)) {
        out += value.map((item) => String(item)).join('');
      } else {
        // `esc` mengembalikan SafeHtml; `String()` mengambil teks escaped-nya.
        out += String(esc(value));
      }
    }
  });
  return safe(out);
}

export type LayoutOptions = {
  title: string;
  /** Isi halaman, SUDAH berupa HTML aman. */
  body: SafeHtml;
  /** Sesi admin yang sedang masuk; kosong pada halaman masuk. */
  admin?: { displayName: string; username: string; role: string } | null;
  /** Nama menu yang sedang aktif. */
  active?: string;
  /** Pesan singkat untuk ditampilkan di atas isi. */
  notice?: { kind: 'ok' | 'error'; text: string } | null;
};

const NAV: { href: string; label: string; key: string }[] = [
  { href: '/admin', label: 'Ringkasan', key: 'dashboard' },
  { href: '/admin/worlds', label: 'Dunia', key: 'worlds' },
  { href: '/admin/characters', label: 'Karakter', key: 'characters' },
  { href: '/admin/locations', label: 'Lokasi', key: 'locations' },
  { href: '/admin/assets', label: 'Aset', key: 'assets' },
  { href: '/admin/accounts', label: 'Akun', key: 'accounts' },
  { href: '/admin/models', label: 'Model', key: 'models' },
  { href: '/admin/promotions', label: 'Promosi', key: 'promotions' },
  { href: '/admin/settings', label: 'Pengaturan', key: 'settings' },
  { href: '/admin/admins', label: 'Admin', key: 'admins' },
  { href: '/admin/audit', label: 'Audit', key: 'audit' },
];

/**
 * Tata letak halaman.
 *
 * Sengaja mengembalikan `string` PRIMITIF, bukan `SafeHtml`. Halaman jadi sudah
 * final, jadi tidak perlu ditandai aman lagi — dan Fastify hanya menerima nilai
 * primitif pada `reply.send()`. Objek `String` turunan akan ditolak serializer.
 */
export function layout(options: LayoutOptions): string {
  const nav = options.admin
    ? html`<nav class="nav">${NAV.map(
        (item) =>
          html`<a href="${item.href}"${item.key === options.active ? ' class="on"' : ''}>${item.label}</a>`,
      )}</nav>`
    : html``;

  const header = options.admin
    ? html`<header class="top">
        <div class="brand">fayLN <span>admin</span></div>
        ${nav}
        <div class="who">
          <span>${options.admin.displayName || options.admin.username}</span>
          <form method="post" action="/admin/logout"><button class="link" type="submit">Keluar</button></form>
        </div>
      </header>`
    : html``;

  const notice = options.notice
    ? safe(
        `<div class="notice ${options.notice.kind === 'ok' ? 'ok' : 'err'}">${esc(options.notice.text)}</div>`,
      )
    : html``;

  return html`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${options.title} — fayLN admin</title>
<style>${safe(STYLES)}</style>
</head>
<body>
${header}
<main>
${notice}
${options.body}
</main>
</body>
</html>`.toString();
}

/**
 * Gaya panel.
 *
 * Netral dingin dengan aksen yang sama dengan aplikasi pemain, supaya panel
 * terasa bagian dari produk yang sama. Tanpa gradien dan tanpa bayangan berat.
 */
const STYLES = `
:root{
  --bg:#0f1416; --surface:#161d20; --surface2:#1d2629; --line:#2a3538;
  --text:#e6edef; --muted:#8fa1a6; --accent:#2fb894; --danger:#e0574f; --warn:#d9a441;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.top{display:flex;align-items:center;gap:20px;padding:10px 20px;border-bottom:1px solid var(--line);
  background:var(--surface);flex-wrap:wrap}
.brand{font-weight:600;letter-spacing:.02em}
.brand span{color:var(--muted);font-weight:400;font-size:12px;text-transform:uppercase;letter-spacing:.1em}
.nav{display:flex;gap:2px;flex-wrap:wrap;flex:1}
.nav a{padding:6px 11px;border-radius:6px;color:var(--muted);font-size:13px}
.nav a:hover{background:var(--surface2);color:var(--text);text-decoration:none}
.nav a.on{background:var(--accent);color:#06231c;font-weight:600}
.who{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:13px}
main{max-width:1120px;margin:0 auto;padding:24px 20px 64px}
h1{font-size:22px;margin:0 0 4px;font-weight:600}
h2{font-size:15px;margin:28px 0 10px;color:var(--muted);text-transform:uppercase;
  letter-spacing:.08em;font-weight:600}
.sub{color:var(--muted);margin:0 0 20px;font-size:13px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:18px;margin-bottom:18px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px}
.stat b{display:block;font-size:24px;font-weight:600;margin-bottom:2px}
.stat span{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
tbody tr:hover{background:var(--surface2)}
label{display:block;margin-bottom:12px}
label span{display:block;color:var(--muted);font-size:12px;margin-bottom:4px}
input,select,textarea{width:100%;padding:8px 10px;background:var(--bg);color:var(--text);
  border:1px solid var(--line);border-radius:6px;font:inherit}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent)}
textarea{min-height:80px;resize:vertical}
button{padding:8px 15px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);
  color:#06231c;font:inherit;font-weight:600;cursor:pointer}
button:hover{filter:brightness(1.08)}
button.ghost{background:transparent;color:var(--muted);border-color:var(--line);font-weight:400}
button.ghost:hover{color:var(--text);border-color:var(--muted)}
button.danger{background:transparent;color:var(--danger);border-color:var(--danger);font-weight:400}
button.link{background:none;border:none;color:var(--accent);padding:0;font-weight:400;cursor:pointer}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.between{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.notice{padding:10px 13px;border-radius:6px;margin-bottom:16px;font-size:13px}
.notice.ok{background:#12332a;border:1px solid #1d6b52;color:#8fe0c4}
.notice.err{background:#3a1f1d;border:1px solid #7d3733;color:#f0a8a3}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;
  border:1px solid var(--line);color:var(--muted)}
.pill.ok{border-color:#1d6b52;color:#8fe0c4}
.pill.off{border-color:#5a4340;color:#c99}
.pill.draft{border-color:#6b5a1d;color:#e0cf8f}
.muted{color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.right{text-align:right}
.empty{color:var(--muted);padding:22px;text-align:center;border:1px dashed var(--line);border-radius:8px}
.login{max-width:340px;margin:12vh auto}
.inline{display:inline}
.two{display:grid;gap:14px;grid-template-columns:1fr 1fr}
@media(max-width:680px){.two{grid-template-columns:1fr}}
`;

/* ---------------------------------------------------------------- */
/* Potongan yang sering dipakai                                      */
/* ---------------------------------------------------------------- */

/**
 * Tabel dengan kolom yang diberikan.
 *
 * Mengembalikan `SafeHtml`, jadi hasilnya boleh disisipkan ke `html` lain tanpa
 * di-escape ulang. `rows` dan `headers` HARUS sudah dibuat dengan `html` atau
 * sudah di-escape pemanggil.
 */
export function table(headers: string[], rows: (SafeHtml | string)[], emptyText: string): SafeHtml {
  if (rows.length === 0) {
    return html`<div class="empty">${emptyText}</div>`;
  }
  return html`<table>
<thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
<tbody>${rows}</tbody>
</table>`;
}

/**
 * Label status berbentuk pil. Hasilnya aman disisipkan ke `html` lain.
 *
 * `label` dipakai bila teks yang dilihat admin berbeda dari nilai mentahnya —
 * mis. status dunia `retired` yang lebih bermakna sebagai "ditarik". Nilainya
 * tetap di-escape `html()`, jadi aman walau berasal dari basis data.
 */
export function statusPill(status: string, label?: string): SafeHtml {
  const known: Record<string, string> = {
    published: 'ok',
    active: 'ok',
    draft: 'draft',
    retired: 'off',
    revoked: 'off',
  };
  const cls = known[status] ?? '';
  return html`<span class="pill ${cls}">${label ?? status}</span>`;
}

/**
 * Pil dengan kelas dan teks yang ditentukan pemanggil.
 *
 * Dipakai untuk penanda kecil seperti "paid"/"free", "aktif"/"nonaktif", atau
 * "sekali/akun". `tone` memilih warna: `'ok'` hijau, `'off'` merah redup,
 * `'draft'` kuning, atau `''` netral. Mengembalikan `SafeHtml`, jadi hasilnya
 * dapat langsung disisipkan ke template `html` tanpa ter-escape.
 */
export function pill(text: string, tone: '' | 'ok' | 'off' | 'draft' = ''): SafeHtml {
  const cls = tone ? `pill ${tone}` : 'pill';
  return html`<span class="${cls}">${text}</span>`;
}

/** Membentuk nilai untuk atribut `value` pada input. */
export function inputValue(value: unknown): SafeHtml {
  return escAttr(value ?? '');
}

/** Menandai `selected` pada `<option>` yang cocok. */
export function selected(current: unknown, candidate: string): string {
  return String(current ?? '') === candidate ? ' selected' : '';
}

/** Menandai `checked` pada kotak centang. */
export function checked(value: boolean): string {
  return value ? ' checked' : '';
}

/**
 * Meng-escape `value`, atau memakai `fallback` bila nilainya kosong.
 *
 * Menggantikan pola `esc(x) || '—'`. Pola itu TIDAK lagi benar sejak `esc`
 * mengembalikan `SafeHtml`: objek selalu truthy, jadi fallback tidak pernah
 * tampil, dan yang tercetak justru `[object Object]`.
 */
export function escOr(value: unknown, fallback: string): SafeHtml {
  const text = value === null || value === undefined ? '' : String(value);
  return text === '' ? safe(fallback) : esc(text);
}

/**
 * Merapikan nilai waktu dari database menjadi teks pendek.
 *
 * Penting: driver `pg` mengembalikan kolom `timestamptz` sebagai objek `Date`,
 * BUKAN sebagai teks ISO. Memanggil `.slice()` langsung pada nilai itu akan
 * melempar "slice is not a function" — dan galatnya muncul di halaman, bukan di
 * kueri, sehingga mudah disalahartikan sebagai masalah tampilan.
 *
 * Fungsi ini menerima `Date`, teks ISO, dan `null`, lalu selalu mengembalikan
 * teks. `mode` menentukan panjangnya: `'date'` untuk YYYY-MM-DD, `'minute'`
 * untuk YYYY-MM-DD HH:mm.
 */
export function formatTime(value: unknown, mode: 'date' | 'minute' = 'date'): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const iso = value instanceof Date ? value.toISOString() : String(value);
  if (iso.length < 10) {
    return iso;
  }
  if (mode === 'date') {
    return iso.slice(0, 10);
  }
  // Buang penanda zona; nilainya sudah UTC dan ditampilkan sebagai UTC.
  return iso.slice(0, 16).replace('T', ' ');
}
