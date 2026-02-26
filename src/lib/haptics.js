/**
 * Central haptic feedback for buttons and UI.
 * Uses expo-haptics when available; no-op otherwise.
 */

let Haptics;
const LAST_TRIGGER = new Map();
const DEFAULT_COOLDOWN_MS = 120;

try {
  Haptics = require('expo-haptics');
} catch (_) {
  Haptics = null;
}

function shouldSkip(key, cooldownMs) {
  const now = Date.now();
  const previous = LAST_TRIGGER.get(key) || 0;
  if (now - previous < cooldownMs) return true;
  LAST_TRIGGER.set(key, now);
  return false;
}

export function triggerHaptic(kind, options = {}) {
  const { skipIfRecent = true, cooldownMs = DEFAULT_COOLDOWN_MS } = options;
  if (skipIfRecent && shouldSkip(kind, cooldownMs)) return;

  if (kind === 'selection') {
    Haptics?.selectionAsync?.().catch(() => {});
    return;
  }
  if (kind === 'success') {
    Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return;
  }
  if (kind === 'medium') {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    return;
  }
  Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticLight(options) {
  triggerHaptic('light', options);
}

export function hapticSelection(options) {
  triggerHaptic('selection', options);
}

export function hapticSuccess(options) {
  triggerHaptic('success', options);
}

export function hapticMedium(options) {
  triggerHaptic('medium', options);
}
