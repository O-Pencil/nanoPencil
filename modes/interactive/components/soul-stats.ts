/**
 * [INPUT]: Soul profile and memory manager
 * [OUTPUT]: Formatted display of Soul stats and personality
 * [POS]: Interactive mode component for /soul command
 */
/**
 * [UPSTREAM]: 
 * [SURFACE]: 
 * [LOCUS]: modes/interactive/components/soul-stats.ts - 
 * [COVENANT]: Change → update this header
 */

// @ts-ignore - soul package is bundled at runtime
import type { SoulManager } from "@pencil-agent/soul";

interface DisplayOptions {
  compact?: boolean;
}

/**
 * Format Soul stats for display
 */
export function formatSoulStats(
  soul: SoulManager,
  options: DisplayOptions = {},
): string {
  const profile = soul.getProfile();
  const stats = soul.getStats();

  if (options.compact) {
    return formatCompactSoul(profile, stats);
  }

  return formatFullSoul(profile, stats);
}

/**
 * Format compact Soul stats (single line)
 */
function formatCompactSoul(profile: any, stats: any): string {
  const personality = profile.personality;
  const expertise = stats.expertise.slice(0, 3);

  const topTraits = Object.entries(personality)
    .filter(
      ([_, value]) => typeof value === "number" && (value > 0.6 || value < 0.4),
    )
    .map(([key, value]) => {
      const label = getTraitLabel(key);
      const numValue = typeof value === "number" ? value : 0.5;
      const status = numValue > 0.6 ? "↑" : numValue < 0.4 ? "↓" : "→";
      return `${label}${status} ${(numValue * 100).toFixed(0)}%`;
    })
    .slice(0, 3)
    .join(", ");

  const topExpertise = expertise
    .map((e: any) => `${e.domain}(${(e.confidence * 100).toFixed(0)}%)`)
    .join(", ");

  return `🧠 Soul: ${topTraits} | Expertise: ${topExpertise} | Interactions: ${stats.stats.totalInteractions}`;
}

/**
 * Format full Soul stats (detailed view)
 */
function formatFullSoul(profile: any, stats: any): string {
  const lines: string[] = [];

  lines.push("╔═════════════════════════════════════════════════╗");
  lines.push("║           🧠 AI Soul - Personality & Stats          ║");
  lines.push("╠═════════════════════════════════════════════════╣");
  lines.push("║");

  // Personality Section
  lines.push("║ 📊 Personality Traits");
  lines.push("║ ────────────────────────────────────────────────");

  const personality = profile.personality;
  const traits = [
    { key: "openness", label: "开放性", emoji: "🎨" },
    { key: "conscientiousness", label: "尽责性", emoji: "📋" },
    { key: "codeVerbosity", label: "代码冗长", emoji: "📝" },
    { key: "abstractionLevel", label: "抽象层级", emoji: "🏗️" },
    { key: "safetyMargin", label: "安全边际", emoji: "🛡️" },
    { key: "explorationDrive", label: "探索欲望", emoji: "🔍" },
  ];

  for (const trait of traits) {
    const value = personality[trait.key];
    const bar = createBar(value, 10);
    const percent = (value * 100).toFixed(0).padStart(3);
    lines.push(`║ ${trait.emoji} ${trait.label.padEnd(12)} ${bar} ${percent}%`);
  }

  lines.push("║");
  lines.push("║ 🎯 Top Expertise Areas");

  const expertise = stats.expertise.slice(0, 5);
  if (expertise.length === 0) {
    lines.push("║   (暂无专长数据，继续使用以积累)");
  } else {
    for (const exp of expertise) {
      const confidence = (exp.confidence * 100).toFixed(0).padStart(3);
      const examples = exp.examples.toString().padStart(3);
      const domainStr = typeof exp.domain === "object" && exp.domain !== null
        ? (exp.domain.name || JSON.stringify(exp.domain))
        : String(exp.domain ?? "未知");
      lines.push(
        `║   • ${domainStr.padEnd(20)} 信心: ${confidence}%  成功: ${examples} 次`,
      );
    }
  }

  lines.push("║");
  lines.push("║ 💭 Current Mood");

  const emotional = profile.emotionalState;
  const mood = [
    { label: "信心", value: emotional.confidence, emoji: "😊" },
    { label: "好奇心", value: emotional.curiosity, emoji: "🤔" },
    { label: "挫败感", value: emotional.frustration, emoji: "😤" },
    { label: "心流", value: emotional.flow, emoji: "✨" },
  ];

  for (const m of mood) {
    const bar = createBar(m.value, 8);
    const percent = (m.value * 100).toFixed(0).padStart(3);
    lines.push(`║   ${m.emoji} ${m.label.padEnd(8)} ${bar} ${percent}%`);
  }

  lines.push("║");
  lines.push("║ 📈 Development Stats");
  lines.push("║ ────────────────────────────────────────────────");
  lines.push(`║   总交互次数: ${stats.stats.totalInteractions}`);
  lines.push(`║   成功率: ${(stats.stats.successRate * 100).toFixed(1)}%`);
  lines.push(`║   Soul 版本: ${profile.version}`);
  lines.push(
    `║   Soul 年龄: ${Math.floor((Date.now() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24))} 天`,
  );
  lines.push(`║   最后进化: ${formatTimeAgo(profile.lastEvolved)}`);

  lines.push("║");
  lines.push("║ 🧘 User Relationship");
  lines.push("║ ────────────────────────────────────────────────");
  const rel = profile.userRelationship;
  lines.push(`║   交互次数: ${rel.interactionCount}`);
  lines.push(`║   满意度: ${(rel.satisfactionScore * 100).toFixed(0)}%`);
  lines.push(`   沟通风格: ${rel.communicationStyle}`);

  if (rel.knownPreferences.length > 0) {
    lines.push(`║   已知偏好: ${rel.knownPreferences.slice(0, 3).join(", ")}`);
  }

  lines.push("║");
  lines.push("╚═════════════════════════════════════════════════╝");

  return lines.join("\n");
}

/**
 * Create a visual bar for values
 */
function createBar(value: number, width: number): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Get trait label in Chinese
 */
function getTraitLabel(key: string): string {
  const labels: Record<string, string> = {
    openness: "开放性",
    conscientiousness: "尽责性",
    extraversion: "外向性",
    agreeableness: "宜人性",
    neuroticism: "神经质",
    codeVerbosity: "代码冗长",
    abstractionLevel: "抽象层级",
    safetyMargin: "安全边际",
    explorationDrive: "探索",
  };
  return labels[key] || key;
}

/**
 * Format time ago in Chinese
 */
function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}
