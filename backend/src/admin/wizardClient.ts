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

  /* ---------------- Unggah satu gambar ke satu slot ---------------- */

  /*
   * Satu slot gambar = satu baris yang punya pratinjau, keterangan status, dan
   * satu bidang tersembunyi berisi id berkas. Dipakai baris ekspresi karakter
   * (potret) dan baris latar master lokasi.
   *
   * Awalan atributnya BERBEDA karena ukuran simpannya berbeda: potret 512x768
   * dan menyimpan alfa, latar 1280x720 dan tidak. Memakai simpan potret untuk
   * latar akan memperkecil gambar latar ke ukuran potret - tanpa galat apa pun,
   * hanya gambar yang jelek.
   */
  function bindImageSlot(input, kind, prefix) {
    var scope = input.closest('[data-' + prefix + '-scope]');
    var status = scope && scope.querySelector('[data-' + prefix + '-status]');
    var hidden = scope && scope.querySelector('[data-' + prefix + '-media]');
    var preview = scope && scope.querySelector('[data-' + prefix + '-preview]');

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) { return; }

      setStatus(status, 'working', 'Mengunggah...');
      uploadFile(file, kind).then(function (result) {
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
    if (input) { bindImageSlot(input, 'portrait', 'portrait'); }
    var remove = row.querySelector('[data-expression-remove]');
    if (remove) {
      remove.addEventListener('click', function (event) {
        event.preventDefault();
        row.remove();
      });
    }
  }

  /* ---------------- Combobox nama model ---------------- */

  /*
   * Daftar saran nama model, digambar sendiri.
   *
   * Bukan <datalist> dan bukan <select>: keduanya dirender PERAMBAN, dan
   * daftar bawaannya tidak dapat digayakan sama sekali — di Windows ia muncul
   * sebagai kotak abu-abu persegi di tengah panel yang serba membulat. Daftar
   * yang digambar sendiri juga memungkinkan dua hal yang tidak mungkin dengan
   * <select>: isiannya tetap bebas diketik, dan saranannya ikut berganti saat
   * providernya berganti.
   *
   * Semua kegagalan berakhir sebagai pesan di baris status, bukan sebagai
   * halaman yang diam: provider yang belum punya kunci atau tidak menjawab
   * adalah keadaan biasa, bukan kesalahan admin.
   */
  function bindModelKeySync() {
    var input = document.querySelector('[data-model-key-input]');
    var menu = document.querySelector('[data-model-key-menu]');
    var status = document.querySelector('[data-model-key-status]');
    var select = document.querySelector('select[name=providerId]');
    if (!input || !menu || !select) { return; }

    var semua = [];
    var konteks = {};
    var aktif = -1;
    var providerDimuat = null;

    var pesanGagal = {
      'no-key': 'Provider ini belum punya kunci API, jadi daftar model tidak dapat diambil. Isi namanya manual.',
      unauthorized: 'Provider menolak kuncinya. Periksa kuncinya di halaman provider.',
      unreachable: 'Provider tidak dapat dihubungi. Isi namanya manual.',
      'bad-response': 'Jawaban provider tidak dikenali sebagai daftar model. Isi namanya manual.'
    };

    function say(pesan, keadaan) {
      if (!status) { return; }
      status.textContent = pesan;
      if (keadaan) { status.setAttribute('data-state', keadaan); }
      else { status.removeAttribute('data-state'); }
    }

    function items() {
      return menu.querySelectorAll('.combo__item');
    }

    function tutup() {
      menu.hidden = true;
      aktif = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }

    /*
     * Menyorot satu baris.
     *
     * Indeksnya berputar di ujung daftar, dan pembaca layar mengikutinya lewat
     * aria-activedescendant — tanpa itu, panah atas-bawah tidak mengatakan apa
     * pun kepada pengguna pembaca layar.
     */
    function sorot(index) {
      var baris = items();
      if (baris.length === 0) { aktif = -1; return; }
      if (index < 0) { index = baris.length - 1; }
      if (index >= baris.length) { index = 0; }
      aktif = index;
      for (var i = 0; i < baris.length; i++) {
        baris[i].setAttribute('data-active', i === index ? 'true' : 'false');
      }
      var terpilih = baris[index];
      input.setAttribute('aria-activedescendant', terpilih.id);
      if (terpilih.scrollIntoView) { terpilih.scrollIntoView({ block: 'nearest' }); }
    }

    function buka() {
      var kata = input.value.trim().toLowerCase();
      var cocok = [];
      for (var i = 0; i < semua.length; i++) {
        if (kata === '' || semua[i].toLowerCase().indexOf(kata) >= 0) { cocok.push(semua[i]); }
      }

      menu.innerHTML = '';
      aktif = -1;

      if (cocok.length === 0) {
        var kosong = document.createElement('li');
        kosong.className = 'combo__empty';
        kosong.textContent = semua.length === 0
          ? 'Belum ada saran dari provider. Nama boleh diketik bebas.'
          : 'Tidak ada nama yang cocok. Nama boleh diketik bebas.';
        menu.appendChild(kosong);
      } else {
        for (var j = 0; j < cocok.length; j++) {
          var item = document.createElement('li');
          item.className = 'combo__item';
          item.id = 'm-key-opt-' + j;
          item.setAttribute('role', 'option');
          item.setAttribute('data-value', cocok[j]);
          item.textContent = cocok[j];
          menu.appendChild(item);
        }
      }

      menu.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function pilih(nilai) {
      input.value = nilai;
      tutup();

      /*
       * Batas konteks dari provider hanya MENGISI YANG MASIH KOSONG.
       *
       * Angka provider adalah kabaran, bukan hasil ukur — dan begitu admin
       * pernah mengisinya sendiri, isian itulah yang dipercaya. Menimpanya
       * otomatis akan menghapus hasil pengukuran hanya karena nama modelnya
       * dipilih ulang dari daftar.
       */
      var bidangKonteks = document.querySelector('[name=contextTokens]');
      var angka = konteks[nilai];
      if (bidangKonteks && angka && bidangKonteks.value.trim() === '') {
        bidangKonteks.value = String(angka);
        bidangKonteks.dispatchEvent(new Event('input', { bubbles: true }));
        say(
          'Context window ' + ribuan(angka) + ' token diisikan dari provider. Angka ini kabaran — ganti bila uji Anda menunjukkan lain.',
          null
        );
      }

      // Penjaga perubahan belum tersimpan mendengarkan peristiwa input; tanpa
      // ini, memilih dari daftar tidak dianggap sebagai perubahan.
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function muat() {
      var id = select.value;
      if (!id || id === providerDimuat) { return; }
      providerDimuat = id;

      semua = [];
      tutup();
      say('Mengambil daftar model...', null);

      fetch('/admin/providers/' + encodeURIComponent(id) + '/models', {
        headers: { accept: 'application/json' },
        credentials: 'same-origin'
      })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          if (!data || data.ok !== true) {
            var teks = pesanGagal[data && data.reason] || 'Daftar model tidak dapat diambil. Isi namanya manual.';
            say(teks + (data && data.detail ? ' (' + data.detail + ')' : ''), 'error');
            return;
          }
          semua = data.ids || [];
          konteks = data.contexts || {};
          if (semua.length === 0) {
            say('Provider tidak mengembalikan satu pun nama model. Isi namanya manual.', 'error');
            return;
          }
          var sebut = 0;
          for (var k in konteks) { if (konteks.hasOwnProperty(k)) { sebut += 1; } }
          say(
            semua.length + ' nama model tersedia. Boleh dipilih, boleh diketik sendiri.' +
            (sebut > 0 ? ' ' + sebut + ' di antaranya menyebutkan batas konteks.' : ''),
            'ok'
          );
        })
        .catch(function () {
          say('Daftar model tidak dapat diambil. Isi namanya manual.', 'error');
        });
    }

    input.addEventListener('focus', buka);
    input.addEventListener('click', buka);
    input.addEventListener('input', buka);

    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (menu.hidden) { buka(); } else { sorot(aktif + 1); }
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (menu.hidden) { buka(); } else { sorot(aktif - 1); }
        return;
      }
      if (event.key === 'Enter') {
        // Enter hanya memilih bila ada baris tersorot. Kalau tidak, biarkan
        // formulir terkirim seperti biasa.
        if (!menu.hidden && aktif >= 0) {
          var baris = items();
          if (baris[aktif]) {
            event.preventDefault();
            pilih(baris[aktif].getAttribute('data-value'));
          }
        }
        return;
      }
      if (event.key === 'Escape') { tutup(); return; }
      if (event.key === 'Tab') { tutup(); }
    });

    /*
     * mousedown, bukan click.
     *
     * Pada click, isian kehilangan fokus lebih dulu dan daftarnya sudah tertutup
     * sebelum pilihannya tercatat. preventDefault di sini menahan fokus tetap di
     * isian — dan itu juga yang membuat menggulir daftar yang panjang tidak
     * menutupnya.
     */
    menu.addEventListener('mousedown', function (event) {
      event.preventDefault();
      var item = event.target && event.target.closest ? event.target.closest('.combo__item') : null;
      if (item) { pilih(item.getAttribute('data-value')); }
    });

    input.addEventListener('blur', tutup);
    select.addEventListener('change', muat);
    muat();
  }
  /** Pemisah ribuan dengan titik, seperti kebiasaan Indonesia. */
  function ribuan(angka) {
    return String(angka).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /* ---------------- Impor massal lokasi dengan AI ---------------- */

  /*
   * Mengunggah banyak gambar latar sekaligus, meminta model visi menamainya,
   * lalu menyimpannya sebagai lokasi.
   *
   * TIGA FASE YANG TERPISAH, dan pemisahan itu bukan kerapian. Unggah, analisis,
   * simpan — masing-masing dapat gagal sendiri. Kalau ketiganya digabung dalam
   * satu permintaan, satu percobaan ulang setelah gagal menyimpan akan memanggil
   * model sekali lagi, dan jawaban yang hilang di jaringan dapat menghasilkan DUA
   * lokasi untuk satu gambar.
   *
   * DIKERJAKAN BERKELOMPOK (tiga sekaligus), bukan satu per satu dan bukan
   * semuanya sekaligus: satu per satu terlalu lambat untuk 50 gambar, sedangkan
   * 50 permintaan serentak akan ditolak penyedia mana pun.
   *
   * Setiap langkah diulang sampai tiga kali. Kegagalan yang menetap ditampilkan
   * apa adanya — model yang tidak dapat melihat gambar tidak akan berhasil pada
   * percobaan keempat, dan mengulanginya tanpa batas hanya membakar biaya.
   */
  function bindBulkImport() {
    var layer = document.querySelector('[data-bulk-root]');
    var pembuka = document.querySelector('[data-bulk-open]');
    if (!layer || !pembuka) { return; }

    var bidangKategori = layer.querySelector('[data-bulk-category]');
    var bidangProvider = layer.querySelector('[data-bulk-provider]');
    var bidangModel = layer.querySelector('[data-bulk-model]');
    var statusModel = layer.querySelector('[data-bulk-model-status]');
    var bidangBerkas = layer.querySelector('[data-bulk-files]');
    var daftar = layer.querySelector('[data-bulk-list]');
    var tombolMulai = layer.querySelector('[data-bulk-action=start]');
    if (!bidangModel || !daftar || !tombolMulai) { return; }

    var SERENTAK = 3;
    var PERCOBAAN = 3;
    var JEDA_ULANG_MS = 900;

    var providerDimuat = null;
    var berjalan = false;
    var fokusTerakhir = null;

    var pesanModel = {
      'no-key': 'Provider ini belum punya kunci API, jadi daftar model tidak dapat diambil.',
      unauthorized: 'Provider menolak kuncinya. Periksa kuncinya di halaman Provider.',
      unreachable: 'Provider tidak dapat dihubungi.',
      'bad-response': 'Jawaban provider tidak dikenali sebagai daftar model.'
    };

    function katakan(pesan, keadaan) {
      if (!statusModel) { return; }
      statusModel.textContent = pesan;
      if (keadaan) { statusModel.setAttribute('data-state', keadaan); }
      else { statusModel.removeAttribute('data-state'); }
    }

    /* ---------------- Buka dan tutup ---------------- */

    function buka() {
      fokusTerakhir = document.activeElement;
      layer.hidden = false;
      if (bidangBerkas && bidangBerkas.focus) { bidangBerkas.focus(); }
    }

    function tutup() {
      /*
       * Sheet tidak dapat ditutup di tengah proses. Menutupnya akan menyembunyikan
       * kemajuan yang sedang berjalan, dan admin akan mengira pekerjaannya batal
       * padahal modelnya masih dipanggil.
       */
      if (berjalan) { katakan('Tunggu sampai prosesnya selesai.', 'error'); return; }
      layer.hidden = true;
      if (fokusTerakhir && fokusTerakhir.focus) { fokusTerakhir.focus(); }
    }

    /* ---------------- Daftar model provider ---------------- */

    function muatModel() {
      var id = bidangProvider ? bidangProvider.value : '';
      if (!id || id === providerDimuat) { return; }
      providerDimuat = id;

      bidangModel.innerHTML = '';
      var menunggu = document.createElement('option');
      menunggu.value = '';
      menunggu.textContent = '(memuat...)';
      bidangModel.appendChild(menunggu);
      katakan('Mengambil daftar model dari provider...', null);

      fetch('/admin/providers/' + encodeURIComponent(id) + '/models', {
        headers: { accept: 'application/json' },
        credentials: 'same-origin'
      })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          bidangModel.innerHTML = '';
          var ids = data && data.ok === true && data.ids ? data.ids : [];
          if (ids.length === 0) {
            var kosong = document.createElement('option');
            kosong.value = '';
            kosong.textContent = '(tidak ada model)';
            bidangModel.appendChild(kosong);
            katakan(pesanModel[data && data.reason] || 'Daftar model tidak dapat diambil.', 'error');
            return;
          }
          for (var i = 0; i < ids.length; i++) {
            var opsi = document.createElement('option');
            opsi.value = ids[i];
            opsi.textContent = ids[i];
            bidangModel.appendChild(opsi);
          }
          katakan(ids.length + ' model tersedia. Pilih yang dapat melihat gambar.', 'ok');
        })
        .catch(function () {
          katakan('Daftar model tidak dapat diambil.', 'error');
        });
    }

    /* ---------------- Baris kemajuan ---------------- */

    function buatBaris(nama) {
      var baris = document.createElement('div');
      baris.className = 'bulk-row';

      var tanda = document.createElement('span');
      tanda.className = 'bulk-row__mark';
      tanda.textContent = '\u00b7';

      var isi = document.createElement('div');
      isi.className = 'bulk-row__body';

      var judul = document.createElement('div');
      judul.className = 'bulk-row__name';
      judul.textContent = nama;

      var keadaan = document.createElement('div');
      keadaan.className = 'bulk-row__state';
      keadaan.textContent = 'Menunggu.';

      isi.appendChild(judul);
      isi.appendChild(keadaan);
      baris.appendChild(tanda);
      baris.appendChild(isi);
      daftar.appendChild(baris);

      return { baris: baris, tanda: tanda, keadaan: keadaan };
    }

    function setBaris(ui, keadaan, pesan, tanda) {
      ui.baris.setAttribute('data-state', keadaan || '');
      ui.keadaan.textContent = pesan;
      ui.tanda.textContent = tanda || '\u00b7';
    }

    /* ---------------- Alat bantu proses ---------------- */

    function kirimJson(url, muatan) {
      return fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(muatan)
      })
        .then(function (response) { return response.json(); })
        .catch(function () { return { ok: false, reason: 'jaringan' }; });
    }

    /** Menjalankan satu tugas untuk tiap berkas, sebanyak batas sekaligus. */
    function berbarengan(tugas, batas, satuTugas) {
      var berikutnya = 0;

      function jalan() {
        if (berikutnya >= tugas.length) { return Promise.resolve(); }
        var sekarang = tugas[berikutnya];
        berikutnya += 1;
        return satuTugas(sekarang).then(jalan, jalan);
      }

      var awalan = [];
      var jumlah = Math.min(batas, tugas.length);
      for (var i = 0; i < jumlah; i++) { awalan.push(jalan()); }
      return Promise.all(awalan);
    }

    /** Mengulang satu langkah sampai berhasil, atau sampai percobaannya habis. */
    function ulangi(langkah, sisa) {
      return langkah().then(function (hasil) {
        if (hasil && hasil.ok) { return hasil; }
        if (sisa <= 1) { return hasil; }
        return new Promise(function (lanjut) {
          window.setTimeout(function () { lanjut(ulangi(langkah, sisa - 1)); }, JEDA_ULANG_MS);
        });
      });
    }

    /* ---------------- Proses utama ---------------- */

    function mulai() {
      if (berjalan) { return; }

      var berkas = bidangBerkas && bidangBerkas.files ? bidangBerkas.files : [];
      if (berkas.length === 0) { katakan('Pilih gambar lebih dulu.', 'error'); return; }
      if (!bidangKategori || bidangKategori.value === '') {
        katakan('Pilih kategori (era) untuk seluruh gambar.', 'error');
        return;
      }
      if (!bidangModel || bidangModel.value === '') {
        katakan('Pilih model visi lebih dulu.', 'error');
        return;
      }

      var kategoriId = bidangKategori.value;
      var providerId = bidangProvider ? bidangProvider.value : '';
      var modelKey = bidangModel.value;

      berjalan = true;
      tombolMulai.disabled = true;
      daftar.innerHTML = '';

      var tugas = [];
      for (var i = 0; i < berkas.length; i++) {
        tugas.push({ file: berkas[i], ui: buatBaris(berkas[i].name), mediaId: '', name: '', description: '' });
      }

      function ringkas(sebab) {
        var gagal = 0;
        var ditolak = 0;
        for (var k = 0; k < tugas.length; k++) {
          if (tugas[k].ui.baris.getAttribute('data-state') === 'error') {
            gagal += 1;
            if (tugas[k].sebab === 'declined') { ditolak += 1; }
          }
        }
        var berhasil = tugas.length - gagal;

        var pesan = sebab + ' ' + berhasil + ' dari ' + tugas.length + ' gambar menjadi lokasi' +
          (gagal > 0 ? ', ' + gagal + ' gagal.' : '.');

        /*
         * Semua gambar ditolak model adalah pola yang khas, dan sebabnya hampir
         * selalu sama: gambarnya tidak pernah sampai ke modelnya — biasanya
         * karena model yang dipilih memang tidak dapat melihat gambar. Tanpa
         * kalimat ini, admin akan menyimpulkan fotonya yang salah, lalu mengganti
         * gambar berulang kali tanpa hasil.
         */
        if (gagal > 0 && ditolak === gagal) {
          pesan += ' Semuanya ditolak model. Periksa jawaban modelnya di tiap baris:'
            + ' kalau ia menjawab tidak melihat gambar, berarti model yang dipilih'
            + ' tidak dapat melihat gambar — ganti ke model visi.';
        }

        katakan(pesan, gagal > 0 ? 'error' : 'ok');
        berjalan = false;
        tombolMulai.disabled = false;
      }

      /* Fase 1 - unggah. Memakai pengecil dan pengode WebP yang sudah dipakai
         wizard, jadi hasilnya sama persis dengan unggahan satu per satu. */
      berbarengan(tugas, SERENTAK, function (t) {
        setBaris(t.ui, '', 'Memperkecil dan mengunggah...', '\u2191');
        return ulangi(function () {
          return encode(t.file, SPECS.background)
            .then(function (encoded) { return uploadBlob(encoded.blob); })
            .then(function (jawaban) {
              if (!jawaban || !jawaban.mediaId) { return { ok: false, pesan: 'jawaban server tidak memuat id gambar' }; }
              t.mediaId = jawaban.mediaId;
              return { ok: true };
            })
            .catch(function (error) { return { ok: false, pesan: error && error.message ? error.message : 'gagal' }; });
        }, PERCOBAAN).then(function (hasil) {
          if (hasil.ok) { setBaris(t.ui, 'ok', 'Terunggah.', '\u2713'); }
          else { setBaris(t.ui, 'error', 'Gagal mengunggah: ' + (hasil.pesan || 'sebab tidak diketahui'), '\u00d7'); }
        });
      })
        .then(function () {
          var siap = tugas.filter(function (t) { return t.mediaId !== ''; });
          if (siap.length === 0) { ringkas('Tidak ada gambar yang berhasil diunggah.'); return null; }

          /* Fase 2 - analisis. Model dipanggil sekali per gambar. */
          return berbarengan(siap, SERENTAK, function (t) {
            setBaris(t.ui, '', 'Model sedang melihat gambarnya...', '\u25cb');
            return ulangi(function () {
              return kirimJson('/admin/locations-bulk/describe', {
                mediaId: t.mediaId, providerId: providerId, modelKey: modelKey
              });
            }, PERCOBAAN).then(function (hasil) {
              if (hasil && hasil.ok) {
                t.name = hasil.name;
                t.description = hasil.description;
                setBaris(t.ui, 'ok', 'Dinamai: ' + hasil.name, '\u2713');
              } else {
                t.sebab = hasil && hasil.reason ? hasil.reason : '';
                var sebab = hasil && hasil.detail ? hasil.detail : 'sebab tidak diketahui';
                setBaris(t.ui, 'error', 'Gagal dianalisis: ' + sebab, '\u00d7');
              }
            });
          });
        })
        .then(function (lanjut) {
          if (lanjut === null) { return null; }

          /* Fase 3 - simpan. Hanya yang benar-benar punya nama. */
          var siap = tugas.filter(function (t) { return t.name !== ''; });
          if (siap.length === 0) { ringkas('Tidak ada gambar yang berhasil dinamai.'); return null; }

          return berbarengan(siap, SERENTAK, function (t) {
            setBaris(t.ui, '', 'Menyimpan sebagai lokasi...', '\u2193');
            return ulangi(function () {
              return kirimJson('/admin/locations-bulk/create', {
                mediaId: t.mediaId, categoryId: kategoriId, name: t.name, description: t.description
              });
            }, PERCOBAAN).then(function (hasil) {
              if (hasil && hasil.ok) { setBaris(t.ui, 'ok', 'Tersimpan sebagai lokasi.', '\u2713'); }
              else {
                var sebab = hasil && hasil.reason ? hasil.reason : 'sebab tidak diketahui';
                setBaris(t.ui, 'error', 'Gagal disimpan: ' + sebab, '\u00d7');
              }
            });
          });
        })
        .then(function () {
          ringkas('Selesai.');
        })
        .catch(function () {
          ringkas('Berhenti karena kesalahan tak terduga.');
        });
    }

    /* ---------------- Pemasangan ---------------- */

    pembuka.addEventListener('click', buka);
    if (bidangProvider) { bidangProvider.addEventListener('change', muatModel); }
    tombolMulai.addEventListener('click', mulai);

    Array.prototype.forEach.call(layer.querySelectorAll('[data-bulk-action]'), function (tombol) {
      var aksi = tombol.getAttribute('data-bulk-action');
      if (aksi === 'close') { tombol.addEventListener('click', tutup); }
      if (aksi === 'min') {
        tombol.addEventListener('click', function () {
          layer.querySelector('.sheet').classList.toggle('sheet--min');
        });
      }
      if (aksi === 'zoom') {
        tombol.addEventListener('click', function () {
          layer.querySelector('.sheet').classList.toggle('sheet--zoom');
        });
      }
    });

    muatModel();
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
    Array.prototype.forEach.call(document.querySelectorAll('[data-upload=portrait]'), function (input) {
      bindImageSlot(input, 'portrait', 'portrait');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-upload=background]'), function (input) {
      bindImageSlot(input, 'background', 'background');
    });
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
    bindModelKeySync();
    bindBulkImport();
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
