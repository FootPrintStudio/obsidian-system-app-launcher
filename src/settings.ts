import { App, Component, Modal, Notice, PluginSettingTab, Setting, TextComponent } from "obsidian";
import type SystemAppLauncherPlugin from "./main";
import { scanDesktopApps } from "./desktop";
import { renderReadmePanel, renderSettingsTabBar, type PluginSettingsTabId } from "./readmeTab";
import type {
	DesktopAppInfo,
	DesktopLauncherEntry,
	LauncherEntry,
	ShellLauncherEntry,
} from "./types";

function newId(): string {
	return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

class DesktopAppPickerModal extends Modal {
	private apps: DesktopAppInfo[];
	private selected = new Set<string>();
	private filter = "";
	private listEl: HTMLElement | null = null;
	private onConfirm: (apps: DesktopAppInfo[]) => void;
	private alreadyAdded: Set<string>;

	constructor(
		app: App,
		apps: DesktopAppInfo[],
		alreadyAddedDesktopIds: Set<string>,
		onConfirm: (apps: DesktopAppInfo[]) => void,
	) {
		super(app);
		this.apps = apps;
		this.alreadyAdded = alreadyAddedDesktopIds;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Add desktop apps" });

		new Setting(contentEl).setClass("sal-modal-search").addText((text) => {
			text.setPlaceholder("Search apps…");
			text.inputEl.addEventListener("input", () => {
				this.filter = text.getValue().trim().toLowerCase();
				this.renderList();
			});
			window.setTimeout(() => text.inputEl.focus(), 50);
		});

		this.listEl = contentEl.createDiv({ cls: "sal-modal-list" });
		this.renderList();

		const footer = contentEl.createDiv({ cls: "sal-modal-footer" });
		footer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		const addBtn = footer.createEl("button", {
			text: "Add selected",
			cls: "mod-cta",
		});
		addBtn.addEventListener("click", () => {
			const chosen = this.apps.filter((a) => this.selected.has(a.desktopId));
			if (chosen.length === 0) {
				new Notice("Select at least one app.");
				return;
			}
			this.onConfirm(chosen);
			this.close();
		});
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();

		const filtered = this.apps.filter((a) => {
			if (this.alreadyAdded.has(a.desktopId)) return false;
			if (!this.filter) return true;
			return (
				a.name.toLowerCase().includes(this.filter) ||
				a.desktopId.toLowerCase().includes(this.filter)
			);
		});

		if (filtered.length === 0) {
			this.listEl.createDiv({
				cls: "sal-empty",
				text: "No matching apps found.",
			});
			return;
		}

		for (const app of filtered) {
			const row = this.listEl.createDiv({
				cls: "sal-modal-row" + (this.selected.has(app.desktopId) ? " selected" : ""),
			});

			const checkbox = row.createEl("input", { type: "checkbox" });
			checkbox.checked = this.selected.has(app.desktopId);
			checkbox.addEventListener("click", (e) => e.stopPropagation());
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) this.selected.add(app.desktopId);
				else this.selected.delete(app.desktopId);
				row.toggleClass("selected", checkbox.checked);
			});

			const info = row.createDiv({ cls: "sal-modal-row-info" });
			info.createDiv({ cls: "sal-modal-row-name", text: app.name });
			info.createDiv({ cls: "sal-modal-row-id", text: app.desktopId });

			row.addEventListener("click", () => {
				if (this.selected.has(app.desktopId)) this.selected.delete(app.desktopId);
				else this.selected.add(app.desktopId);
				checkbox.checked = this.selected.has(app.desktopId);
				row.toggleClass("selected", checkbox.checked);
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class NameEditModal extends Modal {
	private titleText: string;
	private initialName: string;
	private onSave: (name: string) => void;
	private nameInput: TextComponent | null = null;

	constructor(
		app: App,
		opts: { title: string; name: string; onSave: (name: string) => void },
	) {
		super(app);
		this.titleText = opts.title;
		this.initialName = opts.name;
		this.onSave = opts.onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.titleText });

		new Setting(contentEl).setName("Display name").addText((text) => {
			this.nameInput = text;
			text.setValue(this.initialName);
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") this.submit();
			});
			window.setTimeout(() => text.inputEl.focus(), 50);
		});

		const footer = contentEl.createDiv({ cls: "sal-modal-footer" });
		footer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		footer
			.createEl("button", { text: "Save", cls: "mod-cta" })
			.addEventListener("click", () => this.submit());
	}

	private submit(): void {
		const name = this.nameInput?.getValue().trim() ?? "";
		if (!name) {
			new Notice("Name is required.");
			return;
		}
		this.onSave(name);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class ShellEntryModal extends Modal {
	private titleText: string;
	private initialName: string;
	private initialCommand: string;
	private onSave: (name: string, command: string) => void;
	private nameInput: TextComponent | null = null;
	private commandInput: TextComponent | null = null;

	constructor(
		app: App,
		opts: {
			title: string;
			name?: string;
			command?: string;
			onSave: (name: string, command: string) => void;
		},
	) {
		super(app);
		this.titleText = opts.title;
		this.initialName = opts.name ?? "";
		this.initialCommand = opts.command ?? "";
		this.onSave = opts.onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.titleText });

		new Setting(contentEl).setName("Display name").addText((text) => {
			this.nameInput = text;
			text.setValue(this.initialName);
			text.setPlaceholder("e.g. Custom Script");
		});

		new Setting(contentEl).setName("Shell command").addText((text) => {
			this.commandInput = text;
			text.setValue(this.initialCommand);
			text.setPlaceholder("e.g. firefox --private-window");
			text.inputEl.style.width = "100%";
		});

		const footer = contentEl.createDiv({ cls: "sal-modal-footer" });
		footer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		footer
			.createEl("button", { text: "Save", cls: "mod-cta" })
			.addEventListener("click", () => {
				const name = this.nameInput?.getValue().trim() ?? "";
				const command = this.commandInput?.getValue().trim() ?? "";
				if (!name) {
					new Notice("Name is required.");
					return;
				}
				if (!command) {
					new Notice("Shell command is required.");
					return;
				}
				this.onSave(name, command);
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class SystemAppLauncherSettingTab extends PluginSettingTab {
	plugin: SystemAppLauncherPlugin;
	private cachedApps: DesktopAppInfo[] | null = null;
	private entriesContainer: HTMLElement | null = null;
	private activeTab: PluginSettingsTabId = "settings";
	private readmeComponent = new Component();

	constructor(app: App, plugin: SystemAppLauncherPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide(): void {
		this.readmeComponent.unload();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.readmeComponent.unload();
		this.readmeComponent = new Component();

		containerEl.createEl("h2", { text: "System App Launcher" });

		const tabBar = containerEl.createDiv();
		renderSettingsTabBar(tabBar, this.activeTab, (tab) => {
			this.activeTab = tab;
			this.display();
		}, "sal");

		const content = containerEl.createDiv({ cls: "sal-settings-content" });

		if (this.activeTab === "readme") {
			const pluginDir =
				this.plugin.manifest.dir ??
				`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
			renderReadmePanel(this.app, content, this.readmeComponent, "sal-readme-panel", pluginDir);
			return;
		}

		this.displaySettings(content);
	}

	private displaySettings(containerEl: HTMLElement): void {
		containerEl.createEl("p", {
			text: "Each enabled entry becomes an Obsidian command that the Buttons plugin can run with type command. Copy the Buttons action preview exactly into your button blocks.",
		});

		new Setting(containerEl)
			.setName("Command name prefix")
			.setDesc(
				'Buttons matches the full Command Palette name, including this plugin\'s title. Example: "System App Launcher: Launch App: PureRef".',
			)
			.addText((text) => {
				text.setValue(this.plugin.settings.commandNamePrefix);
				text.onChange(async (value) => {
					this.plugin.settings.commandNamePrefix = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCommands();
					this.renderEntries();
				});
			});

		new Setting(containerEl)
			.setName("Launchers")
			.setDesc("Desktop apps and custom shell commands available as Obsidian commands.")
			.addButton((btn) => {
				btn.setButtonText("Add from desktop apps…").onClick(() => {
					void this.openDesktopPicker();
				});
			})
			.addButton((btn) => {
				btn.setButtonText("Add custom shell…").onClick(() => {
					this.openShellModal();
				});
			})
			.addButton((btn) => {
				btn.setButtonText("Rescan desktop apps").onClick(() => {
					this.cachedApps = scanDesktopApps();
					new Notice(`Found ${this.cachedApps.length} desktop apps.`);
				});
			});

		this.entriesContainer = containerEl.createDiv({ cls: "sal-entries" });
		this.renderEntries();
	}

	private renderEntries(): void {
		if (!this.entriesContainer) return;
		const el = this.entriesContainer;
		el.empty();

		const entries = this.plugin.settings.entries;
		if (entries.length === 0) {
			el.createDiv({
				cls: "sal-empty",
				text: "No launchers yet. Add desktop apps or a custom shell command.",
			});
			return;
		}

		entries.forEach((entry, index) => {
			const row = el.createDiv({ cls: "sal-entry" });
			const main = row.createDiv({ cls: "sal-entry-main" });

			const header = main.createDiv({ cls: "sal-entry-header" });
			header.createSpan({
				cls: `sal-kind-badge ${entry.kind}`,
				text: entry.kind,
			});
			header.createSpan({ text: entry.name });

			const actionName = this.plugin.getButtonsActionName(entry);
			main.createDiv({
				cls: "sal-command-preview",
				text: `Buttons action: ${actionName}`,
			});

			if (entry.kind === "shell") {
				main.createDiv({
					cls: "sal-command-preview",
					text: entry.command,
				});
			} else {
				main.createDiv({
					cls: "sal-command-preview",
					text: entry.desktopId,
				});
			}

			const actions = row.createDiv({ cls: "sal-entry-actions" });

			new Setting(actions)
				.setClass("sal-inline-setting")
				.addToggle((toggle) => {
					toggle.setValue(entry.enabled);
					toggle.setTooltip("Enabled as Obsidian command");
					toggle.onChange(async (value) => {
						entry.enabled = value;
						await this.plugin.saveSettings();
						this.plugin.refreshCommands();
					});
				});

			const testBtn = actions.createEl("button", { text: "Test", cls: "clickable-icon" });
			testBtn.title = "Launch now";
			testBtn.addEventListener("click", () => {
				void this.plugin.runLaunch(entry);
			});

			const copyBtn = actions.createEl("button", { text: "Copy", cls: "clickable-icon" });
			copyBtn.title = "Copy Buttons action";
			copyBtn.addEventListener("click", async () => {
				await navigator.clipboard.writeText(actionName);
				new Notice("Copied Buttons action");
			});

			const editBtn = actions.createEl("button", { text: "Edit", cls: "clickable-icon" });
			editBtn.addEventListener("click", () => {
				if (entry.kind === "shell") this.openShellModal(entry, index);
				else this.openRenameModal(entry);
			});

			const up = actions.createEl("button", { text: "↑", cls: "clickable-icon" });
			up.disabled = index === 0;
			up.title = "Move up";
			up.addEventListener("click", async () => {
				if (index === 0) return;
				const list = this.plugin.settings.entries;
				const prev = list[index - 1];
				const curr = list[index];
				if (!prev || !curr) return;
				list[index - 1] = curr;
				list[index] = prev;
				await this.plugin.saveSettings();
				this.renderEntries();
			});

			const down = actions.createEl("button", { text: "↓", cls: "clickable-icon" });
			down.disabled = index === entries.length - 1;
			down.title = "Move down";
			down.addEventListener("click", async () => {
				if (index >= entries.length - 1) return;
				const list = this.plugin.settings.entries;
				const next = list[index + 1];
				const curr = list[index];
				if (!next || !curr) return;
				list[index + 1] = curr;
				list[index] = next;
				await this.plugin.saveSettings();
				this.renderEntries();
			});

			actions
				.createEl("button", { text: "Remove", cls: "mod-warning" })
				.addEventListener("click", async () => {
					this.plugin.settings.entries.splice(index, 1);
					await this.plugin.saveSettings();
					this.plugin.refreshCommands();
					this.renderEntries();
				});
		});
	}

	private refreshDesktopCache(): DesktopAppInfo[] {
		this.cachedApps = scanDesktopApps();
		return this.cachedApps;
	}

	private async openDesktopPicker(): Promise<void> {
		let apps: DesktopAppInfo[];
		try {
			apps = this.refreshDesktopCache();
		} catch (err) {
			console.error("[system-app-launcher] desktop scan failed", err);
			new Notice("Failed to scan desktop apps. See console for details.", 8000);
			return;
		}

		const already = new Set(
			this.plugin.settings.entries
				.filter((e): e is DesktopLauncherEntry => e.kind === "desktop")
				.map((e) => e.desktopId),
		);

		new DesktopAppPickerModal(this.app, apps, already, async (chosen) => {
			let added = 0;
			for (const app of chosen) {
				if (already.has(app.desktopId)) continue;

				let name = app.name;
				const temp: LauncherEntry = {
					id: newId(),
					kind: "desktop",
					desktopId: app.desktopId,
					desktopPath: app.path,
					name,
					enabled: true,
				};
				if (this.plugin.hasDuplicateCommandName(temp, name)) {
					name = `${name} (${app.desktopId.replace(/\.desktop$/i, "")})`;
					temp.name = name;
				}

				this.plugin.settings.entries.push(temp);
				already.add(app.desktopId);
				added++;
			}
			await this.plugin.saveSettings();
			this.plugin.refreshCommands();
			this.renderEntries();
			new Notice(`Added ${added} app(s).`);
		}).open();
	}

	private openRenameModal(entry: DesktopLauncherEntry): void {
		new NameEditModal(this.app, {
			title: "Rename launcher",
			name: entry.name,
			onSave: async (name) => {
				if (this.plugin.hasDuplicateCommandName(entry, name)) {
					new Notice(
						`Another launcher already uses "${this.plugin.settings.commandNamePrefix}${name}". Pick a unique name so Buttons can match it.`,
						8000,
					);
					return;
				}
				entry.name = name;
				await this.plugin.saveSettings();
				this.plugin.refreshCommands();
				this.renderEntries();
			},
		}).open();
	}

	private openShellModal(existing?: ShellLauncherEntry, index?: number): void {
		new ShellEntryModal(this.app, {
			title: existing ? "Edit shell launcher" : "Add custom shell",
			name: existing?.name,
			command: existing?.command,
			onSave: async (name, command) => {
				const target =
					existing ??
					({
						id: newId(),
						kind: "shell",
						name,
						command,
						enabled: true,
					} satisfies ShellLauncherEntry);

				if (this.plugin.hasDuplicateCommandName(target, name)) {
					new Notice(
						`Another launcher already uses "${this.plugin.settings.commandNamePrefix}${name}". Pick a unique name so Buttons can match it.`,
						8000,
					);
					return;
				}

				if (existing && index !== undefined) {
					existing.name = name;
					existing.command = command;
				} else {
					this.plugin.settings.entries.push({
						id: newId(),
						kind: "shell",
						name,
						command,
						enabled: true,
					});
				}
				await this.plugin.saveSettings();
				this.plugin.refreshCommands();
				this.renderEntries();
			},
		}).open();
	}
}
