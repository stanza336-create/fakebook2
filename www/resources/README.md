App icons and splash screens
============================

Place a square source icon here named `icon.png` (at least 1024x1024). To generate platform assets run:

```
npx cordova-res android --skip-config --copy
```

This will create Android mipmap icons under `android/app/src/main/res/` after the Android project has been added.

Current project also references `gg.png` at repository root as the app icon. For best results, duplicate or convert `gg.png` to `resources/icon.png` before running the command above.


