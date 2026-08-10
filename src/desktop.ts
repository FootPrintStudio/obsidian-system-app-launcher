import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { DesktopAppInfo } from "./types";

function expandHome(p: string): string {
	if (p.startsWith("~/")) {
		return path.join(os.homedir(), p.slice(2));
	}
	return p;
}

/**
 * XDG application directories in precedence order (highest first).
 * User locations must win over system locations.
 */
export function getApplicationDirs(): string[] {
	const home = os.homedir();
	const xdgDataHome = process.env.XDG_DATA_HOME
		? expandHome(process.env.XDG_DATA_HOME)
		: path.join(home, ".local", "share");

	const dirs: string[] = [
		path.join(xdgDataHome, "applications"),
		path.join(home, ".local", "share", "applications"),
		path.join(home, ".local", "share", "flatpak", "exports", "share", "applications"),
	];

	const xdgDataDirs = (process.env.XDG_DATA_DIRS ?? "/usr/local/share:/usr/share")
		.split(":")
		.map((d) => d.trim())
		.filter(Boolean);

	for (const dataDir of xdgDataDirs) {
		dirs.push(path.join(expandHome(dataDir), "applications"));
	}

	dirs.push(
		"/usr/local/share/applications",
		"/usr/share/applications",
		"/var/lib/flatpak/exports/share/applications",
	);

	// Preserve first-seen order (highest precedence).
	return [...new Set(dirs)];
}

function parseDesktopFile(filePath: string, desktopId: string): DesktopAppInfo | null {
	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf8");
	} catch {
		return null;
	}

	const lines = content.split(/\r?\n/);
	let inDesktopEntry = false;
	let name = "";
	let exec = "";
	let type = "";
	let workingDir: string | null = null;
	let noDisplay = false;
	let hidden = false;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;

		if (line.startsWith("[") && line.endsWith("]")) {
			inDesktopEntry = line === "[Desktop Entry]";
			continue;
		}
		if (!inDesktopEntry) continue;

		const eq = line.indexOf("=");
		if (eq <= 0) continue;

		const key = line.slice(0, eq).trim();
		const value = line.slice(eq + 1).trim();

		// Prefer unlocalized keys over Name[locale]= variants.
		if (key === "Name" && !name) name = value;
		else if (key === "Exec" && !exec) exec = value;
		else if (key === "Type" && !type) type = value;
		else if (key === "Path" && !workingDir) workingDir = value;
		else if (key === "NoDisplay") noDisplay = value.toLowerCase() === "true";
		else if (key === "Hidden") hidden = value.toLowerCase() === "true";
	}

	if (!name || !exec) return null;
	if (type && type !== "Application") return null;

	if (workingDir) {
		workingDir = expandHome(workingDir);
		if (!fs.existsSync(workingDir)) workingDir = null;
	}

	return {
		desktopId,
		path: filePath,
		name,
		exec,
		workingDir,
		noDisplay,
		hidden,
	};
}

function collectDesktopFiles(dir: string): string[] {
	const results: string[] = [];

	const walk = (current: string, relativePrefix: string) => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const full = path.join(current, entry.name);
			const relative = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;

			if (entry.isDirectory()) {
				walk(full, relative);
			} else if (entry.isFile() && entry.name.endsWith(".desktop")) {
				results.push(full);
			}
		}
	};

	walk(dir, "");
	return results;
}

function desktopIdFromPath(filePath: string, appDir: string): string {
	const relative = path.relative(appDir, filePath);
	return relative.split(path.sep).join("-");
}

/**
 * Scan XDG application directories for desktop entries.
 * Higher-precedence directories win for the same desktop id.
 */
export function scanDesktopApps(options?: { includeHidden?: boolean }): DesktopAppInfo[] {
	const includeHidden = options?.includeHidden ?? false;
	const byId = new Map<string, DesktopAppInfo>();

	for (const dir of getApplicationDirs()) {
		if (!fs.existsSync(dir)) continue;

		for (const filePath of collectDesktopFiles(dir)) {
			const desktopId = desktopIdFromPath(filePath, dir);
			if (byId.has(desktopId)) continue; // keep higher-precedence entry

			const parsed = parseDesktopFile(filePath, desktopId);
			if (!parsed) continue;
			if (!includeHidden && (parsed.hidden || parsed.noDisplay)) continue;
			byId.set(desktopId, parsed);
		}
	}

	return [...byId.values()].sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
	);
}

export function findDesktopApp(
	desktopId: string,
	desktopPath?: string,
): DesktopAppInfo | null {
	if (desktopPath && fs.existsSync(desktopPath)) {
		const parsed = parseDesktopFile(desktopPath, desktopId);
		if (parsed) return parsed;
	}

	// Prefer a targeted lookup over a full scan when possible.
	for (const dir of getApplicationDirs()) {
		if (!fs.existsSync(dir)) continue;
		for (const filePath of collectDesktopFiles(dir)) {
			if (desktopIdFromPath(filePath, dir) !== desktopId) continue;
			const parsed = parseDesktopFile(filePath, desktopId);
			if (parsed) return parsed;
		}
	}

	return null;
}
