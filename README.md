# System App Launcher

Desktop-only Obsidian plugin for **Linux Mint** (and other Linux desktops). It registers Obsidian commands that launch system apps so the [Buttons](https://github.com/shabegom/buttons) plugin can trigger them.

## How it works with Buttons

Buttons cannot run shell commands. This plugin fills that gap:

1. Add apps in **Settings → System App Launcher** (from `.desktop` files and/or custom shell commands).
2. Each enabled entry becomes a Command Palette entry like `System App Launcher: Launch App: PureRef`.
3. In a note, use a Buttons block with `type command` and that **full** name as `action` (copy from the settings preview).

```button
name My Awesome Button
type command
action System App Launcher: Launch App: PureRef
color blue
```
^button-pureref

Buttons matches commands by **display name** (case-insensitive), not by command id. Obsidian always prefixes the plugin name, so the `action` must include `System App Launcher: …`.

## Features

- **Desktop apps:** browse XDG `.desktop` entries (`~/.local/share/applications`, `/usr/share/applications`, Flatpak exports, etc.).
- **Custom shell:** free-form commands for apps without a desktop file or that need special flags.
- Launch order for desktop entries: Exec line → `gtk-launch` → `gio launch` (all detached; AppImage env cleaned).
- Processes are detached so Obsidian is not blocked by the launched app.

## Install

### From GitHub

```bash
cd /path/to/your/vault/.obsidian/plugins
git clone https://github.com/FootPrintStudio/obsidian-system-app-launcher.git system-app-launcher
cd system-app-launcher
npm install && npm run build
```

Then enable **System App Launcher** under Community plugins and reload Obsidian.

### BRAT (beta install)

Not in the Obsidian Community Plugins catalog. Install via [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Enable **BRAT** in Community Plugins.
2. **Add Beta plugin** → `FootPrintStudio/obsidian-system-app-launcher`
3. Install or update from BRAT when [releases](https://github.com/FootPrintStudio/obsidian-system-app-launcher/releases) are published.

BRAT requires a GitHub Release with `main.js`, `manifest.json`, `styles.css`, and `versions.json` attached.

## Setup

1. Enable **System App Launcher** under Community plugins (reload Obsidian if needed).
2. Open **Settings → System App Launcher**.
3. Click **Add from desktop apps…** and/or **Add custom shell…**.
4. Copy the `Buttons action:` preview text into a Buttons `action` field.

## Develop / rebuild

If the vault is on a local disk:

```bash
cd ".obsidian/plugins/system-app-launcher"
npm install
npm run build    # production main.js
npm run dev      # watch mode with sourcemaps
```

If the vault is on a network/remote volume (symlink or execute bit issues), use the helper which builds under `/tmp` and copies `main.js` back:

```bash
cd ".obsidian/plugins/system-app-launcher"
chmod +x build.sh
./build.sh
```

Then reload Obsidian (or disable/re-enable the plugin).

## Notes for Linux / AppImage / Flatpak

- When Obsidian is an AppImage, this plugin strips AppImage env vars (`APPIMAGE`, `APPDIR`, polluted `LD_LIBRARY_PATH`, etc.) before spawning so other AppImages (e.g. PureRef) can start.
- Flatpak Obsidian may still have a restricted environment; prefer AppImage/deb if launches fail.
- Shell command strings live only in plugin settings (not in note markdown).

## Command palette

Enabled launchers also appear in the Command Palette under their full display names, so you can test without Buttons.
