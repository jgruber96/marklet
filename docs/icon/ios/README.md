# iOS app icon

The same artwork as the desktop icon (`../marklet.svg`), drawn as a full square
with no transparency: iOS rounds the corners itself and rejects icons with an
alpha channel. Made from `../marklet-ios.svg`.

These two files are the whole icon set (one 1024 px image; Xcode makes every
other size from it). They replace what `tauri ios init` generated:

```bash
rm src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/*
cp docs/icon/ios/AppIcon-1024.png docs/icon/ios/Contents.json src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/
```
