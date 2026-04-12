/**
 * [WHO]: BuddyPetComponent, BuddySpecies, BuddyState, SpriteData
 * [FROM]: Depends on @pencil-agent/tui, ../theme/theme.js
 * [TO]: Consumed by modes/interactive/components/index.ts, interactive-mode.ts
 * [HERE]: modes/interactive/components/buddy/pet-sprites.ts
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

type FramePair = [string[], string[]];

function spriteFromStateFrames(name: string, states: Record<BuddyState, FramePair>): SpriteData {
	return { name, states };
}

const SITTING_CAT_SPRITE = spriteFromStateFrames("Mochi", {
	idle: [
		["      /|/|", "     ( @ @)", "      ) ^", "     / |||", "    / )|||_", "   (_______)"],
		["      /|/|", "     ( - -)", "      ) ^", "     / |||", "    / )|||_", "   (_______)"],
	],
	happy: [
		["      /|/|", "     (^ ^ )", "      ) ~", "     / |||", "    / )|||_", "   (_______)"],
		["      /|/|", "     (^o^)", "      ) ~", "     / |||", "    / )|||_", "   (_______)"],
	],
	working: [
		["      /|/|", "     ( o.o)", "      )_|_", "     / |||", "    / )|||_", "   (_______)"],
		["      /|/|", "     ( o.O)", "      )_|_", "     / |||", "    / )|||_", "   (_______)"],
	],
	sleeping: [
		["      /|/|", "     (- -)zz", "      ) ~", "     / |||", "    / )|||_", "   (_______)"],
		["      /|/|", "     (- -)ZZ", "      ) ~", "     / |||", "    / )|||_", "   (_______)"],
	],
	error: [
		["      /|/|", "     ( x x)", "      )___", "     / |||", "    / )|||_", "   (_______)"],
		["      /|/|", "     ( X X)", "      )___", "     / |||", "    / )|||_", "   (_______)"],
	],
	eating: [
		["      /|/|", "     ( o o)", "      )_~", "     / |||", "    / )|||~", "   (_______)"],
		["      /|/|", "     (. .)", "      )_~", "     / |||", "    / )|||~", "   (_______)"],
	],
});

const SIDE_CAT_SPRITE = spriteFromStateFrames("Pip", {
	idle: [
		["             /|_", "            /  ,\\", "         .-'   _,'", "   hjw  / _   |", "       /   )_ |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   _,'", "   hjw  / _   |", "       /  _)  |", "   ,=='`.____)_)"],
	],
	happy: [
		["             /|_", "            /  ,\\", "         .-'   ^,'", "   hjw  / _   |", "       /   )_ |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   ~,'", "   hjw  / _   |", "       /   )_ |", "   ,=='`.____)_)"],
	],
	working: [
		["             /|_", "            /  ,\\", "         .-'   _,'", "   hjw  / _   |", "       /  _)  |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   _,'", "   hjw  / _   |", "       /   )_ |", "   ,=='`.____)_)"],
	],
	sleeping: [
		["             /|_", "            /  ,\\", "         .-'   z,'", "   hjw  / _   |", "       /   )_ |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   Z,'", "   hjw  / _   |", "       /   )_ |", "   ,=='`.____)_)"],
	],
	error: [
		["             /|_", "            /  ,\\", "         .-'   x,'", "   hjw  / _   |", "       /   )_ |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   X,'", "   hjw  / _   |", "       /   )_ |", "   ,=='`.____)_)"],
	],
	eating: [
		["             /|_", "            /  ,\\", "         .-'   ~,'", "   hjw  / _   |", "       /   )_ |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   ~,'", "   hjw  / _   |", "       /  _)  |", "   ,=='`.____)_)"],
	],
});

const LOUNGING_CAT_SPRITE = spriteFromStateFrames("Nori", {
	idle: [
		["    |\\/| ---- _", "   =(--)=_____ \\", "   c___ (______/"],
		["    |\\/| ---- _", "   =(- -)=____ \\", "   c___ (______/"],
	],
	happy: [
		["    |\\/| ---- _", "   =(^ ^)=_____ \\", "   c___ (______/"],
		["    |\\/| ---- _", "   =(^o^)=_____ \\", "   c___ (______/"],
	],
	working: [
		["    |\\/| ---- _", "   =(o.O)=_____ \\", "   c___ (______/"],
		["    |\\/| ---- _", "   =(o.o)=_____ \\", "   c___ (______/"],
	],
	sleeping: [
		["    |\\/| ---- _", "   =(- -)=zz___ \\", "   c___ (______/"],
		["    |\\/| ---- _", "   =(- -)=ZZ___ \\", "   c___ (______/"],
	],
	error: [
		["    |\\/| ---- _", "   =(x x)=_____ \\", "   c___ (______/"],
		["    |\\/| ---- _", "   =(X X)=_____ \\", "   c___ (______/"],
	],
	eating: [
		["    |\\/| ---- _", "   =(o o)=_____ \\", "   c___~(_____/"],
		["    |\\/| ---- _", "   =(. .)=_____ \\", "   c___~(_____/"],
	],
});

const SITTING_KITTEN_SPRITE = spriteFromStateFrames("Boba", {
	idle: [
		["      /|/|", "     ( o o)", "      ) ^", "     / |||", "    / )|||_", "   (_______)"],
		["      /|/|", "     ( - -)", "      ) ^", "     / |||", "    / )|||_", "   (_______)"],
	],
	happy: [
		["      /|/|", "     (^ ^ )", "      ) ~", "     / |||", "    / )|||_", "   (_______)"],
		["      /|/|", "     (^o^)", "      ) ~", "     / |||", "    / )|||_", "   (_______)"],
	],
	working: [
		["      /|/|", "     ( o.o)", "      )_|_", "     / |||", "    / )|||_", "   (_______)"],
		["      /|/|", "     ( o.O)", "      )_|_", "     / |||", "    / )|||_", "   (_______)"],
	],
	sleeping: [
		["      /|/|", "     (- -)zz", "      ) ^", "     / |||", "    / )|||_", "   (_______)"],
		["      /|/|", "     (- -)ZZ", "      ) ^", "     / |||", "    / )|||_", "   (_______)"],
	],
	error: [
		["      /|/|", "     ( x x)", "      )___", "     / |||", "    / )|||_", "   (_______)"],
		["      /|/|", "     ( X X)", "      )___", "     / |||", "    / )|||_", "   (_______)"],
	],
	eating: [
		["      /|/|", "     ( o o)", "      )_~", "     / |||", "    / )|||~", "   (_______)"],
		["      /|/|", "     (. .)", "      )_~", "     / |||", "    / )|||~", "   (_______)"],
	],
});

const SIDE_KITTEN_SPRITE = spriteFromStateFrames("Miso", {
	idle: [
		["             /|_", "            /  ,\\", "         .-'   _,'", "        / _   |", "       /   )_ |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   _,'", "        / _   |", "       /  _)  |", "   ,=='`.____)_)"],
	],
	happy: [
		["             /|_", "            /  ,\\", "         .-'   ^,'", "        / _   |", "       /   )_ |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   ~,'", "        / _   |", "       /   )_ |", "   ,=='`.____)_)"],
	],
	working: [
		["             /|_", "            /  ,\\", "         .-'   _,'", "        / _   |", "       /  _)  |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   _,'", "        / _   |", "       /   )_ |", "   ,=='`.____)_)"],
	],
	sleeping: [
		["             /|_", "            /  ,\\", "         .-'   z,'", "        / _   |", "       /   )_ |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   Z,'", "        / _   |", "       /   )_ |", "   ,=='`.____)_)"],
	],
	error: [
		["             /|_", "            /  ,\\", "         .-'   x,'", "        / _   |", "       /   )_ |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   X,'", "        / _   |", "       /   )_ |", "   ,=='`.____)_)"],
	],
	eating: [
		["             /|_", "            /  ,\\", "         .-'   ~,'", "        / _   |", "       /   )_ |", "   ,=='`.____)_)"],
		["             /|_", "            /  ,\\", "         .-'   ~,'", "        / _   |", "       /  _)  |", "   ,=='`.____)_)"],
	],
});

const LOUNGING_KITTEN_SPRITE = spriteFromStateFrames("Bean", {
	idle: [
		["    |\\/| ---- _", "   =(oo)=_____ \\", "   c___ (______/"],
		["    |\\/| ---- _", "   =(- -)=_____ \\", "   c___ (______/"],
	],
	happy: [
		["    |\\/| ---- _", "   =(^ ^)=_____ \\", "   c___ (______/"],
		["    |\\/| ---- _", "   =(^o^)=_____ \\", "   c___ (______/"],
	],
	working: [
		["    |\\/| ---- _", "   =(o.O)=_____ \\", "   c___ (______/"],
		["    |\\/| ---- _", "   =(o.o)=_____ \\", "   c___ (______/"],
	],
	sleeping: [
		["    |\\/| ---- _", "   =(- -)=zz___ \\", "   c___ (______/"],
		["    |\\/| ---- _", "   =(- -)=ZZ___ \\", "   c___ (______/"],
	],
	error: [
		["    |\\/| ---- _", "   =(x x)=_____ \\", "   c___ (______/"],
		["    |\\/| ---- _", "   =(X X)=_____ \\", "   c___ (______/"],
	],
	eating: [
		["    |\\/| ---- _", "   =(o o)=_____ \\", "   c___~(_____/"],
		["    |\\/| ---- _", "   =(. .)=_____ \\", "   c___~(_____/"],
	],
});

export const ALL_SPRITES: SpriteData[] = [
	SITTING_CAT_SPRITE,
	SIDE_CAT_SPRITE,
	LOUNGING_CAT_SPRITE,
	SITTING_KITTEN_SPRITE,
	SIDE_KITTEN_SPRITE,
	LOUNGING_KITTEN_SPRITE,
];

// ============================================================================
// Buddy Pet Component
// ============================================================================

const IDLE_BLINK_INTERVAL_MS = 6800;
const IDLE_BLINK_DURATION_MS = 180;

export class BuddyPetComponent implements Component {
	private tui: TUI;
	private sprite: SpriteData;
	private state: BuddyState = "idle";
	private currentFrame = 0;
	private blinkInterval: ReturnType<typeof setInterval> | undefined;
	private blinkResetTimer: ReturnType<typeof setTimeout> | undefined;
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
			this.clearBlinkResetTimer();
			this.currentFrame = 0;
			this.tui.requestRender();
		}
	}

	setSpeechBubble(text: string): void {
		this.speechBubble = text;
		this.tui.requestRender();
	}

	private clearBlinkResetTimer(): void {
		if (this.blinkResetTimer) {
			clearTimeout(this.blinkResetTimer);
			this.blinkResetTimer = undefined;
		}
	}

	private startAnimation(): void {
		const tick = () => {
			if (this.state !== "idle" || this.currentFrame !== 0) {
				return;
			}
			const frames = this.sprite.states.idle;
			if (!frames || frames.length < 2) {
				return;
			}
			this.currentFrame = 1;
			this.tui.requestRender();
			this.clearBlinkResetTimer();
			this.blinkResetTimer = setTimeout(() => {
				this.currentFrame = 0;
				this.blinkResetTimer = undefined;
				this.tui.requestRender();
			}, IDLE_BLINK_DURATION_MS);
		};
		this.blinkInterval = setInterval(tick, IDLE_BLINK_INTERVAL_MS);
	}

	invalidate(): void {
		// No cached state
	}

	render(width: number): string[] {
		const frames = this.sprite.states[this.state];
		if (!frames || frames.length === 0) return [];

		const frame = frames[this.currentFrame % frames.length];

		const lines: string[] = [];
		for (const line of frame) {
			lines.push(theme.fg("accent", line));
		}

		const nameLine = theme.fg("dim", this.name);
		lines.push(nameLine);

		if (this.speechBubble) {
			const bubbleWidth = Math.min(this.speechBubble.length + 4, width);
			const top = theme.fg("muted", " " + "_".repeat(bubbleWidth - 2) + " ");
			const mid =
				theme.fg("muted", "< ") +
				theme.fg("text", this.speechBubble.slice(0, bubbleWidth - 4)) +
				theme.fg("muted", " >");
			const bot = theme.fg("muted", " " + "-".repeat(bubbleWidth - 2) + " ");
			lines.push(top, mid, bot);
		}

		return lines;
	}

	dispose(): void {
		this.clearBlinkResetTimer();
		if (this.blinkInterval) {
			clearInterval(this.blinkInterval);
			this.blinkInterval = undefined;
		}
	}
}
