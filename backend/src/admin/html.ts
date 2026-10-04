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
  /**
   * Gaya tambahan untuk halaman ini, disisipkan MENTAH ke `<head>`.
   *
   * Hanya untuk konstanta yang ditulis di kode (mis. `WIZARD_CSS`). Jangan
   * pernah mengisinya dengan nilai dari basis data atau masukan pengguna —
   * isinya tidak melewati `esc()`.
   */
  styles?: string;
  /**
   * Skrip tambahan, disisipkan MENTAH sebelum `</body>`.
   *
   * Batasan yang sama: hanya konstanta internal. Isi skrip juga tidak boleh
   * memuat `</script>` — teks itu akan menutup tag lebih awal.
   */
  scripts?: string;
};

const NAV: { href: string; label: string; key: string }[] = [
  { href: '/admin', label: 'Ringkasan', key: 'dashboard' },
  { href: '/admin/worlds', label: 'Dunia', key: 'worlds' },
  { href: '/admin/characters', label: 'Karakter', key: 'characters' },
  { href: '/admin/locations', label: 'Lokasi', key: 'locations' },
  { href: '/admin/genres', label: 'Genre', key: 'genres' },
  { href: '/admin/assets', label: 'Aset', key: 'assets' },
  { href: '/admin/accounts', label: 'Akun', key: 'accounts' },
  { href: '/admin/models', label: 'Model', key: 'models' },
  { href: '/admin/promotions', label: 'Promosi', key: 'promotions' },
  { href: '/admin/settings', label: 'Pengaturan', key: 'settings' },
  { href: '/admin/admins', label: 'Admin', key: 'admins' },
  { href: '/admin/audit', label: 'Audit', key: 'audit' },
];

/**
 * Tiga titik jendela macOS.
 *
 * Murni hiasan — tidak ada yang dapat diklik, dan itu memang benar: panel ini
 * halaman web, bukan jendela aplikasi. Karena itu `aria-hidden` dipasang dan
 * tidak ada satu pun elemen fokus di dalamnya; pembaca layar tidak perlu
 * mendengar tiga lingkaran yang tidak melakukan apa-apa.
 */
const TRAFFIC_LIGHTS = safe(
  `<span class="traffic" aria-hidden="true">` +
    `<span class="traffic__dot traffic__dot--close"></span>` +
    `<span class="traffic__dot traffic__dot--min"></span>` +
    `<span class="traffic__dot traffic__dot--zoom"></span>` +
    `</span>`,
);

/**
 * Tata letak halaman.
 *
 * Bentuknya meniru jendela macOS: bilah judul dengan tiga titik di kiri,
 * bilah sisi tetap berisi menu, dan isi halaman sebagai "jendela" putih yang
 * mengambang di atas kanvas kelabu.
 *
 * Sengaja mengembalikan `string` PRIMITIF, bukan `SafeHtml`. Halaman jadi sudah
 * final, jadi tidak perlu ditandai aman lagi — dan Fastify hanya menerima nilai
 * primitif pada `reply.send()`. Objek `String` turunan akan ditolak serializer.
 */
export function layout(options: LayoutOptions): string {
  const signedIn = options.admin !== null && options.admin !== undefined;

  const header = signedIn
    ? html`<header class="top">
  ${TRAFFIC_LIGHTS}
  <div class="brand">fayLN <span>admin</span></div>
  <div class="who">
    <span class="who__name">${options.admin!.displayName || options.admin!.username}</span>
    <form method="post" action="/admin/logout"><button class="link" type="submit">Keluar</button></form>
  </div>
</header>`
    : html``;

  const nav = signedIn
    ? html`<aside class="sidebar">
  <div class="sidebar__label">Panel</div>
  <nav class="nav">${NAV.map(
    (item) =>
      html`<a href="${item.href}"${item.key === options.active ? ' class="on"' : ''}>${item.label}</a>`,
  )}</nav>
</aside>`
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
<style>${safe(STYLES)}${options.styles ? safe(options.styles) : safe('')}</style>
</head>
<body>
${header}
<div class="shell${signedIn ? '' : ' shell--bare'}">
${nav}
<main>
${notice}
${options.body}
</main>
</div>
${options.scripts ? safe(`<script>${options.scripts}</script>`) : safe('')}
</body>
</html>`.toString();
}

/**
 * Gaya panel — ala macOS.
 *
 * TIGA ATURAN YANG MENGIKAT BERKAS INI:
 *
 * 1. **Tanpa resource luar.** Tanpa font web, tanpa CDN, tanpa ikon dari
 *    jaringan. Panel ini harus tampil utuh di jaringan tertutup sekalipun.
 *    Tumpukan font sistem dipakai apa adanya — `-apple-system` memberi SF Pro
 *    di macOS, `Segoe UI Variable` di Windows, `Inter` di Linux.
 *
 * 2. **Tema terang dan gelap.** Tema gelap mengikuti `prefers-color-scheme`
 *    perangkat, bukan sakelar di halaman: itu yang diharapkan dari aplikasi
 *    macOS, dan tidak menambah keadaan yang harus disimpan.
 *
 * 3. **Nama kelas tidak berubah.** Seluruh halaman sudah memakai kelas seperti
 *    `.card`, `.grid`, `.stat`, `.notice`, `.pill`, `.two`, `.between`, dan
 *    seterusnya. Rombakan ini hanya mengubah TAMPILANNYA, bukan namanya —
 *    mengganti nama berarti menyunting belasan halaman sekaligus, dan satu yang
 *    terlewat tidak menghasilkan galat, hanya bagian yang tampil tanpa gaya.
 *
 * JANGAN MENULIS BACKTICK ATAU `${` DI DALAM STRING INI. Isinya template
 * literal; satu backtick saja menutupnya lebih awal, dan sisa CSS-nya menjadi
 * kode TypeScript yang tidak sah — `tsc` gagal dengan pesan yang menunjuk baris
 * komentar CSS, bukan baris yang salah. Ini pernah terjadi pada komentar yang
 * menulis nama properti CSS di antara backtick.
 */
const STYLES = `
:root{
  color-scheme:light dark;

  --canvas:#f2f2f7; --surface:#ffffff; --sidebar:#ececf0; --panel:#f7f7f9;
  --field:#ffffff; --line:rgba(0,0,0,.10); --line-strong:rgba(0,0,0,.16);
  --text:#1d1d1f; --muted:#6e6e73;
  --accent:#007aff; --accent-ink:#ffffff; --accent-soft:rgba(0,122,255,.12);
  --danger:#d70015; --danger-soft:rgba(215,0,21,.10);
  --ok:#1c8b3a; --ok-soft:rgba(28,139,58,.12);
  --warn:#9a6400; --warn-soft:rgba(154,100,0,.12);
  --shadow:0 1px 2px rgba(0,0,0,.10), 0 10px 30px rgba(0,0,0,.07);
  --radius:12px;
}
@media (prefers-color-scheme:dark){
  :root{
    --canvas:#131315; --surface:#2c2c2e; --sidebar:#232325; --panel:#232325;
    --field:#1c1c1e; --line:rgba(255,255,255,.12); --line-strong:rgba(255,255,255,.22);
    --text:#f5f5f7; --muted:#98989d;
    --accent:#0a84ff; --accent-ink:#ffffff; --accent-soft:rgba(10,132,255,.20);
    --danger:#ff6961; --danger-soft:rgba(255,105,97,.16);
    --ok:#4cd964; --ok-soft:rgba(76,217,100,.16);
    --warn:#ffb340; --warn-soft:rgba(255,179,64,.16);
    --shadow:0 1px 2px rgba(0,0,0,.5), 0 10px 30px rgba(0,0,0,.4);
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--text);
  font:13.5px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text",
  "Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}

/* ---------------- Bilah judul ---------------- */
.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:16px;
  height:52px;padding:0 18px;border-bottom:1px solid var(--line);
  background:var(--surface);background:color-mix(in srgb,var(--surface) 82%,transparent);
  backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px)}
.traffic{display:inline-flex;gap:8px;flex:none}
.traffic__dot{width:12px;height:12px;border-radius:50%;display:block}
.traffic__dot--close{background:#ff5f57}
.traffic__dot--min{background:#febc2e}
.traffic__dot--zoom{background:#28c840}
@media (prefers-color-scheme:dark){
  .traffic__dot{box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}
}
.brand{font-weight:600;font-size:14px;letter-spacing:.01em}
.brand span{color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase;
  letter-spacing:.08em;margin-left:2px}
.who{display:flex;align-items:center;gap:12px;margin-left:auto;color:var(--muted);font-size:12.5px}
.who__name{color:var(--text);font-weight:500}

/* ---------------- Kerangka: satu jendela berisi bilah sisi + isi ---------------- */
/*
 * Bilah sisi berada DI DALAM jendela, bukan di sampingnya. Itu yang membuatnya
 * terbaca sebagai jendela macOS — System Settings, Finder, dan Mail semuanya
 * berbentuk satu kartu dengan kolom kiri yang diwarnai berbeda, bukan dua
 * permukaan yang berdiri sendiri.
 *
 * "overflow:hidden" dipakai untuk memangkas sudut kolom kirinya; sudut itu tidak
 * dapat dibulatkan sendiri karena tingginya mengikuti isi halaman.
 */
.shell{max-width:1240px;margin:22px auto 72px;display:flex;align-items:stretch;
  background:var(--surface);border:1px solid var(--line);border-radius:14px;
  box-shadow:var(--shadow);overflow:hidden}
.shell--bare{display:block;max-width:400px;margin:12vh auto;padding:26px}
.shell--bare main{padding:0}
.sidebar{width:236px;flex:none;padding:16px 12px 24px;background:var(--sidebar);
  border-right:1px solid var(--line)}
.sidebar__label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;
  color:var(--muted);padding:0 10px 8px}
.nav{display:flex;flex-direction:column;gap:1px}
.nav a{display:block;padding:6px 10px;border-radius:7px;color:var(--text);font-size:13px;
  line-height:1.4}
.nav a:hover{background:var(--accent-soft);text-decoration:none}
.nav a.on{background:var(--accent);color:var(--accent-ink);font-weight:600}

main{flex:1;min-width:0;padding:24px 26px 32px}
@media(max-width:860px){
  .shell{display:block;margin:12px 12px 48px}
  .sidebar{width:auto;padding:10px;border-right:0;border-bottom:1px solid var(--line)}
  .nav{flex-direction:row;flex-wrap:wrap;gap:4px}
  .sidebar__label{display:none}
  main{padding:18px}
}

/* ---------------- Tipografi ---------------- */
h1{font-size:21px;margin:0 0 6px;font-weight:600;letter-spacing:-.01em}
h2{font-size:13px;margin:26px 0 10px;color:var(--muted);text-transform:uppercase;
  letter-spacing:.06em;font-weight:600}
h2 span{text-transform:none;letter-spacing:normal}
.sub{color:var(--muted);margin:0 0 18px;font-size:12.5px}
.sub strong{color:var(--text);font-weight:600}
.muted{color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-size:11.5px}
.right{text-align:right}

/* ---------------- Permukaan ---------------- */
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;
  padding:16px;margin-bottom:16px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:13px 14px}
.stat b{display:block;font-size:22px;font-weight:600;margin-bottom:1px;letter-spacing:-.01em}
.stat span{color:var(--muted);font-size:11.5px}
.empty{color:var(--muted);padding:22px;text-align:center;border:1px dashed var(--line-strong);
  border-radius:10px;font-size:12.5px}

/* ---------------- Tabel ---------------- */
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--panel);color:var(--muted);font-size:10.5px;text-transform:uppercase;
  letter-spacing:.05em;font-weight:600;white-space:nowrap}
thead th:first-child{border-top-left-radius:8px}
thead th:last-child{border-top-right-radius:8px}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:var(--accent-soft)}

/* ---------------- Formulir ---------------- */
label{display:block;margin-bottom:12px}
label span{display:block;color:var(--muted);font-size:11.5px;margin-bottom:4px}
input,select,textarea{width:100%;padding:6px 10px;background:var(--field);color:var(--text);
  border:1px solid var(--line-strong);border-radius:7px;font:inherit;font-size:13px}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent);
  box-shadow:0 0 0 3px var(--accent-soft)}
input[type=checkbox],input[type=radio]{width:auto;accent-color:var(--accent)}
input[type=range]{padding:0;background:none;border:none;box-shadow:none}
textarea{min-height:80px;resize:vertical}
select{appearance:none;-webkit-appearance:none;
  background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),
    linear-gradient(135deg,var(--muted) 50%,transparent 50%);
  background-position:calc(100% - 15px) 50%,calc(100% - 10px) 50%;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:28px}

/* ---------------- Tombol ---------------- */
button{padding:5px 13px;border-radius:7px;border:1px solid transparent;background:var(--accent);
  color:var(--accent-ink);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;
  box-shadow:0 1px 2px rgba(0,0,0,.12)}
button:hover{filter:brightness(1.06)}
button:active{filter:brightness(.94)}
button:disabled{opacity:.4;cursor:default;filter:none}
button.ghost{background:var(--surface);color:var(--text);border-color:var(--line-strong);
  font-weight:500;box-shadow:0 1px 1px rgba(0,0,0,.06)}
button.ghost:hover{background:var(--panel);filter:none}
button.danger{background:var(--danger-soft);color:var(--danger);
  border-color:color-mix(in srgb,var(--danger) 35%,transparent);font-weight:500;box-shadow:none}
button.danger:hover{background:var(--danger);color:#fff;filter:none}
button.link{background:none;border:none;color:var(--accent);padding:0;font-weight:500;
  box-shadow:none;font-size:12.5px}
button.link:hover{text-decoration:underline;filter:none}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.between{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.inline{display:inline}
.two{display:grid;gap:14px;grid-template-columns:1fr 1fr}
@media(max-width:680px){.two{grid-template-columns:1fr}}

/* ---------------- Pemberitahuan dan pil ---------------- */
.notice{padding:10px 13px;border-radius:9px;margin-bottom:16px;font-size:12.5px;
  border:1px solid transparent}
.notice.ok{background:var(--ok-soft);border-color:color-mix(in srgb,var(--ok) 30%,transparent);
  color:var(--ok)}
.notice.err{background:var(--danger-soft);
  border-color:color-mix(in srgb,var(--danger) 30%,transparent);color:var(--danger)}
.notice.info{background:var(--accent-soft);
  border-color:color-mix(in srgb,var(--accent) 30%,transparent);color:var(--text)}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;
  border:1px solid var(--line-strong);color:var(--muted);white-space:nowrap}
.pill.ok{border-color:color-mix(in srgb,var(--ok) 40%,transparent);color:var(--ok);
  background:var(--ok-soft)}
.pill.off{border-color:color-mix(in srgb,var(--danger) 40%,transparent);color:var(--danger);
  background:var(--danger-soft)}
.pill.draft{border-color:color-mix(in srgb,var(--warn) 40%,transparent);color:var(--warn);
  background:var(--warn-soft)}

/* ---------------- Halaman masuk ---------------- */
.login{max-width:340px;margin:0 auto}
.login .brand{margin-bottom:4px}
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
    /**
     * Nama kelas itu sendiri diterima.
     *
     * Sebagian pil tidak menyebut status, melainkan kemajuan atau penanda
     * ("langkah 2 dari 3", "bawaan"). Memaksa pemanggilnya mengarang status
     * palsu yang kebetulan berwarna sama adalah cara paling cepat membuat
     * warnanya salah tanpa ada yang menyadari.
     */
    ok: 'ok',
    off: 'off',
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
