/**
 * [WHO]: Public skills subpath exports for skill discovery and prompt formatting
 * [FROM]: Re-exports core/skills.js
 * [TO]: Consumed by advanced SDK users importing @catui/agent/skills
 * [HERE]: skills.ts - package subpath entry for skill APIs
 */

export {
  formatSkillsForPrompt,
  type LoadSkillsFromDirOptions,
  type LoadSkillsResult,
  loadSkills,
  loadSkillsFromDir,
  type Skill,
  type SkillFrontmatter,
} from "./core/skills.js";
