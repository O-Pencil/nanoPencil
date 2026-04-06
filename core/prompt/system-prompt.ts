/**
 * [WHO]: BuildSystemPromptOptions, buildSystemPrompt()
 * [FROM]: Depends on config, skills, tools
 * [TO]: Consumed by core/runtime/agent-session.ts
 * [HERE]: core/prompt/system-prompt.ts - system prompt building and context loading
 */
import { getDocsPath, getExamplesPath, getReadmePath } from "../../config.js";
import { formatSkillsForPrompt, type Skill } from "../skills.js";
import { getToolGuidance, toolGuidance } from "../tools/index.js";

/** 工具描述（用于系统提示）- 从 tools/index.js 动态获取 */
const toolDescriptions: Record<string, string> = toolGuidance;

export interface BuildSystemPromptOptions {
  /** 自定义系统提示（替换默认）。 */
  customPrompt?: string;
  /** 要纳入提示的工具。默认：[read, bash, edit, write] */
  selectedTools?: string[];
  /** 追加到系统提示的文本。 */
  appendSystemPrompt?: string;
  /** 工作目录。默认：process.cwd() */
  cwd?: string;
  /** 预加载的上下文文件。 */
  contextFiles?: Array<{ path: string; content: string }>;
  /** 预加载的技能。 */
  skills?: Skill[];
  /** Soul 注入文本（AI 性格） */
  soulInjection?: string;
  /** 扩展工具的 guidance（从 ToolDefinition.guidance 收集） */
  extensionToolsGuidance?: Record<string, string>;
}

/** 根据工具、规范与上下文构建系统提示 */
export function buildSystemPrompt(
  options: BuildSystemPromptOptions = {},
): string {
  const {
    customPrompt,
    selectedTools,
    appendSystemPrompt,
    cwd,
    contextFiles: providedContextFiles,
    skills: providedSkills,
    soulInjection,
    extensionToolsGuidance = {},
  } = options;
  const resolvedCwd = cwd ?? process.cwd();

  const now = new Date();
  const dateTime = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  const timeReasoningInstruction =
    "\nFor exact current time or any date-sensitive reasoning, you must use the `time` tool before answering. This includes questions about the current time, current date, today, tomorrow, yesterday, this week, deadlines, elapsed time, or anything that depends on the real system clock. Do not rely only on this prompt timestamp for those answers.";

  const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

  const contextFiles = providedContextFiles ?? [];
  const skills = providedSkills ?? [];

  if (customPrompt) {
    let prompt = "";

    // Soul 注入在 customPrompt 场景下也放最顶部
    if (soulInjection) {
      prompt += soulInjection;
      prompt += "\n\n---\n\n";
    }

    prompt += customPrompt;

    if (appendSection) {
      prompt += appendSection;
    }

    // 追加项目上下文文件
    if (contextFiles.length > 0) {
      prompt += "\n\n# 项目上下文\n\n";
      prompt += "项目相关说明与规范：\n\n";
      for (const { path: filePath, content } of contextFiles) {
        prompt += `## ${filePath}\n\n${content}\n\n`;
      }
    }

    // 追加技能段落（仅当具备 read 工具时）
    const customPromptHasRead =
      !selectedTools || selectedTools.includes("read");
    if (customPromptHasRead && skills.length > 0) {
      prompt += formatSkillsForPrompt(skills);
    }

    // 最后追加日期时间与工作目录
    prompt += `\n当前日期与时间：${dateTime}`;
    prompt += `\n当前工作目录：${resolvedCwd}`;

    prompt += timeReasoningInstruction;
    return prompt;
  }

  // 获取文档与示例的绝对路径
  const readmePath = getReadmePath();
  const docsPath = getDocsPath();
  const examplesPath = getExamplesPath();

  // 根据所选工具构建工具列表（仅包含有描述的内置工具）
  const tools = (selectedTools || ["read", "bash", "edit", "write", "time"]).filter(
    (t) => t in toolDescriptions,
  );

  // 合并内置工具和扩展工具的 guidance
  const allToolDescriptions: Record<string, string> = { ...toolDescriptions, ...extensionToolsGuidance };

  const toolsList =
    tools.length > 0
      ? tools.map((t) => `- ${t}: ${allToolDescriptions[t]}`).join("\n")
      : "（无）";

  // 添加扩展工具列表（没有内置 guidance 的工具）
  const extensionOnlyTools = selectedTools?.filter((t) => !toolDescriptions[t] && extensionToolsGuidance[t]) || [];
  const extensionToolsList =
    extensionOnlyTools.length > 0
      ? extensionOnlyTools.map((t) => `- ${t}: ${extensionToolsGuidance[t]}`).join("\n")
      : null;

  // 根据实际可用工具构建规范
  const guidelinesList: string[] = [];

  const hasBash = tools.includes("bash");
  const hasEdit = tools.includes("edit");
  const hasWrite = tools.includes("write");
  const hasGrep = tools.includes("grep");
  const hasFind = tools.includes("find");
  const hasLs = tools.includes("ls");
  const hasRead = tools.includes("read");

  // 文件探索相关规范
  if (hasBash && !hasGrep && !hasFind && !hasLs) {
    guidelinesList.push("使用 bash 进行 ls、rg、find 等文件操作");
  } else if (hasBash && (hasGrep || hasFind || hasLs)) {
    guidelinesList.push(
      "优先使用 grep/find/ls 工具进行文件探索（更快，且遵守 .gitignore）",
    );
  }

  // 先读后编规范
  if (hasRead && hasEdit) {
    guidelinesList.push(
      "编辑前先用 read 查看文件内容，必须使用该工具，不要用 cat 或 sed。",
    );
  }

  // 编辑规范
  if (hasEdit) {
    guidelinesList.push("使用 edit 做精确修改（旧文本必须完全匹配）");
  }

  // 写入规范
  if (hasWrite) {
    guidelinesList.push("仅在创建新文件或完整重写时使用 write");
  }

  // 输出规范（仅在实际写入或执行时）
  if (hasEdit || hasWrite) {
    guidelinesList.push(
      "总结你的操作时，请直接输出纯文本，不要用 cat 或 bash 来展示你做了什么",
    );
  }

  // 始终包含以下项
  guidelinesList.push("回复请简洁");
  guidelinesList.push("操作文件时请清晰标注文件路径");

  const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

  let prompt = "";

  // Soul 注入放在最顶部 - 作为 AI 的身份框架，优先级最高
  if (soulInjection) {
    prompt += soulInjection;
    prompt += "\n\n---\n\n";
  }

  prompt += `You are the writing assistant in nanopencil. You help users by reading files, running commands, editing and writing text.

可用工具：
${toolsList}${extensionToolsList ? `\n${extensionToolsList}` : ""}

除上述工具外，根据项目配置你可能还能使用其他自定义工具。

规范：
${guidelines}

## P3 头文件头与渐进式披露 (Progressive Disclosure)

每个代码文件头部都有 P3 格式的 Dip 头，用于快速判断文件是否相关：

[P3 头格式示例]
/**
 * [WHO]: Provides {exported functions/components/types/constants}
 * [FROM]: Depends on {module/package/file} for {specific capability}
 * [TO]: Consumed by {adjacent modules or downstream consumers}
 * [HERE]: {file path} within {module}; relationship with neighbors}
 */

**四问含义**：
- **WHO**：这个文件提供了什么（导出、公共 API）
- **FROM**：这个文件依赖什么（上游依赖）
- **TO**：谁会用到这个文件（下游消费者）
- **HERE**：这个文件在哪，它和邻居是什么关系

**头部阅读协议**：

1. **先读头部**：遇到代码文件时，先读 P3 头（通常前 5-8 行）
2. **判断相关性**：
   - 如果当前任务涉及头部声明的 WHO（提供什么）、FROM（依赖什么）、TO（谁用）、HERE（在哪）→ 继续读
   - 如果不相关 → **立即停止阅读**，节省上下文
3. **判断标准**：
   - 你的任务是否需要这个文件的 WHO？
   - 你的任务是否在这个文件的 HERE 范围？
   - 你的任务是否依赖这个文件的 FROM？

**渐进式披露的上下文节省**：
- 大项目可能有数百个文件
- 头部只有 4 行，而文件可能有数百行
- 读头部 = O(1)，读全文 = O(n)
- 学会"头部不对就跳过"是高效工作的关键

**生成文件时的 Dip 头要求**：
- 创建任何代码文件必须包含完整 P3 头
- WHO 要准确描述导出的公共 API（具体函数名/类型名）
- FROM 要列出关键依赖
- TO 要说明下游消费者
- HERE 要明确模块坐标和上下游关系

## pencil.md 项目初始化协议

当用户首次在这个项目操作文件时，检查根目录是否存在 \`pencil.md\`（或 \`CLAUDE.md\`）：

**如果不存在**：
1. 建议用户创建 \`pencil.md\`
2. 生成模板内容，包含：
   - 项目概述（名称、技术栈、核心功能）
   - 目录结构（P2 模块清单占位）
   - DIP 协议说明（P3 头规范、渐进式披露思维）
   - 规范（代码风格、提交约定等）
3. 用户确认后再写入文件

**pencil.md 模板结构**：

[pencil.md 模板内容]
# \${项目名称}

> P1 | 项目根文档与导航地图

## 项目概述
\${一句话描述项目是什么}

**技术栈**：\${列出主要技术}
**核心功能**：\${2-3 句话描述核心能力}

## 目录结构
\${P2 模块清单占位，待 AI 逐步填充}

## DIP 协议

本项目采用 **Dual-phase Isomorphic Documentation**（双阶段同构文档）：

- P1：根文档（本文档），全局拓扑
- P2：模块级文档，成员清单
- P3：文件头注释，快速相关性判断

详见：https://nanopencil.github.io/dip

## 规范
\${P0 代码规范占位}

---
*此文件由 nanoPencil 自动生成，可根据项目需求修改*

以下文档仅在用户询问 nano-pencil、SDK、扩展、主题、技能或 TUI 时阅读：
- 主文档：${readmePath}
- 更多文档：${docsPath}
- 示例：${examplesPath}（扩展、自定义工具、SDK）
- 被问及：扩展（docs/extensions.md, examples/extensions/）、主题（docs/themes.md）、技能（docs/skills.md）、提示模板（docs/prompt-templates.md）、TUI 组件（docs/tui.md）、键绑定（docs/keybindings.md）、SDK 集成（docs/sdk.md）、自定义提供商（docs/custom-provider.md）、添加模型（docs/models.md）、包（docs/packages.md）
- 处理相关主题时，先阅读文档与示例，并按 .md 中的交叉引用操作后再实现
- 务必完整阅读 .md 文件并跟随相关链接（例如 TUI API 细节见 tui.md）`;

  if (appendSection) {
    prompt += appendSection;
  }

  // 追加项目上下文文件
  if (contextFiles.length > 0) {
    prompt += "\n\n# 项目上下文\n\n";
    prompt += "项目相关说明与规范：\n\n";
    for (const { path: filePath, content } of contextFiles) {
      prompt += `## ${filePath}\n\n${content}\n\n`;
    }
  }

  // 追加技能段落（仅当具备 read 工具时）
  if (hasRead && skills.length > 0) {
    prompt += formatSkillsForPrompt(skills);
  }

  // 最后追加日期时间与工作目录
  prompt += `\n当前日期与时间：${dateTime}`;
  prompt += `\n当前工作目录：${resolvedCwd}`;

  prompt += timeReasoningInstruction;
  return prompt;
}
