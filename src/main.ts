import { Notice, Platform, Plugin } from "obsidian";
import { launchEntry } from "./launch";
import { SystemAppLauncherSettingTab } from "./settings";
import {
	DEFAULT_SETTINGS,
	type DesktopLauncherEntry,
	type LauncherEntry,
	type PluginSettings,
	type ShellLauncherEntry,
} from "./types";
import { applyCollectionXiewerSeedOnce } from "./xiewerTemplate";

function newEntryId(): string {
	return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeEntry(raw: unknown): LauncherEntry | null {
	if (!raw || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;
	const id = typeof obj.id === "string" && obj.id ? obj.id : newEntryId();
	const name = typeof obj.name === "string" ? obj.name.trim() : "";
	const enabled = obj.enabled !== false;

	if (obj.kind === "shell") {
		const command = typeof obj.command === "string" ? obj.command : "";
		if (!name || !command.trim()) return null;
		const entry: ShellLauncherEntry = { id, kind: "shell", name, command, enabled };
		return entry;
	}

	if (obj.kind === "desktop") {
		const desktopId = typeof obj.desktopId === "string" ? obj.desktopId : "";
		const desktopPath = typeof obj.desktopPath === "string" ? obj.desktopPath : "";
		if (!name || !desktopId) return null;
		const entry: DesktopLauncherEntry = {
			id,
			kind: "desktop",
			desktopId,
			desktopPath,
			name,
			enabled,
		};
		return entry;
	}

	return null;
}

export default class SystemAppLauncherPlugin extends Plugin {
	settings: PluginSettings = {
		commandNamePrefix: DEFAULT_SETTINGS.commandNamePrefix,
		entries: [],
		collectionXiewerSeedApplied: false,
	};
	private registeredCommandIds: string[] = [];

	async onload(): Promise<void> {
		if (!Platform.isDesktop) {
			new Notice("System App Launcher requires the desktop app.");
			return;
		}

		await this.loadSettings();
		this.refreshCommands();
		this.addSettingTab(new SystemAppLauncherSettingTab(this.app, this));
	}

	onunload(): void {
		this.clearCommands();
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<PluginSettings> | null;
		const prefix =
			typeof data?.commandNamePrefix === "string"
				? data.commandNamePrefix
				: DEFAULT_SETTINGS.commandNamePrefix;

		let entries: LauncherEntry[] = [];
		if (Array.isArray(data?.entries)) {
			for (const raw of data.entries) {
				const entry = sanitizeEntry(raw);
				if (entry) entries.push(entry);
			}
		}

		let collectionXiewerSeedApplied = data?.collectionXiewerSeedApplied === true;

		// Decision C: opt-in seed once — disabled until the user enables it.
		if (!collectionXiewerSeedApplied) {
			const result = applyCollectionXiewerSeedOnce(entries);
			entries = result.entries;
			collectionXiewerSeedApplied = true;
		}

		this.settings = {
			commandNamePrefix: prefix,
			entries,
			collectionXiewerSeedApplied,
		};

		// Persist seed flag (+ new disabled entry) so upgrades do not re-seed after removal.
		if (data?.collectionXiewerSeedApplied !== true) {
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Re-insert the disabled CollectionXiewer template if the user removed it. */
	async reseedCollectionXiewerTemplate(): Promise<boolean> {
		const result = applyCollectionXiewerSeedOnce(this.settings.entries);
		if (!result.seeded) return false;
		this.settings.entries = result.entries;
		this.settings.collectionXiewerSeedApplied = true;
		await this.saveSettings();
		this.refreshCommands();
		return true;
	}

	/** Local command name passed to addCommand (Obsidian prefixes the plugin name). */
	getCommandDisplayName(entry: LauncherEntry): string {
		return `${this.settings.commandNamePrefix}${entry.name}`;
	}

	/**
	 * Full name as shown in the Command Palette / matched by Buttons.
	 * Buttons compares action text to command.name, which includes the plugin title.
	 */
	getButtonsActionName(entry: LauncherEntry): string {
		return `${this.manifest.name}: ${this.getCommandDisplayName(entry)}`;
	}

	/** True if another enabled entry already uses this Buttons/command display name. */
	hasDuplicateCommandName(entry: LauncherEntry, name: string): boolean {
		const candidate = `${this.settings.commandNamePrefix}${name}`.toUpperCase();
		return this.settings.entries.some((other) => {
			if (other.id === entry.id || !other.enabled) return false;
			return this.getCommandDisplayName(other).toUpperCase() === candidate;
		});
	}

	private commandIdFor(entry: LauncherEntry): string {
		return `launch-${entry.id}`;
	}

	clearCommands(): void {
		for (const id of this.registeredCommandIds) {
			try {
				this.removeCommand(id);
			} catch {
				// Command may already be gone during unload races.
			}
		}
		this.registeredCommandIds = [];
	}

	refreshCommands(): void {
		this.clearCommands();

		const seenNames = new Set<string>();

		for (const entry of this.settings.entries) {
			if (!entry.enabled) continue;

			const displayName = this.getCommandDisplayName(entry);
			const key = displayName.toUpperCase();
			if (seenNames.has(key)) {
				console.warn(
					`[system-app-launcher] Skipping duplicate command name: ${displayName}`,
				);
				continue;
			}
			seenNames.add(key);

			const localId = this.commandIdFor(entry);

			this.addCommand({
				id: localId,
				name: displayName,
				callback: () => {
					void this.runLaunch(entry);
				},
			});

			this.registeredCommandIds.push(localId);
		}
	}

	async runLaunch(entry: LauncherEntry): Promise<void> {
		try {
			await launchEntry(entry);
			new Notice(`Launched: ${entry.name}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Failed to launch ${entry.name}: ${message}`, 8000);
			console.error("[system-app-launcher]", err);
		}
	}
}
