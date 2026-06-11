/**
 * [WHO]: StreamingPreviewComponent - renders a 3-4 line preview of the AI's current output
 * [FROM]: Depends on @pencil-agent/tui
 * [TO]: Consumed by StreamRenderController
 * [HERE]: modes/interactive/components/streaming-preview.ts - live output preview near status bar
 */

import { Container, Spacer, Text, truncateToWidth, type TUI } from "@pencil-agent/tui";
import stripAnsi from "strip-ansi";
import type { Theme } from "../theme/theme.js";

const MAX_PREVIEW_LINES = 3;

export class StreamingPreviewComponent extends Container {
  private tui: TUI;
  private theme: Theme;
  private headerText: Text;
  private previewLines: Text[] = [];
  private active = false;

  constructor(tui: TUI, theme: Theme) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.headerText = new Text("", 0, 0);
    this.addChild(new Spacer(1));
    this.addChild(this.headerText);
  }

  /** Update the preview with the latest streaming text content. */
  update(textContent: string): void {
    // Remove old preview lines
    for (const line of this.previewLines) super.removeChild(line);
    this.previewLines = [];

    if (!textContent || !textContent.trim()) {
      this.headerText.setText("");
      this.active = false;
      return;
    }

    this.active = true;

    // Get terminal width for truncation
    const width = this.tui.terminal?.columns ?? 80;
    const maxWidth = Math.max(width - 4, 20);

    // Strip ANSI and split into lines, take last N
    const cleanText = stripAnsi(textContent);
    const allLines = cleanText.split("\n").filter((l) => l.trim().length > 0);
    const recentLines = allLines.slice(-MAX_PREVIEW_LINES);

    // Header with a subtle indicator
    this.headerText.setText(this.theme.fg("dim", " ─ output ─"));

    for (const line of recentLines) {
      const truncated = truncateToWidth(line.trim(), maxWidth, "…");
      const previewLine = new Text(
        ` ${this.theme.fg("dim", "│")} ${this.theme.fg("toolOutput", truncated)}`,
        0,
        0,
      );
      this.previewLines.push(previewLine);
      this.addChild(previewLine);
    }
  }

  /** Clear the preview and mark inactive. */
  clear(): void {
    for (const line of this.previewLines) super.removeChild(line);
    this.previewLines = [];
    this.headerText.setText("");
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}
