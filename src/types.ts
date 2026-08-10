export type DesktopLauncherEntry = {
	id: string;
	kind: "desktop";
	desktopId: string;
	desktopPath: string;
	name: string;
	enabled: boolean;
};

export type ShellLauncherEntry = {
	id: string;
	kind: "shell";
	name: string;
	command: string;
	enabled: boolean;
};

export type LauncherEntry = DesktopLauncherEntry | ShellLauncherEntry;

export interface PluginSettings {
	commandNamePrefix: string;
	entries: LauncherEntry[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
	commandNamePrefix: "Launch App: ",
	entries: [],
};

export interface DesktopAppInfo {
	desktopId: string;
	path: string;
	name: string;
	exec: string;
	/** Working directory from desktop Path= key, if any. */
	workingDir: string | null;
	noDisplay: boolean;
	hidden: boolean;
}
