/**
 * PencilLoader - Custom loader with rotating diamond animation
 * Uses ◆◇◈ symbols for a smooth loading indicator
 */
/**
 * [WHO]: PencilLoader
 * [FROM]: Depends on @pencil-agent/tui
 * [TO]: Consumed by modes/interactive/components/index.ts
 * [HERE]: modes/interactive/components/pencil-loader.ts -
 */


import { Container, Spacer, Text, type TUI } from "@pencil-agent/tui";
import type { Theme } from "../theme/theme.js";

export class PencilLoader extends Container {
	private tui: TUI;
	private theme: Theme;
	private message: string;
	private interval: NodeJS.Timeout | undefined;
	private currentFrame = 0;
	private textComponent: Text;
	private isStopped = false;

	// Rotating diamond animation frames
	private readonly frames = [
		"◆", // filled diamond
		"◇", // outline diamond
		"◈", // outlined diamond with dot
	];

	constructor(tui: TUI, theme: Theme, message: string) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.message = message;

		this.textComponent = new Text("", 0, 0);

		this.addChild(new Spacer(1));
		this.addChild(this.textComponent);
		this.addChild(new Spacer(1));

		this.startAnimation();
	}

	private startAnimation(): void {
		const updateFrame = () => {
			if (this.isStopped) return;

			const frameChar = this.frames[this.currentFrame];
			const diamond = this.theme.fg("accent", frameChar);

			this.textComponent.setText(`${diamond} ${this.message}`);
			this.tui.requestRender();

			this.currentFrame = (this.currentFrame + 1) % this.frames.length;
		};

		// Initial render
		updateFrame();

		// Update every 200ms for smooth rotation
		this.interval = setInterval(updateFrame, 200);
	}

	setMessage(message: string): void {
		this.message = message;
		const frameChar = this.frames[this.currentFrame];
		const diamond = this.theme.fg("accent", frameChar);
		this.textComponent.setText(`${diamond} ${this.message}`);
		this.tui.requestRender();
	}

	stop(): void {
		this.isStopped = true;
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = undefined;
		}
	}

	dispose(): void {
		this.stop();
	}
}
