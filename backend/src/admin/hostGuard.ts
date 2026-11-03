/**
 * Penjaga alamat tujuan untuk panggilan keluar ke provider model.
 *
 * Server mengirim kunci API ke `baseUrl` yang diketik admin. Tanpa penjaga,
 * akun admin yang bocor (atau salah ketik) dapat mengarahkan server ke layanan
 * internal, mis. endpoint metadata cloud `169.254.169.254`, dan membawa kunci
 * API bersamanya.
 *
 * Batas yang DISADARI: yang diperiksa hanya alamat yang diketik. Nama host yang
 * di-DNS-kan ke IP privat lolos dari pemeriksaan ini. Menutupnya butuh
 * pemeriksaan pada saat koneksi; itu di luar lingkup di sini.
 */

/** Hasil pemeriksaan: `null` bila boleh, selain itu alasan singkat (untuk log). */
export function hostRejection(
  parsed: URL,
  options: { isProduction: boolean },
): string | null {
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (options.isProduction && parsed.protocol !== 'https:') {
    return 'produksi hanya menerima https';
  }

  if (host === 'metadata.google.internal' || host.endsWith('.internal') || host.endsWith('.local')) {
    return 'nama host internal';
  }

  const v4 = parseIPv4(host);
  if (v4) {
    return rejectIPv4(v4, options.isProduction);
  }

  if (host.includes(':')) {
    return rejectIPv6(host, options.isProduction);
  }

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return options.isProduction ? 'localhost' : null;
  }

  return null;
}

function parseIPv4(host: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) {
    return null;
  }
  const parts = match.slice(1).map(Number) as [number, number, number, number];
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null;
}

function rejectIPv4(ip: [number, number, number, number], isProduction: boolean): string | null {
  const [a, b] = ip;

  if (a === 127) {
    return isProduction ? 'loopback' : null;
  }
  if (a === 0) {
    return 'alamat 0.0.0.0/8';
  }
  if (a === 10) {
    return 'jaringan privat 10.0.0.0/8';
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return 'jaringan privat 172.16.0.0/12';
  }
  if (a === 192 && b === 168) {
    return 'jaringan privat 192.168.0.0/16';
  }
  if (a === 169 && b === 254) {
    return 'link-local / metadata 169.254.0.0/16';
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return 'carrier-grade NAT 100.64.0.0/10';
  }
  if (a >= 224) {
    return 'multicast / dicadangkan';
  }
  return null;
}

function rejectIPv6(host: string, isProduction: boolean): string | null {
  if (host === '::1') {
    return isProduction ? 'loopback' : null;
  }
  if (host === '::') {
    return 'alamat tak ditentukan';
  }

  // IPv4 yang dibungkus IPv6 (::ffff:10.0.0.1, atau bentuk heksa ::ffff:a00:1).
  const mapped = /^::ffff:(.+)$/.exec(host);
  if (mapped) {
    const tail = mapped[1] ?? '';
    const dotted = parseIPv4(tail);
    if (dotted) {
      return rejectIPv4(dotted, isProduction);
    }
    return 'IPv4 terbungkus dalam IPv6';
  }

  // fc00::/7 (ULA) dan fe80::/10 (link-local).
  const first = Number.parseInt(host.split(':')[0] || '0', 16);
  if (Number.isNaN(first)) {
    return 'alamat IPv6 tidak sah';
  }
  if ((first & 0xfe00) === 0xfc00) {
    return 'jaringan privat IPv6 (ULA)';
  }
  if ((first & 0xffc0) === 0xfe80) {
    return 'link-local IPv6';
  }
  return null;
}
