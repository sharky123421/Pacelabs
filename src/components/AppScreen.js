import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { ScreenBackground } from './ScreenBackground';

export function AppScreen({ children, header, footer }) {
  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        {header ? (
          <>
            <View style={styles.headerGlow} pointerEvents="none" />
            <View style={styles.header}>{header}</View>
          </>
        ) : null}
        <View style={styles.content}>
          <View style={styles.contentGlow} pointerEvents="none" />
          <View style={styles.contentDepth} pointerEvents="none" />
          {children}
        </View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  headerGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 72,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  header: {
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 4,
  },
  content: {
    flex: 1,
    position: 'relative',
  },
  contentGlow: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: -8,
    height: 150,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  contentDepth: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 0,
    height: 130,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  footer: {
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingVertical: 12,
  },
});

