# Apple HealthKit setup (Pacelab)

## 1. Install native dependency

```bash
npm install
cd ios && pod install && cd ..
```

## 2. Enable HealthKit in Xcode

1. Open `ios/Pacelab.xcworkspace` in Xcode.
2. Select the **Pacelab** target.
3. Open **Signing & Capabilities**.
4. Click **+ Capability** and add **HealthKit**.
5. (Optional) Enable **Clinical Health Records** if you need them.

The `Pacelab.entitlements` file already includes `com.apple.developer.healthkit`; if Xcode shows a conflict, use the capability panel to ensure HealthKit is enabled.

## 3. Info.plist

`ios/Pacelab/Info.plist` already contains:

- `NSHealthShareUsageDescription` — "Pacelab reads your health data to optimize your training"
- `NSHealthUpdateUsageDescription` — "Pacelab saves your runs to Apple Health"

## 4. Simulator

HealthKit is **not available** in the iOS Simulator. The app uses **mock data** when HealthKit is unavailable so you can test the UI. Test on a real device for real HealthKit data.

## 5. Background sync (optional)

When you add `react-native-background-fetch`, register a task that calls `fullSync(userId)` from `src/services/appleHealth.js`. Sync runs on app open (if last sync &gt; 30 min) and on pull-to-refresh on the Today screen.
