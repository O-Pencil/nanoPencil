/**
 * [WHO]: RawText - renders pre-formatted ANSI text without padding
 * [FROM]: Depends on @pencil-agent/tui Component
 * [TO]: Consumed by modes/interactive/interactive-mode.ts
 * [HERE]: modes/interactive/components/raw-text.ts - raw ANSI text component
 */

import type { Component } from "@pencil-agent/tui";

/**
 * RawText - renders pre-formatted ANSI text lines without auto-padding.
 * Use this when you have pre-formatted content (like a status card) that
 * already has the exact width you want, and don't want TUI to pad it.
 */
export class RawText implements Component {
	private lines: string[];

	constructor(text: string) {
		// Split into lines, preserving ANSI codes
		this.lines = text.split("\n");
	}

	setText(text: string): void {
		this.lines = text.split("\n");
	}

	invalidate(): void {
		// No cached state
	}

	render(_width: number): string[] {
		// Return lines unchanged - no padding, no wrapping
		return this.lines;
	}
}