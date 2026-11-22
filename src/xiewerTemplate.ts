import { scanDesktopApps } from "./desktop";
import type { DesktopAppInfo, DesktopLauncherEntry, LauncherEntry, ShellLauncherEntry } from "./types";

/** Stable id so we can find / re-seed without duplicating. */
export const COLLECTION_XIEWER_SEED_ID = "seed-collectionxiewer";

export const COLLECTION_XIEWER_DISPLAY_NAME = "CollectionXiewer";

/**
 * Shell fallback when no .desktop entry is installed.
 * Searches common AppImage locations; user can edit the command after enabling.
 */
export const COLLECTION_XIEWER_SHELL_FALLBACK =
	'sh -c \'for d in "$HOME/Applications" "$HOME/Downloads" "$HOME/bin" "$HOME/.local/bin"; do for f in "$d"/CollectionXiewer*.AppImage; do [ -f "$f" ] && exec "$f"; done; done; echo "CollectionXiewer AppImage not found under ~/Applications, ~/Downloads, ~/bin, or ~/.local/bin — edit this launcher command or add from desktop apps." >&2; exit 1\'';

const DESKTOP_ID_HINTS = [
	"com.collectionxiewer.app.desktop",
	"collectionxiewer.desktop",
	"CollectionXiewer.desktop",
];

function looksLikeCollectionXiewer(app: DesktopAppInfo): boolean {
	const id = app.desktopId.toLowerCase();
	const name = app.name.toLowerCase();
	return (
		id.includes("collectionxiewer") ||
		name.includes("collectionxiewer") ||
		DESKTOP_ID_HINTS.some((hint) => id === hint.toLowerCase())
	);
}

/** Prefer a real .desktop entry when present on the machine. */
export function findCollectionXiewerDesktopApp(): DesktopAppInfo | null {
	try {
		const apps = scanDesktopApps({ includeHidden: true });
		const byHint = apps.find((a) =>
			DESKTOP_ID_HINTS.some((hint) => a.desktopId.toLowerCase() === hint.toLowerCase()),
		);
		if (byHint) return byHint;
		return apps.find(looksLikeCollectionXiewer) ?? null;
	} catch {
		return null;
	}
}

export function buildCollectionXiewerSeedEntry(): LauncherEntry {
	const desktop = findCollectionXiewerDesktopApp();
	if (desktop) {
		const entry: DesktopLauncherEntry = {
			id: COLLECTION_XIEWER_SEED_ID,
			kind: "desktop",
			desktopId: desktop.desktopId,
			desktopPath: desktop.path,
			name: COLLECTION_XIEWER_DISPLAY_NAME,
			enabled: false,
		};
		return entry;
	}

	const entry: ShellLauncherEntry = {
		id: COLLECTION_XIEWER_SEED_ID,
		kind: "shell",
		name: COLLECTION_XIEWER_DISPLAY_NAME,
		command: COLLECTION_XIEWER_SHELL_FALLBACK,
		enabled: false,
	};
	return entry;
}

/** True if the vault already has some CollectionXiewer launcher (manual or seed). */
export function hasCollectionXiewerEntry(entries: LauncherEntry[]): boolean {
	return entries.some((e) => {
		if (e.id === COLLECTION_XIEWER_SEED_ID) return true;
		if (e.name.toLowerCase().includes("collectionxiewer")) return true;
		if (e.kind === "desktop") {
			return (
				e.desktopId.toLowerCase().includes("collectionxiewer") ||
				DESKTOP_ID_HINTS.some((hint) => e.desktopId.toLowerCase() === hint.toLowerCase())
			);
		}
		if (e.kind === "shell") {
			return e.command.toLowerCase().includes("collectionxiewer");
		}
		return false;
	});
}

export function findSeedEntry(entries: LauncherEntry[]): LauncherEntry | undefined {
	return entries.find((e) => e.id === COLLECTION_XIEWER_SEED_ID);
}

/**
 * Opt-in seed (Decision C): insert a **disabled** CollectionXiewer entry once.
 * Never overwrites an existing CollectionXiewer launcher. Does not enable a command.
 */
export function applyCollectionXiewerSeedOnce(entries: LauncherEntry[]): {
	entries: LauncherEntry[];
	seeded: boolean;
} {
	if (hasCollectionXiewerEntry(entries)) {
		return { entries, seeded: false };
	}
	return {
		entries: [...entries, buildCollectionXiewerSeedEntry()],
		seeded: true,
	};
}
