/**
 * Halaman: provider model, model, dan rantai fallback.
 *
 * Dua hal yang perlu dipahami dari halaman-halaman ini:
 *
 * 1. **Provider adalah tingkat di atas model.** Provider memegang alamat, jenis
 *    API, dan awalan id; model memegang nama model di sisi provider, biaya, dan
 *    posisinya dalam rantai. Memisahkannya berarti alamat tidak ditulis ulang
 *    di setiap model — dan satu salah ketik tidak menghasilkan model yang
 *    diam-diam menembak alamat yang salah.
 *
 * 2. **Rantai fallback adalah URUTAN, bukan kumpulan.** Posisi 0 dicoba lebih
 *    dulu; bila gagal, posisi 1; dan seterusnya. Karena itu halaman model
 *    menampilkannya sebagai DUA RANTAI (free dan paid) yang berurutan, bukan
 *    sebagai satu tabel datar yang menyembunyikan urutannya di sebuah kolom.
 *
 * ---------------------------------------------------------------------------
 * CATATAN TENTANG BIDANG FORMULIR
 * ---------------------------------------------------------------------------
 * Bidang di sini memakai pola "label di atas, isian, bantuan di bawah", dan
 * helper di bagian atas berkas ini yang membangunnya — bukan ditulis tangan di
 * setiap tempat. Alasannya bukan kerapian: `aria-describedby` harus menunjuk
 * id bantuan yang benar, dan itu tidak dapat diperiksa mata. Kalau setiap bidang
 * ditulis tangan, satu yang terlewat hanya menghasilkan formulir yang tampak
 * benar tetapi tidak terbaca pembaca layar.
 */

import type { SafeHtml } from '../html';
import { CHEVRON, esc, escOr, formatTime, html, inputValue, pill, safe, selected, table } from '../html';
import { formatNumber } from './dashboardPages';
import { API_TYPES, API_TYPE_LABELS, type ProviderRow } from '../providersRepository';
import { resolvedModelId, type ModelConfigRow } from '../modelsRepository';
import { secretsKeyConfigured } from '../secretBox';
import type { AdminPageContext } from './context';

/* ------------------------------------------------------------------ */
/* Bidang formulir                                                     */
/* ------------------------------------------------------------------ */

type FieldBase = {
  id: string;
  label: string;
  /**
   * Teks bantuan.
   *
   * Bertipe `SafeHtml` juga supaya bidang yang perlu menandai potongan teksnya
   * (mis. nama berkas dalam huruf mono) dapat melakukannya. Sebuah string biasa
   * akan di-escape dan tag-nya tampil sebagai teks — kelas cacat senyap yang
   * justru dijaga uji sapuan halaman.
   */
  hint: string | SafeHtml;
  required?: boolean;
};

/** Apakah variabel lingkungan yang disebut benar-benar terpasang. */
function isKeySet(provider: ProviderRow): boolean {
  return provider.keySource === 'env';
}

/** Bantuan selalu ber-id dan ditunjuk `aria-describedby` oleh kontrolnya. */
function hintFor(id: string, hint: string | SafeHtml, required: boolean | undefined): SafeHtml {
  return html`<span class="field__hint" id="${id}-hint">${
    required ? html`<b>Wajib.</b> ` : ''
  }${hint}</span>`;
}

/**
 * Atribut tambahan, di-escape nilainya dan dibungkus `safe()`.
 *
 * Namanya datang dari kode (bukan dari isian), jadi yang perlu di-escape hanya
 * nilainya. Dipakai untuk kait JavaScript seperti `data-model-key-input` —
 * menulisnya sebagai string biasa akan menghasilkan `=&quot;` dan kaitnya tidak
 * pernah cocok, tanpa galat apa pun.
 */
function extraAttrs(extra: Record<string, string> | undefined): SafeHtml {
  if (!extra) {
    return safe('');
  }
  return safe(
    Object.entries(extra)
      .map(([key, value]) => ` ${key}="${esc(value)}"`)
      .join(''),
  );
}

function textField(
  base: FieldBase & {
    name: string;
    value: string;
    placeholder?: string;
    maxlength?: number;
    type?: string;
    mono?: boolean;
    /** Atribut tambahan, mis. kait JavaScript. */
    attrs?: Record<string, string>;
    /** Daftar saran melayang, tepat di bawah isian. Lihat gaya .combo. */
    menu?: SafeHtml;
    /** Elemen di bawah bantuan — mis. baris status. */
    after?: SafeHtml;
  },
): SafeHtml {
  const input = html`<input id="${base.id}" name="${base.name}" type="${base.type ?? 'text'}"
         aria-describedby="${base.id}-hint"
         ${base.required ? 'required' : ''}
         ${base.maxlength ? safe(` maxlength="${String(base.maxlength)}"`) : ''}
         ${base.placeholder ? safe(` placeholder="${esc(base.placeholder)}"`) : ''}
         ${base.mono ? safe(' class="field__mono"') : ''}${extraAttrs(base.attrs)}
         value="${inputValue(base.value)}">`;

  return html`<div class="field">
  <label class="field__label" for="${base.id}">${base.label}</label>
  ${
    base.menu
      ? // Pembungkus ini yang menjadi acuan posisi daftarnya; tanpa itu daftar
        // menempel ke halaman, bukan ke isiannya.
        html`<div class="combo">${input}${base.menu}</div>`
      : input
  }
  ${hintFor(base.id, base.hint, base.required)}
  ${base.after ?? ''}
</div>`;
}

function selectField(
  base: FieldBase & {
    name: string;
    value: string;
    /**
     * `data` menempelkan angka pada opsinya, bukan pada halamannya.
     *
     * Dipakai jatah harian: skrip di peramban perlu tahu jatah tier yang sedang
     * dipilih untuk menghitung "≈ N giliran per hari" tanpa memanggil server.
     * Menaruhnya di opsi membuatnya ikut berganti sendiri saat tier berganti.
     */
    options: { value: string; label: string; data?: Record<string, string> }[];
  },
): SafeHtml {
  return html`<div class="field">
  <label class="field__label" for="${base.id}">${base.label}</label>
  <select id="${base.id}" name="${base.name}" aria-describedby="${base.id}-hint"
          ${base.required ? 'required' : ''}>
    ${base.options.map(
      (option) =>
        html`<option value="${inputValue(option.value)}"${extraAttrs(option.data)}${selected(base.value, option.value)}>${esc(option.label)}</option>`,
    )}
  </select>
  ${hintFor(base.id, base.hint, base.required)}
</div>`;
}

function textareaField(
  base: FieldBase & { name: string; value: string; maxlength?: number },
): SafeHtml {
  return html`<div class="field">
  <label class="field__label" for="${base.id}">${base.label}</label>
  <textarea id="${base.id}" name="${base.name}" aria-describedby="${base.id}-hint"
            ${base.maxlength ? safe(` maxlength="${String(base.maxlength)}"`) : ''}>${esc(base.value)}</textarea>
  ${hintFor(base.id, base.hint, base.required)}
</div>`;
}

function checkboxField(
  base: Omit<FieldBase, 'required'> & { name: string; checked: boolean },
): SafeHtml {
  return html`<div class="field">
  <label class="field__label" for="${base.id}">${base.label}</label>
  <div class="row">
    <input id="${base.id}" name="${base.name}" type="checkbox"
           aria-describedby="${base.id}-hint" ${base.checked ? 'checked' : ''}>
  </div>
  ${hintFor(base.id, base.hint, false)}
</div>`;
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export async function providersList(ctx: AdminPageContext): Promise<SafeHtml> {
  const providers = await ctx.providers.list();
  const missingKey = providers.filter((row) => !row.keyPresent).length;
  const notSet = missingKey;

  const rows = providers.map(
    (provider, index) =>
      html`<tr>
  <td>
    <a href="/admin/providers-form?provider=${esc(provider.providerId)}">
      <strong>${escOr(provider.name, 'Tanpa nama')}</strong>
    </a>
    <div class="muted mono" style="font-size:12px">${esc(provider.prefix)}/&hellip;</div>
  </td>
  <td>${esc(API_TYPE_LABELS[provider.apiType])}</td>
  <td class="mono" style="font-size:12px">${escOr(provider.baseUrl, '—')}</td>
  <td>${keyBadge(provider)}</td>
  <td class="right mono">${provider.modelCount > 0 ? String(provider.modelCount) : html`<span class="muted">0</span>`}</td>
  <td>${provider.isActive ? pill('aktif', 'ok') : pill('nonaktif', 'off')}</td>
  <td class="right">
    <div class="row" style="justify-content:flex-end;gap:4px">
      <form method="post" action="/admin/providers/move">
        <input type="hidden" name="providerId" value="${inputValue(provider.providerId)}">
        <input type="hidden" name="direction" value="up">
        <button class="ghost" type="submit"${index === 0 ? ' disabled' : ''} title="Naikkan">&uarr;</button>
      </form>
      <form method="post" action="/admin/providers/move">
        <input type="hidden" name="providerId" value="${inputValue(provider.providerId)}">
        <input type="hidden" name="direction" value="down">
        <button class="ghost" type="submit"${index === providers.length - 1 ? ' disabled' : ''} title="Turunkan">&darr;</button>
      </form>
    </div>
  </td>
</tr>`,
  );

  return html`<h1>Provider</h1>
<p class="sub">
  Provider adalah <strong>ke mana</strong> permintaan dikirim dan <strong>dengan protokol apa</strong>.
  Model menunjuk ke sini, jadi satu alamat cukup ditulis sekali — tidak diulang di
  setiap model dari provider yang sama.
</p>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(providers.length)}</b><span>Provider terdaftar</span></div>
  <div class="stat"><b>${String(providers.filter((row) => row.isActive).length)}</b><span>Ditawarkan ke model</span></div>
  <div class="stat"><b>${String(notSet)}</b><span>Kuncinya belum terpasang</span></div>
</div>

${
    providers.length === 0
      ? html`<div class="card" style="border-color:var(--warn)">
  <p class="sub" style="margin-top:0">
    <strong>Belum ada provider.</strong> Model tidak dapat disimpan sebelum ada provider,
    karena setiap model harus tahu ke alamat mana ia dikirim.
  </p>
  <p style="margin-bottom:0"><a href="/admin/providers-form">Tambah provider</a></p>
</div>`
      : html`<div class="card">${table(
          ['Provider', 'Jenis API', 'Alamat dasar', 'Kunci', 'Model', 'Status', 'Urutan'],
          rows,
          'Belum ada provider.',
        )}</div>`
  }

${
    missingKey > 0
      ? html`<div class="notice err" style="margin-top:18px">
  Ada provider yang belum punya kunci — baik tersimpan maupun lewat variabel
  lingkungan. Provider seperti itu belum dapat dipanggil.
</div>`
      : ''
  }

<div class="notice err" style="margin-top:18px">
  Kunci API yang disimpan <strong>dienkripsi</strong> dengan kunci yang hidup di variabel
  lingkungan <span class="mono">FAYLN_SECRETS_KEY</span> — bukan di basis data dan bukan
  di repositori. Nilainya <strong>tidak pernah ditampilkan lagi</strong> setelah disimpan,
  dan tidak pernah masuk catatan audit. Kalau variabel itu hilang, seluruh kunci tersimpan
  tidak terbaca; perlakukan ia seperti kunci brankas.
</div>`;
}

/**
 * Penanda keadaan kunci.
 *
 * Tiga keadaan, dan ketiganya berbeda artinya: belum disebut sama sekali, sudah
 * disebut tetapi variabelnya tidak ada, dan sudah terpasang. Menggabungkan dua
 * yang pertama menjadi "belum siap" akan menyembunyikan hal yang justru perlu
 * ditindaklanjuti admin.
 */
/**
 * Penanda keadaan kunci.
 *
 * Tiga keadaan, dan ketiganya berbeda artinya: tersimpan terenkripsi, diambil
 * dari variabel lingkungan, dan tidak ada sama sekali. Menggabungkan dua yang
 * pertama menjadi "siap" akan menutupi hal yang perlu diketahui saat kunci
 * tiba-tiba tidak bisa dipakai — dari mana asalnya menentukan ke mana harus
 * mencari.
 */
function keyBadge(provider: ProviderRow): SafeHtml {
  if (provider.keySource === 'stored') {
    return html`${pill('tersimpan', 'ok')}
    <div class="muted" style="font-size:11px;margin-top:4px">terenkripsi</div>`;
  }
  if (provider.keySource === 'env') {
    return html`${pill('lingkungan', 'ok')}
    <div class="muted mono" style="font-size:11px;margin-top:4px">${esc(provider.apiKeyEnv)}</div>`;
  }
  if (provider.apiKeyEnv.length > 0) {
    return html`${pill('variabel kosong', 'draft')}
    <div class="muted mono" style="font-size:11px;margin-top:4px">${esc(provider.apiKeyEnv)}</div>`;
  }
  return pill('belum ada', 'off');
}

export async function providerForm(
  ctx: AdminPageContext,
  providerId: string | null,
): Promise<SafeHtml> {
  const provider = providerId ? await ctx.providers.find(providerId) : null;
  if (providerId && !provider) {
    return html`<h1>Tidak ditemukan</h1>
<div class="card"><p>Provider <span class="mono">${esc(providerId)}</span> tidak terdaftar.</p>
<p><a href="/admin/providers">Kembali ke daftar provider</a></p></div>`;
  }

  // Tanpa kunci enkripsi, bidang kunci tidak ditawarkan sama sekali — lebih
  // baik tidak bisa menyimpan daripada menyimpan tanpa enkripsi.
  const secretsReady = secretsKeyConfigured();

  return html`<h1>${provider ? 'Ubah provider' : 'Provider baru'}</h1>
<p class="sub">
  Satu provider mewakili satu alamat API. Beberapa model dari provider yang sama
  cukup menunjuk ke baris ini.
</p>
<form method="post" action="/admin/providers" class="card">
  <input type="hidden" name="providerId" value="${inputValue(provider?.providerId ?? '')}">

  ${textField({
    id: 'p-name',
    name: 'name',
    label: 'Nama',
    required: true,
    hint: 'Label yang mudah dikenali di daftar. Nama ini tidak pernah dikirim ke API.',
    placeholder: 'mis. OpenAI Compatible (Prod)',
    maxlength: 120,
    value: provider?.name ?? '',
  })}

  ${textField({
    id: 'p-prefix',
    name: 'prefix',
    label: 'Prefix',
    required: true,
    hint: 'Dipakai sebagai awalan id model. Huruf kecil, angka, dan tanda hubung.',
    placeholder: 'mis. oc-prod',
    maxlength: 32,
    mono: true,
    value: provider?.prefix ?? '',
  })}

  ${selectField({
    id: 'p-api-type',
    name: 'apiType',
    label: 'Jenis API',
    required: true,
    hint: 'Bentuk permintaan yang dipahami alamat itu. Salah pilih berarti setiap panggilan ditolak.',
    value: provider?.apiType ?? 'chat-completions',
    options: API_TYPES.map((type) => ({ value: type, label: API_TYPE_LABELS[type] })),
  })}

  ${textField({
    id: 'p-base-url',
    name: 'baseUrl',
    label: 'Base URL',
    required: true,
    hint: html`Alamat dasar API, biasanya berakhiran <span class="field__mono">/v1</span>. Garis miring di ujung dibuang otomatis.`,
    placeholder: 'https://api.openai.com/v1',
    maxlength: 300,
    mono: true,
    value: provider?.baseUrl ?? '',
  })}

  ${
    secretsReady
      ? html`${textField({
          id: 'p-api-key',
          name: 'apiKey',
          label: 'Kunci API',
          type: 'password',
          /*
           * Nilainya SENGAJA tidak pernah diisi kembali. Bidang sandi yang
           * berisi nilai lama mengirimkannya ke mana-mana: ke DOM, ke riwayat
           * peramban, dan ke tangkapan layar. Yang ditampilkan hanya keadaannya.
           */
          hint: html`Dienkripsi sebelum disimpan, dan <strong>tidak pernah ditampilkan lagi</strong>. Kosongkan bila hanya mengubah hal lain.`,
          placeholder: provider?.hasStoredKey ? 'biarkan kosong bila tidak diganti' : 'mis. sk-…',
          maxlength: 2000,
          value: '',
        })}`
      : html`<div class="notice err" style="margin-bottom:20px">
  Kunci API belum dapat disimpan karena <span class="mono">FAYLN_SECRETS_KEY</span> belum
  terpasang di lingkungan server. Tanpa itu kunci tidak dapat dienkripsi — dan
  menyimpannya tanpa enkripsi lebih buruk daripada tidak menyimpannya sama
  sekali. Sementara ini pakai nama variabel lingkungan di bawah.
</div>`
  }

  ${
    provider?.hasStoredKey
      ? html`<div class="notice ok" style="margin:-8px 0 20px">
  Kunci tersimpan <strong>terenkripsi</strong>. Nilainya tidak ditampilkan di mana pun.
</div>
<div class="row" style="margin:-8px 0 20px">
  <form method="post" action="/admin/providers/key/delete" class="inline"
        data-confirm="Hapus kunci tersimpan untuk “${esc(provider.name)}”? Provider ini tidak dapat dipanggil sampai kunci baru diisi."
        data-confirm-title="Hapus kunci API"
        data-confirm-ok="Hapus kunci">
    <input type="hidden" name="providerId" value="${inputValue(provider.providerId)}">
    <button class="danger" type="submit">Hapus kunci</button>
  </form>
</div>`
      : ''
  }

  ${textField({
    id: 'p-key-env',
    name: 'apiKeyEnv',
    label: 'Nama variabel kunci API (opsional)',
    hint: 'Bila Anda lebih suka kunci tetap di lingkungan server dan tidak tersimpan di sini. Huruf besar dan garis bawah. Kunci yang tersimpan di atas menang bila keduanya ada.',
    placeholder: 'mis. OPENAI_API_KEY',
    maxlength: 120,
    mono: true,
    value: provider?.apiKeyEnv ?? '',
  })}

  ${
    provider && provider.apiKeyEnv.length > 0 && provider.keySource !== 'stored'
      ? html`<div class="notice ${isKeySet(provider) ? 'ok' : 'err'}" style="margin:-8px 0 20px">
  Variabel <span class="mono">${esc(provider.apiKeyEnv)}</span>
  ${isKeySet(provider) ? 'terpasang.' : 'belum terpasang di lingkungan server.'}
</div>`
      : ''
  }

  ${textareaField({
    id: 'p-notes',
    name: 'notes',
    label: 'Catatan',
    hint: 'Hanya untuk manusia. Tidak dibaca kode mana pun.',
    maxlength: 240,
    value: provider?.notes ?? '',
  })}

  ${checkboxField({
    id: 'p-active',
    name: 'isActive',
    label: 'Aktif',
    hint: 'Provider nonaktif tidak muncul di formulir model, tetapi model yang sudah menunjuknya tetap utuh.',
    checked: provider ? provider.isActive : true,
  })}

  <div class="row" style="margin-top:6px">
    <button type="submit">Simpan</button>
    <a href="/admin/providers"><button class="ghost" type="button">Batal</button></a>
    ${
      provider
        ? html`<span class="spacer"></span>
    <form method="post" action="/admin/providers/delete" class="inline"
          data-confirm="Hapus provider “${esc(provider.name)}”?"
          data-confirm-title="Hapus provider"
          data-confirm-ok="Hapus">
      <input type="hidden" name="providerId" value="${inputValue(provider.providerId)}">
      <button class="danger" type="submit">Hapus</button>
    </form>`
        : ''
    }
  </div>
</form>`;
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

const TIERS = ['free', 'paid'] as const;

export async function modelsList(ctx: AdminPageContext): Promise<SafeHtml> {
  const models = await ctx.models.listModels();
  const health = await ctx.models.chainHealth();

  const chains = TIERS.map((tier) => {
    const chain = models
      .filter((row) => row.tier === tier && row.isActive)
      .sort((a, b) => a.position - b.position);
    const summary = health.find((item) => item.tier === tier);
    return chainSection(tier, chain, summary);
  });

  // Model yang tidak aktif tidak muncul di rantai mana pun. Tanpa daftar ini ia
  // menjadi tidak terjangkau sama sekali dari panel.
  const outside = models.filter((row) => !row.isActive);
  const outsideRows = outside.map(
    (model) =>
      html`<tr>
  <td>
    <a href="/admin/models-form?model=${esc(model.modelId)}"><strong>${esc(model.label)}</strong></a>
    <div class="muted mono" style="font-size:12px">${escOr(resolvedModelId(model), 'belum lengkap')}</div>
  </td>
  <td>${model.tier === 'paid' ? pill('paid', 'ok') : pill('free')}</td>
  <td class="muted">${escOr(model.providerName, '—')}</td>
  <td class="right mono">${formatNumber(model.estimatedTurnCost)}</td>
  <td class="right">
    <form method="post" action="/admin/models/toggle" class="inline"
          data-confirm="Nyalakan ${esc(model.label)}?"
          data-confirm-title="Nyalakan model"
          data-confirm-ok="Nyalakan">
      <input type="hidden" name="modelId" value="${inputValue(model.modelId)}">
      <input type="hidden" name="isActive" value="true">
      <button class="ghost" type="submit">Nyalakan</button>
    </form>
  </td>
</tr>`,
  );

  return html`<h1>Model</h1>
<p class="sub">
  Setiap tier punya <strong>rantai</strong>-nya sendiri. Posisi 0 dicoba lebih dulu; bila
  gagal, posisi 1; dan seterusnya. Token per giliran dipakai memeriksa anggaran
  <strong>sebelum</strong> model dipanggil — angka yang salah berarti pemain dapat memakai
  token lebih banyak daripada jatahnya, atau ditolak padahal masih cukup.
</p>

${chains}

${
    outside.length > 0
      ? html`<h2>Di luar rantai <span class="muted">${String(outside.length)} model</span></h2>
<p class="sub" style="margin-top:0">
  Model nonaktif tidak dicoba sama sekali. Ia tetap terdaftar supaya angkanya tidak hilang.
</p>
<div class="card">${table(
          ['Model', 'Tier', 'Provider', 'Token/giliran', ''],
          outsideRows,
          'Tidak ada model nonaktif.',
        )}</div>`
      : ''
  }

<div class="row" style="margin-top:18px">
  <a href="/admin/models-form"><button type="button">Tambah model</button></a>
  <a href="/admin/providers"><button class="ghost" type="button">Kelola provider</button></a>
</div>

<div class="notice err" style="margin-top:18px">
  Model yang pemakaian tokennya belum diukur <strong>tidak boleh dinyalakan</strong>.
  Selama sebuah tier tidak punya model aktif, permintaan pemain pada tier itu tidak
  dilayani oleh model apa pun.
</div>`;
}

function chainSection(
  tier: 'free' | 'paid',
  chain: ModelConfigRow[],
  summary: { activeCount: number; hasPrimary: boolean; totalCost: number } | undefined,
): SafeHtml {
  const label = tier === 'paid' ? 'Paid' : 'Free';

  const items = chain.map((model, index) => {
    const meta = [
      index === 0 ? 'dicoba pertama' : `fallback ke-${String(index)}`,
      escOr(model.providerName, 'provider belum dipilih'),
      `${formatNumber(model.estimatedTurnCost)} token/giliran`,
      `konteks ${formatNumber(model.contextTokens)}`,
    ].join(' · ');

    return html`<a class="list__item" href="/admin/models-form?model=${esc(model.modelId)}">
  <div class="list__main">
    <div class="list__title">
      <span class="mono muted">${String(model.position)}</span> ${esc(model.label)}
    </div>
    <div class="list__meta">${meta}</div>
    <div class="list__meta mono" style="font-size:11px">${escOr(resolvedModelId(model), 'id belum lengkap')}</div>
  </div>
  <div class="list__side"><span class="list__chev">${CHEVRON}</span></div>
</a>`;
  });

  const problems: string[] = [];
  if (!summary || summary.activeCount === 0) {
    problems.push('Belum ada model aktif — tier ini tidak dilayani siapa pun.');
  } else if (!summary.hasPrimary) {
    problems.push('Tidak ada model di posisi 0, jadi tidak ada yang dicoba lebih dulu.');
  }

  return html`<h2>Rantai ${label} <span class="muted">${String(chain.length)} model aktif${
    summary ? ` · ${formatNumber(summary.totalCost)} token/giliran bila semuanya dicoba` : ''
  }</span></h2>
${
    problems.length > 0
      ? html`<div class="notice err">${problems.join(' ')}</div>`
      : ''
  }
<div class="card card--list">${
    items.length > 0
      ? html`<div class="list">${items}</div>`
      : html`<div class="empty" style="margin:16px">
  Belum ada model aktif pada tier ini. <a href="/admin/models-form">Tambah model</a>.
</div>`
  }</div>`;
}

export async function modelForm(ctx: AdminPageContext, modelId: string | null): Promise<SafeHtml> {
  const [model, providers, freeMultiplier, paidMultiplier] = await Promise.all([
    modelId ? ctx.models.findModel(modelId) : Promise.resolve(null),
    ctx.providers.listOfferable(),
    ctx.settings.quotaMultiplier('free'),
    ctx.settings.quotaMultiplier('paid'),
  ]);

  /*
   * Jatah harian yang SEDANG berlaku, dihitung dari konfigurasi server dikali
   * pengali promosi. Angkanya tidak ditulis ulang di halaman: halaman yang
   * menyebut jatah keliru lebih buruk daripada halaman yang tidak menyebutnya,
   * karena admin akan mengisi biaya per giliran berdasarkan angka yang salah.
   */
  const dailyQuota = {
    free: Math.round(ctx.plan.free.dailyTokens * freeMultiplier),
    paid: Math.round(ctx.plan.paid.dailyTokens * paidMultiplier),
  };

  if (modelId && !model) {
    return html`<h1>Tidak ditemukan</h1>
<div class="card"><p>Model <span class="mono">${esc(modelId)}</span> tidak terdaftar.</p>
<p><a href="/admin/models">Kembali ke daftar model</a></p></div>`;
  }

  if (providers.length === 0) {
    return html`<h1>Belum ada provider</h1>
<div class="card">
  <p class="sub" style="margin-top:0">
    Setiap model harus tahu ke alamat mana ia dikirim, dan alamat itu milik provider.
    Tambahkan satu provider lebih dulu.
  </p>
  <p style="margin-bottom:0"><a href="/admin/providers-form">Tambah provider</a></p>
</div>`;
  }

  const providerOptions = providers.map((provider) => ({
    value: provider.providerId,
    label: `${provider.name} · ${provider.prefix}/…`,
  }));

  return html`<h1>${model ? 'Ubah model' : 'Model baru'}</h1>
<p class="sub">
  Satu baris mewakili satu model pada satu provider, beserta perkiraan tokennya dan posisinya
  dalam rantai fallback tier-nya.
</p>
<form method="post" action="/admin/models" class="card">
  <input type="hidden" name="modelId" value="${inputValue(model?.modelId ?? '')}">

  ${textField({
    id: 'm-label',
    name: 'label',
    label: 'Nama',
    required: true,
    hint: 'Label yang mudah dikenali di daftar rantai. ID internal dibuat dari nama ini bila dibiarkan kosong.',
    placeholder: 'mis. Mistral Medium',
    maxlength: 120,
    value: model?.label ?? '',
  })}

  ${selectField({
    id: 'm-provider',
    name: 'providerId',
    label: 'Provider',
    required: true,
    hint: 'Menentukan alamat dan jenis API yang dipakai model ini.',
    value: model?.providerId ?? providers[0]!.providerId,
    options: providerOptions,
  })}

  ${textField({
    id: 'm-key',
    name: 'modelKey',
    label: 'Nama model di provider',
    required: true,
    hint: 'Nama yang dikirim ke API, bukan nama tampilan. Daftar saran diambil dari provider yang dipilih — boleh dipilih, dan boleh juga diketik sendiri.',
    placeholder: 'mis. mistral-medium-latest',
    maxlength: 120,
    mono: true,
    attrs: {
      'data-model-key-input': '',
      // Peran combobox diumumkan ke pembaca layar; tanpa ini, daftar yang
      // muncul di bawahnya tidak dikaitkan dengan isiannya sama sekali.
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-controls': 'm-key-menu',
      'aria-autocomplete': 'list',
      // Mematikannya penting: tanpa ini peramban menampilkan daftar riwayatnya
      // SENDIRI di atas daftar kita, dan keduanya berebut tempat yang sama.
      autocomplete: 'off',
    },
    menu: html`<ul class="combo__menu" id="m-key-menu" role="listbox" data-model-key-menu hidden></ul>`,
    after: html`<span class="field__status" data-model-key-status>Menunggu daftar model dari provider&hellip;</span>`,
    value: model?.modelKey ?? '',
  })}

  ${
    model && resolvedModelId(model).length > 0
      ? html`<div class="notice ok" style="margin:-8px 0 20px">
  Id lengkap yang dikenal penyedia: <span class="mono">${esc(resolvedModelId(model))}</span>
</div>`
      : ''
  }

  ${selectField({
    id: 'm-tier',
    name: 'tier',
    label: 'Tier',
    required: true,
    hint: 'Menentukan rantai mana yang memakai model ini, dan jatah token pemain yang mana. Angka jatah di bawah dibaca dari konfigurasi server, jadi ia yang benar-benar ditegakkan.',
    value: model?.tier ?? 'free',
    options: [
      {
        value: 'free',
        label: `Free — ${formatNumber(dailyQuota.free)} token/hari`,
        data: { 'data-daily-tokens': String(dailyQuota.free) },
      },
      {
        value: 'paid',
        label: `Paid — ${formatNumber(dailyQuota.paid)} token/hari`,
        data: { 'data-daily-tokens': String(dailyQuota.paid) },
      },
    ],
  })}

  ${textField({
    id: 'm-position',
    name: 'position',
    label: 'Posisi dalam rantai',
    required: true,
    hint: '0 = dicoba pertama. Angka berikutnya adalah urutan fallback bila yang sebelumnya gagal.',
    type: 'number',
    value: String(model?.position ?? 0),
  })}

  ${textField({
    id: 'm-cost',
    name: 'estimatedTurnCost',
    /*
     * "Perkiraan token per giliran", bukan "biaya per giliran".
     *
     * Kata "biaya" dalam bahasa Indonesia hampir selalu berarti uang, dan
     * bidang ini BUKAN uang: satuannya token, dan sistem tidak pernah menghitung
     * rupiah atau dolar di mana pun. Seluruh pemeriksaan anggaran adalah
     * perbandingan token dengan jatah token harian pemain — persis seperti yang
     * sudah ditulis di halaman Promosi ("hadiah berupa token, bukan mata uang
     * terpisah"). Nama yang menyiratkan uang membuat admin mengira ada kurs yang
     * harus diisi.
     */
    label: 'Perkiraan token per giliran',
    required: true,
    hint: 'Jumlahkan token prompt dan token jawaban untuk SATU giliran — mis. 3.000 token prompt + 500 token jawaban = 3.500. Satuannya TOKEN, bukan uang: sistem hanya membandingkan angka ini dengan jatah token harian pemain, dan tidak pernah menghitung rupiah atau dolar. Angka ini menahan permintaan SEBELUM model dipanggil — terlalu kecil membuat jatah pemain jebol, dan terlalu besar membuat pemain ditolak padahal masih cukup.',
    type: 'number',
    after: html`<span class="field__status" data-cost-helper>Isi angkanya untuk melihat berapa giliran yang muat dalam sehari.</span>`,
    value: String(model?.estimatedTurnCost ?? ''),
  })}

  ${textField({
    id: 'm-context',
    name: 'contextTokens',
    /*
     * "Context window", bukan "batas konteks (max token)".
     *
     * Dua alasan. Pertama, itu istilah yang dipakai semua dokumentasi penyedia —
     * orang mencarinya dengan nama itu. Kedua, "max token" justru MENYESATKAN:
     * dalam percakapan sehari-hari istilah itu biasanya berarti batas token
     * KELUARAN (`max_tokens` pada permintaan), padahal yang dimaksud di sini
     * adalah masukan DAN keluaran sekaligus.
     */
    label: 'Context window (token)',
    required: true,
    hint: 'Jumlah token masukan DAN keluaran yang dapat ditangani model dalam satu permintaan. Dipakai sebagai ambang pemadatan riwayat — sisakan ruang untuk jawaban, karena pemadatan yang baru mulai tepat di batas ini membuat balasannya tidak muat. Isi angka EFEKTIF yang sudah diuji: mutu jawaban biasanya turun jauh sebelum batas brosur tercapai.',
    type: 'number',
    value: String(model?.contextTokens ?? ''),
  })}

  ${textareaField({
    id: 'm-notes',
    name: 'notes',
    label: 'Catatan',
    hint: 'Hanya untuk manusia. Tidak dibaca kode mana pun.',
    maxlength: 240,
    value: model?.notes ?? '',
  })}

  ${checkboxField({
    id: 'm-active',
    name: 'isActive',
    label: 'Aktif',
    hint: 'Hanya model aktif yang ikut dicoba. Mengaktifkan model pada posisi yang sudah terisi akan menonaktifkan penghuninya.',
    checked: model ? model.isActive : false,
  })}

  <div class="row" style="margin-top:6px">
    <button type="submit">Simpan</button>
    <a href="/admin/models"><button class="ghost" type="button">Batal</button></a>
    ${
      model
        ? html`<span class="spacer"></span>
    <form method="post" action="/admin/models/delete" class="inline"
          data-confirm="Hapus model ${esc(model.label)} dari rantai fallback tier ini?"
          data-confirm-title="Hapus model"
          data-confirm-ok="Hapus">
      <input type="hidden" name="modelId" value="${inputValue(model.modelId)}">
      <button class="danger" type="submit">Hapus</button>
    </form>`
        : ''
    }
  </div>
</form>

<p class="sub" style="margin-top:16px">
  Model yang pemakaian tokennya belum diukur disimpan sebagai catatan, bukan dinyalakan.
  Aturan proyek ini jelas: <strong>jangan mengarang harga, versi model, atau angka
  benchmark</strong> — dan model Paid belum boleh dijual sebelum O-08b lolos.
</p>
<p class="sub">Terakhir diubah ${model ? esc(formatTime(model.updatedAt, 'minute')) : '—'}.</p>`;
}
