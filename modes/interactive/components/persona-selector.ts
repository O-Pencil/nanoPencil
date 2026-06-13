/**
 * [WHO]: Provides PersonaSelectorComponent — persona picker UI with search and keyboard navigation
 * [FROM]: Depends on @catui/tui, theme, DynamicBorder, keybinding hints
 * [TO]: Consumed by modes/interactive/interactive-mode.ts; emits selected persona id
 * [HERE]: modes/interactive/components/persona-selector.ts — presentation component for persona selection
 */

import {
	Container,
	type Focusable,
	fuzzyFilter,
	getEditorKeybindings,
	Input,
	Spacer,
	Text,
	type TUI,
} from "@catui/tui";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

interface PersonaItem {
	id: string;
	description: string;
	isActive: boolean;
}

export class PersonaSelectorComponent extends Container implements Focusable {
	private searchInput: Input;
	private _focused = false;
	private listContainer: Container;
	private allPersonas: PersonaItem[] = [];
	private filteredPersonas: PersonaItem[] = [];
	private selectedIndex = 0;
	private onSelectCallback: (personaId: string) => void;
	private onCancelCallback: () => void;
	private tui: TUI;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(
		tui: TUI,
		personaIds: string[],
		activePersonaId: string | undefined,
		getDescription: (id: string) => string,
		onSelect: (personaId: string) => void,
		onCancel: () => void,
	) {
		super();

		this.tui = tui;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		this.allPersonas = personaIds.map((id) => ({
			id,
			description: getDescription(id),
			isActive: id === activePersonaId,
		}));
		// Sort: active first, then alphabetical
		this.allPersonas.sort((a, b) => {
			if (a.isActive && !b.isActive) return -1;
			if (!a.isActive && b.isActive) return 1;
			return a.id.localeCompare(b.id);
		});
		this.filteredPersonas = this.allPersonas;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(theme.fg("muted", "Select a persona to switch to:"), 0, 0),
		);
		this.addChild(new Spacer(1));

		this.searchInput = new Input();
		this.searchInput.onSubmit = () => {
			const selected = this.filteredPersonas[this.selectedIndex];
			if (selected) this.onSelectCallback(selected.id);
		};
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));

		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());

		this.updateList();
	}

	private filterPersonas(query: string): void {
		this.filteredPersonas = query
			? fuzzyFilter(this.allPersonas, query, (p) => `${p.id} ${p.description}`)
			: this.allPersonas;
		this.selectedIndex = Math.min(
			this.selectedIndex,
			Math.max(0, this.filteredPersonas.length - 1),
		);
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();

		const maxVisible = 10;
		const startIndex = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(maxVisible / 2),
				this.filteredPersonas.length - maxVisible,
			),
		);
		const endIndex = Math.min(startIndex + maxVisible, this.filteredPersonas.length);

		for (let index = startIndex; index < endIndex; index++) {
			const item = this.filteredPersonas[index];
			if (!item) continue;

			const isSelected = index === this.selectedIndex;
			const prefix = isSelected ? theme.fg("accent", "->") : "  ";
			const name = isSelected ? theme.fg("accent", item.id) : item.id;
			const active = item.isActive ? theme.fg("success", " [active]") : "";
			const desc = item.description
				? theme.fg("muted", ` — ${item.description}`)
				: "";

			this.listContainer.addChild(
				new Text(`${prefix} ${name}${active}${desc}`, 0, 0),
			);
		}

		if (startIndex > 0 || endIndex < this.filteredPersonas.length) {
			this.listContainer.addChild(
				new Text(
					theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filteredPersonas.length})`),
					0,
					0,
				),
			);
		}

		if (this.filteredPersonas.length === 0) {
			this.listContainer.addChild(
				new Text(theme.fg("muted", "  No personas found"), 0, 0),
			);
		}
	}

	handleInput(keyData: string): void {
		const kb = getEditorKeybindings();
		if (kb.matches(keyData, "selectUp")) {
			if (this.filteredPersonas.length === 0) return;
			this.selectedIndex =
				this.selectedIndex === 0
					? this.filteredPersonas.length - 1
					: this.selectedIndex - 1;
			this.updateList();
		} else if (kb.matches(keyData, "selectDown")) {
			if (this.filteredPersonas.length === 0) return;
			this.selectedIndex =
				this.selectedIndex === this.filteredPersonas.length - 1
					? 0
					: this.selectedIndex + 1;
			this.updateList();
		} else if (kb.matches(keyData, "selectConfirm")) {
			const selected = this.filteredPersonas[this.selectedIndex];
			if (selected) this.onSelectCallback(selected.id);
		} else if (kb.matches(keyData, "selectCancel")) {
			this.onCancelCallback();
		} else {
			this.searchInput.handleInput(keyData);
			this.filterPersonas(this.searchInput.getValue());
		}
	}
}
