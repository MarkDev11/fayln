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

/**
 * Ikon bilah sisi.
 *
 * Ikon berwarna di bilah sisi adalah tanda pengenal System Settings: setiap
 * baris punya kotak kecil bersudut bulat dengan gradien yang berbeda, sehingga
 * menu dapat dikenali dari warnanya sebelum labelnya dibaca. Semuanya SVG
 * sebaris — panel ini tidak boleh memuat apa pun dari jaringan.
 *
 * `aria-hidden` dipasang karena label teksnya sudah ada di sebelah ikon;
 * pembaca layar tidak perlu mendengar bentuk yang tidak menambah makna.
 */
function navIcon(paths: string): SafeHtml {
  return safe(
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths +
      '</svg>',
  );
}

type NavItem = {
  href: string;
  label: string;
  key: string;
  /** Warna gradien kotak ikon. */
  from: string;
  to: string;
  icon: SafeHtml;
};

const NAV: NavItem[] = [
  {
    href: '/admin',
    label: 'Ringkasan',
    key: 'dashboard',
    from: '#8e8e93',
    to: '#5f5f66',
    icon: navIcon(
      '<rect x="2.6" y="2.6" width="4.8" height="4.8" rx="1.2"/>' +
        '<rect x="8.6" y="2.6" width="4.8" height="4.8" rx="1.2"/>' +
        '<rect x="2.6" y="8.6" width="4.8" height="4.8" rx="1.2"/>' +
        '<rect x="8.6" y="8.6" width="4.8" height="4.8" rx="1.2"/>',
    ),
  },
  {
    href: '/admin/worlds',
    label: 'Dunia',
    key: 'worlds',
    from: '#0a84ff',
    to: '#0055c4',
    icon: navIcon(
      '<circle cx="8" cy="8" r="5.6"/><path d="M2.4 8h11.2"/>' +
        '<path d="M8 2.4c1.6 1.7 2.4 3.6 2.4 5.6S9.6 12.3 8 13.6C6.4 12.3 5.6 10.4 5.6 8s.8-3.9 2.4-5.6z"/>',
    ),
  },
  {
    href: '/admin/characters',
    label: 'Karakter',
    key: 'characters',
    from: '#af52de',
    to: '#7a2bd0',
    icon: navIcon(
      '<circle cx="8" cy="5.5" r="2.7"/><path d="M2.9 13.7c0-2.6 2.3-4.3 5.1-4.3s5.1 1.7 5.1 4.3"/>',
    ),
  },
  {
    href: '/admin/locations',
    label: 'Lokasi',
    key: 'locations',
    from: '#30b0c7',
    to: '#1a7f93',
    icon: navIcon(
      '<path d="M8 14.2s4.7-4.3 4.7-7.6A4.7 4.7 0 0 0 8 1.9a4.7 4.7 0 0 0-4.7 4.7c0 3.3 4.7 7.6 4.7 7.6z"/>' +
        '<circle cx="8" cy="6.5" r="1.7"/>',
    ),
  },
  {
    href: '/admin/location-categories',
    label: 'Kategori lokasi',
    key: 'locationCategories',
    from: '#32ade6',
    to: '#0b6fa4',
    icon: navIcon(
      '<path d="M2.6 3.4h10.8l-4.2 4.6v4.6l-2.4 1.4V8z"/>',
    ),
  },
  {
    href: '/admin/genres',
    label: 'Genre',
    key: 'genres',
    from: '#ff9f0a',
    to: '#d97c00',
    icon: navIcon(
      '<path d="M8.7 2.2H13a.9.9 0 0 1 .9.9v4.3a1.7 1.7 0 0 1-.5 1.2l-4.4 4.4a1.7 1.7 0 0 1-2.4 0L3 9.4a1.7 1.7 0 0 1 0-2.4l4.4-4.4a1.7 1.7 0 0 1 1.3-.4z"/>' +
        '<circle cx="10.7" cy="5.3" r=".95"/>',
    ),
  },
  {
    href: '/admin/assets',
    label: 'Aset',
    key: 'assets',
    from: '#5e5ce6',
    to: '#3b39b8',
    icon: navIcon(
      '<rect x="2.4" y="3.2" width="11.2" height="9.6" rx="1.9"/><circle cx="5.9" cy="6.7" r="1.2"/>' +
        '<path d="M3.1 11.6l3.1-2.9 2.4 2.2 2.2-2 2.1 1.9"/>',
    ),
  },
  {
    href: '/admin/accounts',
    label: 'Akun',
    key: 'accounts',
    from: '#34c759',
    to: '#1f8f3f',
    icon: navIcon(
      '<rect x="2.2" y="3.6" width="11.6" height="8.8" rx="2.1"/><path d="M2.2 6.9h11.6"/><path d="M4.8 10.1h2.6"/>',
    ),
  },
  {
    href: '/admin/models',
    label: 'Model',
    key: 'models',
    from: '#ff375f',
    to: '#c9003a',
    icon: navIcon(
      '<rect x="4.4" y="4.4" width="7.2" height="7.2" rx="1.7"/>' +
        '<path d="M6.6 2.1v2.3M9.4 2.1v2.3M6.6 11.6v2.3M9.4 11.6v2.3M2.1 6.6h2.3M2.1 9.4h2.3M11.6 6.6h2.3M11.6 9.4h2.3"/>',
    ),
  },
  {
    href: '/admin/providers',
    label: 'Provider',
    key: 'providers',
    from: '#64d2ff',
    to: '#0a7ea4',
    icon: navIcon(
      '<rect x="2.2" y="3.2" width="11.6" height="4.2" rx="1.5"/>' +
        '<rect x="2.2" y="8.6" width="11.6" height="4.2" rx="1.5"/>' +
        '<path d="M4.6 5.3h.01M4.6 10.7h.01"/>',
    ),
  },
  {
    href: '/admin/promotions',
    label: 'Promosi',
    key: 'promotions',
    from: '#ffd60a',
    to: '#d9a800',
    icon: navIcon(
      '<circle cx="4.9" cy="11.1" r="1.9"/><circle cx="11.1" cy="4.9" r="1.9"/><path d="M12.2 3.8L3.8 12.2"/>',
    ),
  },
  {
    href: '/admin/settings',
    label: 'Pengaturan',
    key: 'settings',
    from: '#8e8e93',
    to: '#5f5f66',
    icon: navIcon(
      '<circle cx="8" cy="8" r="2.2"/>' +
        '<path d="M8 1.9v1.9M8 12.2v1.9M1.9 8h1.9M12.2 8h1.9M3.7 3.7l1.35 1.35M10.95 10.95l1.35 1.35M12.3 3.7l-1.35 1.35M5.05 10.95L3.7 12.3"/>',
    ),
  },
  {
    href: '/admin/admins',
    label: 'Admin',
    key: 'admins',
    from: '#64d2ff',
    to: '#0a84ff',
    icon: navIcon(
      '<path d="M8 2.1l4.9 1.9v3.7c0 3.1-2 5.2-4.9 6.3-2.9-1.1-4.9-3.2-4.9-6.3V4z"/>' +
        '<path d="M6 8l1.5 1.5L10.2 6.8"/>',
    ),
  },
  {
    href: '/admin/audit',
    label: 'Audit',
    key: 'audit',
    from: '#a2845e',
    to: '#7d6343',
    icon: navIcon('<circle cx="8" cy="8" r="5.6"/><path d="M8 4.9V8l2.2 1.4"/>'),
  },
];

/**
 * Tiga titik jendela macOS pada bilah judul.
 *
 * Murni hiasan di jendela utama — tidak ada yang dapat diklik, dan itu memang
 * benar: panel ini halaman web, bukan jendela aplikasi. Karena itu `aria-hidden`
 * dipasang dan tidak ada satu pun elemen fokus di dalamnya.
 *
 * Yang BERFUNGSI adalah tiga titik pada sheet konfirmasi (lihat `SHEET`): di
 * sana ia memang menutup, mengecilkan, dan memperbesar sesuatu.
 */
const TRAFFIC_LIGHTS = safe(
  '<span class="traffic" aria-hidden="true">' +
    '<span class="traffic__dot traffic__dot--close"></span>' +
    '<span class="traffic__dot traffic__dot--min"></span>' +
    '<span class="traffic__dot traffic__dot--zoom"></span>' +
    '</span>',
);

/**
 * Kerangka sheet konfirmasi.
 *
 * Bentuknya meniru jendela macOS: bilah judul dengan tiga titik yang benar-benar
 * dapat ditekan, isi, lalu deretan tombol. Titik merah menutup, kuning
 * mengecilkan sheet sampai tinggal bilah judulnya, hijau memperlebarnya.
 *
 * Dirender server-side, bukan dibuat JavaScript, supaya markupnya ikut tersapu
 * uji render — kalau ia dibuat di sisi klien, tidak ada uji yang akan menangkap
 * markup yang tampil sebagai teks di dalamnya.
 */
const SHEET = safe(
  '<div class="sheet-layer" data-sheet-root hidden>' +
    '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
    '<header class="sheet__bar">' +
    '<span class="traffic traffic--live">' +
    '<button type="button" class="traffic__dot traffic__dot--close" data-sheet-action="close" aria-label="Tutup" title="Tutup"></button>' +
    '<button type="button" class="traffic__dot traffic__dot--min" data-sheet-action="min" aria-label="Kecilkan" title="Kecilkan"></button>' +
    '<button type="button" class="traffic__dot traffic__dot--zoom" data-sheet-action="zoom" aria-label="Perbesar" title="Perbesar"></button>' +
    '</span>' +
    '<h2 class="sheet__title" id="sheet-title" data-sheet-title>Konfirmasi</h2>' +
    '</header>' +
    '<div class="sheet__body"><p class="sheet__text" data-sheet-text></p></div>' +
    '<footer class="sheet__foot">' +
    '<button type="button" class="ghost" data-sheet-action="close">Batal</button>' +
    '<button type="button" class="danger" data-sheet-action="ok" data-sheet-ok>Lanjutkan</button>' +
    '</footer>' +
    '</div>' +
    '</div>',
);

/**
 * Skrip kecil di `<head>` yang memasang tema tersimpan SEBELUM halaman digambar.
 *
 * Tanpa ini, halaman akan berkedip terang lebih dahulu lalu berubah gelap pada
 * setiap pemuatan — persis keluhan yang membuat sakelar tema terasa rusak.
 */
const THEME_BOOT = safe(
  "(function(){try{var m=localStorage.getItem('fayln.admin.theme');" +
    "if(m==='light'||m==='dark'){document.documentElement.setAttribute('data-theme',m);}}catch(e){}})();",
);

/**
 * Perilaku klien panel: sakelar tema dan sheet konfirmasi.
 *
 * Ditulis tanpa pustaka dan tanpa fitur yang tidak ada di peramban lama.
 * Sengaja dipasang di SETIAP halaman, bukan hanya halaman wizard: konfirmasi
 * aksi destruktif tersebar di seluruh panel.
 *
 * Semua kontrol di sini adalah PENINGKATAN, bukan syarat. Tanpa JavaScript,
 * formulir `data-confirm` tetap terkirim seperti biasa dan tombol tema hanya
 * diam — tidak ada satu pun tindakan yang menjadi mustahil.
 */
const APP_SCRIPT = safe(
  [
    '(function () {',
    "  'use strict';",
    '',
    '  /* ---------------- Tema ---------------- */',
    "  var THEME_KEY = 'fayln.admin.theme';",
    '',
    '  function storedTheme() {',
    "    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; }",
    '  }',
    '',
    '  function paintTheme(mode) {',
    "    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-set]'), function (btn) {",
    "      btn.setAttribute('aria-pressed', btn.getAttribute('data-theme-set') === mode ? 'true' : 'false');",
    '    });',
    '  }',
    '',
    '  function applyTheme(mode) {',
    '    var root = document.documentElement;',
    "    if (mode === 'light' || mode === 'dark') { root.setAttribute('data-theme', mode); }",
    "    else { root.removeAttribute('data-theme'); }",
    '    paintTheme(mode);',
    '  }',
    '',
    '  function bindTheme() {',
    "    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-set]'), function (btn) {",
    "      btn.addEventListener('click', function () {",
    "        var mode = btn.getAttribute('data-theme-set');",
    '        try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}',
    '        applyTheme(mode);',
    '      });',
    '    });',
    '    paintTheme(storedTheme());',
    '  }',
    '',
    '  /* ---------------- Sheet konfirmasi ---------------- */',
    "  var layer = document.querySelector('[data-sheet-root]');",
    '  var pending = null;',
    '  var lastFocus = null;',
    '',
    "  function box() { return layer ? layer.querySelector('.sheet') : null; }",
    '',
    '  /*',
    '   * Memanggil submit lewat prototipe, bukan form.submit().',
    '   *',
    '   * submit hanyalah nama properti pada elemen formulir, dan sebuah input',
    '   * bernama "submit" akan menutupinya — panggilan itu lalu gagal tanpa suara.',
    '   * Prototipe tidak dapat ditimpa oleh nama medan.',
    '   */',
    '  function submit(form) {',
    '    window.HTMLFormElement.prototype.submit.call(form);',
    '  }',
    '',
    '  function openSheet(form) {',
    '    var target = box();',
    '    if (!layer || !target) { submit(form); return; }',
    '    pending = form;',
    '    lastFocus = document.activeElement;',
    "    target.classList.remove('sheet--min', 'sheet--zoom');",
    "    layer.querySelector('[data-sheet-text]').textContent =",
    "      form.getAttribute('data-confirm') || 'Lanjutkan tindakan ini?';",
    "    layer.querySelector('[data-sheet-title]').textContent =",
    "      form.getAttribute('data-confirm-title') || 'Konfirmasi';",
    "    var ok = layer.querySelector('[data-sheet-ok]');",
    "    ok.textContent = form.getAttribute('data-confirm-ok') || 'Lanjutkan';",
    '    layer.hidden = false;',
    '    ok.focus();',
    '  }',
    '',
    '  function closeSheet() {',
    '    if (!layer || layer.hidden) { return; }',
    '    layer.hidden = true;',
    '    pending = null;',
    '    if (lastFocus && lastFocus.focus) { lastFocus.focus(); }',
    '  }',
    '',
    '  function confirmSheet() {',
    '    var form = pending;',
    '    closeSheet();',
    '    if (!form) { return; }',
    '    /*',
    '     * Umumkan lebih dahulu bahwa formulir ini memang akan dikirim, lalu',
    '     * kirim sungguhan lewat prototipe.',
    '     *',
    '     * Pengumuman itu perlu karena halaman wizard memasang penjaga perubahan',
    '     * belum tersimpan yang menandai "sudah dikirim" pada setiap peristiwa',
    '     * submit. Pengiriman lewat prototipe melewati semua pendengar, jadi tanpa',
    '     * pengumuman ini penjaganya tetap mengira masih ada perubahan yang belum',
    '     * disimpan, dan peramban menampilkan dialog "tinggalkan situs?" tepat',
    '     * setelah admin menekan tombol konfirmasi.',
    '     */',
    "    form.setAttribute('data-sheet-confirmed', '1');",
    '    try {',
    "      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));",
    '    } catch (e) {',
    "      form.removeAttribute('data-sheet-confirmed');",
    '    }',
    '    submit(form);',
    '  }',
    '',
    '  function bindSheet() {',
    '    if (!layer) { return; }',
    "    layer.addEventListener('click', function (event) {",
    '      if (event.target === layer) { closeSheet(); return; }',
    "      var hit = event.target.closest ? event.target.closest('[data-sheet-action]') : null;",
    '      if (!hit) { return; }',
    "      var kind = hit.getAttribute('data-sheet-action');",
    "      if (kind === 'close') { closeSheet(); }",
    "      else if (kind === 'ok') { confirmSheet(); }",
    "      else if (kind === 'min') { box().classList.toggle('sheet--min'); }",
    "      else if (kind === 'zoom') { box().classList.toggle('sheet--zoom'); }",
    '    });',
    "    document.addEventListener('keydown', function (event) {",
    '      if (layer.hidden) { return; }',
    "      if (event.key === 'Escape') { closeSheet(); }",
    "      if (event.key === 'Enter' && event.target === layer.querySelector('[data-sheet-ok]')) { confirmSheet(); }",
    '    });',
    "    Array.prototype.forEach.call(document.querySelectorAll('form[data-confirm]'), function (form) {",
    "      form.addEventListener('submit', function (event) {",
    "        if (form.getAttribute('data-sheet-confirmed') === '1') {",
    "          form.removeAttribute('data-sheet-confirmed');",
    '          return;',
    '        }',
    '        event.preventDefault();',
    '        openSheet(form);',
    '      });',
    '    });',
    '  }',
    '',
    '  function start() { bindTheme(); bindSheet(); }',
    '',
    "  if (document.readyState === 'loading') {",
    "    document.addEventListener('DOMContentLoaded', start);",
    '  } else { start(); }',
    '})();',
  ].join('\n'),
);

/**
 * Tata letak halaman.
 *
 * Bentuknya mengikuti macOS terkini sebagaimana terlihat pada System Settings:
 * satu jendela yang memenuhi seluruh layar, bilah judul tipis yang tembus
 * pandang, bilah sisi dengan ikon berwarna, dan isi yang menggulir sendiri.
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
  <div class="top__gap"></div>
  <div class="segmented" role="group" aria-label="Tema tampilan">
    <button type="button" data-theme-set="light">Terang</button>
    <button type="button" data-theme-set="dark">Gelap</button>
    <button type="button" data-theme-set="auto">Otomatis</button>
  </div>
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
    /*
     * Atribut kelas ditulis sebagai SafeHtml, bukan string biasa.
     *
     * `html()` meng-escape setiap nilai skalar, dan yang di-escape bukan hanya
     * tanda kurung siku: tanda kutip ikut menjadi &quot;. Akibatnya nilai
     * `class` berisi `"on"` berikut tanda kutipnya, kelasnya tidak pernah
     * cocok, dan tidak ada satu pun menu yang tersorot — tanpa satu pun galat,
     * tanpa satu pun halaman rusak. Cacat ini sempat hidup lama justru karena
     * tampilannya hanya "kurang", bukan "salah".
     */
    (item) =>
      html`<a href="${item.href}"${item.key === options.active ? safe(' class="on"') : safe('')}><span class="nav__icon" style="--i-a:${item.from};--i-b:${item.to}">${item.icon}</span><span class="nav__text">${item.label}</span></a>`,
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
<script>${THEME_BOOT}</script>
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
${signedIn ? SHEET : safe('')}
<script>${APP_SCRIPT}</script>
${options.scripts ? safe(`<script>${options.scripts}</script>`) : safe('')}
</body>
</html>`.toString();
}

/**
 * Gaya panel — macOS terkini, bukan Mac jadul.
 *
 * EMPAT ATURAN YANG MENGIKAT BERKAS INI:
 *
 * 1. **Tanpa resource luar.** Tanpa font web, tanpa CDN, tanpa ikon dari
 *    jaringan. Panel ini harus tampil utuh di jaringan tertutup sekalipun.
 *    Tumpukan font sistem dipakai apa adanya — `-apple-system` memberi SF Pro
 *    di macOS, `Segoe UI Variable` di Windows, `Inter` di Linux.
 *
 * 2. **Yang membuat sesuatu terasa macOS TERKINI** bukan kilau, melainkan:
 *    radius besar yang konsisten, pemisah rambut setipis 1px, permukaan
 *    tembus pandang yang di-blur, bilah sisi berikon warna, dan ruang kosong
 *    yang lapang. Yang membuatnya terasa JADUL justru sebaliknya — gradien
 *    mengkilap, tombol kapsul, dan garis tebal. Hindari yang kedua.
 *
 * 3. **Tema terang dan gelap, dengan pilihan manual.** Bawaannya mengikuti
 *    `prefers-color-scheme`, tetapi `data-theme` pada elemen `html` selalu
 *    menang — itulah yang dipasang sakelar Terang/Gelap/Otomatis. Urutan
 *    penulisannya penting: aturan `[data-theme]` harus berada SETELAH blok
 *    media, sebab spesifisitas keduanya sama dan yang terakhir menang.
 *
 * 4. **Nama kelas tidak berubah.** Seluruh halaman sudah memakai kelas seperti
 *    `.card`, `.grid`, `.stat`, `.notice`, `.pill`, `.two`, `.between`, dan
 *    seterusnya. Rombakan ini hanya mengubah TAMPILANNYA, bukan namanya —
 *    mengganti nama berarti menyunting belasan halaman sekaligus, dan satu yang
 *    terlewat tidak menghasilkan galat, hanya bagian yang tampil tanpa gaya.
 *
 * JANGAN MENULIS BACKTICK ATAU TANDA DOLAR-KURUNG-BUKA DI DALAM STRING INI.
 * Isinya template literal; satu backtick saja menutupnya lebih awal, dan sisa
 * CSS-nya menjadi kode TypeScript yang tidak sah — `tsc` gagal dengan pesan yang
 * menunjuk baris komentar CSS, bukan baris yang salah. Ini pernah terjadi pada
 * komentar yang menulis nama properti CSS di antara backtick.
 */
const STYLES = `
:root{
  color-scheme:light;

  --canvas:#ececf0; --window:#ffffff; --sidebar:#f2f2f5; --panel:#f7f7f9; --panel-2:#ffffff;
  --field:#ffffff; --line:rgba(0,0,0,.08); --line-strong:rgba(0,0,0,.16);
  --bevel:rgba(255,255,255,0);
  --text:#1d1d1f; --muted:#6e6e73;
  --accent:#0071e3; --accent-link:#0071e3; --accent-fill:#0071e3; --accent-ink:#ffffff;
  --accent-soft:rgba(0,113,227,.12);
  --danger:#c2000f; --danger-soft:rgba(194,0,15,.10); --danger-fill:#c2000f;
  --ok:#0a6b28; --ok-soft:rgba(10,107,40,.12);
  --warn:#8a5a00; --warn-soft:rgba(138,90,0,.12);
  --sel:rgba(0,0,0,.055); --hover:rgba(0,0,0,.045); --track:rgba(0,0,0,.07); --seg-active:#ffffff;
  --shadow-ctl:0 1px 1.5px rgba(0,0,0,.10);
  --shadow-card:0 1px 2px rgba(0,0,0,.06), 0 6px 18px rgba(0,0,0,.05);
  --shadow-pop:0 24px 64px rgba(0,0,0,.26);
  --bar:52px; --content:1180px;
  --radius:10px; --radius-lg:14px; --radius-sm:7px; --radius-xs:5px;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme=light]){
    color-scheme:dark;
    --canvas:#131316; --window:#1c1c1e; --sidebar:#202023; --panel:#2a2a2d; --panel-2:#313135;
    --field:#2c2c2f; --line:rgba(255,255,255,.12); --line-strong:rgba(255,255,255,.20);
    --bevel:rgba(255,255,255,.055);
    --text:#f5f5f7; --muted:#a1a1a8;
    --accent:#0a84ff; --accent-link:#409cff; --accent-fill:#0060df; --accent-ink:#ffffff;
    --accent-soft:rgba(64,156,255,.18);
    --danger:#ff8a84; --danger-soft:rgba(255,138,132,.16); --danger-fill:#d70015;
    --ok:#4cd964; --ok-soft:rgba(76,217,100,.16);
    --warn:#ffb340; --warn-soft:rgba(255,179,64,.16);
    --sel:rgba(120,120,128,.22); --hover:rgba(255,255,255,.06); --track:rgba(255,255,255,.09);
    --seg-active:#48484c;
    --shadow-ctl:0 1px 1.5px rgba(0,0,0,.45);
    --shadow-card:0 1px 2px rgba(0,0,0,.44), 0 10px 30px rgba(0,0,0,.28);
    --shadow-pop:0 24px 64px rgba(0,0,0,.66), 0 0 0 .5px rgba(255,255,255,.06);
  }
}
:root[data-theme=dark]{
  color-scheme:dark;
  --canvas:#131316; --window:#1c1c1e; --sidebar:#202023; --panel:#2a2a2d; --panel-2:#313135;
  --field:#2c2c2f; --line:rgba(255,255,255,.12); --line-strong:rgba(255,255,255,.20);
  --bevel:rgba(255,255,255,.055);
  --text:#f5f5f7; --muted:#a1a1a8;
  --accent:#0a84ff; --accent-link:#409cff; --accent-fill:#0060df; --accent-ink:#ffffff;
  --accent-soft:rgba(64,156,255,.18);
  --danger:#ff8a84; --danger-soft:rgba(255,138,132,.16); --danger-fill:#d70015;
  --ok:#4cd964; --ok-soft:rgba(76,217,100,.16);
  --warn:#ffb340; --warn-soft:rgba(255,179,64,.16);
  --sel:rgba(120,120,128,.22); --hover:rgba(255,255,255,.06); --track:rgba(255,255,255,.09);
  --seg-active:#48484c;
  --shadow-ctl:0 1px 1.5px rgba(0,0,0,.45);
  --shadow-card:0 1px 2px rgba(0,0,0,.44), 0 10px 30px rgba(0,0,0,.28);
  --shadow-pop:0 24px 64px rgba(0,0,0,.66), 0 0 0 .5px rgba(255,255,255,.06);
}

*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--window);color:var(--text);
  font:13.5px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text",
  "Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
  display:flex;flex-direction:column;overflow:hidden}
a{color:var(--accent-link);text-decoration:none}
a:hover{text-decoration:underline}
::selection{background:var(--accent-soft)}
:focus-visible{outline:2px solid var(--accent);outline-offset:1px}

/* ---------------- Bilah judul ---------------- */
.top{flex:none;height:var(--bar);display:flex;align-items:center;gap:14px;padding:0 16px;
  background:color-mix(in srgb,var(--sidebar) 74%,transparent);
  backdrop-filter:saturate(180%) blur(24px);-webkit-backdrop-filter:saturate(180%) blur(24px);
  border-bottom:1px solid var(--line);z-index:20}
.top__gap{flex:1}
.traffic{display:inline-flex;gap:8px;flex:none}
.traffic__dot{width:12px;height:12px;border-radius:50%;display:block;padding:0;border:0}
.traffic__dot--close{background:#ff5f57}
.traffic__dot--min{background:#febc2e}
.traffic__dot--zoom{background:#28c840}
@media (prefers-color-scheme:dark){
  :root:not([data-theme=light]) .traffic__dot{box-shadow:inset 0 0 0 1px rgba(0,0,0,.32)}
}
:root[data-theme=dark] .traffic__dot{box-shadow:inset 0 0 0 1px rgba(0,0,0,.32)}
.brand{font-weight:600;font-size:14px;letter-spacing:.01em;white-space:nowrap}
.brand span{color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase;
  letter-spacing:.08em;margin-left:2px}
.who{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:12.5px}
.who__name{color:var(--text);font-weight:500}

/* ---------------- Kontrol tersegmen ---------------- */
.segmented{display:inline-flex;gap:2px;padding:2px;border-radius:var(--radius-sm);
  background:var(--track)}
.segmented button{border:0;background:none;box-shadow:none;color:var(--muted);
  font:inherit;font-size:12px;font-weight:600;padding:3px 11px;border-radius:6px;cursor:pointer}
.segmented button:hover{color:var(--text)}
.segmented button[aria-pressed=true]{background:var(--seg-active);color:var(--text);
  box-shadow:var(--shadow-ctl)}

/* ---------------- Kerangka: bilah sisi + isi, memenuhi layar ---------------- */
.shell{flex:1;display:flex;align-items:stretch;min-height:0;background:var(--window)}
.sidebar{width:238px;flex:none;overflow-y:auto;padding:12px 10px 20px;
  background:color-mix(in srgb,var(--sidebar) 66%,transparent);
  backdrop-filter:saturate(180%) blur(24px);-webkit-backdrop-filter:saturate(180%) blur(24px);
  border-right:1px solid var(--line)}
.sidebar__label{font-size:11.5px;font-weight:600;color:var(--muted);padding:6px 9px 8px}
.nav{display:flex;flex-direction:column;gap:2px}
.nav a{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:6px;
  color:var(--text);font-size:13px;line-height:1.35}
.nav a:hover{background:var(--hover);text-decoration:none}
/*
 * Pemilihan TIDAK memakai --accent penuh.
 *
 * Tiga alasan, ketiganya terukur: teks putih di atas --accent hanya 3,65:1;
 * ubin ikon "Dunia" memakai gradien biru yang sama, sehingga ubinnya hilang
 * saat barisnya terpilih; dan satu baris biru mematikan kode warna dua belas
 * ikon di bawahnya. System Settings memakai isian kelabu tembus pandang.
 */
.nav a.on{background:var(--sel);font-weight:600}
.nav__icon{width:18px;height:18px;flex:none;border-radius:var(--radius-xs);
  display:grid;place-items:center;color:#fff;
  background:linear-gradient(160deg,var(--i-a),var(--i-b));
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.28), 0 1px 1.5px rgba(0,0,0,.22)}
.nav__icon svg{width:11px;height:11px;display:block}
.nav__text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

main{flex:1;min-width:0;overflow-y:auto;padding:28px 32px 64px;background:var(--window)}
/*
 * margin-inline, BUKAN margin shorthand.
 *
 * Aturan h1/h2/.sub di bawah memakai shorthand margin dengan spesifisitas yang
 * sama, dan shorthand itu menghapus auto pada sisi kiri-kanan. Akibatnya judul
 * menempel ke tepi kiri sementara kartu tetap di tengah — terukur 207px pada
 * lebar 1908px, di SETIAP halaman panel. Menulis margin-inline di sini membuat
 * kedua sisi tidak lagi bertabrakan.
 */
main>*{max-width:var(--content);margin-inline:auto}
@media(max-width:900px){
  .shell{flex-direction:column}
  .sidebar{width:auto;border-right:0;border-bottom:1px solid var(--line);padding:8px 10px}
  .nav{flex-direction:row;flex-wrap:wrap;gap:4px}
  .sidebar__label{display:none}
  main{padding:18px 16px 48px}
  .top{gap:10px;padding:0 12px}
  .brand span,.who__name{display:none}
}

/* ---------------- Tipografi ---------------- */
/*
 * Skala lama tidak punya undakan: seluruhnya antara 10,5 dan 13,5px, dan DUA
 * tingkat memakai huruf besar semua (h2 12px, th 10,5px) sehingga keduanya
 * justru lebih kecil daripada teks isi 13,5px — judul bagian lebih kecil dari
 * paragrafnya, kepala kolom lebih kecil dari datanya. Huruf besar semua juga
 * bukan kebiasaan macOS; System Settings memakai huruf biasa.
 */
h1{font-size:20px;line-height:1.25;letter-spacing:-.021em;font-weight:600;margin-block:0 6px}
h2{font-size:13px;line-height:1.35;font-weight:600;letter-spacing:-.005em;
  margin-block:32px 10px;color:var(--text)}
h2 span{font-weight:500}
.sub{color:var(--muted);margin-block:0 20px;font-size:13px;line-height:1.5}
.sub strong{color:var(--text);font-weight:600}
.muted{color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-size:11.5px}
.right{text-align:right}

/* ---------------- Kepala halaman ---------------- */
.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.page-head h1{margin-block:0}
.page-head .sub{margin-block:7px 20px}

/* ---------------- Permukaan ---------------- */
/*
 * Di tema gelap, isian saja tidak pernah cukup: --panel di atas --window hanya
 * 1,16:1. Yang memisahkan kartu dari latarnya adalah TIGA isyarat sekaligus —
 * sorot tipis di tepi atas, bayangan jatuh, dan garis rambut. Tanpa ketiganya
 * kartu tenggelam dan halaman terbaca datar.
 */
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
  padding:20px;margin-bottom:16px;
  box-shadow:inset 0 1px 0 var(--bevel), var(--shadow-card)}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(184px,1fr))}
/*
 * Kartu yang isinya daftar bergrup: tanpa padding, supaya barisnya menyentuh
 * tepi kartu seperti System Settings. overflow:hidden yang membulatkan sudut
 * baris pertama dan terakhir, jadi tidak perlu aturan first/last-child yang
 * akan salah ketika daftarnya hanya berisi satu baris.
 */
.card--list{padding:0;overflow:hidden}
.card--list .sub{margin:16px 16px 0}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
  padding:16px 18px;box-shadow:inset 0 1px 0 var(--bevel), var(--shadow-card)}
.stat b{display:block;font-size:24px;font-weight:600;line-height:1.2;margin-bottom:2px;
  letter-spacing:-.022em}
.stat span{color:var(--muted);font-size:12px}
.empty{color:var(--muted);padding:28px;text-align:center;
  border:1px dashed var(--line-strong);border-radius:var(--radius);font-size:13px}

/* ---------------- Daftar bergrup ---------------- */
.list{display:flex;flex-direction:column}
.list__item{display:flex;align-items:center;gap:14px;padding:11px 16px;color:var(--text);
  border-bottom:1px solid var(--line)}
.list__item:last-child{border-bottom:0}
.list__item:hover{background:var(--hover);text-decoration:none}
.list__main{flex:1;min-width:0}
.list__title{font-size:13.5px;font-weight:500;line-height:1.35}
.list__meta{color:var(--muted);font-size:12px;line-height:1.45;margin-top:3px}
.list__side{flex:none;display:flex;align-items:center;gap:14px;color:var(--muted);font-size:12px}
.list__chev{flex:none;color:var(--muted);display:grid;place-items:center;opacity:.8}
/* Potret mini pada daftar karakter. Nisbahnya 2:3, sama seperti potret yang
   diunggah, supaya wajah tidak terpotong di tengah dahi. */
.list__thumb{flex:none;width:36px;height:54px;object-fit:cover;object-position:top center;
  border-radius:var(--radius-xs);border:1px solid var(--line);background:var(--field)}

/* Latar mini pada daftar lokasi. Nisbahnya 16:9, sama seperti latar yang
   diunggah — memakai nisbah potret akan memotong bagian tengah gambarnya. */
.list__thumb--wide{width:64px;height:36px;object-position:center}

/* ---------------- Tabel ---------------- */
/*
 * vertical-align:middle, bukan top. Dengan top, baris setinggi 52px menaruh
 * angka di tepi atas dan menyisakan sekitar 35px kosong di bawahnya — itulah
 * yang membuat tabel tampak melompong meski isinya sedikit.
 */
table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);
  vertical-align:middle}
th{color:var(--muted);font-size:11.5px;font-weight:500;white-space:nowrap}
td{font-variant-numeric:tabular-nums}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:var(--hover)}

/* ---------------- Formulir ---------------- */
label{display:block;margin-bottom:14px}
label span{display:block;color:var(--muted);font-size:12px;font-weight:500;margin-bottom:5px}
input,select,textarea{width:100%;padding:7px 11px;background:var(--field);color:var(--text);
  border:1px solid var(--line-strong);border-radius:var(--radius-sm);font:inherit;font-size:13px;
  box-shadow:inset 0 1px 1.5px rgba(0,0,0,.045)}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent);
  box-shadow:0 0 0 3.5px var(--accent-soft)}
input[type=checkbox],input[type=radio]{width:auto;accent-color:var(--accent)}
input[type=range]{padding:0;background:none;border:none;box-shadow:none}
/*
 * Tombol di dalam pemilih berkas bergaya bawaan peramban dan tidak ikut
 * diwarnai oleh aturan elemen input di atas. Tanpa aturan ini, ia menjadi
 * satu-satunya kontrol yang masih terlihat seperti tahun 2010 di tengah panel
 * yang lain.
 */
input[type=file]{padding:5px}
input[type=file]::file-selector-button{margin-right:8px;padding:5px 12px;
  border:1px solid var(--line-strong);border-radius:var(--radius-xs);background:var(--window);
  color:var(--text);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer}
input[type=file]::file-selector-button:hover{background:var(--hover)}
textarea{min-height:88px;resize:vertical}
select{appearance:none;-webkit-appearance:none;
  background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),
    linear-gradient(135deg,var(--muted) 50%,transparent 50%);
  background-position:calc(100% - 15px) 50%,calc(100% - 10px) 50%;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:28px}

/*
 * Bidang bergaya "label di atas, isian, bantuan di bawah".
 *
 * Dipakai formulir yang isiannya perlu DIJELASKAN, bukan sekadar diberi nama:
 * nama bidang yang baik belum tentu cukup ("Prefix" tidak memberi tahu bahwa
 * nilainya dipakai sebagai awalan id model). Tempat penjelasan yang benar
 * adalah tepat di bawah isiannya, bukan di paragraf jauh di atas formulir —
 * di sana ia terpisah dari hal yang diterangkannya begitu halaman digulir.
 *
 * Spesifisitasnya sengaja lebih tinggi daripada aturan label span, yang akan
 * menimpa warna dan ukuran keduanya karena span di sini juga anak label.
 */
.field{margin-bottom:20px}
.field__label{display:block;color:var(--text);font-size:13px;font-weight:500;margin:0 0 6px}
.field__hint{display:block;color:var(--muted);font-size:12px;font-weight:400;
  line-height:1.55;margin:6px 0 0}
/* "Wajib." dibedakan dari penjelasannya: yang pertama syarat, yang kedua alasan. */
.field__hint b{color:var(--text);font-weight:500}
/* Sejalan dengan .mono, dan sengaja memakai tumpukan yang sama persis. */
.field__mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}

/*
 * Baris status bidang: hasil sesuatu yang dikerjakan SETELAH halaman tampil,
 * mis. mengambil daftar model dari provider. Warnanya menyatakan hasilnya,
 * karena "berhasil" dan "gagal" di sini hanya berbeda satu kata.
 */
.field__status{display:block;font-size:12px;line-height:1.55;margin:6px 0 0;color:var(--muted)}
.field__status[data-state=ok]{color:var(--ok)}
.field__status[data-state=error]{color:var(--danger)}

/*
 * Combobox: isian yang tetap bebas diketik, dengan daftar saran melayang.
 *
 * Mengapa bukan <datalist> atau <select>: keduanya dirender oleh PERAMBAN, dan
 * daftar bawaan peramban tidak dapat digayakan sama sekali — di Windows ia
 * muncul sebagai kotak abu-abu persegi di tengah panel yang serba membulat, dan
 * tidak ada satu properti CSS pun yang dapat mengubahnya. Satu-satunya cara
 * mendapatkan daftar bergaya macOS adalah menggambarnya sendiri.
 *
 * <select> juga bukan pilihan di sini karena ia MENGUNCI pilihan: penyedia
 * menambah model lebih cepat daripada halaman ini dimuat ulang, dan nama yang
 * belum terdaftar harus tetap dapat diketik.
 */
.combo{position:relative}
.combo__menu{position:absolute;z-index:40;top:calc(100% + 6px);left:0;right:0;
  max-height:264px;overflow-y:auto;margin:0;padding:5px;list-style:none;
  background:var(--panel);border:1px solid var(--line-strong);border-radius:10px;
  box-shadow:0 14px 34px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.14)}
.combo__menu[hidden]{display:none}
.combo__item{padding:6px 10px;border-radius:6px;font-size:13px;line-height:1.35;
  cursor:default;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
/*
 * Sorotan memakai --accent-fill dengan --accent-ink, pasangan yang sama dengan
 * tombol: di tema gelap --accent terlalu terang untuk teks putih di atasnya.
 */
.combo__item[data-active=true]{background:var(--accent-fill);color:var(--accent-ink)}
.combo__empty{padding:8px 10px;font-size:12.5px;line-height:1.5;color:var(--muted)}

/* ---------------- Tombol ---------------- */
/*
 * Isian tombol memakai --accent-fill, bukan --accent. Di tema gelap --accent
 * adalah biru terang (#0a84ff) yang hanya memberi 3,65:1 untuk teks putih di
 * atasnya; --accent-fill yang lebih tua memberi 5,62:1. Tautan tetap memakai
 * --accent-link yang terang, karena di sana teksnya yang berwarna, bukan
 * latarnya.
 */
button{padding:6px 14px;border-radius:var(--radius-sm);border:1px solid transparent;
  background:var(--accent-fill);color:var(--accent-ink);font:inherit;font-size:13px;
  font-weight:600;cursor:pointer;box-shadow:var(--shadow-ctl)}
button:hover{filter:brightness(1.08)}
button:active{filter:brightness(.94)}
button:disabled{opacity:.4;cursor:default;filter:none}
button.ghost{background:var(--window);color:var(--text);border-color:var(--line-strong);
  font-weight:500}
button.ghost:hover{background:var(--hover);filter:none}
button.danger{background:var(--danger-soft);color:var(--danger);
  border-color:color-mix(in srgb,var(--danger) 32%,transparent);font-weight:500;box-shadow:none}
button.danger:hover{background:var(--danger-fill);color:#fff;border-color:transparent;
  filter:none}
button.link{background:none;border:none;color:var(--accent-link);padding:0;font-weight:500;
  box-shadow:none;font-size:13px}
button.link:hover{text-decoration:underline;filter:none}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.between{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.inline{display:inline}
.two{display:grid;gap:16px;grid-template-columns:1fr 1fr}
@media(max-width:680px){.two{grid-template-columns:1fr}}

/* ---------------- Pemberitahuan dan pil ---------------- */
.notice{padding:11px 14px;border-radius:var(--radius-sm);margin-bottom:16px;font-size:13px;
  border:1px solid transparent}
.notice.ok{background:var(--ok-soft);border-color:color-mix(in srgb,var(--ok) 30%,transparent);
  color:var(--ok)}
.notice.err{background:var(--danger-soft);
  border-color:color-mix(in srgb,var(--danger) 30%,transparent);color:var(--danger)}
.notice.info{background:var(--accent-soft);
  border-color:color-mix(in srgb,var(--accent) 30%,transparent);color:var(--text)}
.pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11.5px;
  border:1px solid var(--line-strong);color:var(--muted);white-space:nowrap}
.pill.ok{border-color:color-mix(in srgb,var(--ok) 40%,transparent);color:var(--ok);
  background:var(--ok-soft)}
.pill.off{border-color:color-mix(in srgb,var(--danger) 40%,transparent);color:var(--danger);
  background:var(--danger-soft)}
.pill.draft{border-color:color-mix(in srgb,var(--warn) 40%,transparent);color:var(--warn);
  background:var(--warn-soft)}

/* ---------------- Sheet konfirmasi ---------------- */
/*
 * Di sinilah tiga titik itu benar-benar bekerja. Merah menutup, kuning
 * mengecilkan jendela sampai tinggal bilah judulnya, hijau memperlebarnya —
 * persis tiga tombol jendela macOS, pada satu-satunya tempat di panel ini yang
 * memang berupa jendela di atas jendela.
 */
.sheet-layer{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:24px;
  background:rgba(0,0,0,.30);
  backdrop-filter:saturate(160%) blur(4px);-webkit-backdrop-filter:saturate(160%) blur(4px)}
.sheet-layer[hidden]{display:none}
.sheet{width:min(460px,100%);background:var(--window);border:1px solid var(--line-strong);
  border-radius:var(--radius-lg);box-shadow:var(--shadow-pop);overflow:hidden;
  transition:width .22s cubic-bezier(.32,.72,0,1)}
.sheet--zoom{width:min(940px,100%)}
.sheet--min{width:min(320px,100%);align-self:end;justify-self:start;margin-left:24px}
.sheet--min .sheet__body,.sheet--min .sheet__foot{display:none}
.sheet__bar{height:44px;display:flex;align-items:center;gap:12px;padding:0 14px;
  background:var(--sidebar);border-bottom:1px solid var(--line)}
.traffic--live .traffic__dot{cursor:pointer;border:0;padding:0;
  transition:transform .12s ease,filter .12s ease}
.traffic--live .traffic__dot:hover{filter:brightness(1.12)}
.traffic--live .traffic__dot:active{transform:scale(.9)}
.sheet__title{margin:0;font-size:13px;font-weight:600;color:var(--text)}
.sheet__body{padding:20px 18px}
.sheet__text{margin:0;font-size:13px;line-height:1.55}
.sheet__foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px;
  border-top:1px solid var(--line);background:var(--panel)}

/*
 * Sheet impor massal.
 *
 * Lebih lebar daripada sheet konfirmasi, karena isinya daftar berkas dan bukan
 * satu kalimat — dan lebih tinggi, tetapi TIDAK setinggi jendela: daftar 50
 * berkas akan mendorong tombol "Mulai" keluar dari layar, dan tombol yang tidak
 * terlihat sama saja dengan tombol yang tidak ada.
 */
.sheet--bulk{width:min(680px,100%)}
.sheet--bulk .sheet__body{max-height:min(58vh,540px);overflow-y:auto}
/*
 * Jarak di dalam sheet ini diatur eksplisit.
 *
 * Label formulir di panel hanya punya jarak BAWAH, jadi bidang pertama menempel
 * ke paragraf di atasnya dan baris status menempel ke label berikutnya. Di
 * formulir biasa itu tidak terlihat karena selalu ada judul di antaranya; di
 * dalam sheet, tidak.
 */
.sheet--bulk .sheet__text + *{margin-top:18px}
.sheet--bulk .field__status{margin-bottom:16px}

.bulk-list{margin-top:14px;display:flex;flex-direction:column;gap:6px}
.bulk-list:empty{display:none}
.bulk-row{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;
  border-radius:var(--radius-sm);background:var(--field);border:1px solid var(--line)}
.bulk-row__mark{flex:0 0 16px;text-align:center;font-size:12px;line-height:1.5;color:var(--muted)}
.bulk-row__body{flex:1;min-width:0}
.bulk-row__name{font-size:12.5px;font-weight:500;overflow-wrap:anywhere}
.bulk-row__state{font-size:11.5px;line-height:1.5;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
/*
 * Warnanya menyatakan hasil, karena "berhasil" dan "gagal" di sini hanya
 * berbeda satu kata — dan pada daftar 50 baris, mata tidak membaca kata.
 */
.bulk-row[data-state=ok] .bulk-row__state{color:var(--ok)}
.bulk-row[data-state=error] .bulk-row__state{color:var(--danger)}
.bulk-row[data-state=error]{border-color:color-mix(in srgb,var(--danger) 35%,transparent)}

/* ---------------- Halaman masuk ---------------- */
.shell--bare{flex:1;display:grid;place-items:center;background:var(--canvas);padding:24px}
.shell--bare main{flex:none;width:100%;max-width:360px;padding:0;background:none;overflow:visible}
.shell--bare main>*{max-width:none}
.login .brand{font-size:15px}
`;

/* ---------------------------------------------------------------- */
/* Potongan yang sering dipakai                                      */
/* ---------------------------------------------------------------- */

/**
 * Tanda panah kecil di ujung baris daftar.
 *
 * Baris daftar bergrup adalah satu-satunya penanda bahwa barisnya dapat dibuka,
 * jadi tanda ini dipakai bersama oleh daftar dunia dan daftar draf. Digambar
 * sebagai SVG sebaris, bukan karakter panah: karakter panah dirender berbeda
 * oleh setiap font sistem, sedangkan panel ini memakai font apa pun yang ada.
 */
export const CHEVRON = safe(
  '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4.5 2.5 8 6l-3.5 3.5"/></svg>',
);

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
 *
 * `title` adalah tempat yang benar untuk nilai mentah itu. Sebelumnya ia
 * dicetak sebagai baris kedua di bawah pil, dan hasilnya satu sel memuat fakta
 * yang sama dua kali — "terbit" di atas "published" — sehingga barisnya dua
 * kali lebih tinggi tanpa menambah satu pun keterangan. Sebagai tooltip ia
 * tetap ada bagi yang membutuhkannya, tanpa mengotori baris yang dipindai.
 */
export function statusPill(status: string, label?: string, title?: string): SafeHtml {
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
  return html`<span class="pill ${cls}"${title ? html` title="${title}"` : ''}>${label ?? status}</span>`;
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

