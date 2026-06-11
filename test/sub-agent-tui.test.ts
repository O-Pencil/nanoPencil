import assert from "node:assert/strict";
import test from "node:test";
import type { SubAgentState } from "../modes/interactive/state/interactive-state.js";
import { SubAgentPanelComponent } from "../modes/interactive/components/sub-agent-panel.js";

// Minimal mock TUI and Theme for component testing
function createMockTheme() {
  return {
    fg: (_name: string, text: string) => text,
    bg: (_name: string, text: string) => text,
  } as any;
}

function createMockTui() {
  return {
    terminal: { rows: 40, columns: 120 },
  } as any;
}

// Test mapSubAgentEvent mapping logic by importing the module and testing the types
// We can't easily import mapSubAgentEvent (it's not exported), but we can verify
// the SubAgentEvent types and SubAgentState interface work correctly.

test("SubAgentState: creates valid state object", () => {
  const state: SubAgentState = {
    id: "test-id",
    agentType: "Explore",
    description: "search codebase",
    isAsync: false,
    isResolved: false,
    isError: false,
    toolUseCount: 0,
    lastToolName: null,
    startTime: Date.now(),
  };
  assert.equal(state.id, "test-id");
  assert.equal(state.agentType, "Explore");
  assert.equal(state.description, "search codebase");
  assert.equal(state.isResolved, false);
  assert.equal(state.toolUseCount, 0);
});

test("SubAgentState: tracks tool usage", () => {
  const state: SubAgentState = {
    id: "test-id",
    agentType: "Explore",
    description: "",
    isAsync: false,
    isResolved: false,
    isError: false,
    toolUseCount: 0,
    lastToolName: null,
    startTime: Date.now(),
  };

  // Simulate tool_start
  state.lastToolName = "grep";
  assert.equal(state.lastToolName, "grep");

  // Simulate tool_end
  state.toolUseCount += 1;
  state.lastToolName = null;
  assert.equal(state.toolUseCount, 1);
  assert.equal(state.lastToolName, null);
});

test("SubAgentState: resolves with error", () => {
  const state: SubAgentState = {
    id: "test-id",
    agentType: "general-purpose",
    description: "task",
    isAsync: true,
    isResolved: false,
    isError: false,
    toolUseCount: 3,
    lastToolName: "bash",
    startTime: Date.now(),
  };

  // Simulate agent_end with error
  state.isResolved = true;
  state.isError = true;
  state.lastToolName = null;

  assert.equal(state.isResolved, true);
  assert.equal(state.isError, true);
  assert.equal(state.toolUseCount, 3);
});

test("SubAgentEvent: agent_start has required metadata", () => {
  // Verify the type shape compiles correctly
  const event = {
    type: "agent_start" as const,
    subAgentId: "id-1",
    timestamp: Date.now(),
    agentType: "Explore",
    description: "search tests",
    isAsync: false,
  };
  assert.equal(event.type, "agent_start");
  assert.equal(event.agentType, "Explore");
  assert.equal(event.description, "search tests");
  assert.equal(event.isAsync, false);
});

test("SubAgentPanel: Map iteration preserves insertion order", () => {
  const agents = new Map<string, SubAgentState>();
  agents.set("a", {
    id: "a", agentType: "Explore", description: "first", isAsync: false,
    isResolved: false, isError: false, toolUseCount: 2, lastToolName: "grep", startTime: Date.now(),
  });
  agents.set("b", {
    id: "b", agentType: "Plan", description: "second", isAsync: false,
    isResolved: true, isError: false, toolUseCount: 5, lastToolName: null, startTime: Date.now(),
  });
  agents.set("c", {
    id: "c", agentType: "Explore", description: "third", isAsync: true,
    isResolved: false, isError: false, toolUseCount: 0, lastToolName: null, startTime: Date.now(),
  });

  const list = Array.from(agents.values());
  assert.equal(list.length, 3);
  assert.equal(list[0].description, "first");
  assert.equal(list[1].description, "second");
  assert.equal(list[2].description, "third");

  // Verify anyRunning detection
  const anyRunning = list.some((a) => !a.isResolved);
  assert.equal(anyRunning, true);

  // Verify total tools
  const totalTools = list.reduce((s, a) => s + a.toolUseCount, 0);
  assert.equal(totalTools, 7);
});

test("SubAgentPanelComponent: renders with single running agent", () => {
  const tui = createMockTui();
  const th = createMockTheme();
  const panel = new SubAgentPanelComponent(tui, th);

  const agents = new Map<string, SubAgentState>();
  agents.set("id-1", {
    id: "id-1", agentType: "Explore", description: "search codebase", isAsync: false,
    isResolved: false, isError: false, toolUseCount: 0, lastToolName: null, startTime: Date.now(),
  });

  // Should not throw
  panel.update(agents);

  // Verify children were added (spacer + header + 2 agent lines)
  assert.ok(panel.children.length >= 3, `Expected >= 3 children, got ${panel.children.length}`);
});

test("SubAgentPanelComponent: renders with multiple agents", () => {
  const tui = createMockTui();
  const th = createMockTheme();
  const panel = new SubAgentPanelComponent(tui, th);

  const agents = new Map<string, SubAgentState>();
  agents.set("id-1", {
    id: "id-1", agentType: "Explore", description: "search tests", isAsync: false,
    isResolved: false, isError: false, toolUseCount: 3, lastToolName: "grep", startTime: Date.now(),
  });
  agents.set("id-2", {
    id: "id-2", agentType: "Plan", description: "design", isAsync: false,
    isResolved: true, isError: false, toolUseCount: 5, lastToolName: null, startTime: Date.now(),
  });
  agents.set("id-3", {
    id: "id-3", agentType: "Explore", description: "check types", isAsync: true,
    isResolved: false, isError: false, toolUseCount: 1, lastToolName: "read", startTime: Date.now(),
  });

  panel.update(agents);

  // spacer + header + 3 agents * 2 lines each = 8
  assert.equal(panel.children.length, 8, `Expected 8 children, got ${panel.children.length}`);
});

test("SubAgentPanelComponent: update is idempotent", () => {
  const tui = createMockTui();
  const th = createMockTheme();
  const panel = new SubAgentPanelComponent(tui, th);

  const agents = new Map<string, SubAgentState>();
  agents.set("id-1", {
    id: "id-1", agentType: "Explore", description: "", isAsync: false,
    isResolved: false, isError: false, toolUseCount: 0, lastToolName: null, startTime: Date.now(),
  });

  panel.update(agents);
  const count1 = panel.children.length;

  // Update again with same data — should not duplicate children
  panel.update(agents);
  const count2 = panel.children.length;

  assert.equal(count1, count2, `Children grew from ${count1} to ${count2} on second update`);
});

test("SubAgentPanelComponent: agent resolves between updates", () => {
  const tui = createMockTui();
  const th = createMockTheme();
  const panel = new SubAgentPanelComponent(tui, th);

  const agents = new Map<string, SubAgentState>();
  agents.set("id-1", {
    id: "id-1", agentType: "Explore", description: "search", isAsync: false,
    isResolved: false, isError: false, toolUseCount: 2, lastToolName: "grep", startTime: Date.now(),
  });

  panel.update(agents);

  // Resolve the agent
  agents.get("id-1")!.isResolved = true;
  agents.get("id-1")!.lastToolName = null;
  panel.update(agents);

  // Should still have same number of children
  assert.equal(panel.children.length, 4); // spacer + header + 2 lines
});

test("SubAgentPanelComponent: renders in condensed mode with small terminal", () => {
  const tui = { terminal: { rows: 10, columns: 80 } } as any;
  const th = createMockTheme();
  const panel = new SubAgentPanelComponent(tui, th);

  const agents = new Map<string, SubAgentState>();
  agents.set("id-1", {
    id: "id-1", agentType: "Explore", description: "", isAsync: false,
    isResolved: false, isError: false, toolUseCount: 3, lastToolName: "read", startTime: Date.now(),
  });
  agents.set("id-2", {
    id: "id-2", agentType: "Plan", description: "", isAsync: false,
    isResolved: false, isError: false, toolUseCount: 1, lastToolName: "write", startTime: Date.now(),
  });

  panel.update(agents);

  // In condensed mode: spacer + empty header + condensed line = 3
  assert.equal(panel.children.length, 3, `Expected 3 children in condensed mode, got ${panel.children.length}`);
});
