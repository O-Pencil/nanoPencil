/**
 * [UPSTREAM]: 
 * [SURFACE]: 
 * [LOCUS]: modes/interactive/components/attachments-bar.ts - 
 * [COVENANT]: Change → update this header
 */
import * as path from "node:path";
import { Container, Spacer, Text, type Component } from "@pencil-agent/tui";
import type { Theme } from "../theme/theme.js";

export interface Attachment {
	path: string;
	mimeType?: string;
}

/**
 * Attachments bar component for displaying clipboard image attachments.
 * Shows a list of attached images with selection and deletion support.
 */
export class AttachmentsBarComponent extends Container {
	private attachments: Attachment[];
	private selectedIndex: number;
	private theme: Theme;
	private onSelect?: (index: number) => void;
	private onDelete?: (index: number) => void;

	constructor(
		attachments: Attachment[],
		selectedIndex: number,
		theme: Theme,
		options?: {
			onSelect?: (index: number) => void;
			onDelete?: (index: number) => void;
		},
	) {
		super();
		this.attachments = attachments;
		this.selectedIndex = selectedIndex;
		this.theme = theme;
		this.onSelect = options?.onSelect;
		this.onDelete = options?.onDelete;

		this.renderContent();
	}

	private renderContent(): void {
		this.clear();

		if (this.attachments.length === 0) {
			return;
		}

		// Add attachment items
		for (let i = 0; i < this.attachments.length; i++) {
			const attachment = this.attachments[i];
			const fileName = path.basename(attachment.path);
			const isSelected = i === this.selectedIndex;

			// Format: [Image #1] (filename.png)
			// Selected: brighter color, Unselected: dimmer color
			const label = `[Image #${i + 1}]`;
			const fileNameText = `(${fileName})`;

			// Use theme colors - selected gets brighter accent color
			const labelColored = isSelected ? this.theme.fg("accent", label) : this.theme.fg("muted", label);
			const fileNameColored = isSelected ? this.theme.fg("accent", fileNameText) : this.theme.fg("dim", fileNameText);

			const row = new Text(`${labelColored} ${fileNameColored}`, 0, 0);
			this.addChild(row);

			// Add hint for controls when selected
			if (isSelected) {
				const hint = new Text(
					"  " + this.theme.fg("muted", "(↑↓ select, Del remove)"),
					0,
					0,
				);
				this.addChild(hint);
			}
		}

		// Add spacer at the end
		this.addChild(new Spacer(1));
	}

	/**
	 * Update the attachments and re-render
	 */
	update(attachments: Attachment[], selectedIndex: number): void {
		this.attachments = attachments;
		this.selectedIndex = selectedIndex;
		this.renderContent();
	}

	/**
	 * Handle input for selection and deletion
	 */
	handleInput(data: string): boolean {
		// This is handled by the parent InteractiveMode
		// The component just displays the current state
		return false;
	}

	invalidate(): void {
		this.renderContent();
	}
}
