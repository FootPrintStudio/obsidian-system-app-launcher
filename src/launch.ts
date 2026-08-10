import { spawn, spawnSync } from "child_process";
import type { DesktopAppInfo, LauncherEntry } from "./types";
import { findDesktopApp } from "./desktop";

export class LaunchError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LaunchError";
	}
}

/** Env keys set by Obsidian's AppImage that break launching other AppImages/apps. */
const APPIMAGE_ENV_KEYS = [
	"APPIMAGE",
	"APPDIR",
	"OWD",
	"ARGV0",
	"APPIMAGE_EXTRACT_AND_RUN",
	"APPIMAGE_MOUNT_DIR",
];

function isAppImageMountPath(p: string): boolean {
	return p.includes("/.mount_") || p.includes("/tmp/.mount");
}

function cleanEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env };

	for (const key of APPIMAGE_ENV_KEYS) {
		delete env[key];
	}

	if (env.LD_LIBRARY_PATH) {
		const parts = env.LD_LIBRARY_PATH.split(":").filter((p) => p && !isAppImageMountPath(p));
		if (parts.length > 0) env.LD_LIBRARY_PATH = parts.join(":");
		else delete env.LD_LIBRARY_PATH;
	}

	for (const key of ["QT_PLUGIN_PATH", "GTK_PATH", "GI_TYPELIB_PATH", "PERLLIB", "GSETTINGS_SCHEMA_DIR"]) {
		const value = env[key];
		if (value && isAppImageMountPath(value)) delete env[key];
	}

	const requiredPath = ["/usr/local/bin", "/usr/bin", "/bin"];
	const currentPath = (env.PATH ?? "").split(":").filter(Boolean);
	for (const p of requiredPath) {
		if (!currentPath.includes(p)) currentPath.push(p);
	}
	env.PATH = currentPath.join(":");

	return env;
}

function commandExists(command: string): boolean {
	const result = spawnSync("sh", ["-c", `command -v ${JSON.stringify(command)}`], {
		encoding: "utf8",
		env: cleanEnv(),
		stdio: ["ignore", "pipe", "ignore"],
	});
	return result.status === 0;
}

/**
 * Spawn a process fully detached from Obsidian.
 * Never use spawnSync for GUI apps — it can block the Obsidian UI until the app exits.
 */
function spawnDetached(
	command: string,
	args: string[],
	options?: { shell?: boolean; cwd?: string | null },
): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;

		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			fn();
		};

		try {
			const child = spawn(command, args, {
				detached: true,
				stdio: "ignore",
				shell: options?.shell ?? false,
				env: cleanEnv(),
				cwd: options?.cwd || undefined,
			});

			child.on("error", (err) => {
				settle(() => reject(new LaunchError(err.message)));
			});

			child.unref();
			// Missing binaries fire 'error' on next tick; succeed shortly after if not.
			setTimeout(() => {
				settle(() => resolve());
			}, 75);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			settle(() => reject(new LaunchError(message)));
		}
	});
}

/** Strip freedesktop Exec field codes (%f, %u, %% , etc.). */
export function stripExecFieldCodes(exec: string): string {
	return exec
		.replace(/%%/g, "\0")
		.replace(/%[fFuUdDnNickvm]/g, "")
		.replace(/\0/g, "%")
		.replace(/\s+/g, " ")
		.trim();
}

async function launchViaExec(exec: string, cwd?: string | null): Promise<void> {
	const cleaned = stripExecFieldCodes(exec);
	if (!cleaned) {
		throw new LaunchError("Desktop entry Exec line is empty after stripping field codes.");
	}
	await spawnDetached(cleaned, [], { shell: true, cwd });
}

export async function launchDesktopApp(app: DesktopAppInfo): Promise<void> {
	const errors: string[] = [];

	// Prefer Exec first — most reliable when Obsidian itself is an AppImage.
	try {
		await launchViaExec(app.exec, app.workingDir);
		return;
	} catch (err) {
		errors.push(err instanceof Error ? err.message : String(err));
	}

	if (commandExists("gtk-launch")) {
		try {
			await spawnDetached("gtk-launch", [app.desktopId], { cwd: app.workingDir });
			return;
		} catch (err) {
			errors.push(err instanceof Error ? err.message : String(err));
		}
	}

	if (commandExists("gio")) {
		try {
			await spawnDetached("gio", ["launch", app.path], { cwd: app.workingDir });
			return;
		} catch (err) {
			errors.push(err instanceof Error ? err.message : String(err));
		}
	}

	throw new LaunchError(
		`Could not launch ${app.name}. Tried Exec/gtk-launch/gio. ${errors.join(" | ")}`,
	);
}

export async function launchShellCommand(command: string): Promise<void> {
	const trimmed = command.trim();
	if (!trimmed) {
		throw new LaunchError("Shell command is empty.");
	}
	await spawnDetached(trimmed, [], { shell: true });
}

export async function launchEntry(entry: LauncherEntry): Promise<void> {
	if (entry.kind === "shell") {
		await launchShellCommand(entry.command);
		return;
	}

	const app = findDesktopApp(entry.desktopId, entry.desktopPath);
	if (!app) {
		throw new LaunchError(
			`Desktop entry not found: ${entry.desktopId}` +
				(entry.desktopPath ? ` (${entry.desktopPath})` : ""),
		);
	}

	await launchDesktopApp(app);
}
