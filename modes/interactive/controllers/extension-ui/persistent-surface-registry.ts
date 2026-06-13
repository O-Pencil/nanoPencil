/**
 * [WHO]: Provides PersistentSurfaceRegistry, PersistentSurfaceContext — extension keyed persistent surfaces
 * [FROM]: Depends on @catui/tui (Container/Component/Text/Spacer/TUI), theme, theme-contract (Theme),
 *         extensions-host (ExtensionWidgetOptions), footer-data-provider (FooterDataProvider) — types
 * [TO]: Consumed by modes/interactive/interactive-mode.ts (held as `this.surfaces`; wired into ExtensionUIContext
 *       setWidget/setFooter/setHeader/setStatus; called by resetExtensionUI + syncBuddyPet)
 * [HERE]: modes/interactive/controllers/extension-ui/persistent-surface-registry.ts — P5 extension-ui rewrite, host 1/4 (UI02, 纯搬)
 *
 * First extension-ui host (see ../../../.dev-docs/architecture-review/interactive-ui-review/extension-ui-analysis.md).
 * Owns the *keyed persistent surfaces* an extension can set: above/below widgets, custom footer, custom
 * header, and footer status. The mount-owned layout containers (widget containers, header container,
 * built-in header/footer, footer data provider, TUI) are reached through a narrow context. Behavior is
 * identical to the former InteractiveMode methods (纯搬).
 */

import { type Component, Container, Spacer, Text, type TUI } from "@catui/tui";
import type { ExtensionWidgetOptions } from "../../../../core/extensions-host/index.js";
import type { Theme } from "../../../../core/theme-contract.js";
import type { FooterDataProvider } from "../../footer-data-provider.js";
import { theme } from "../../theme/theme.js";

type DisposableComponent = Component & { dispose?(): void };

// Maximum total widget lines to prevent viewport overflow
const MAX_WIDGET_LINES = 10;

/** Narrow capability seam: the mount-owned layout/render handles the surfaces manipulate. */
export interface PersistentSurfaceContext {
  requestRender(): void;
  getUi(): TUI;
  getWidgetContainerAbove(): Container | undefined;
  getWidgetContainerBelow(): Container | undefined;
  getHeaderContainer(): Container;
  getBuiltInHeader(): Component | undefined;
  /** The built-in footer component (swapped out when a custom footer is set). */
  getFooter(): Component;
  getFooterDataProvider(): FooterDataProvider;
}

export class PersistentSurfaceRegistry {
  private readonly widgetsAbove = new Map<string, DisposableComponent>();
  private readonly widgetsBelow = new Map<string, DisposableComponent>();
  private customFooter: DisposableComponent | undefined = undefined;
  private customHeader: DisposableComponent | undefined = undefined;

  constructor(private readonly ctx: PersistentSurfaceContext) {}

  // ----- status -----

  setStatus(key: string, text: string | undefined): void {
    this.ctx.getFooterDataProvider().setExtensionStatus(key, text);
    this.ctx.requestRender();
  }

  // ----- widgets -----

  /** Set an extension widget (string array or custom component). */
  setWidget(
    key: string,
    content:
      | string[]
      | ((tui: TUI, thm: Theme) => DisposableComponent)
      | undefined,
    options?: ExtensionWidgetOptions,
  ): void {
    const placement = options?.placement ?? "aboveEditor";
    const removeExisting = (map: Map<string, DisposableComponent>) => {
      const existing = map.get(key);
      if (existing?.dispose) existing.dispose();
      map.delete(key);
    };

    removeExisting(this.widgetsAbove);
    removeExisting(this.widgetsBelow);

    if (content === undefined) {
      this.renderWidgets();
      return;
    }

    let component: DisposableComponent;

    if (Array.isArray(content)) {
      // Wrap string array in a Container with Text components
      const container = new Container();
      for (const line of content.slice(0, MAX_WIDGET_LINES)) {
        container.addChild(new Text(line, 1, 0));
      }
      if (content.length > MAX_WIDGET_LINES) {
        container.addChild(
          new Text(theme.fg("muted", "... (widget truncated)"), 1, 0),
        );
      }
      component = container;
    } else {
      // Factory function - create component
      component = content(this.ctx.getUi(), theme);
    }

    const targetMap =
      placement === "belowEditor" ? this.widgetsBelow : this.widgetsAbove;
    targetMap.set(key, component);
    this.renderWidgets();
  }

  clearWidgets(): void {
    for (const widget of this.widgetsAbove.values()) {
      widget.dispose?.();
    }
    for (const widget of this.widgetsBelow.values()) {
      widget.dispose?.();
    }
    this.widgetsAbove.clear();
    this.widgetsBelow.clear();
    this.renderWidgets();
  }

  /** Render all extension widgets to the widget containers. */
  renderWidgets(): void {
    const above = this.ctx.getWidgetContainerAbove();
    const below = this.ctx.getWidgetContainerBelow();
    if (!above || !below) return;
    this.renderWidgetContainer(above, this.widgetsAbove, true, true);
    this.renderWidgetContainer(below, this.widgetsBelow, false, false);
    this.ctx.requestRender();
  }

  private renderWidgetContainer(
    container: Container,
    widgets: Map<string, DisposableComponent>,
    spacerWhenEmpty: boolean,
    leadingSpacer: boolean,
  ): void {
    container.clear();

    if (widgets.size === 0) {
      if (spacerWhenEmpty) {
        container.addChild(new Spacer(1));
      }
      return;
    }

    if (leadingSpacer) {
      container.addChild(new Spacer(1));
    }
    for (const component of widgets.values()) {
      container.addChild(component);
    }
  }

  // ----- footer -----

  /** Set a custom footer component, or restore the built-in footer. */
  setFooter(
    factory:
      | ((
          tui: TUI,
          thm: Theme,
          footerData: FooterDataProvider,
        ) => DisposableComponent)
      | undefined,
  ): void {
    const ui = this.ctx.getUi();

    // Dispose existing custom footer
    if (this.customFooter?.dispose) {
      this.customFooter.dispose();
    }

    // Remove current footer from UI
    if (this.customFooter) {
      ui.removeChild(this.customFooter);
    } else {
      ui.removeChild(this.ctx.getFooter());
    }

    if (factory) {
      // Create and add custom footer, passing the data provider
      this.customFooter = factory(ui, theme, this.ctx.getFooterDataProvider());
      ui.addChild(this.customFooter);
    } else {
      // Restore built-in footer
      this.customFooter = undefined;
      ui.addChild(this.ctx.getFooter());
    }

    ui.requestRender();
  }

  // ----- header -----

  /** Set a custom header component, or restore the built-in header. */
  setHeader(
    factory: ((tui: TUI, thm: Theme) => DisposableComponent) | undefined,
  ): void {
    const builtInHeader = this.ctx.getBuiltInHeader();
    // Header may not be initialized yet if called during early initialization
    if (!builtInHeader) {
      return;
    }

    const ui = this.ctx.getUi();
    const headerContainer = this.ctx.getHeaderContainer();

    // Dispose existing custom header
    if (this.customHeader?.dispose) {
      this.customHeader.dispose();
    }

    // Find the index of the current header in the header container
    const currentHeader = this.customHeader || builtInHeader;
    const index = headerContainer.children.indexOf(currentHeader);

    if (factory) {
      // Create and add custom header
      this.customHeader = factory(ui, theme);
      if (index !== -1) {
        headerContainer.children[index] = this.customHeader;
      } else {
        // If not found (e.g. builtInHeader was never added), add at the top
        headerContainer.children.unshift(this.customHeader);
      }
    } else {
      // Restore built-in header
      this.customHeader = undefined;
      if (index !== -1) {
        headerContainer.children[index] = builtInHeader;
      }
    }

    ui.requestRender();
  }
}
