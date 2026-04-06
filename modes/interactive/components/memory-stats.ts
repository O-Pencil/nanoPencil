/**
 * [INPUT]: NanoMem engine
 * [OUTPUT]: Formatted display of memory stats
 * [POS]: Interactive mode component for /memory command
 */
/**
 * [WHO]: formatMemoryStats
 * [FROM]: No external dependencies
 * [TO]: Consumed by modes/interactive/components/index.ts
 * [HERE]: modes/interactive/components/memory-stats.ts -
 */


// Use any type for NanoMemEngine since it's a local package
interface NanoMemEngine {
  getStats(): {
    knowledge: number;
    lessons: number;
    preferences: number;
    facets: number;
    work: number;
    episodes: number;
    totalSessions: number;
  };
}

interface DisplayOptions {
  compact?: boolean;
}

/**
 * Format NanoMem stats for display
 */
export function formatMemoryStats(
  memory: any,
  options: DisplayOptions = {},
): string {
  if (options.compact) {
    return formatCompactMemory(memory);
  }

  return formatFullMemory(memory);
}

/**
 * Format compact memory stats (single line)
 */
function formatCompactMemory(memory: NanoMemEngine): string {
  const stats = memory.getStats();

  const totalMemories =
    stats.knowledge +
    stats.lessons +
    stats.preferences +
    stats.facets +
    stats.episodes;

  return `📚 Memory: ${totalMemories} 项 | Knowledge: ${stats.knowledge} | Lessons: ${stats.lessons} | Episodes: ${stats.episodes}`;
}

/**
 * Format full memory stats (detailed view)
 */
function formatFullMemory(memory: NanoMemEngine): string {
  const lines: string[] = [];

  lines.push("╔═════════════════════════════════════════════════╗");
  lines.push("║           📚 Project Memory - NanoMem                ║");
  lines.push("╠═════════════════════════════════════════════════╣");
  lines.push("║");

  const stats = memory.getStats();

  // Memory Types
  const memoryTypes = [
    { type: "knowledge", name: "知识", emoji: "📖", count: stats.knowledge },
    { type: "lessons", name: "经验教训", emoji: "💡", count: stats.lessons },
    {
      type: "preferences",
      name: "用户偏好",
      emoji: "❤️",
      count: stats.preferences,
    },
    { type: "facets", name: "模式/困境", emoji: "🧩", count: stats.facets },
    { type: "work", name: "工作摘要", emoji: "📋", count: stats.work },
    { type: "episodes", name: "会话记录", emoji: "📝", count: stats.episodes },
  ];

  lines.push("║ 📊 Memory Types");
  lines.push("║ ────────────────────────────────────────────────");

  for (const mem of memoryTypes) {
    const bar = createBar(Math.min(mem.count / 100, 1), 15);
    lines.push(
      `║ ${mem.emoji} ${mem.name.padEnd(12)} ${bar} ${mem.count.toString().padStart(5)} 项`,
    );
  }

  lines.push("║");
  lines.push("║ 🔍 Recent Knowledge (Top 5)");
  lines.push("║ ────────────────────────────────────────────────");

  // Note: This would require loading actual entries
  // For now, show stats only
  lines.push(`║   (共 ${stats.knowledge} 条项目知识)`);
  lines.push(`║   最近更新: ${stats.totalSessions > 0 ? "本次会话" : "无"}`);

  lines.push("║");
  lines.push("║ 💡 Lessons Learned");
  lines.push("║ ────────────────────────────────────────────────");
  lines.push(`║   (共 ${stats.lessons} 条经验教训)`);
  lines.push(`   ⚠️  从错误中学习，避免重复犯错`);

  lines.push("║");
  lines.push("║ 🧩 Patterns & Struggles");
  lines.push("║ ────────────────────────────────────────────────");
  lines.push(`║   模式: ${stats.facets}  条`);
  lines.push(`   困境: 已识别的行为模式`);

  lines.push("║");
  lines.push("║ 📝 Session History");
  lines.push("║ ────────────────────────────────────────────────");
  lines.push(`║   会话记录: ${stats.episodes} 条`);
  lines.push(`   总会话数: ${stats.totalSessions}`);

  lines.push("║");
  lines.push("╚═════════════════════════════════════════════════╝");

  return lines.join("\n");
}

/**
 * Create a visual bar for counts
 */
function createBar(filled: number, width: number): string {
  const intFilled = Math.floor(filled);
  const partial = Math.floor((filled - intFilled) * 8);

  let bar = "█".repeat(intFilled);
  if (partial > 0) {
    bar += "▓".repeat(1); // Partial fill
  }
  bar += "░".repeat(width - intFilled - (partial > 0 ? 1 : 0));

  return bar;
}
