# fayLN backend — image produksi.
#
# Batasan blitz.cloud yang dipatuhi berkas ini:
# - Dibangun untuk linux/amd64 (server mereka x86).
# - Aplikasi menerima PORT dari platform; kode membaca process.env.PORT.
# - Berjalan sebagai user non-root (root diizinkan di sandbox mereka, tetapi
#   non-root adalah kebiasaan yang lebih baik).
# - Tidak ada state di disk: semua data ada di PostgreSQL.

# ---------- Tahap 1: build ----------
FROM --platform=linux/amd64 node:22-bookworm-slim AS build

WORKDIR /app

# Manifest disalin lebih dahulu agar lapisan dependensi dipakai ulang selama
# package.json tidak berubah.
COPY package.json package-lock.json* ./

# `npm ci` dipakai bila lockfile ada supaya build dapat diulang persis.
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi

COPY tsconfig.json ./
COPY src ./src

# Berkas aset gambar ikut ke dalam image: gambar berversi bersama kode, disajikan
# pada /assets/*, dan tidak memerlukan folder persisten maupun mekanisme unggah.
COPY assets ./assets

RUN npm run build

# Buang dependensi pengembangan dari node_modules sebelum disalin ke tahap akhir.
RUN npm prune --omit=dev

# ---------- Tahap 2: runtime ----------
FROM --platform=linux/amd64 node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
# Nilai ini hanya cadangan; blitz.cloud menyuntikkan PORT sendiri.
ENV PORT=8080

WORKDIR /app

# Port yang dipakai bila platform membaca EXPOSE. Tetap membaca PORT saat jalan.
EXPOSE 8080

# Node resmi sudah menyediakan user `node` (uid 1000). Tidak ada yang perlu dipasang.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

# Migrasi SQL ikut dibawa karena tidak dikompilasi oleh tsc.
COPY --from=build --chown=node:node /app/src/db/migrations ./dist/db/migrations

# Aset gambar. `defaultAssetsRoot()` mencari folder ini di /app/assets.
COPY --from=build --chown=node:node /app/assets ./assets

USER node

CMD ["node", "dist/index.js"]
