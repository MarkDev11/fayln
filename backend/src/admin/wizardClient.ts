/**
 * Skrip klien wizard "Dunia baru".
 *
 * Ditulis sebagai satu potongan JavaScript biasa, tanpa pustaka dan tanpa
 * resource luar — mengikuti aturan panel yang sama dengan halaman lainnya.
 *
 * MENGAPA BERKAS INI BERISI STRING, BUKAN KODE:
 * ia disisipkan ke dalam halaman lewat template `html`. Kalau kode ini ditulis
 * sebagai template literal di dalam berkas halaman, setiap `${...}` di dalamnya
 * akan ditafsirkan sebagai penyisipan oleh `html` dan halamannya rusak. Karena
 * itu isinya dirakit dengan penggabungan string biasa dan tanda kutip tunggal,
 * lalu ditandai aman saat disisipkan. Jangan menambahkan backtick atau `${` ke
 * dalam string ini.
 *
 * TIGA HAL YANG DIKERJAKANNYA:
 *   1. Memperkecil gambar di peramban SEBELUM diunggah. Berkas disimpan di
 *      dalam basis data, jadi setiap byte yang tidak dikirim adalah byte yang
 *      tidak perlu disimpan, dicadangkan, dan dikirim ulang.
 *   2. Mengunggah SATU berkas per permintaan, supaya satu kegagalan tidak
 *      membatalkan seluruh batch dan kemajuannya dapat ditampilkan.
 *   3. Menyunting blur dan titik fokus secara langsung pada pratinjau.
 *
 * NILAI YANG DIKIRIM KE SERVER ADALAH NILAI TERNORMALISASI — kekuatan blur
 * 0..100 dan titik fokus 0..1, bukan piksel. Piksel akan langsung salah begitu
 * gambar diperkecil, dan `blur()` di CSS berbeda satuan sekaligus algoritme dari
 * `blurRadius` di React Native.
 */

export const WIZARD_JS = `
(function () {
  'use strict';

  /* Ukuran sasaran per jenis gambar. Dijaga sekecil mungkin dengan sengaja:
     berkasnya disimpan di basis data, bukan di CDN. */
  var SPECS = {
    cover:      { maxW: 600,  maxH: 800, alpha: false, quality: 0.82 },
    background: { maxW: 1280, maxH: 720, alpha: false, quality: 0.80 },
    portrait:   { maxW: 512,  maxH: 768, alpha: true,  quality: 0.90 }
  };

  /* Kekuatan blur 0..100 dipetakan ke piksel CSS di sini. Pemetaannya sengaja
     hanya ada di satu tempat: React Native memetakan angka yang sama dengan
     caranya sendiri, dan keduanya harus berangkat dari nilai yang sama. */
  var BLUR_MAX_CSS_PX = 14;

  function blurToCss(strength) {
    return (Math.max(0, Math.min(100, Number(strength) || 0)) / 100) * BLUR_MAX_CSS_PX;
  }

  /* ---------------- Pengecilan dan pengodean di peramban ---------------- */

  function encode(file, spec) {
    return new Promise(function (resolve, reject) {
      var objectUrl = URL.createObjectURL(file);
      var image = new Image();

      image.onload = function () {
        URL.revokeObjectURL(objectUrl);
        var scale = Math.min(1, spec.maxW / image.width, spec.maxH / image.height);
        var width = Math.max(1, Math.round(image.width * scale));
        var height = Math.max(1, Math.round(image.height * scale));

        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);

        var type = spec.alpha ? 'image/png' : 'image/webp';
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Gambar gagal dikodekan.')); return; }
          resolve({ blob: blob, width: width, height: height });
        }, type, spec.alpha ? undefined : spec.quality);
      };

      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Berkas ini bukan gambar yang dapat dibaca.'));
      };

      image.src = objectUrl;
    });
  }

  function uploadBlob(blob) {
    return fetch('/admin/media', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': blob.type },
      body: blob
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.message || ('Gagal mengunggah (HTTP ' + response.status + ').'));
        });
      }
      return response.json();
    });
  }

  function uploadFile(file, kind) {
    var spec = SPECS[kind] || SPECS.background;
    return encode(file, spec).then(function (encoded) {
      return uploadBlob(encoded.blob).then(function (result) {
        result.width = encoded.width;
        result.height = encoded.height;
        return result;
      });
    });
  }

  /* ---------------- Keadaan baris unggahan ---------------- */

  function setStatus(element, state, message) {
    if (!element) { return; }
    element.textContent = message;
    element.setAttribute('data-state', state);
  }

  /* ---------------- Titik fokus dan blur pada pratinjau ---------------- */

  function bindPreview(scope) {
    var stage = scope.querySelector('[data-focal-stage]');
    if (!stage) { return; }

    var image = stage.querySelector('[data-focal-image]');
    var marker = stage.querySelector('[data-focal-marker]');
    var hiddenX = scope.querySelector('[data-focal-x]');
    var hiddenY = scope.querySelector('[data-focal-y]');
    var readout = scope.querySelector('[data-focal-readout]');

    function paint() {
      var x = Number(hiddenX && hiddenX.value) || 0.5;
      var y = Number(hiddenY && hiddenY.value) || 0.5;
      if (image) { image.style.objectPosition = (x * 100) + '% ' + (y * 100) + '%'; }
      if (marker) {
        marker.style.left = (x * 100) + '%';
        marker.style.top = (y * 100) + '%';
      }
      if (readout) {
        readout.textContent = Math.round(x * 100) + '% / ' + Math.round(y * 100) + '%';
      }
    }

    stage.addEventListener('click', function (event) {
      var box = stage.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) { return; }
      var x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
      var y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
      if (hiddenX) { hiddenX.value = x.toFixed(4); }
      if (hiddenY) { hiddenY.value = y.toFixed(4); }
      paint();
    });

    var reset = scope.querySelector('[data-focal-reset]');
    if (reset) {
      reset.addEventListener('click', function (event) {
        event.preventDefault();
        if (hiddenX) { hiddenX.value = '0.5'; }
        if (hiddenY) { hiddenY.value = '0.5'; }
        paint();
      });
    }

    paint();
  }

  function bindBlur(scope) {
    var slider = scope.querySelector('[data-blur]');
    if (!slider) { return; }

    var image = scope.querySelector('[data-blur-image]');
    var readout = scope.querySelector('[data-blur-readout]');

    function paint() {
      var value = Number(slider.value) || 0;
      if (image) { image.style.filter = value === 0 ? 'none' : ('blur(' + blurToCss(value) + 'px)'); }
      if (readout) { readout.textContent = String(value); }
    }

    slider.addEventListener('input', paint);

    var reset = scope.querySelector('[data-blur-reset]');
    if (reset) {
      reset.addEventListener('click', function (event) {
        event.preventDefault();
        slider.value = '0';
        paint();
      });
    }

    paint();
  }

  /* ---------------- Unggah sampul (langkah 1) ---------------- */

  function bindCover(input) {
    var holder = input.closest('[data-cover-scope]');
    var status = holder && holder.querySelector('[data-cover-status]');
    var preview = holder && holder.querySelector('[data-cover-preview]');
    var hidden = holder && holder.querySelector('[data-cover-media]');

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) { return; }

      setStatus(status, 'working', 'Mengecilkan dan mengunggah...');
      uploadFile(file, 'cover').then(function (result) {
        if (hidden) { hidden.value = result.mediaId; }
        if (preview) {
          preview.src = result.url;
          preview.hidden = false;
        }
        setStatus(status, 'ok', 'Sampul tersimpan (' + result.width + '\\u00d7' + result.height + ').');
      }).catch(function (error) {
        setStatus(status, 'error', error.message + ' Pilih berkas lain untuk mencoba lagi.');
      });
    });
  }

  /* ---------------- Unggah banyak latar belakang (langkah 2) ---------------- */

  function bindBackgroundBatch(input) {
    var form = input.closest('form');
    var status = form && form.querySelector('[data-batch-status]');
    var list = form && form.querySelector('[data-batch-list]');
    var submit = form && form.querySelector('[data-batch-submit]');

    if (submit) { submit.disabled = true; }

    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (files.length === 0) { return; }

      if (list) { list.innerHTML = ''; }
      if (submit) { submit.disabled = true; }

      var done = 0;
      var failed = 0;

      /* Dijalankan berurutan, bukan serentak: sepuluh unggahan bersamaan pada
         koneksi yang lambat membuat semuanya tampak menggantung sekaligus. */
      var chain = Promise.resolve();
      files.forEach(function (file, index) {
        chain = chain.then(function () {
          setStatus(status, 'working', 'Mengunggah ' + (index + 1) + ' dari ' + files.length + '...');
          return uploadFile(file, 'background').then(function (result) {
            done += 1;
            appendUploaded(form, result);
            if (list) { list.appendChild(rowFor(result)); }
          }).catch(function (error) {
            failed += 1;
            if (list) { list.appendChild(failedRow(file.name, error.message)); }
          });
        });
      });

      chain.then(function () {
        if (failed === 0) {
          setStatus(status, 'ok', done + ' gambar siap ditambahkan.');
        } else {
          setStatus(status, 'error', done + ' berhasil, ' + failed + ' gagal. Yang gagal tidak diikutkan.');
        }
        if (submit) { submit.disabled = done === 0; }
      });
    });
  }

  /* Bidang tersembunyi yang dibaca server. Nama berulang menjadi LARIK di sisi
     server — itulah cara beberapa gambar dikirim dalam satu formulir.

     Hanya id berkas yang dikirim. Dimensinya TIDAK ikut: server sudah
     menyimpannya saat unggahan, jadi mengirimkannya lagi hanya menambah angka
     yang bisa berselisih dengan yang benar. */
  function appendUploaded(form, result) {
    var field = document.createElement('input');
    field.type = 'hidden';
    field.name = 'mediaId';
    field.value = result.mediaId;
    form.appendChild(field);
  }

  function rowFor(result) {
    var row = document.createElement('div');
    row.className = 'upload-row';

    var image = document.createElement('img');
    image.src = result.url;
    image.alt = '';
    image.className = 'upload-thumb';

    var text = document.createElement('span');
    text.textContent = result.width + '\\u00d7' + result.height + ' \\u00b7 siap';

    row.appendChild(image);
    row.appendChild(text);
    return row;
  }

  function failedRow(name, message) {
    var row = document.createElement('div');
    row.className = 'upload-row upload-row--error';

    var text = document.createElement('span');
    text.textContent = name + ' \\u2014 ' + message;

    row.appendChild(text);
    return row;
  }

  /* ---------------- Unggah satu potret (langkah 3) ---------------- */

  function bindPortrait(input) {
    var scope = input.closest('[data-portrait-scope]');
    var status = scope && scope.querySelector('[data-portrait-status]');
    var hidden = scope && scope.querySelector('[data-portrait-media]');
    var preview = scope && scope.querySelector('[data-portrait-preview]');

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) { return; }

      setStatus(status, 'working', 'Mengunggah...');
      uploadFile(file, 'portrait').then(function (result) {
        if (hidden) { hidden.value = result.mediaId; }
        if (preview) {
          preview.src = result.url;
          preview.hidden = false;
        }
        setStatus(status, 'ok', 'Tersimpan.');
      }).catch(function (error) {
        setStatus(status, 'error', error.message);
      });
    });
  }

  /* ---------------- Baris ekspresi yang dapat ditambah ---------------- */

  function bindExpressionRows(scope) {
    var list = scope.querySelector('[data-expression-list]');
    /*
     * Templat dicari DI DALAM scope, bukan di seluruh dokumen.
     *
     * Konsekuensinya: templat HARUS berada di dalam elemen ber-atribut scope.
     * Templat yang diletakkan sebagai saudara formulir tidak akan ditemukan,
     * dan fungsi ini keluar lebih awal TANPA galat — tombol "+ Tambah ekspresi"
     * hanya diam. Itu pernah terjadi pada langkah 3 wizard; admin-render.test.ts
     * kini menjaganya.
     *
     * Jangan menulis backtick di dalam berkas ini: seluruh isinya adalah satu
     * string JavaScript, dan satu backtick memutusnya di tengah kalimat.
     */
    var template = scope.querySelector('[data-expression-template]');
    var addButton = scope.querySelector('[data-expression-add]');
    if (!list || !template || !addButton) { return; }

    addButton.addEventListener('click', function (event) {
      event.preventDefault();
      var fragment = template.content.cloneNode(true);
      var row = fragment.querySelector('[data-expression-row]');
      if (row) { prepareRow(row); }
      list.appendChild(fragment);
    });

    Array.prototype.forEach.call(list.querySelectorAll('[data-expression-row]'), prepareRow);
  }

  function prepareRow(row) {
    var input = row.querySelector('input[type=file]');
    if (input) { bindPortrait(input); }
    var remove = row.querySelector('[data-expression-remove]');
    if (remove) {
      remove.addEventListener('click', function (event) {
        event.preventDefault();
        row.remove();
      });
    }
  }

  /* ---------------- Peringatan meninggalkan halaman ---------------- */

  function bindUnsavedGuard() {
    var dirty = false;

    document.addEventListener('input', function (event) {
      var target = event.target;
      if (target && target.matches && target.matches('input, textarea, select')) {
        dirty = true;
      }
    });

    window.addEventListener('beforeunload', function (event) {
      if (!dirty) { return undefined; }
      event.preventDefault();
      event.returnValue = '';
      return '';
    });

    /* Menekan tombol kirim berarti perubahan memang sedang disimpan. */
    Array.prototype.forEach.call(document.querySelectorAll('form'), function (form) {
      form.addEventListener('submit', function () { dirty = false; });
    });
  }

  /* ---------------- Pemasangan ---------------- */

  function start() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-upload=cover]'), bindCover);
    Array.prototype.forEach.call(document.querySelectorAll('[data-upload=background-batch]'), bindBackgroundBatch);
    Array.prototype.forEach.call(document.querySelectorAll('[data-upload=portrait]'), bindPortrait);
    Array.prototype.forEach.call(document.querySelectorAll('[data-preview-scope]'), function (scope) {
      bindPreview(scope);
      bindBlur(scope);
    });
    /*
     * Dua nama atribut, satu perilaku.
     *
     * data-npc-scope adalah nama asli dari langkah 3 wizard; halaman master
     * karakter memakai data-expression-scope karena ia tidak berbicara tentang
     * NPC. Nama lama SENGAJA tidak diganti: mengganti atribut HTML tidak
     * diperiksa TypeScript, jadi satu tempat yang terlewat berarti tombol yang
     * diam tanpa galat. Menerima keduanya tidak berbiaya apa pun.
     */
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-npc-scope], [data-expression-scope]'),
      bindExpressionRows
    );
    bindUnsavedGuard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
`;

/**
 * Gaya untuk potongan yang hanya dipakai wizard.
 *
 * Diselaraskan dengan gaya panel: tokennya sama (`--panel`, `--line`, `--accent`,
 * `--track`, `--seg-active`), radiusnya sama, dan `--surface2` serta `--surface`
 * lama sudah tidak ada — memakai variabel yang tidak lagi didefinisikan TIDAK
 * menghasilkan galat, hanya latar yang tembus, sehingga mudah terlewat.
 *
 * Langkah wizard digambar sebagai segmented control macOS: satu wadah kelabu
 * berisi beberapa ruas, dengan ruas aktif berlatar terang dan berbayang.
 */
export const WIZARD_CSS = `
.wizard-steps{display:inline-flex;gap:2px;margin:0 0 18px;padding:2px;list-style:none;
  flex-wrap:wrap;background:var(--track);border:0;border-radius:var(--radius-sm)}
.wizard-steps li{display:flex;align-items:center}
.wizard-steps a,.wizard-steps span{display:inline-flex;align-items:center;gap:6px;
  padding:4px 12px;border-radius:7px;font-size:12px;font-weight:600;color:var(--muted);
  border:1px solid transparent}
.wizard-steps a:hover{color:var(--text);text-decoration:none;background:var(--hover)}
.wizard-steps .is-current{background:var(--seg-active);color:var(--text);font-weight:600;
  border-color:transparent;box-shadow:var(--shadow-ctl)}
.wizard-steps .is-done{color:var(--accent);font-weight:500}
.wizard-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px}
.wizard-actions .spacer{flex:1}
.upload-status{font-size:12px;color:var(--muted)}
.upload-status[data-state=working]{color:var(--warn)}
.upload-status[data-state=ok]{color:var(--ok)}
.upload-status[data-state=error]{color:var(--danger)}
.upload-row{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:12.5px}
.upload-row--error{color:var(--danger)}
.upload-thumb{width:56px;height:32px;object-fit:cover;border-radius:var(--radius-xs);
  border:1px solid var(--line);background:var(--field)}
.focal-stage{position:relative;display:inline-block;line-height:0;cursor:crosshair;
  border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden;max-width:100%}
.focal-stage img{display:block;width:100%;max-width:420px;height:auto}
.focal-marker{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;
  border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.6);pointer-events:none}
.bg-item{display:flex;gap:12px;align-items:flex-start;padding:12px 0;
  border-top:1px solid var(--line)}
.bg-item:first-child{border-top:0}
.bg-item__thumb{width:96px;height:54px;object-fit:cover;border-radius:var(--radius-xs);
  border:1px solid var(--line);background:var(--field);flex:none}
.bg-item__body{flex:1;min-width:0}
.bg-item__meta{font-size:11.5px;color:var(--muted);margin-top:2px}
.bg-item__order{display:flex;flex-direction:column;gap:4px}
.bg-item__order button{padding:1px 8px;font-size:12px}
.expression-row{display:flex;gap:10px;align-items:flex-start;padding:10px;
  border:1px solid var(--line);border-radius:var(--radius-sm);margin-top:10px;
  background:var(--field)}
.expression-row__fields{flex:1;min-width:0}
.npc-card{border:1px solid var(--line);border-radius:var(--radius);padding:14px;margin-top:12px;
  background:var(--field)}
.npc-card__head{display:flex;gap:12px;align-items:center}
`;
