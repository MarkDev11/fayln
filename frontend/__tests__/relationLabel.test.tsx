import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { NPCRelationChip } from '@/components/NPCRelationChip';
import { NPCInspector } from '@/features/player/components/NPCInspector';
import type { RelationVocabularyEntry } from '@/domain/types';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Label status hubungan yang datang dari KOSAKATA DUNIA.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA BERKAS INI ADA
 * ---------------------------------------------------------------------------
 * Status hubungan berhenti menjadi daftar delapan nilai di dalam kode dan
 * menjadi DATA: admin menambahnya lewat panel, dan setiap versi dunia membawa
 * salinan kosakatanya sendiri. Aplikasi pemain menerimanya di sesi.
 *
 * Bentuk lama tidak punya cara untuk membuktikan apa pun di sini — labelnya
 * ditentukan `Record<RelationStatus, TranslationKey>` yang isinya delapan kunci
 * tetap, jadi status kesembilan PASTI jatuh ke "Belum diketahui".
 *
 * Uji di bawah menjaga tiga hal yang berbeda, dan ketiganya harus lulus:
 *
 *   1. kosakata berisi  → label DARI KOSAKATA yang tampil;
 *   2. kosakata kosong  → label BAWAAN yang tampil (bukan id mentah);
 *   3. tidak di keduanya → ID MENTAH yang tampil (bukan "Belum diketahui").
 *
 * Nomor tiga bukan kelonggaran: "Belum diketahui" memberi tahu pemain bahwa ada
 * yang rusak tanpa mengatakan apa, sedangkan id mentah dapat ditelusuri.
 */

/** Kosakata berisi status kesembilan yang tidak ada di daftar bawaan mana pun. */
const KOSAKATA_SEMBILAN: RelationVocabularyEntry[] = [
  { relationId: 'normal', labelId: 'Normal', labelEn: 'Neutral', meaning: 'Netral.', behaviourHint: '', position: 1 },
  { relationId: 'waspada', labelId: 'Waspada', labelEn: 'Wary', meaning: 'Waspada.', behaviourHint: '', position: 2 },
  {
    relationId: 'rel_curiga',
    labelId: 'Curiga',
    labelEn: 'Suspicious',
    meaning: 'Mengawasi pemain diam-diam.',
    behaviourHint: 'Menjaga jarak fisik dan menjawab pendek.',
    position: 3,
  },
];

describe('NPCRelationChip — label dari kosakata dunia', () => {
  it('menampilkan label kosakata untuk status kesembilan', async () => {
    await render(
      <TestProviders>
        <NPCRelationChip npcName="Rina" status="rel_curiga" vocabulary={KOSAKATA_SEMBILAN} />
      </TestProviders>,
    );

    expect(screen.getByText('Curiga')).toBeTruthy();
    // Dan TIDAK jatuh ke label cadangan.
    expect(screen.queryByText('Belum diketahui')).toBeNull();
    expect(screen.queryByText('rel_curiga')).toBeNull();
    /*
     * `behaviourHint` adalah arahan untuk AI, bukan label untuk pemain.
     *
     * BUKTI MUTASI: ganti label penyelesaian dari `labelId` ke `behaviourHint`
     * di `relationLabel`, lalu uji ini memerah — pemain akan melihat arahan
     * penulis alih-alih nama hubungan.
     */
    expect(screen.queryByText('Menjaga jarak fisik dan menjawab pendek.')).toBeNull();
  });

  it('memakai label Inggris saat bahasa aplikasi Inggris', async () => {
    await render(
      <TestProviders locale="en-US">
        <NPCRelationChip npcName="Rina" status="rel_curiga" vocabulary={KOSAKATA_SEMBILAN} />
      </TestProviders>,
    );

    expect(screen.getByText('Suspicious')).toBeTruthy();
  });

  it('memakai label BAWAAN saat kosakata belum termuat', async () => {
    /*
     * Panel dapat dirender sebelum sesi tiba. Saat itu yang benar adalah label
     * terjemahan yang sudah ada, bukan id mentah — delapan status lama memang
     * punya kuncinya di kamus.
     */
    await render(
      <TestProviders>
        <NPCRelationChip npcName="Rina" status="waspada" />
      </TestProviders>,
    );

    expect(screen.getByText('Waspada')).toBeTruthy();
  });

  it('menampilkan ID MENTAH — bukan "Belum diketahui" — untuk status yang tidak ada di mana pun', async () => {
    /*
     * BUKTI MUTASI: kembalikan `relationLabel` agar jatuh ke
     * `t('relation.unknown')` di akhir, lalu uji ini memerah.
     */
    await render(
      <TestProviders>
        <NPCRelationChip npcName="Rina" status="rel_tak_dikenal" vocabulary={KOSAKATA_SEMBILAN} />
      </TestProviders>,
    );

    expect(screen.getByText('rel_tak_dikenal')).toBeTruthy();
    expect(screen.queryByText('Belum diketahui')).toBeNull();
  });

  it('menyebut label kosakata di label aksesibilitasnya juga', async () => {
    // Pembaca layar harus mendengar hal yang sama dengan yang terlihat.
    await render(
      <TestProviders>
        <NPCRelationChip npcName="Rina" status="rel_curiga" vocabulary={KOSAKATA_SEMBILAN} />
      </TestProviders>,
    );

    expect(screen.getByLabelText('Rina, Curiga')).toBeTruthy();
  });
});

describe('NPCInspector — meneruskan kosakata ke kartu tokoh', () => {
  it('menampilkan label kosakata untuk tokoh dengan status kesembilan', async () => {
    /*
     * Tanpa penerusan ini, panel tokoh tetap memakai daftar bawaan dan status
     * kesembilan tampil sebagai id mentah — padahal kosakatanya sudah ada di
     * state pemutar. Yang diuji di sini adalah JALURNYA, bukan labelnya.
     */
    await render(
      <TestProviders>
        <NPCInspector
          visible
          relationVocabulary={KOSAKATA_SEMBILAN}
          onClose={() => {}}
          characters={[
            {
              npcId: 'npc_rina',
              name: 'Rina',
              role: 'Atasanmu',
              soul: 'Keras di permukaan.',
              relation: 'rel_curiga',
              reasonPublic: 'Kamu menyebut masa lalu di depan tim.',
            },
          ]}
        />
      </TestProviders>,
    );

    expect(screen.getAllByText('Curiga').length).toBeGreaterThan(0);
    expect(screen.queryByText('rel_curiga')).toBeNull();
  });
});
