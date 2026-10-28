# Relay identity

Original geometric artwork created for this assessment: two offset paper-colored
strokes on muted teal, matching the in-app mark. No third-party logo is used.
The vector source is [relay-mark.svg](relay-mark.svg); the source renderer is
[render-branding.swift](../scripts/render-branding.swift). Artwork is AI-generated
and attributed in the [development disclosure](../docs/AI_USAGE.md).

Checked-in PNGs are inputs to Expo's existing native asset pipeline:

- `icon.png`: 1024×1024 opaque launcher artwork.
- `adaptive-icon.png`: transparent foreground with central artwork; Expo supplies
  the teal adaptive background.
- `splash-icon.png`: rounded mark on transparency, displayed on warm paper.
- `favicon.png`: 64×64 mark.

Optional regeneration on macOS (AppKit and Xcode command-line tools):

```sh
swift scripts/render-branding.swift
npx expo prebuild --platform android --no-install
```

Normal installation/builds use the committed PNGs and do not require Swift or a new
image dependency. Generated Android/iOS projects stay outside Git. Display branding
changes do not alter the Pear runtime name, package identifier or version chain.
