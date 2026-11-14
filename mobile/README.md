# Rental Inventory Companion Apps

Cross-platform iPhone + Android client for the existing Kids Rental Tracker backend.

## Architecture

- React Native + Expo SDK 57
- One codebase for iPhone and Android
- Native barcode scanning with `expo-camera`
- Uses the existing Cloudflare Worker + D1 API in this repository
- Production API: `https://rentals.jd2012.work/api/*`
- Fallback API: `https://kids-rentals-api.codingjoe14.workers.dev/api/*`

No Django migration is required for the mobile client.

## Supported workflows

- Authenticate using the existing shop PIN (`Authorization: Bearer <PIN>`)
- Dashboard stats
- Checkout: scan and confirm guest pass, then scan and confirm gear
- Each checkout scan is saved immediately through `/api/items/add`
- Return a single item by scanning gear
- Scan a guest pass to view all outstanding gear and return everything
- Inventory lookup

## Run locally

Requires Node.js 22.13+ for Expo SDK 57.

```bash
cd mobile
npm install
npx expo install --fix
npx expo-doctor
npx expo start
```

Use a physical iPhone or Android phone to test camera scanning.

## Local iOS build

Install full Xcode, an iOS simulator runtime, and CocoaPods (`brew install cocoapods`).
If `xcode-select -p` points to Command Line Tools, select full Xcode for the current terminal:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cd mobile # from the repository root
npm ci
npx --yes expo-doctor
npx expo prebuild --platform ios
npm run ios
```

The native `ios/` and `android/` folders are generated locally and ignored by Git.
Rerun Prebuild after changing native dependencies or app configuration. To build in
Xcode, open `ios/RentalInventory.xcworkspace` and select the `RentalInventory` scheme.
Physical-device builds require configuring your Apple signing team in Xcode.

## Environment

The API URL normally does not need configuration because the app probes both production endpoints. To override it:

```bash
cp .env.example .env
```

Then edit `EXPO_PUBLIC_API_BASE_URL`.

The shop PIN is never committed to the repository. Staff enter it in the app when connecting a device.

## Production builds

Once device testing is complete:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android
eas build --platform ios
```

Google Play distribution requires a Play Console developer account. TestFlight/App Store distribution requires an Apple Developer account.

## Product boundary

These apps are companions to the website, maintained independently in this repository. Keep mobile scanning confirmations. Database administration, inventory management and label printing live in `../site/`. Both clients share the API in `../worker/`; status and due-date rules remain server-owned.
