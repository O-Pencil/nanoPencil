/**
 * [UPSTREAM]: Depends on @pencil-agent/ai, @pencil-agent/tui, ../theme/theme.js, ./dynamic-border.js
 * [SURFACE]: OAuthSelectorComponent
 * [LOCUS]: modes/interactive/components/oauth-selector.ts - 
 * [COVENANT]: Change → update this header
 */

import type { OAuthProviderInterface } from "@pencil-agent/ai";
import { Container, getEditorKeybindings, Spacer, TruncatedText } from "@pencil-agent/tui";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

export interface ProviderSelectorItem {
	id: string;
	name: string;
	authType: "oauth" | "api_key";
	loggedIn?: boolean;
}

/**
 * Component that renders a provider selector
 */
export class OAuthSelectorComponent extends Container {
	private listContainer: Container;
	private allProviders: ProviderSelectorItem[] = [];
	private selectedIndex: number = 0;
	private mode: "login" | "logout";
	private onSelectCallback: (providerId: string) => void;
	private onCancelCallback: () => void;
	private title: string;

	constructor(
		mode: "login" | "logout",
		providers: ProviderSelectorItem[],
		onSelect: (providerId: string) => void,
		onCancel: () => void,
		options?: { title?: string },
	) {
		super();

		this.mode = mode;
		this.allProviders = providers;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;
		this.title =
			options?.title ?? (mode === "login" ? "Select provider to login:" : "Select provider to logout:");

		// Add top border
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		// Add title
		this.addChild(new TruncatedText(theme.bold(this.title)));
		this.addChild(new Spacer(1));

		// Create list container
		this.listContainer = new Container();
		this.addChild(this.listContainer);

		this.addChild(new Spacer(1));

		// Add bottom border
		this.addChild(new DynamicBorder());

		// Initial render
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();

		for (let i = 0; i < this.allProviders.length; i++) {
			const provider = this.allProviders[i];
			if (!provider) continue;

			const isSelected = i === this.selectedIndex;

			const statusIndicator = provider.loggedIn ? theme.fg("success", " ✓ configured") : "";

			let line = "";
			if (isSelected) {
				const prefix = theme.fg("accent", "→ ");
				const text = theme.fg("accent", provider.name);
				line = prefix + text + statusIndicator;
			} else {
				const text = `  ${provider.name}`;
				line = text + statusIndicator;
			}

			this.listContainer.addChild(new TruncatedText(line, 0, 0));
		}

		// Show "no providers" if empty
		if (this.allProviders.length === 0) {
			const message =
				this.mode === "login" ? "No providers available" : "No providers logged in. Use /login first.";
			this.listContainer.addChild(new TruncatedText(theme.fg("muted", `  ${message}`), 0, 0));
		}
	}

	handleInput(keyData: string): void {
		const kb = getEditorKeybindings();
		// Up arrow
		if (kb.matches(keyData, "selectUp")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.updateList();
		}
		// Down arrow
		else if (kb.matches(keyData, "selectDown")) {
			this.selectedIndex = Math.min(this.allProviders.length - 1, this.selectedIndex + 1);
			this.updateList();
		}
		// Enter
		else if (kb.matches(keyData, "selectConfirm")) {
			const selectedProvider = this.allProviders[this.selectedIndex];
			if (selectedProvider) {
				this.onSelectCallback(selectedProvider.id);
			}
		}
		// Escape or Ctrl+C
		else if (kb.matches(keyData, "selectCancel")) {
			this.onCancelCallback();
		}
	}
}
