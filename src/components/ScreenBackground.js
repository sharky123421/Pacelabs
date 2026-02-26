import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme';

export function ScreenBackground({ children, style }) {
  return (
    <View style={[styles.background, style]}>
      <View style={styles.materialLayer} pointerEvents="none">
        <View style={styles.coolWash} />
        <View style={styles.toneTop} />
        <View style={styles.toneMid} />
        <View style={styles.toneBottom} />
        <View style={styles.centerSpot} />
        <View style={styles.bottomSpot} />
        <View style={styles.ambientLeft} />
        <View style={styles.ambientRight} />
        <View style={styles.vignette} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: colors.surfaceBase,
  },
  materialLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  coolWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(196,210,230,0.06)',
  },
  toneTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '35%',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  toneMid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '28%',
    height: '42%',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  toneBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(0,0,0,0.26)',
  },
  centerSpot: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    top: '24%',
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  bottomSpot: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    bottom: 36,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  ambientLeft: {
    position: 'absolute',
    left: -80,
    top: 34,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ambientRight: {
    position: 'absolute',
    right: -94,
    bottom: 90,
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(0,0,0,0.32)',
    borderWidth: 22,
  },
});

