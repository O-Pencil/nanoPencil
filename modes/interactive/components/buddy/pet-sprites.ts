/**
 * [WHO]: BuddyPetComponent, BuddySpecies, BuddyState, SpriteData
 * [FROM]: Depends on @pencil-agent/tui, ../theme/theme.js
 * [TO]: Consumed by modes/interactive/components/index.ts, interactive-mode.ts
 * [HERE]: modes/interactive/components/buddy/buddy-pet.ts - terminal pet display component
 */

import { type Component, type TUI } from "@pencil-agent/tui";
import { theme } from "../../theme/theme.js";

// ============================================================================
// Sprite Data
// ============================================================================

export type BuddyState = "idle" | "happy" | "working" | "sleeping" | "error" | "eating";

export interface SpriteData {
	name: string;
	states: Record<BuddyState, string[][]>;
}

const CAT_SPRITE: SpriteData = {
	name: "Cat",
	states: {
		idle: [
			[
				"   /|/|   ",
				"  ( @ @)  ",
				"   ) ^    ",
				"  / |||   ",
				" /  )|||_ ",
				"(_______)  ",
			],
			[
				"   /|/|   ",
				"  ( - -)  ",
				"   ) ^    ",
				"  / |||   ",
				" /  )|||_ ",
				"(_______)  ",
			],
		],
		happy: [
			[
				"   /|/|   ",
				"  (^ ^ ^) ",
				"   ) ~    ",
				"  / |||   ",
				" /  )|||_ ",
				"(_______)  ",
			],
			[
				"   /|/|   ",
				"  (^o^ ^) ",
				"   ) ~    ",
				"  / |||\\  ",
				" /  )|||_ ",
				"(_______)  ",
			],
		],
		working: [
			[
				"   /|/|   ",
				"  ( o.o)  ",
				"   )_|_   ",
				"  / |||   ",
				" /  )|||_ ",
				"(_______)  ",
			],
			[
				"   /|/|   ",
				"  (O  o)  ",
				"   )_|_   ",
				"  / |||   ",
				" /  )|||_ ",
				"(_______)  ",
			],
		],
		sleeping: [
			[
				"   /|/|   ",
				"  (-  -)zz",
				"   ) ~    ",
				"  / |||   ",
				" /  )|||_ ",
				"(_______)  ",
			],
			[
				"   /|/|   ",
				"  (-  -)ZZ",
				"   ) ~    ",
				"  / |||   ",
				" /  )|||_ ",
				"(_______)  ",
			],
		],
		error: [
			[
				"   /|/|   ",
				"  (x  x)  ",
				"   )___   ",
				"  / |||   ",
				" /  )|||_ ",
				"(_______)  ",
			],
			[
				"   /|/|   ",
				"  (X  X)  ",
				"   )___   ",
				"  / |||   ",
				" /  )|||_ ",
				"(_______)  ",
			],
		],
		eating: [
			[
				"   /|/|   ",
				"  (o  o)  ",
				"   )_~    ",
				"  / |||   ",
				" /  )|||~ ",
				"(_______)  ",
			],
			[
				"   /|/|   ",
				"  (.  .)  ",
				"   )_~    ",
				"  / |||   ",
				" /  )|||~ ",
				"(_______)  ",
			],
		],
	},
};

const DUCK_SPRITE: SpriteData = {
	name: "Duck",
	states: {
		idle: [
			[
				"    __    ",
				"  <(o )___",
				"   ( ._> /",
				"    `---' ",
			],
			[
				"    __    ",
				"  <(o )___",
				"   ( ._> /",
				"    `---' ",
			],
		],
		happy: [
			[
				"    __    ",
				"  <(^o^)__",
				"   ( ._> /",
				"    `---' ",
			],
			[
				"    __    ",
				"  <(^o^)__",
				"   ( ._> /",
				"    `---' ",
			],
		],
		working: [
			[
				"    __    ",
				"  <(o.O)__",
				"   ( ._> /",
				"    `---' ",
			],
			[
				"    __    ",
				"  <(O.o)__",
				"   ( ._> /",
				"    `---' ",
			],
		],
		sleeping: [
			[
				"    __    ",
				"  <(- -)__",
				"   ( ._> /",
				"    `---' ",
			],
			[
				"    __    ",
				"  <(- -)__",
				"   ( ._> /",
				"    `---' ",
			],
		],
		error: [
			[
				"    __    ",
				"  <(x x)__",
				"   ( ._> /",
				"    `---' ",
			],
			[
				"    __    ",
				"  <(X X)__",
				"   ( ._> /",
				"    `---' ",
			],
		],
		eating: [
			[
				"    __    ",
				"  <(o o)__",
				"   ( ._> /",
				"    `---' ",
			],
			[
				"    __    ",
				"  <(. .)__",
				"   ( ._> /",
				"    `---' ",
			],
		],
	},
};

const GHOST_SPRITE: SpriteData = {
	name: "Ghost",
	states: {
		idle: [
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (o o)  |",
				"|   | ^ |  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (- -)  |",
				"|   | ^ |  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
		],
		happy: [
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (^_^)  |",
				"|   | ~ |  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (^o^)  |",
				"|   | ~ |  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
		],
		working: [
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (O.o)  |",
				"|   |_|_|  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (o.O)  |",
				"|   |_|_|  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
		],
		sleeping: [
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (- -)zz|",
				"|   | ~ |  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (- -)ZZ|",
				"|   | ~ |  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
		],
		error: [
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (x x)  |",
				"|   |___|  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (X X)  |",
				"|   |___|  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
		],
		eating: [
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (o o)  |",
				"|   |_~ |  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
			[
				"  .-''''-.  ",
				" /   _   \\ ",
				"|   (. .)  |",
				"|   |_~ |  |",
				" \\  \\_/  / ",
				"  `'---'`  ",
			],
		],
	},
};

const DRAGON_SPRITE: SpriteData = {
	name: "Dragon",
	states: {
		idle: [
			[
				"    /\\_/\\    ",
				"   ( o.o )   ",
				"  /  > <  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
			[
				"    /\\_/\\    ",
				"   ( -.- )   ",
				"  /  > <  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
		],
		happy: [
			[
				"    /\\_/\\    ",
				"   (^o^ )   ",
				"  /  > <  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
			[
				"    /\\_/\\    ",
				"   (^ ^ )~  ",
				"  /  > <  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
		],
		working: [
			[
				"    /\\_/\\    ",
				"   (O.O )   ",
				"  /  >|<  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
			[
				"    /\\_/\\    ",
				"   (o.O )   ",
				"  /  >|<  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
		],
		sleeping: [
			[
				"    /\\_/\\    ",
				"   (- - )zz ",
				"  /  > <  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
			[
				"    /\\_/\\    ",
				"   (- - )ZZ ",
				"  /  > <  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
		],
		error: [
			[
				"    /\\_/\\    ",
				"   (X.X )   ",
				"  /  > <  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
			[
				"    /\\_/\\    ",
				"   (x.x )   ",
				"  /  > <  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
		],
		eating: [
			[
				"    /\\_/\\    ",
				"   (o.o )~  ",
				"  /  >|~  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
			[
				"    /\\_/\\    ",
				"   (.o )~   ",
				"  /  >|~  \\  ",
				" / /|   |\\ \\ ",
				"(_)|   |(_)  ",
				"   \"'   '\"   ",
			],
		],
	},
};

export const ALL_SPRITES: SpriteData[] = [CAT_SPRITE, DUCK_SPRITE, GHOST_SPRITE, DRAGON_SPRITE];

// ============================================================================
// Buddy Pet Component
// ============================================================================

export class BuddyPetComponent implements Component {
	private tui: TUI;
	private sprite: SpriteData;
	private state: BuddyState = "idle";
	private currentFrame = 0;
	private interval: ReturnType<typeof setInterval> | undefined;
	private name: string;
	private speechBubble = "";

	constructor(tui: TUI, spriteIndex: number = 0, name?: string) {
		this.tui = tui;
		this.sprite = ALL_SPRITES[spriteIndex % ALL_SPRITES.length];
		this.name = name || this.sprite.name;
		this.startAnimation();
	}

	setState(state: BuddyState): void {
		if (this.state !== state) {
			this.state = state;
			this.currentFrame = 0;
		}
	}

	setSpeechBubble(text: string): void {
		this.speechBubble = text;
		this.tui.requestRender();
	}

	private startAnimation(): void {
		const tick = () => {
			const frames = this.sprite.states[this.state];
			if (!frames || frames.length === 0) return;
			this.currentFrame = (this.currentFrame + 1) % frames.length;
			this.tui.requestRender();
		};
		this.interval = setInterval(tick, 800);
	}

	invalidate(): void {
		// No cached state
	}

	render(width: number): string[] {
		const frames = this.sprite.states[this.state];
		if (!frames || frames.length === 0) return [];

		const frame = frames[this.currentFrame % frames.length];

		// Render sprite with accent color
		const lines: string[] = [];
		for (const line of frame) {
			lines.push(theme.fg("accent", line));
		}

		// Add name label
		const nameLine = theme.fg("dim", this.name);
		lines.push(nameLine);

		// Add speech bubble if present
		if (this.speechBubble) {
			const bubbleWidth = Math.min(this.speechBubble.length + 4, width);
			const top = theme.fg("muted", " " + "_".repeat(bubbleWidth - 2) + " ");
			const mid = theme.fg("muted", "< ") + theme.fg("text", this.speechBubble.slice(0, bubbleWidth - 4)) + theme.fg("muted", " >");
			const bot = theme.fg("muted", " " + "-".repeat(bubbleWidth - 2) + " ");
			lines.push(top, mid, bot);
		}

		return lines;
	}

	dispose(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = undefined;
		}
	}
}
