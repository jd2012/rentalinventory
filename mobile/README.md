# Rental Inventory Mobile

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
- Checkout: scan guest pass, then scan gear
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
