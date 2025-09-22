Fakebook (Capacitor Android)
===========================

This converts the static site (index.html, style.css, script.js) into an Android APK using Capacitor.

Prereqs
-------
- Node 18+ (Node 20 recommended)
- Java 17 (Temurin/OpenJDK)
- Android SDK + Android Studio (for local builds/opening project)

Local setup
-----------
1) Install dependencies:
```
cd public
npm install
```

2) Add Android platform (one-time):
```
npx cap add android
```

3) Generate icons (optional, uses gg.png):
```
# copy or convert gg.png to resources/icon.png (1024x1024 recommended)
npx cordova-res android --skip-config --copy
```

4) Sync web assets into Android:
```
npx cap sync android
```

5) Build APK:
```
cd android
./gradlew assembleDebug   # macOS/Linux
# or
gradlew.bat assembleDebug # Windows
```
APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`.

6) Open in Android Studio (optional):
```
cd ..
npx cap open android
```

GitHub Actions
--------------
- Push to `main` or `master` to trigger the workflow `.github/workflows/android-apk.yml`.
- It builds and uploads `app-debug.apk` as an artifact named `Fakebook-debug-apk`.

Notes
-----
- `capacitor.config.json` uses `webDir: "."` since your site files are at repo root (`public`).
- Service worker `sw.js` will be copied as-is; ensure paths are relative for file URLs.
- For release signing, add a signing config in `android/app/build.gradle` and inject secrets via GitHub Actions.


