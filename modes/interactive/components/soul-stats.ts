/**
 * [INPUT]: Soul profile and memory manager
 * [OUTPUT]: Formatted display of Soul stats and personality
 * [POS]: Interactive mode component for /soul command
 */
/**
 * [WHO]: formatSoulStats
 * [FROM]: No external dependencies
 * [TO]: Consumed by modes/interactive/components/index.ts
 * [HERE]: modes/interactive/components/soul-stats.ts -
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
    { key: "openness", label: "Openness", emoji: "🎨" },
    { key: "conscientiousness", label: "Conscientious", emoji: "📋" },
    { key: "codeVerbosity", label: "Code Verbosity", emoji: "📝" },
    { key: "abstractionLevel", label: "Abstraction", emoji: "🏗️" },
    { key: "safetyMargin", label: "Safety Margin", emoji: "🛡️" },
    { key: "explorationDrive", label: "Exploration", emoji: "🔍" },
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
    lines.push("║   (No expertise data yet. Keep using to accumulate.)");
  } else {
    for (const exp of expertise) {
      const confidence = (exp.confidence * 100).toFixed(0).padStart(3);
      const examples = exp.examples.toString().padStart(3);
      const domainStr = typeof exp.domain === "object" && exp.domain !== null
        ? (exp.domain.name || JSON.stringify(exp.domain))
        : String(exp.domain ?? "Unknown");
      lines.push(
        `║   • ${domainStr.padEnd(20)} Confidence: ${confidence}%  Successes: ${examples}`,
      );
    }
  }

  lines.push("║");
  lines.push("║ 💭 Current Mood");

  const emotional = profile.emotionalState;
  const mood = [
    { label: "Confidence", value: emotional.confidence, emoji: "😊" },
    { label: "Curiosity", value: emotional.curiosity, emoji: "🤔" },
    { label: "Frustration", value: emotional.frustration, emoji: "😤" },
    { label: "Flow", value: emotional.flow, emoji: "✨" },
  ];

  for (const m of mood) {
    const bar = createBar(m.value, 8);
    const percent = (m.value * 100).toFixed(0).padStart(3);
    lines.push(`║   ${m.emoji} ${m.label.padEnd(8)} ${bar} ${percent}%`);
  }

  lines.push("║");
  lines.push("║ 📈 Development Stats");
  lines.push("║ ────────────────────────────────────────────────");
  lines.push(`║   Total Interactions: ${stats.stats.totalInteractions}`);
  lines.push(`║   Success Rate: ${(stats.stats.successRate * 100).toFixed(1)}%`);
  lines.push(`║   Soul Version: ${profile.version}`);
  lines.push(
    `║   Soul Age: ${Math.floor((Date.now() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24))} days`,
  );
  lines.push(`║   Last Evolution: ${formatTimeAgo(profile.lastEvolved)}`);

  lines.push("║");
  lines.push("║ 🧘 User Relationship");
  lines.push("║ ────────────────────────────────────────────────");
  const rel = profile.userRelationship;
  lines.push(`║   Interactions: ${rel.interactionCount}`);
  lines.push(`║   Satisfaction: ${(rel.satisfactionScore * 100).toFixed(0)}%`);
  lines.push(`   Communication Style: ${rel.communicationStyle}`);

  if (rel.knownPreferences.length > 0) {
    lines.push(`║   Known Preferences: ${rel.knownPreferences.slice(0, 3).join(", ")}`);
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
 * Get trait label in English
 */
function getTraitLabel(key: string): string {
  const labels: Record<string, string> = {
    openness: "Openness",
    conscientiousness: "Conscientious",
    extraversion: "Extraversion",
    agreeableness: "Agreeableness",
    neuroticism: "Neuroticism",
    codeVerbosity: "Code Verbosity",
    abstractionLevel: "Abstraction",
    safetyMargin: "Safety Margin",
    explorationDrive: "Exploration",
  };
  return labels[key] || key;
}

/**
 * Format time ago in English
 */
function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours < 24) return `${hours} hours ago`;
  return `${days} days ago`;
}
