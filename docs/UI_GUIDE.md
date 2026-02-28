### Pacelab UI guide — liquid glass

- **Theme tokens**
  - Use `colors.background` / `backgroundSecondary` for screen backgrounds.
  - Use `colors.glassSurface` + `colors.glassBorder` for most cards and navigation chrome.
  - Use `theme.radius.card` for cards and `theme.radius.pill` for pills/segmented controls.
  - Use `theme.glassShadow` for elevated glass surfaces (cards, tab bar).
  - Use `theme.animation.press` via `usePressAnimation` for micro-interaktioner på press.

- **GlassCard**
  - **När**: Primära informationskort (today session, readiness, profile cards, beginner cards).
  - **Hur**: Wrappa innehållet i `<GlassCard style={...}>...</GlassCard>` i stället för en `View` med egen bakgrund/shadow.
  - **Interaktivt kort**: Skicka `onPress` till `GlassCard` för att få press-animation (t.ex. readiness/why this session).

- **Knappar**
  - **PrimaryButton** för huvud-CTA, **SecondaryButton** för sekundära actions. Båda använder `usePressAnimation` för press-feedback.

- **Kontrast & dark mode**
  - Text ska alltid ligga på `colors.background*`, `colors.card*` eller `colors.glassSurface*`.
  - Använd `colors.primaryText` för primär text, `secondaryText` för kropp/sekundär info, `tertiaryText` för hjälptråd.
  - När du skapar nya glass-ytor, kombinera halvtransparenta bakgrunder med en tydlig border (`colors.glassBorder`) så att kortet är synligt även på OLED-skärmar.
  - Dark mode är redan den primära paletten; vid framtida ljust läge bör samma tokens spegla motsvarande ljus-färger utan att ändra komponent-API:t.

