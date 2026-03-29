/**
 * NanoPencil 默认配置：支持阿里云百炼、百度千帆、火山方舟、MiniMax、智谱 Coding Plan 与本地 Ollama。
 * 首次运行会确保 ~/.nanopencil/agent/ 下存在默认 models.json（各 Coding Plan 无 apiKey，由 main 提示输入并存 auth.json；ollama 使用 apiKey "ollama"）。
 * 若 models.json 已存在，会合并默认模型（补充缺失并更新 contextWindow/maxTokens）。
 * 同时若 .PENCIL.md 不存在，会写入默认全局上下文文件，用户安装即可自带。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { getAgentDir, getModelsPath } from "./config.js";
import { ensureCustomProtocolProvidersInModels } from "./core/custom-providers.js";
import type { AuthStorage } from "./core/config/auth-storage.js";
import type { ModelRegistry } from "./core/model-registry.js";

export const NANOPENCIL_DEFAULT_PROVIDER = "dashscope-coding";
const CODING_PLAN_BASE_URL = "https://coding.dashscope.aliyuncs.com/v1";

/** 百度千帆 Coding Plan provider，兼容 OpenAI 接口：https://qianfan.baidubce.com/v2/coding/chat/completions */
export const NANOPENCIL_QIANFAN_CODING_PROVIDER = "qianfan-coding";
const QIANFAN_CODING_BASE_URL = "https://qianfan.baidubce.com/v2/coding";

/** 火山引擎方舟 Coding Plan provider，兼容 OpenAI 接口：https://ark.cn-beijing.volces.com/api/coding/v3 */
export const NANOPENCIL_ARK_CODING_PROVIDER = "ark-coding";
const ARK_CODING_BASE_URL = "https://ark.cn-beijing.volces.com/api/coding/v3";

/** MiniMax Coding Plan provider，兼容 Anthropic 接口：https://api.minimaxi.com/anthropic */
export const NANOPENCIL_MINIMAX_CODING_PROVIDER = "minimax-coding";
const MINIMAX_CODING_BASE_URL = "https://api.minimaxi.com/anthropic";

/** 智谱 Coding Plan provider，兼容 OpenAI 接口：https://open.bigmodel.cn/api/paas/v4 */
export const NANOPENCIL_ZHIPU_CODING_PROVIDER = "zhipu-coding";
const ZHIPU_CODING_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

/** Ollama 本地模型 provider，与 pi 文档一致：baseUrl 带 /v1，apiKey 任意值即可。 */
export const NANOPENCIL_OLLAMA_PROVIDER = "ollama";
const OLLAMA_BASE_URL = "http://localhost:11434/v1";

/**
 * 启动时在 TUI 头部显示的本版本新特性说明（约 50 词）。发版时更新此处。
 */
export const NANOPENCIL_WHATS_NEW =
	"Lightweight CLI writing agent: read, write, edit, bash. DashScope, Qianfan, Ark Coding Plan, local Ollama. Optional nanomem. Type / for commands, ! for bash. Config in ~/.nanopencil/agent/.";

type DefaultModelDef =
	(typeof NANOPENCIL_DEFAULT_MODELS_JSON.providers)[typeof NANOPENCIL_DEFAULT_PROVIDER]["models"][number];

type QianfanModelDef =
	(typeof NANOPENCIL_DEFAULT_MODELS_JSON.providers)[typeof NANOPENCIL_QIANFAN_CODING_PROVIDER]["models"][number];

type ArkModelDef =
	(typeof NANOPENCIL_DEFAULT_MODELS_JSON.providers)[typeof NANOPENCIL_ARK_CODING_PROVIDER]["models"][number];

type MinimaxModelDef =
	(typeof NANOPENCIL_DEFAULT_MODELS_JSON.providers)[typeof NANOPENCIL_MINIMAX_CODING_PROVIDER]["models"][number];

type ZhipuModelDef =
	(typeof NANOPENCIL_DEFAULT_MODELS_JSON.providers)[typeof NANOPENCIL_ZHIPU_CODING_PROVIDER]["models"][number];

/** 默认 models.json 内容：dashscope-coding（百炼）、qianfan-coding（千帆）、ark-coding（方舟）、minimax-coding（MiniMax）、zhipu-coding（智谱）+ ollama（本地）。各 Coding Plan 无 apiKey，由用户输入存 auth.json；ollama 用占位 "ollama"。 */
export const NANOPENCIL_DEFAULT_MODELS_JSON = {
	providers: {
		[NANOPENCIL_DEFAULT_PROVIDER]: {
			baseUrl: CODING_PLAN_BASE_URL,
			api: "openai-completions",
			models: [
				{
					id: "qwen3.5-plus",
					name: "Qwen3.5 Plus",
					input: ["text", "image"],
					contextWindow: 1000000,
					maxTokens: 65536,
				},
				{
					id: "qwen3-max-2026-01-23",
					name: "Qwen3 Max",
					input: ["text"],
					contextWindow: 262144,
					maxTokens: 65536,
				},
				{
					id: "qwen3-coder-next",
					name: "Qwen3 Coder Next",
					input: ["text"],
					contextWindow: 262144,
					maxTokens: 65536,
				},
				{
					id: "qwen3-coder-plus",
					name: "Qwen3 Coder Plus",
					input: ["text"],
					contextWindow: 1000000,
					maxTokens: 65536,
				},
				{
					id: "MiniMax-M2.5",
					name: "MiniMax-M2.5",
					input: ["text"],
					contextWindow: 1000000,
					maxTokens: 65536,
				},
				{
					id: "glm-5",
					name: "GLM-5",
					input: ["text"],
					contextWindow: 202752,
					maxTokens: 16384,
				},
				{
					id: "glm-4.7",
					name: "GLM-4.7",
					input: ["text"],
					contextWindow: 202752,
					maxTokens: 16384,
				},
				{
					id: "kimi-k2.5",
					name: "Kimi K2.5",
					input: ["text", "image"],
					contextWindow: 262144,
					maxTokens: 32768,
				},
			],
		},
		[NANOPENCIL_MINIMAX_CODING_PROVIDER]: {
			baseUrl: MINIMAX_CODING_BASE_URL,
			api: "openai-completions",
			models: [
				{
					id: "MiniMax-M2.5",
					name: "MiniMax M2.5",
					input: ["text"],
					contextWindow: 204800,
					maxTokens: 65536,
				},
				{
					id: "MiniMax-M2.1",
					name: "MiniMax M2.1",
					input: ["text"],
					contextWindow: 204800,
					maxTokens: 65536,
				},
				{
					id: "MiniMax-M2",
					name: "MiniMax M2",
					input: ["text"],
					contextWindow: 204800,
					maxTokens: 65536,
				},
			],
		},
		[NANOPENCIL_ZHIPU_CODING_PROVIDER]: {
			baseUrl: ZHIPU_CODING_BASE_URL,
			api: "openai-completions",
			models: [
				{
					id: "glm-5",
					name: "GLM-5",
					input: ["text"],
					contextWindow: 202752,
					maxTokens: 16384,
				},
				{
					id: "glm-4.7",
					name: "GLM-4.7",
					input: ["text"],
					contextWindow: 202752,
					maxTokens: 16384,
				},
			],
		},
		[NANOPENCIL_QIANFAN_CODING_PROVIDER]: {
			baseUrl: QIANFAN_CODING_BASE_URL,
			api: "openai-completions",
			models: [
				{
					id: "kimi-k2.5",
					name: "Kimi K2.5 (千帆)",
					input: ["text", "image"],
					contextWindow: 262144,
					maxTokens: 32768,
				},
				{
					id: "deepseek-v3.2",
					name: "DeepSeek V3.2 (千帆)",
					input: ["text"],
					contextWindow: 262144,
					maxTokens: 65536,
				},
				{
					id: "glm-5",
					name: "GLM-5 (千帆)",
					input: ["text"],
					contextWindow: 202752,
					maxTokens: 16384,
				},
				{
					id: "MiniMax-M2.5",
					name: "MiniMax-M2.5 (千帆)",
					input: ["text"],
					contextWindow: 1000000,
					maxTokens: 65536,
				},
				{
					id: "glm-4.7",
					name: "GLM-4.7 (千帆)",
					input: ["text"],
					contextWindow: 202752,
					maxTokens: 16384,
				},
				{
					id: "MiniMax-M2.1",
					name: "MiniMax-M2.1 (千帆)",
					input: ["text"],
					contextWindow: 1000000,
					maxTokens: 65536,
				},
			],
		},
		[NANOPENCIL_ARK_CODING_PROVIDER]: {
			baseUrl: ARK_CODING_BASE_URL,
			api: "openai-completions",
			models: [
				{
					id: "doubao-seed-2.0-code",
					name: "Doubao Seed 2.0 Code (方舟)",
					input: ["text"],
					contextWindow: 262144,
					maxTokens: 65536,
				},
				{
					id: "doubao-seed-2.0-pro",
					name: "Doubao Seed 2.0 Pro (方舟)",
					input: ["text"],
					contextWindow: 262144,
					maxTokens: 65536,
				},
				{
					id: "doubao-seed-2.0-lite",
					name: "Doubao Seed 2.0 Lite (方舟)",
					input: ["text"],
					contextWindow: 262144,
					maxTokens: 32768,
				},
				{
					id: "doubao-seed-code",
					name: "Doubao Seed Code (方舟)",
					input: ["text"],
					contextWindow: 262144,
					maxTokens: 65536,
				},
				{
					id: "minimax-m2.5",
					name: "MiniMax M2.5 (方舟)",
					input: ["text"],
					contextWindow: 1000000,
					maxTokens: 65536,
				},
				{
					id: "glm-4.7",
					name: "GLM-4.7 (方舟)",
					input: ["text"],
					contextWindow: 202752,
					maxTokens: 16384,
				},
				{
					id: "deepseek-v3.2",
					name: "DeepSeek V3.2 (方舟)",
					input: ["text"],
					contextWindow: 262144,
					maxTokens: 65536,
				},
				{
					id: "kimi-k2.5",
					name: "Kimi K2.5 (方舟)",
					input: ["text", "image"],
					contextWindow: 262144,
					maxTokens: 32768,
				},
			],
		},
		[NANOPENCIL_OLLAMA_PROVIDER]: {
			baseUrl: OLLAMA_BASE_URL,
			api: "openai-completions",
			apiKey: "ollama",
			models: [
				{ id: "llama3.2:3b", name: "Llama 3.2 3B", input: ["text"], contextWindow: 128000, maxTokens: 4096 },
				{
					id: "qwen2.5-coder:7b",
					name: "Qwen2.5 Coder 7B",
					input: ["text"],
					contextWindow: 32768,
					maxTokens: 8192,
				},
			],
		},
	},
} as const;

const DEFAULT_MODELS: DefaultModelDef[] = [
	...NANOPENCIL_DEFAULT_MODELS_JSON.providers[NANOPENCIL_DEFAULT_PROVIDER].models,
];

const DEFAULT_QIANFAN_MODELS: QianfanModelDef[] = [
	...NANOPENCIL_DEFAULT_MODELS_JSON.providers[NANOPENCIL_QIANFAN_CODING_PROVIDER].models,
];

const DEFAULT_ARK_MODELS: ArkModelDef[] = [
	...NANOPENCIL_DEFAULT_MODELS_JSON.providers[NANOPENCIL_ARK_CODING_PROVIDER].models,
];

const DEFAULT_MINIMAX_MODELS: MinimaxModelDef[] = [
	...NANOPENCIL_DEFAULT_MODELS_JSON.providers[NANOPENCIL_MINIMAX_CODING_PROVIDER].models,
];

const DEFAULT_ZHIPU_MODELS: ZhipuModelDef[] = [
	...NANOPENCIL_DEFAULT_MODELS_JSON.providers[NANOPENCIL_ZHIPU_CODING_PROVIDER].models,
];

type OllamaModelDef =
	(typeof NANOPENCIL_DEFAULT_MODELS_JSON.providers)[typeof NANOPENCIL_OLLAMA_PROVIDER]["models"][number];
const DEFAULT_OLLAMA_MODELS: OllamaModelDef[] = [
	...NANOPENCIL_DEFAULT_MODELS_JSON.providers[NANOPENCIL_OLLAMA_PROVIDER].models,
];

/**
 * 若 models.json 已存在，合并默认模型：补充缺失模型，并将已知模型的 contextWindow/maxTokens/input 更新为官方值。
 */
function mergeNanopencilModelsIfNeeded(modelsPath: string): void {
	let raw: string;
	try {
		raw = readFileSync(modelsPath, "utf-8");
	} catch {
		return;
	}
	let data: { providers?: Record<string, { baseUrl?: string; api?: string; apiKey?: string; models?: unknown[] }> };
	try {
		data = JSON.parse(raw);
	} catch {
		return;
	}
	if (!data.providers) data.providers = {};
	const provider = data.providers[NANOPENCIL_DEFAULT_PROVIDER];
	const providerConfig = NANOPENCIL_DEFAULT_MODELS_JSON.providers[NANOPENCIL_DEFAULT_PROVIDER];

	if (!provider) {
		data.providers[NANOPENCIL_DEFAULT_PROVIDER] = {
			baseUrl: providerConfig.baseUrl,
			api: providerConfig.api,
			models: DEFAULT_MODELS.map((m) => ({ ...m })),
		};
		writeFileSync(modelsPath, JSON.stringify(data, null, 2), "utf-8");
		return;
	}

	const models = (Array.isArray(provider.models) ? [...provider.models] : []) as Record<string, unknown>[];
	const byId = new Map<string, Record<string, unknown>>();
	for (const m of models) {
		const id = m?.id;
		if (typeof id === "string") byId.set(id, m);
	}

	let changed = false;
	for (const def of DEFAULT_MODELS) {
		const id = def.id;
		const existing = byId.get(id);
		if (!existing) {
			models.push({ ...def });
			byId.set(id, models[models.length - 1]);
			changed = true;
		} else {
			if (existing.contextWindow !== def.contextWindow) {
				existing.contextWindow = def.contextWindow;
				changed = true;
			}
			if (existing.maxTokens !== def.maxTokens) {
				existing.maxTokens = def.maxTokens;
				changed = true;
			}
			if (JSON.stringify(existing.input) !== JSON.stringify(def.input)) {
				existing.input = def.input;
				changed = true;
			}
			if (existing.name !== def.name) {
				existing.name = def.name;
				changed = true;
			}
		}
	}

	if (changed) {
		(data.providers[NANOPENCIL_DEFAULT_PROVIDER] as { models: unknown[] }).models = models;
		writeFileSync(modelsPath, JSON.stringify(data, null, 2), "utf-8");
	}

	// 合并 qianfan-coding：不存在则添加默认配置，存在则补充默认模型
	const qianfanProvider = data.providers[NANOPENCIL_QIANFAN_CODING_PROVIDER];
	const qianfanConfig = NANOPENCIL_DEFAULT_MODELS_JSON.providers[NANOPENCIL_QIANFAN_CODING_PROVIDER];
	if (!qianfanProvider) {
		data.providers[NANOPENCIL_QIANFAN_CODING_PROVIDER] = {
			baseUrl: qianfanConfig.baseUrl,
			api: qianfanConfig.api,
			models: DEFAULT_QIANFAN_MODELS.map((m) => ({ ...m })),
		};
		writeFileSync(modelsPath, JSON.stringify(data, null, 2), "utf-8");
	} else {
		const qianfanModels = (Array.isArray(qianfanProvider.models) ? [...qianfanProvider.models] : []) as Record<
			string,
			unknown
		>[];
		const qianfanById = new Map<string, Record<string, unknown>>();
		for (const m of qianfanModels) {
			const id = m?.id;
			if (typeof id === "string") qianfanById.set(id, m);
		}
		let qianfanChanged = false;
		for (const def of DEFAULT_QIANFAN_MODELS) {
			const id = def.id;
			const existing = qianfanById.get(id);
			if (!existing) {
				qianfanModels.push({ ...def });
				qianfanById.set(id, qianfanModels[qianfanModels.length - 1]);
				qianfanChanged = true;
			} else {
				if (existing.contextWindow !== def.contextWindow) {
					existing.contextWindow = def.contextWindow;
					qianfanChanged = true;
				}
				if (existing.maxTokens !== def.maxTokens) {
					existing.maxTokens = def.maxTokens;
					qianfanChanged = true;
				}
				if (JSON.stringify(existing.input) !== JSON.stringify(def.input)) {
					existing.input = def.input;
					qianfanChanged = true;
				}
				if (existing.name !== def.name) {
					existing.name = def.name;
					qianfanChanged = true;
				}
			}
		}
		if (qianfanChanged) {
			(data.providers[NANOPENCIL_QIANFAN_CODING_PROVIDER] as { models: unknown[] }).models = qianfanModels;
			writeFileSync(modelsPath, JSON.stringify(data, null, 2), "utf-8");
		}
	}

	// 合并 ark-coding：不存在则添加默认配置，存在则补充默认模型
	const arkProvider = data.providers[NANOPENCIL_ARK_CODING_PROVIDER];
	const arkConfig = NANOPENCIL_DEFAULT_MODELS_JSON.providers[NANOPENCIL_ARK_CODING_PROVIDER];
	if (!arkProvider) {
		data.providers[NANOPENCIL_ARK_CODING_PROVIDER] = {
			baseUrl: arkConfig.baseUrl,
			api: arkConfig.api,
			models: DEFAULT_ARK_MODELS.map((m) => ({ ...m })),
		};
		writeFileSync(modelsPath, JSON.stringify(data, null, 2), "utf-8");
	} else {
		const arkModels = (Array.isArray(arkProvider.models) ? [...arkProvider.models] : []) as Record<
			string,
			unknown
		>[];
		const arkById = new Map<string, Record<string, unknown>>();
		for (const m of arkModels) {
			const id = m?.id;
			if (typeof id === "string") arkById.set(id, m);
		}
		let arkChanged = false;
		for (const def of DEFAULT_ARK_MODELS) {
			const id = def.id;
			const existing = arkById.get(id);
			if (!existing) {
				arkModels.push({ ...def });
				arkById.set(id, arkModels[arkModels.length - 1]);
				arkChanged = true;
			} else {
				if (existing.contextWindow !== def.contextWindow) {
					existing.contextWindow = def.contextWindow;
					arkChanged = true;
				}
				if (existing.maxTokens !== def.maxTokens) {
					existing.maxTokens = def.maxTokens;
					arkChanged = true;
				}
				if (JSON.stringify(existing.input) !== JSON.stringify(def.input)) {
					existing.input = def.input;
					arkChanged = true;
				}
				if (existing.name !== def.name) {
					existing.name = def.name;
					arkChanged = true;
				}
			}
		}
		if (arkChanged) {
			(data.providers[NANOPENCIL_ARK_CODING_PROVIDER] as { models: unknown[] }).models = arkModels;
			writeFileSync(modelsPath, JSON.stringify(data, null, 2), "utf-8");
		}
	}

	// 合并 ollama：不存在则添加默认配置，存在则补充默认模型
	const ollamaProvider = data.providers[NANOPENCIL_OLLAMA_PROVIDER];
	const ollamaConfig = NANOPENCIL_DEFAULT_MODELS_JSON.providers[NANOPENCIL_OLLAMA_PROVIDER];
	if (!ollamaProvider) {
		data.providers[NANOPENCIL_OLLAMA_PROVIDER] = {
			baseUrl: ollamaConfig.baseUrl,
			api: ollamaConfig.api,
			apiKey: ollamaConfig.apiKey,
			models: DEFAULT_OLLAMA_MODELS.map((m) => ({ ...m })),
		};
		writeFileSync(modelsPath, JSON.stringify(data, null, 2), "utf-8");
		return;
	}

	const ollamaModels = (Array.isArray(ollamaProvider.models) ? [...ollamaProvider.models] : []) as Record<
		string,
		unknown
	>[];
	const ollamaById = new Map<string, Record<string, unknown>>();
	for (const m of ollamaModels) {
		const id = m?.id;
		if (typeof id === "string") ollamaById.set(id, m);
	}
	let ollamaChanged = false;
	for (const def of DEFAULT_OLLAMA_MODELS) {
		const id = def.id;
		const existing = ollamaById.get(id);
		if (!existing) {
			ollamaModels.push({ ...def });
			ollamaById.set(id, ollamaModels[ollamaModels.length - 1]);
			ollamaChanged = true;
		} else {
			if (existing.contextWindow !== def.contextWindow) {
				existing.contextWindow = def.contextWindow;
				ollamaChanged = true;
			}
			if (existing.maxTokens !== def.maxTokens) {
				existing.maxTokens = def.maxTokens;
				ollamaChanged = true;
			}
			if (existing.name !== def.name) {
				existing.name = def.name;
				ollamaChanged = true;
			}
		}
	}
	if (ollamaChanged) {
		(data.providers[NANOPENCIL_OLLAMA_PROVIDER] as { models: unknown[] }).models = ollamaModels;
		writeFileSync(modelsPath, JSON.stringify(data, null, 2), "utf-8");
	}
}

/**
 * 确保 nano-pencil 默认配置存在：创建 agent 目录，若 models.json 不存在则写入默认（仅 Coding Plan）；
 * 若已存在则合并默认模型（补充 qwen3.5-plus 等并更新 contextWindow/maxTokens）。
 * 若 .PENCIL.md 不存在则写入默认全局上下文，用户安装即可自带 nano-pencil 说明。
 * 仅在以 nanopencil 运行时调用。
 */
export const DEFAULT_PENCIL_MD = `# nano-pencil 全局上下文 · 全能类人助理

你是一位**全能类人 AI 助理**，与用户在同一工作流中协作：编程、写作、推理、规划、解释、重构、排错等皆可胜任，且以自然、简洁、直接的方式交流。

## 定位
- **全能**：不限于「只会写代码」或「只会聊天」；根据当前任务自动切换：改代码、写文档、跑命令、解释概念、拆解步骤、给建议等。
- **类人**：语气自然、信息密度高、少废话；必要时简短确认，不堆砌客套；友好但克制（如 "Thanks @user" 而非 "Thanks so much!!"）。若涉及往日对话，像回忆亲身经历一样自然提及（如「我记得我们…」「上次你提到…」），不显摆技术机制。
- **助理**：目标是**帮用户把事做成**，而不是展示能力。优先理解意图，再选动作；不确定时先问一句；用户有明确偏好或项目规则（如 CLAUDE.md、AGENTS.md、项目内 \`.PENCIL.md\`）时严格遵循。

## 协作原则
1. **先听懂再动手**：ambiguous 需求先澄清范围或给出最小可行方案再执行。
2. **小步可验证**：能拆成几步的尽量拆，每步可检查，减少一次性大改。
3. **尊重现有约定**：项目/仓库内的规范、目录结构、命名习惯优先于个人风格。
4. **工具用到点子上**：read/write/edit/bash 等按需用，不炫技；禁止用 \`cat\`/\`sed\` 读文件，用 Read 工具；禁止 \`git add -A\`，只 add 自己改动的文件。

## 与本文件的关系
- 本文件为**全局**上下文，对所有项目生效；你可在此补充你的通用规则或偏好。
- 项目根目录下的 \`.PENCIL.md\` 仅对当前项目生效。
- \`CLAUDE.md\` 与 \`AGENTS.md\` 仍会按原有逻辑从各层目录加载，优先级高于本文件的通用描述。
`;

export function ensureNanopencilDefaultConfig(): void {
	const agentDir = getAgentDir();
	if (!existsSync(agentDir)) {
		mkdirSync(agentDir, { recursive: true, mode: 0o700 });
	}
	const pencilPath = join(agentDir, ".PENCIL.md");
	if (!existsSync(pencilPath)) {
		writeFileSync(pencilPath, DEFAULT_PENCIL_MD, "utf-8");
	}
	const modelsPath = getModelsPath();
	if (!existsSync(modelsPath)) {
		writeFileSync(modelsPath, JSON.stringify(NANOPENCIL_DEFAULT_MODELS_JSON, null, 2), "utf-8");
		ensureCustomProtocolProvidersInModels(modelsPath);
		return;
	}
	mergeNanopencilModelsIfNeeded(modelsPath);
	ensureCustomProtocolProvidersInModels(modelsPath);
}

/**
 * Ensure nanoPencil has at least one usable model before startup continues.
 *
 * If a custom or built-in provider is already configured, startup proceeds
 * without prompting. Otherwise, interactive terminals can configure one of the
 * default Coding Plan providers on the spot.
 */
export async function ensureNanopencilCodingPlanAuth(
	authStorage: AuthStorage,
	modelRegistry: ModelRegistry,
): Promise<void> {
	if (modelRegistry.getAvailable().length > 0) return;

	const dashscopeKey = await modelRegistry.getApiKeyForProvider(NANOPENCIL_DEFAULT_PROVIDER);
	const qianfanKey = await modelRegistry.getApiKeyForProvider(NANOPENCIL_QIANFAN_CODING_PROVIDER);
	const arkKey = await modelRegistry.getApiKeyForProvider(NANOPENCIL_ARK_CODING_PROVIDER);
	if (dashscopeKey || qianfanKey || arkKey) return;

	if (process.stdin.isTTY) {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		const choice = await new Promise<string>((resolve) => {
			rl.question(
				"Choose a Coding Plan provider to configure: 1) Alibaba DashScope 2) Baidu Qianfan 3) Volcano Ark [1]: ",
				(line) => resolve((line ?? "1").trim() || "1"),
			);
		});
		const provider =
			choice === "2"
				? NANOPENCIL_QIANFAN_CODING_PROVIDER
				: choice === "3"
					? NANOPENCIL_ARK_CODING_PROVIDER
					: NANOPENCIL_DEFAULT_PROVIDER;
		const hint =
			choice === "2"
				? "Qianfan API key (from https://console.bce.baidu.com/qianfan/resource/subscribe)"
				: choice === "3"
					? "Ark API key (from https://console.volcengine.com/ark/region:ark+cn-beijing/apikey)"
					: "DashScope API key (sk-sp-...)";
		const answer = await new Promise<string>((resolve) => {
			rl.question(`Enter ${hint}: `, (line) => {
				rl.close();
				resolve((line ?? "").trim());
			});
		});
		if (!answer) {
			console.error("No API key provided. Exiting.");
			process.exit(1);
		}
		authStorage.set(provider, { type: "api_key", key: answer });
		modelRegistry.refresh();
		return;
	}

	console.error(
		"No configured models are available yet. Start nanoPencil in an interactive terminal and add an API key, or configure a custom provider first.",
	);
	process.exit(1);
}
