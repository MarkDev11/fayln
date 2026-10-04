import React from 'react';
import { StyleSheet, Text, View, type ColorValue, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/**
 * Ikon geometris dari primitif View.
 *
 * Alasan tidak memakai pustaka ikon: menghindari dependensi tambahan, tetap
 * aman di lingkungan pengujian, dan tidak memerlukan sprite/font eksternal.
 * Semua ikon bersifat dekoratif — label aksesibilitas selalu disediakan
 * pemanggil melalui `accessibilityLabel` pada kontrol, bukan pada ikon.
 */
export type IconName =
  | 'home'
  | 'journey'
  | 'settings'
  | 'search'
  | 'close'
  | 'filter'
  | 'trash'
  | 'chevronRight'
  | 'chevronLeft'
  | 'check'
  | 'book'
  | 'pause'
  | 'play'
  | 'eye'
  | 'eyeOff'
  | 'star';

export type IconProps = {
  name: IconName;
  size?: number;
  /** Menerima ColorValue agar dapat dipakai langsung oleh opsi ikon tab. */
  color?: ColorValue;
  strokeWidth?: number;
};

export function Icon({ name, size = 24, color, strokeWidth = 2 }: IconProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.inkSecondary;
  const bar = (width: number, height: number, style?: ViewStyle) => (
    <View
      style={[
        { width, height, backgroundColor: tint, borderRadius: height / 2 },
        style,
      ]}
    />
  );

  switch (name) {
    /**
     * Bintang digambar sebagai glif teks, bukan bentuk `View`.
     *
     * Bintang berujung lima tidak dapat dibentuk dari `View` + `borderWidth`
     * seperti ikon lain di berkas ini, dan menambahkan pustaka SVG hanya untuk
     * satu ikon terlalu berat. `★` (U+2605) adalah glif tipografis biasa, bukan
     * emoji, dan tersedia di semua peramban serta sistem seluler.
     */
    case 'star':
      return (
        <Text
          allowFontScaling={false}
          style={{ color: tint, fontSize: size, lineHeight: size * 1.1 }}
        >
          ★
        </Text>
      );

    case 'home':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.5,
              height: size * 0.5,
              borderTopWidth: strokeWidth,
              borderLeftWidth: strokeWidth,
              borderColor: tint,
              transform: [{ rotate: '45deg' }],
              marginTop: size * 0.16,
            }}
          />
          <View
            style={{
              width: size * 0.58,
              height: size * 0.42,
              borderWidth: strokeWidth,
              borderTopWidth: 0,
              borderColor: tint,
              borderBottomLeftRadius: size * 0.1,
              borderBottomRightRadius: size * 0.1,
              marginTop: -size * 0.02,
            }}
          />
        </View>
      );

    case 'journey':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.82,
              height: size * 0.62,
              borderWidth: strokeWidth,
              borderColor: tint,
              borderRadius: size * 0.22,
              marginTop: size * 0.06,
            }}
          />
          <View
            style={{
              width: size * 0.22,
              height: size * 0.22,
              borderBottomWidth: strokeWidth,
              borderLeftWidth: strokeWidth,
              borderColor: tint,
              transform: [{ rotate: '-45deg' }],
              marginTop: -size * 0.1,
              marginLeft: -size * 0.24,
            }}
          />
        </View>
      );

    case 'settings':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center', gap: size * 0.16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {bar(size * 0.62, strokeWidth)}
            <View
              style={{
                width: size * 0.2,
                height: size * 0.2,
                borderRadius: size * 0.1,
                borderWidth: strokeWidth,
                borderColor: tint,
                marginLeft: -size * 0.34,
                backgroundColor: 'transparent',
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {bar(size * 0.62, strokeWidth)}
            <View
              style={{
                width: size * 0.2,
                height: size * 0.2,
                borderRadius: size * 0.1,
                borderWidth: strokeWidth,
                borderColor: tint,
                marginLeft: -size * 0.12,
                backgroundColor: 'transparent',
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {bar(size * 0.62, strokeWidth)}
            <View
              style={{
                width: size * 0.2,
                height: size * 0.2,
                borderRadius: size * 0.1,
                borderWidth: strokeWidth,
                borderColor: tint,
                marginLeft: -size * 0.46,
                backgroundColor: 'transparent',
              }}
            />
          </View>
        </View>
      );

    case 'search':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.62,
              height: size * 0.62,
              borderRadius: size * 0.31,
              borderWidth: strokeWidth,
              borderColor: tint,
              marginTop: size * 0.04,
              marginLeft: size * 0.04,
            }}
          />
          <View
            style={{
              width: size * 0.34,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '45deg' }],
              marginTop: -size * 0.12,
              marginLeft: size * 0.56,
            }}
          />
        </View>
      );

    case 'close':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center' }]}>
          <View
            style={{
              width: size * 0.72,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              width: size * 0.72,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '-45deg' }],
              marginTop: -strokeWidth,
            }}
          />
        </View>
      );

    case 'filter':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center', gap: size * 0.14 }]}>
          {bar(size * 0.78, strokeWidth)}
          {bar(size * 0.5, strokeWidth, { alignSelf: 'flex-start' })}
          {bar(size * 0.28, strokeWidth, { alignSelf: 'flex-start' })}
        </View>
      );

    case 'trash':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.6,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              marginTop: size * 0.14,
            }}
          />
          <View
            style={{
              width: size * 0.44,
              height: size * 0.5,
              borderWidth: strokeWidth,
              borderTopWidth: 0,
              borderColor: tint,
              borderBottomLeftRadius: size * 0.08,
              borderBottomRightRadius: size * 0.08,
              marginTop: size * 0.04,
            }}
          />
        </View>
      );

    case 'chevronRight':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center' }]}>
          <View
            style={{
              width: size * 0.38,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '45deg' }],
              marginLeft: size * 0.1,
            }}
          />
          <View
            style={{
              width: size * 0.38,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '-45deg' }],
              marginTop: -strokeWidth,
              marginLeft: size * 0.1,
            }}
          />
        </View>
      );

    case 'chevronLeft':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center' }]}>
          <View
            style={{
              width: size * 0.38,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '-45deg' }],
              marginLeft: -size * 0.1,
            }}
          />
          <View
            style={{
              width: size * 0.38,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '45deg' }],
              marginTop: -strokeWidth,
              marginLeft: -size * 0.1,
            }}
          />
        </View>
      );

    case 'eye':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center' }]}>
          <View
            style={{
              width: size * 0.86,
              height: size * 0.54,
              borderRadius: size * 0.27,
              borderWidth: strokeWidth,
              borderColor: tint,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: size * 0.24,
              height: size * 0.24,
              borderRadius: size * 0.12,
              backgroundColor: tint,
            }}
          />
        </View>
      );

    case 'eyeOff':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center' }]}>
          <View
            style={{
              width: size * 0.86,
              height: size * 0.54,
              borderRadius: size * 0.27,
              borderWidth: strokeWidth,
              borderColor: tint,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: size * 0.24,
              height: size * 0.24,
              borderRadius: size * 0.12,
              backgroundColor: tint,
            }}
          />
          {/* Garis miring menandakan UI disembunyikan */}
          <View
            style={{
              position: 'absolute',
              width: size * 1.02,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'check':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center' }]}>
          <View
            style={{
              width: size * 0.3,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '45deg' }],
              marginLeft: size * 0.06,
            }}
          />
          <View
            style={{
              width: size * 0.56,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '-45deg' }],
              marginTop: -strokeWidth,
              marginLeft: size * 0.28,
            }}
          />
        </View>
      );

    case 'book':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.66,
              height: size * 0.76,
              borderWidth: strokeWidth,
              borderColor: tint,
              borderRadius: size * 0.08,
              marginTop: size * 0.1,
            }}
          />
          <View
            style={{
              width: strokeWidth,
              height: size * 0.6,
              backgroundColor: tint,
              marginTop: -size * 0.68,
              marginLeft: size * 0.3,
            }}
          />
        </View>
      );

    case 'pause':
      return (
        <View style={[styles.box, { width: size, height: size, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: size * 0.16 }]}>
          {bar(size * 0.16, size * 0.56, { borderRadius: size * 0.05 })}
          {bar(size * 0.16, size * 0.56, { borderRadius: size * 0.05 })}
        </View>
      );

    case 'play':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center', alignItems: 'center' }]}>
          <View
            style={{
              width: 0,
              height: 0,
              borderTopWidth: size * 0.26,
              borderBottomWidth: size * 0.26,
              borderLeftWidth: size * 0.42,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
              borderLeftColor: tint,
              marginLeft: size * 0.1,
            }}
          />
        </View>
      );

    default:
      return <View style={{ width: size, height: size }} />;
  }
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'flex-start' },
});
