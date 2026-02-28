/**
 * Apple-style time wheel picker: timmar, min, sek.
 * value/onChange: "H:MM:SS" or "HH:MM:SS" (e.g. "0:45:30", "1:30:00").
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, typography } from '../theme';

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const SCROLLVIEW_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;

const HOURS = Array.from({ length: 6 }, (_, i) => i);   // 0–5 h
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const SECONDS = Array.from({ length: 60 }, (_, i) => i);

function parseTime(str) {
  if (!str || typeof str !== 'string') return { h: 0, m: 0, s: 0 };
  const parts = str.trim().split(':').map((p) => parseInt(p, 10));
  return {
    h: Number.isFinite(parts[0]) ? Math.max(0, Math.min(5, parts[0])) : 0,
    m: Number.isFinite(parts[1]) ? Math.max(0, Math.min(59, parts[1])) : 0,
    s: Number.isFinite(parts[2]) ? Math.max(0, Math.min(59, parts[2])) : 0,
  };
}

function formatTime(h, m, s) {
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function WheelColumn({ items, unitLabel, selectedIndex, onSelectIndex, style }) {
  const scrollRef = useRef(null);
  const [localIndex, setLocalIndex] = useState(selectedIndex);
  const totalHeight = items.length * ITEM_HEIGHT;
  const padding = (SCROLLVIEW_HEIGHT - ITEM_HEIGHT) / 2;

  useEffect(() => {
    setLocalIndex(selectedIndex);
    const y = selectedIndex * ITEM_HEIGHT;
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [selectedIndex]);

  const handleScrollEnd = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    setLocalIndex(clamped);
    onSelectIndex(clamped);
    scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
  };

  return (
    <View style={[styles.column, style]}>
      <View style={styles.pill} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingVertical: padding }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
      >
        {items.map((val, i) => (
          <View key={val} style={styles.item}>
            <Text style={styles.itemText}>{val} {unitLabel}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function TimeWheelPicker({ value = '0:00:00', onChange }) {
  const parsed = parseTime(value);
  const [h, setH] = useState(parsed.h);
  const [m, setM] = useState(parsed.m);
  const [s, setS] = useState(parsed.s);

  useEffect(() => {
    const p = parseTime(value);
    setH(p.h);
    setM(p.m);
    setS(p.s);
  }, [value]);

  // Initial value so parent has something (e.g. "0:00:00") for continue button
  const didEmitInitial = useRef(false);
  useEffect(() => {
    if (onChange && !didEmitInitial.current) {
      didEmitInitial.current = true;
      onChange(formatTime(parsed.h, parsed.m, parsed.s));
    }
  }, []);

  const notify = (newH, newM, newS) => {
    if (onChange) onChange(formatTime(newH, newM, newS));
  };

  return (
    <View style={styles.container}>
      <WheelColumn
        items={HOURS}
        unitLabel="timmar"
        selectedIndex={h}
        onSelectIndex={(i) => { setH(i); notify(i, m, s); }}
      />
      <WheelColumn
        items={MINUTES}
        unitLabel="min"
        selectedIndex={m}
        onSelectIndex={(i) => { setM(i); notify(h, i, s); }}
      />
      <WheelColumn
        items={SECONDS}
        unitLabel="sek"
        selectedIndex={s}
        onSelectIndex={(i) => { setS(i); notify(h, m, i); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: SCROLLVIEW_HEIGHT,
    backgroundColor: colors.background,
  },
  column: {
    flex: 1,
    height: SCROLLVIEW_HEIGHT,
    justifyContent: 'center',
  },
  pill: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: (SCROLLVIEW_HEIGHT - ITEM_HEIGHT) / 2,
    height: ITEM_HEIGHT,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
  },
  scroll: {
    flex: 1,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    ...typography.body,
    color: colors.primaryText,
    fontSize: 18,
  },
});
