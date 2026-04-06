/**
 * [UPSTREAM]: Depends on module, clipboard package
 * [SURFACE]: ClipboardModule, hasClipboardImage(), getClipboardBinary()
 * [LOCUS]: modes/utils/clipboard-native.ts - native clipboard for images
 * [COVENANT]: Change native clipboard → update this header
 */
import { createRequire } from "module";

export type ClipboardModule = {
	hasImage: () => boolean;
	getImageBinary: () => Promise<Array<number>>;
};

const require = createRequire(import.meta.url);
let clipboard: ClipboardModule | null = null;

const hasDisplay = process.platform !== "linux" || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

// Timeout for clipboard operations (ms) - prevents indefinite hang on macOS/Windows
const CLIPBOARD_TIMEOUT_MS = 5000;

if (!process.env.TERMUX_VERSION && hasDisplay) {
	try {
		clipboard = require("@mariozechner/clipboard") as ClipboardModule;
	} catch {
		clipboard = null;
	}
}

/**
 * Get image binary from native clipboard with a timeout guard.
 * This prevents indefinite hangs on rare macOS/Windows clipboard issues.
 */
export async function getClipboardBinary(): Promise<Uint8Array | null> {
	if (!clipboard) return null;

	let timeoutId: NodeJS.Timeout;
	const timeoutPromise = new Promise<null>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error("Clipboard read timed out")), CLIPBOARD_TIMEOUT_MS);
	});

	try {
		const imageData = await Promise.race([
			clipboard.getImageBinary(),
			timeoutPromise,
		]);
		clearTimeout(timeoutId!);
		if (!imageData || imageData.length === 0) return null;
		return imageData instanceof Uint8Array ? imageData : Uint8Array.from(imageData);
	} catch {
		return null;
	}
}

// Export clipboard module for hasImage() check in clipboard-image.ts
export { clipboard };
