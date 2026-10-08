import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RelationEntry } from '@/domain/types';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { NPCRelationChip } from '@/components/NPCRelationChip';
import { Text } from '@/components/Text';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type InspectorCharacter = {
  npcId: string;
  name: string;
  role: string;
  soul: string;
  relation: RelationEntry['status'];
  reasonPublic: string;
};

export type NPCInspectorProps = {
  visible: boolean;
  characters: InspectorCharacter[];
  onClose: () => void;
  testID?: string;
};

/**
 * Daftar tokoh selama bermain.
 *
 * Hanya menampilkan tokoh yang sudah muncul di panggung, beserta hubungan yang
 * sudah terlihat. Rahasia kanon dan skrip AI tidak pernah masuk ke sini (FR-56).
 */
export function NPCInspector({ visible, characters, onClose, testID }: NPCInspectorProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
      testID={testID}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t('inspector.close')}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.bgApp,
            borderColor: colors.line,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.line }]} />
        <View style={styles.header}>
          <Text variant="title">{t('inspector.title')}</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('inspector.close')}
            hitSlop={10}
            style={styles.close}
          >
            <Icon name="close" size={20} color={colors.inkSecondary} />
          </Pressable>
        </View>

        {characters.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="small" tone="secondary" center>
              {t('inspector.empty')}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {characters.map((character) => (
              <View
                key={character.npcId}
                style={[
                  styles.card,
                  { backgroundColor: colors.bgSurface, borderColor: colors.line },
                ]}
              >
                <Text variant="title">{character.name}</Text>
                <Text variant="caption" tone="secondary">
                  {character.role}
                </Text>

                {/*
                  * Jiwa ditampilkan sebagai PARAGRAF, bukan daftar kata.
                  *
                  * Bentuk lamanya adalah `traits` — deretan kata yang dipisah titik
                  * tengah. Jiwa menggantikannya, dan ia satu sampai dua paragraf:
                  * apa yang mendorong orang ini, apa yang ditakutinya, bagaimana ia
                  * bicara. `join(' · ')` karena itu tidak lagi tepat — ia akan
                  * merangkai kalimat menjadi satu baris panjang yang tidak terbaca.
                  */}
                {character.soul.trim().length > 0 ? (
                  <View style={styles.traitBlock}>
                    <Text variant="caption" tone="secondary">
                      {t('inspector.soul')}
                    </Text>
                    <Text variant="small">{character.soul}</Text>
                  </View>
                ) : null}

                <View style={styles.relationBlock}>
                  <Text variant="caption" tone="secondary">
                    {t('inspector.relation')}
                  </Text>
                  <NPCRelationChip npcName={character.name} status={character.relation} />
                </View>

                {character.reasonPublic ? (
                  <View style={styles.reasonBlock}>
                    <Text variant="caption" tone="secondary">
                      {t('inspector.reason')}
                    </Text>
                    <Text variant="small" tone="secondary">
                      {character.reasonPublic}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <Button label={t('common.close')} onPress={onClose} variant="secondary" fullWidth />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    padding: space.xs,
  },
  empty: {
    paddingVertical: space.xxl,
  },
  list: {
    paddingTop: space.md,
    gap: space.md,
    paddingBottom: space.md,
  },
  card: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  traitBlock: {
    gap: 2,
  },
  relationBlock: {
    gap: space.xs,
  },
  reasonBlock: {
    gap: 2,
  },
  footer: {
    paddingTop: space.sm,
  },
});
