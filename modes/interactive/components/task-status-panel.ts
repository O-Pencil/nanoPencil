/**
 * [WHO]: TaskStatusPanelComponent - renders persistent task status with checkboxes
 * [FROM]: Depends on @catui/tui, extensions/builtin/task/task-store
 * [TO]: Consumed by StreamRenderController
 * [HERE]: modes/interactive/components/task-status-panel.ts - CC-style task status TUI panel
 */

import { Container, Spacer, Text, truncateToWidth, type TUI } from "@catui/tui";
import type { Theme } from "../theme/theme.js";

export interface TaskStatusEntry {
  id: string;
  subject: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
  blockedBy?: string[];
}

const BRAILLE_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
/** Max tasks visible before collapsing. Dynamically adjusted by terminal height. */
const MAX_VISIBLE_TASKS = 10;
const MIN_VISIBLE_TASKS = 3;

export class TaskStatusPanelComponent extends Container {
  private tui: TUI;
  private theme: Theme;
  private spinnerFrame = 0;
  private headerText: Text;
  private taskLines: Text[] = [];
  private overflowLine: Text | undefined;
  private lastTasks: TaskStatusEntry[] = [];

  constructor(tui: TUI, theme: Theme) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.headerText = new Text("", 0, 0);
    this.addChild(new Spacer(1));
    this.addChild(this.headerText);
  }

  /** Rebuild the panel from current task list. */
  update(tasks: TaskStatusEntry[]): void {
    this.lastTasks = tasks;

    // Remove old task lines
    for (const line of this.taskLines) super.removeChild(line);
    this.taskLines = [];
    if (this.overflowLine) {
      super.removeChild(this.overflowLine);
      this.overflowLine = undefined;
    }

    if (tasks.length === 0) {
      this.headerText.setText("");
      return;
    }

    const completed = tasks.filter((t) => t.status === "completed").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const pending = tasks.length - completed - inProgress;
    const anyRunning = inProgress > 0;
    const allDone = completed === tasks.length;

    // Spinner
    if (anyRunning) {
      this.spinnerFrame = (this.spinnerFrame + 1) % BRAILLE_FRAMES.length;
    }
    const spinner = anyRunning
      ? this.theme.fg("accent", BRAILLE_FRAMES[this.spinnerFrame])
      : allDone
        ? this.theme.fg("success", "✔")
        : this.theme.fg("dim", "◼");

    // Header — summary line like CC: "{total} tasks ({completed} done, ...)"
    const parts: string[] = [];
    if (completed > 0) parts.push(`${completed} done`);
    if (inProgress > 0) parts.push(`${inProgress} in progress`);
    if (pending > 0) parts.push(`${pending} open`);
    const summary = parts.join(", ");
    this.headerText.setText(` ${spinner} ${this.theme.bold("Tasks")} ${this.theme.fg("dim", `(${summary})`)}`);

    // Compute max visible based on terminal height
    const rows = this.tui.terminal?.rows ?? 24;
    const maxVisible = Math.min(MAX_VISIBLE_TASKS, Math.max(MIN_VISIBLE_TASKS, rows - 14));

    // Prioritize: in_progress first, then pending, then recently completed
    const sorted = this.prioritizeTasks(tasks, maxVisible);
    const visibleTasks = sorted.slice(0, maxVisible);
    const hiddenCount = tasks.length - maxVisible;

    const width = this.tui.terminal?.columns ?? 80;
    const maxSubjectWidth = Math.max(width - 10, 20);

    for (const task of visibleTasks) {
      let icon: string;
      let subjectStyle: (s: string) => string;

      if (task.status === "completed") {
        icon = this.theme.fg("success", "✔");
        // Completed: dim
        subjectStyle = (s: string) => this.theme.fg("dim", s);
      } else if (task.status === "in_progress") {
        icon = this.theme.fg("accent", "◼");
        // In-progress: bold
        subjectStyle = (s: string) => this.theme.bold(s);
      } else {
        icon = this.theme.fg("dim", "◻");
        // Pending: normal dim
        subjectStyle = (s: string) => this.theme.fg("dim", s);
      }

      // Use activeForm for in-progress tasks if available
      const displayText = task.status === "in_progress" && task.activeForm
        ? task.activeForm
        : task.subject;
      const truncated = truncateToWidth(displayText, maxSubjectWidth, "…");

      let lineText = `  ${icon} ${subjectStyle(truncated)}`;

      // Show blocked notice
      if (task.blockedBy && task.blockedBy.length > 0 && task.status !== "completed") {
        const blockedIds = task.blockedBy.map((id) => `#${id}`).join(", ");
        lineText += this.theme.fg("dim", ` ⎿ blocked by ${blockedIds}`);
      }

      const line = new Text(lineText, 0, 0);
      this.taskLines.push(line);
      this.addChild(line);
    }

    if (hiddenCount > 0) {
      // Breakdown of hidden tasks
      const hidden = tasks.slice(maxVisible);
      const hiddenInProgress = hidden.filter((t) => t.status === "in_progress").length;
      const hiddenPending = hidden.filter((t) => t.status === "pending").length;
      const hiddenCompleted = hidden.filter((t) => t.status === "completed").length;
      const parts: string[] = [];
      if (hiddenInProgress > 0) parts.push(`${hiddenInProgress} in progress`);
      if (hiddenPending > 0) parts.push(`${hiddenPending} pending`);
      if (hiddenCompleted > 0) parts.push(`${hiddenCompleted} completed`);
      this.overflowLine = new Text(
        this.theme.fg("dim", `  … +${hiddenCount} ${parts.join(", ")}`),
        0,
        0,
      );
      this.addChild(this.overflowLine);
    }
  }

  /**
   * Prioritize tasks for display:
   * 1. in_progress (most important — user needs to see what's happening)
   * 2. pending (what's next)
   * 3. completed (least important, show most recent first)
   */
  private prioritizeTasks(tasks: TaskStatusEntry[], _maxVisible: number): TaskStatusEntry[] {
    const inProgress = tasks.filter((t) => t.status === "in_progress");
    const pending = tasks.filter((t) => t.status === "pending");
    const completed = tasks.filter((t) => t.status === "completed");
    return [...inProgress, ...pending, ...completed];
  }

  /** Get the last known tasks. */
  getLastTasks(): TaskStatusEntry[] {
    return this.lastTasks;
  }
}
