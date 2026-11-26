#!/usr/bin/env bash
set -euo pipefail
echo "Building web bundle into dist/..."
npm run build
echo "To generate Android APK via Capacitor:"
echo "  npm install @capacitor/core @capacitor/cli @capacitor/android"
echo "  npx cap add android"
echo "  npx cap sync android"
echo "  npx cap open android   # Build APK/AAB in Android Studio"
