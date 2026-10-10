import { apiBaseUrl, apiMode, MOCK_MODE, PRODUCTION_API_URL } from '@/data/http/apiConfig';

/**
 * Keputusan paling menentukan di frontend: bicara ke backend ONLINE atau ke
 * data contoh?
 *
 * Sampai sekarang tidak ada satu pun uji untuk ini. Padahal bila seseorang
 * menjalankan aplikasi dengan `EXPO_PUBLIC_API_URL=mock` — misalnya karena
 * variabel lingkungan yang tertinggal di shell — aplikasi menyajikan data
 * contoh TANPA jaringan dan TANPA penanda apa pun: badge simulator sudah
 * dibuang dari layar pemain. Gejalanya akan menyesatkan ("kok ceritanya
 * begitu-begitu saja") dan tidak ada galat yang menunjuk ke penyebabnya.
 *
 * BUKTI MERAH: ubah bawaan `apiBaseUrl()` menjadi `null` (mode mock), lalu uji
 * "bawaan menunjuk ke backend produksi" memerah.
 */
describe('apiBaseUrl', () => {
  const asli = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    if (asli === undefined) {
      delete process.env.EXPO_PUBLIC_API_URL;
    } else {
      process.env.EXPO_PUBLIC_API_URL = asli;
    }
  });

  it('bawaan menunjuk ke backend PRODUKSI, bukan mock', () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    expect(apiBaseUrl()).toBe(PRODUCTION_API_URL);
    expect(apiMode()).toBe('http');
  });

  it('variabel kosong tetap berarti produksi', () => {
    process.env.EXPO_PUBLIC_API_URL = '   ';

    expect(apiBaseUrl()).toBe(PRODUCTION_API_URL);
    expect(apiMode()).toBe('http');
  });

  it('hanya nilai "mock" yang mematikan jaringan', () => {
    process.env.EXPO_PUBLIC_API_URL = MOCK_MODE;

    expect(apiBaseUrl()).toBeNull();
    expect(apiMode()).toBe('mock');
  });

  it('"MOCK" besar-kecil huruf tetap dianggap mock', () => {
    process.env.EXPO_PUBLIC_API_URL = 'MoCk';

    expect(apiBaseUrl()).toBeNull();
    expect(apiMode()).toBe('mock');
  });

  it('alamat lain dipakai apa adanya, tanpa garis miring di akhir', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8080///';

    expect(apiBaseUrl()).toBe('http://localhost:8080');
    expect(apiMode()).toBe('http');
  });

  it('spasi di sekitar alamat dibuang', () => {
    process.env.EXPO_PUBLIC_API_URL = '  https://contoh.test  ';

    expect(apiBaseUrl()).toBe('https://contoh.test');
  });
});
