/**
 * [WHO]: EditorBuddyLayout
 * [FROM]: Depends on @pencil-agent/tui
 * [TO]: Consumed by interactive-mode.ts
 * [HERE]: Horizontal layout — editor on the left, optional buddy pet on the right (bottom-aligned).
 */

import {
  type Component,
  Container,
  truncateToWidth,
} from "@pencil-agent/tui";

/** Width reserved for the ASCII pet column (matches longest sprite line + label). */
export const BUDDY_COLUMN_WIDTH = 30;
const BUDDY_RIGHT_OFFSET = 3;

export class EditorBuddyLayout implements Component {
  constructor(
    private readonly getEditor: () => Component,
    readonly buddySlot: Container,
    private readonly rightColumnWidth: number = BUDDY_COLUMN_WIDTH,
  ) {}

  invalidate(): void {
    this.getEditor().invalidate?.();
    this.buddySlot.invalidate();
  }

  render(width: number): string[] {
    const buddyLines = this.buddySlot.render(Math.max(1, this.rightColumnWidth - BUDDY_RIGHT_OFFSET));
    if (buddyLines.length === 0) {
      return this.getEditor().render(width);
    }

    const gap = 1;
    const leftWidth = Math.max(1, width - this.rightColumnWidth - gap);
    const leftLines = this.getEditor().render(leftWidth);

    const h = Math.max(leftLines.length, buddyLines.length);
    const padTopLeft = h - leftLines.length;
    const padTopRight = h - buddyLines.length;

    const out: string[] = [];
    for (let i = 0; i < h; i++) {
      const leftLine = i < padTopLeft ? "" : leftLines[i - padTopLeft]!;
      const rightLine = i < padTopRight ? "" : `${" ".repeat(BUDDY_RIGHT_OFFSET)}${buddyLines[i - padTopRight]!}`;
      const leftPadded = truncateToWidth(leftLine, leftWidth, "", true);
      out.push(`${leftPadded}${" ".repeat(gap)}${rightLine}`);
    }
    return out;
  }
}
