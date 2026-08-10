import { App, Component, MarkdownRenderer } from "obsidian";
import { readFileSync } from "fs";
import { join } from "path";

export type PluginSettingsTabId = "settings" | "readme";

export function loadPluginReadme(): string {
	try {
		return readFileSync(join(__dirname, "README.md"), "utf-8");
	} catch {
		return "# README not found\n\nCould not load README.md from the plugin folder.";
	}
}

export function renderSettingsTabBar(
	container: HTMLElement,
	activeTab: PluginSettingsTabId,
	onSelect: (tab: PluginSettingsTabId) => void,
	classPrefix: string,
): void {
	container.empty();
	container.addClass(`${classPrefix}-settings-tabs`);

	const tabs: { id: PluginSettingsTabId; label: string }[] = [
		{ id: "settings", label: "Settings" },
		{ id: "readme", label: "README" },
	];

	for (const tab of tabs) {
		const btn = container.createDiv({
			cls: `${classPrefix}-settings-tab${activeTab === tab.id ? " is-active" : ""}`,
			text: tab.label,
		});
		btn.addEventListener("click", () => {
			if (activeTab !== tab.id) onSelect(tab.id);
		});
	}
}

export function renderReadmePanel(
	app: App,
	container: HTMLElement,
	component: Component,
	panelClass: string,
): void {
	container.empty();
	container.addClass(panelClass);
	const markdown = loadPluginReadme();
	void MarkdownRenderer.render(app, markdown, container, "", component);
}
