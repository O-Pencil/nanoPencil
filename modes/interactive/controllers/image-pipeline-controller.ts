/**
 * [WHO]: Provides ImagePipelineController, ImagePipelineContext, Attachment — clipboard/attachment/image handling
 * [FROM]: Depends on @pencil-agent/tui (Container/Component/matchesKey), @pencil-agent/ai (ImageContent),
 *         modes/utils (clipboard-image, image-resize), utils/mime, components/attachments-bar, theme
 * [TO]: Consumed by modes/interactive/interactive-mode.ts (constructs one, delegates paste/attachment/image methods)
 * [HERE]: modes/interactive/controllers/image-pipeline-controller.ts — first P5 UI slice (UI02, 纯搬)
 *
 * Extracted from InteractiveMode (P5 image-pipeline). Owns clipboard image paste, the attachments
 * bar state, attachment key navigation, and text→image extraction. Reads the editor-shell layout and
 * mount capabilities through a narrow ImagePipelineContext (no InteractiveMode reference). Behavior is
 * identical to the former InteractiveMode methods.
 */

import type { ImageContent } from "@pencil-agent/ai";
import { type Component, Container, matchesKey } from "@pencil-agent/tui";
import { detectSupportedImageMimeTypeFromFile } from "../../../utils/mime.js";
import { extensionForImageMimeType, readClipboardImage } from "../../utils/clipboard-image.js";
import { formatDimensionNote, resizeImage } from "../../utils/image-resize.js";
import { AttachmentsBarComponent } from "../components/attachments-bar.js";
import { getThemeByName } from "../theme/theme.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface Attachment {
  path: string;
  mimeType?: string;
  bytes?: Uint8Array;
}

/** Narrow capability seam: mount/render capabilities the image pipeline needs, no InteractiveMode. */
export interface ImagePipelineContext {
  /** Current working directory (where clipboard images are written). */
  getCwd(): string;
  /** Request a TUI re-render. */
  requestRender(): void;
  /** Show a transient status line. */
  showStatus(message: string): void;
  /** Active theme name (for the attachments bar). */
  getThemeName(): string | undefined;
  /** Whether the editor text is empty (so ↑ would browse history, not move the cursor). */
  isEditorEmpty(): boolean;
  /** The editor shell container that hosts the attachments bar. */
  getEditorContainer(): Container;
  /** The container the attachments bar is mounted into. */
  getAttachmentsContainer(): Container | undefined;
  /** The editor/buddy layout node the attachments bar is placed before. */
  getEditorBuddyLayout(): Component;
}

export class ImagePipelineController {
  private clipboardImageSeq = 0;
  private clipboardImageFiles: string[] = [];
  private clipboardPastePromise: Promise<void> = Promise.resolve();
  private attachments: Attachment[] = [];
  private selectedAttachmentIndex = -1;
  private attachmentsBar: AttachmentsBarComponent | undefined = undefined;

  constructor(private readonly ctx: ImagePipelineContext) {}

  // ----- public surface (called by mount / submit) -----

  /** Await any in-flight clipboard paste so a rapid Enter still waits for attachment registration. */
  async awaitPendingPaste(): Promise<void> {
    await this.clipboardPastePromise;
  }

  /** Whether there are pending attachments (for editor-shell remount). */
  hasAttachments(): boolean {
    return this.attachments.length > 0;
  }

  /**
   * Take all pending attachments (clears the bar, resets selection + sequence).
   * Returns [] without side effects when empty. Used by the submit pipeline.
   */
  takePendingAttachments(): Attachment[] {
    if (this.attachments.length === 0) return [];
    const taken = this.attachments.splice(0);
    this.selectedAttachmentIndex = -1;
    // Reset the sequence counter when all attachments are sent
    this.clipboardImageSeq = 0;
    this.updateAttachmentsBar();
    this.ctx.requestRender();
    return taken;
  }

  /**
   * Discard all pending (unsent) attachments — used on session new/switch/fork/tree.
   * Disk files are reclaimed by cleanupClipboardImages() at shutdown (same as sent images).
   */
  clearAttachments(): void {
    if (this.attachments.length === 0) return;
    this.attachments = [];
    this.selectedAttachmentIndex = -1;
    this.clipboardImageSeq = 0;
    this.updateAttachmentsBar();
    this.ctx.requestRender();
  }

  handleClipboardImagePaste(): void {
    this.enqueueClipboardPaste(() => this.loadClipboardImageIntoAttachments());
  }

  /**
   * Arrow/Delete handling for the attachments bar. The editor offers these keys
   * here before its own cursor/history handling.
   *
   * Model: the bar sits above the editor.
   * - ↑ from the editor (only when the editor is empty, so ↑ would otherwise browse
   *   history) ENTERS the bar at the last (most recent) attachment.
   * - Inside the bar, ↑/↓ move the selection; stepping past the top/bottom leaves
   *   the bar (returns false so the editor handles the key, e.g. history).
   * - Delete/Backspace removes the selected attachment.
   * This works for a single attachment too (the previous code only intercepted when
   * there were 2+, so one image could never be selected/deleted by keyboard).
   */
  handleAttachmentKeyNavigation(data: string): boolean {
    if (this.attachments.length === 0) return false;
    const inBar = this.selectedAttachmentIndex >= 0;

    if (matchesKey(data, "up")) {
      if (!inBar) {
        // Only hijack ↑ from the editor when it's empty (otherwise the editor
        // needs ↑ for cursor movement / history).
        if (!this.ctx.isEditorEmpty()) return false;
        this.setSelectedIndex(this.attachments.length - 1);
        return true;
      }
      if (this.selectedAttachmentIndex > 0) {
        this.setSelectedIndex(this.selectedAttachmentIndex - 1);
        return true;
      }
      // At the top of the bar — leave it; let the editor handle ↑ (history).
      this.setSelectedIndex(-1);
      return false;
    }

    if (matchesKey(data, "down")) {
      if (!inBar) return false; // not in the bar — editor handles ↓
      if (this.selectedAttachmentIndex < this.attachments.length - 1) {
        this.setSelectedIndex(this.selectedAttachmentIndex + 1);
        return true;
      }
      // At the bottom — leave the bar.
      this.setSelectedIndex(-1);
      return false;
    }

    if (inBar && (matchesKey(data, "delete") || matchesKey(data, "backspace"))) {
      this.deleteAttachment(this.selectedAttachmentIndex);
      return true;
    }

    return false;
  }

  private setSelectedIndex(index: number): void {
    this.selectedAttachmentIndex = index;
    this.updateAttachmentsBar();
    this.ctx.requestRender();
  }

  /**
   * Convert attachment files to ImageContent array for sending to the model.
   * Prefers in-memory bytes (clipboard) then falls back to disk read.
   */
  async processAttachmentFiles(attachments: Attachment[]): Promise<ImageContent[]> {
    const supportedMime = new Set([
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ]);
    const normalizedMime = (raw?: string): string | null => {
      if (!raw) return null;
      const base = raw.split(";")[0]?.trim().toLowerCase() ?? "";
      return supportedMime.has(base) ? base : null;
    };

    const result: ImageContent[] = [];
    for (const attachment of attachments) {
      try {
        let mimeType = normalizedMime(attachment.mimeType);
        let base64Content: string;

        if (attachment.bytes && attachment.bytes.length > 0) {
          base64Content = Buffer.from(attachment.bytes).toString("base64");
          if (!mimeType) {
            mimeType = fs.existsSync(attachment.path)
              ? await detectSupportedImageMimeTypeFromFile(attachment.path)
              : null;
          }
        } else {
          if (!fs.existsSync(attachment.path)) continue;
          mimeType =
            mimeType ??
            (await detectSupportedImageMimeTypeFromFile(attachment.path));
          if (!mimeType) continue;
          base64Content = fs.readFileSync(attachment.path).toString("base64");
        }

        if (!mimeType) continue;

        const resized = await resizeImage({
          type: "image",
          data: base64Content,
          mimeType,
        });
        result.push({
          type: "image",
          mimeType: resized.mimeType,
          data: resized.data,
        });
      } catch (error: unknown) {
        // Skip unreadable attachment files but log the error for debugging
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.warn(`[Attachments] Skipped unreadable file ${attachment.path}: ${errorMessage}`);
      }
    }
    return result;
  }

  /**
   * Extract image file paths from text, read them as base64 ImageContent,
   * and return the cleaned text with image references plus the image array.
   */
  async extractImagesFromText(
    text: string,
  ): Promise<{ text: string; images: ImageContent[] }> {
    const images: ImageContent[] = [];
    const tmpDir = os.tmpdir();

    // Match clipboard-pasted image paths (nanopencil-clipboard-UUID.ext)
    const clipboardImagePattern = new RegExp(
      `${tmpDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[/\\\\]nanopencil-clipboard-[a-f0-9-]+\\.(?:png|jpg|jpeg|gif|webp)`,
      "gi",
    );

    const matches = text.match(clipboardImagePattern);
    if (!matches) {
      return { text, images };
    }

    let cleanedText = text;
    for (const filePath of matches) {
      try {
        if (!fs.existsSync(filePath)) continue;

        const mimeType =
          await detectSupportedImageMimeTypeFromFile(filePath);
        if (!mimeType) continue;

        const content = fs.readFileSync(filePath);
        const base64Content = content.toString("base64");

        const resized = await resizeImage({
          type: "image",
          data: base64Content,
          mimeType,
        });
        const dimensionNote = formatDimensionNote(resized);

        images.push({
          type: "image",
          mimeType: resized.mimeType,
          data: resized.data,
        });

        // Replace file path in text with a reference
        const ref = dimensionNote
          ? `[image: ${path.basename(filePath)}] ${dimensionNote}`
          : `[image: ${path.basename(filePath)}]`;
        cleanedText = cleanedText.replace(filePath, ref);
      } catch {
        // Skip files that can't be read
      }
    }

    return { text: cleanedText, images };
  }

  cleanupStaleClipboardFiles(): void {
    try {
      const cwd = this.ctx.getCwd();

      // Clean legacy clipboard files from older implementations.
      for (const entry of fs.readdirSync(cwd)) {
        if (
          /^_clipboard_\d+\.\w+$/.test(entry) ||
          /^_np_clipboard_image_\d+\.\w+$/.test(entry)
        ) {
          try { fs.unlinkSync(path.join(cwd, entry)); } catch { /* best-effort */ }
        }
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  cleanupClipboardImages(): void {
    for (const filePath of this.clipboardImageFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Best-effort cleanup
      }
    }
    this.clipboardImageFiles = [];
  }

  // ----- private -----

  /** Chain clipboard work so rapid Enter after paste still waits for attachment registration. */
  private enqueueClipboardPaste(task: () => Promise<void>): void {
    this.clipboardPastePromise = this.clipboardPastePromise
      .catch(() => undefined)
      .then(() => task())
      .catch(() => undefined);
  }

  private async loadClipboardImageIntoAttachments(): Promise<void> {
    try {
      const image = await readClipboardImage();
      if (!image) {
        return;
      }

      // Save to project root for cleanup tracking and optional tool reads.
      const ext = extensionForImageMimeType(image.mimeType) ?? "png";
      const seq = ++this.clipboardImageSeq;
      const fileName = `_np_clipboard_image_${seq}.${ext}`;
      const filePath = path.join(this.ctx.getCwd(), fileName);
      fs.writeFileSync(filePath, Buffer.from(image.bytes));

      this.clipboardImageFiles.push(filePath);
      // Keep a copy of bytes so submit uses memory (avoids races with disk/cleanup).
      this.attachments.push({
        path: filePath,
        mimeType: image.mimeType,
        bytes: Uint8Array.from(image.bytes),
      });
      this.updateAttachmentsBar();

      // Show success feedback to user
      const sizeKB = Math.round(image.bytes.length / 1024);
      this.ctx.showStatus(`Image pasted (${sizeKB} KB). Press Enter to send, ↑↓ Del to manage.`);
      this.ctx.requestRender();
    } catch (error: unknown) {
      // Show user feedback for clipboard errors
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.ctx.showStatus(`Clipboard paste failed: ${errorMessage}`);
      this.ctx.requestRender();
    }
  }

  private deleteAttachment(index: number): void {
    if (index < 0 || index >= this.attachments.length) return;

    // Remove the attachment file
    const attachment = this.attachments[index];
    try {
      fs.unlinkSync(attachment.path);
    } catch {
      // Ignore file deletion errors
    }

    this.attachments.splice(index, 1);
    if (this.selectedAttachmentIndex >= this.attachments.length) {
      this.selectedAttachmentIndex = this.attachments.length - 1;
    }
    this.updateAttachmentsBar();
    this.ctx.requestRender();
  }

  private updateAttachmentsBar(): void {
    const attachmentsContainer = this.ctx.getAttachmentsContainer();
    if (!attachmentsContainer) return;
    const editorContainer = this.ctx.getEditorContainer();

    attachmentsContainer.clear();

    if (this.attachments.length === 0) {
      this.attachmentsBar = undefined;
      editorContainer.removeChild(attachmentsContainer);
      return;
    }

    // Ensure attachmentsContainer is placed before the editor in the layout
    if (!editorContainer.children.includes(attachmentsContainer)) {
      const editorIdx = editorContainer.children.indexOf(
        this.ctx.getEditorBuddyLayout(),
      );
      if (editorIdx >= 0) {
        editorContainer.children.splice(
          editorIdx,
          0,
          attachmentsContainer,
        );
      } else {
        editorContainer.addChild(attachmentsContainer);
      }
    }

    const themeName = this.ctx.getThemeName();
    const theme = getThemeByName(themeName || "dark") ?? getThemeByName("dark")!;
    this.attachmentsBar = new AttachmentsBarComponent(
      this.attachments,
      this.selectedAttachmentIndex,
      theme,
    );
    attachmentsContainer.addChild(this.attachmentsBar);
  }
}
