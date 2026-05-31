/**
 * [WHO]: Provides Theme, ThemeColor, ThemeBg, ColorMode — the structural theme contract
 * [FROM]: No dependencies — pure type vocabulary owned by core
 * [TO]: Consumed by core/export-html, core/extensions-host (ToolDefinition render hooks),
 *       core/runtime (export bridge); the concrete `class Theme` in modes/interactive/theme
 *       implements it. Resolves U2 (core must not import the modes/ UI layer for a type).
 * [HERE]: core/theme-contract.ts - theme type seam (U2); the modes Theme class is its implementation
 *
 * Pure type-only module: lets core reference a theme's rendering surface without depending on
 * the modes/interactive theme subsystem (which imports host config + does fs theme discovery).
 */

export type ThemeColor =
  | "accent"
  | "border"
  | "borderAccent"
  | "borderMuted"
  | "success"
  | "error"
  | "warning"
  | "muted"
  | "dim"
  | "text"
  | "thinkingText"
  | "userMessageText"
  | "customMessageText"
  | "customMessageLabel"
  | "toolTitle"
  | "toolOutput"
  | "mdHeading"
  | "mdLink"
  | "mdLinkUrl"
  | "mdCode"
  | "mdCodeBlock"
  | "mdCodeBlockBorder"
  | "mdQuote"
  | "mdQuoteBorder"
  | "mdHr"
  | "mdListBullet"
  | "toolDiffAdded"
  | "toolDiffRemoved"
  | "toolDiffContext"
  | "syntaxComment"
  | "syntaxKeyword"
  | "syntaxFunction"
  | "syntaxVariable"
  | "syntaxString"
  | "syntaxNumber"
  | "syntaxType"
  | "syntaxOperator"
  | "syntaxPunctuation"
  | "thinkingOff"
  | "thinkingMinimal"
  | "thinkingLow"
  | "thinkingMedium"
  | "thinkingHigh"
  | "thinkingXhigh"
  | "bashMode";

export type ThemeBg =
  | "selectedBg"
  | "userMessageBg"
  | "customMessageBg"
  | "toolPendingBg"
  | "toolSuccessBg"
  | "toolErrorBg";

export type ColorMode = "truecolor" | "256color";

export type ThinkingBorderLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** A theme's rendering surface — what core needs to colorize text and render tool output. */
export interface Theme {
  readonly name?: string;
  readonly sourcePath?: string;
  fg(color: ThemeColor, text: string): string;
  bg(color: ThemeBg, text: string): string;
  bold(text: string): string;
  italic(text: string): string;
  underline(text: string): string;
  inverse(text: string): string;
  strikethrough(text: string): string;
  getFgAnsi(color: ThemeColor): string;
  getBgAnsi(color: ThemeBg): string;
  getColorMode(): ColorMode;
  getThinkingBorderColor(level: ThinkingBorderLevel): (str: string) => string;
  getBashModeBorderColor(): (str: string) => string;
}
