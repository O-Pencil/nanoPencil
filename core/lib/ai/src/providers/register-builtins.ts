/**
 * [WHO]: registerBuiltInApiProviders, resetApiProviders
 * [FROM]: Depends on ../api-registry.js and dynamic imports for built-in provider runtime modules
 * [TO]: Consumed by core/lib/ai/src/stream.ts and core/lib/ai/src/index.ts for built-in provider availability
 * [HERE]: core/lib/ai/src/providers/register-builtins.ts - lazy registration boundary for built-in AI providers
 */

import { clearApiProviders, registerApiProviderLoader } from "../api-registry.js";

export function registerBuiltInApiProviders(): void {
	registerApiProviderLoader("anthropic-messages", async () => {
		const { streamAnthropic, streamSimpleAnthropic } = await import("./anthropic.js");
		return {
			api: "anthropic-messages",
			stream: streamAnthropic,
			streamSimple: streamSimpleAnthropic,
		};
	});

	registerApiProviderLoader("openai-completions", async () => {
		const { streamOpenAICompletions, streamSimpleOpenAICompletions } = await import("./openai-completions.js");
		return {
			api: "openai-completions",
			stream: streamOpenAICompletions,
			streamSimple: streamSimpleOpenAICompletions,
		};
	});

	registerApiProviderLoader("openai-responses", async () => {
		const { streamOpenAIResponses, streamSimpleOpenAIResponses } = await import("./openai-responses.js");
		return {
			api: "openai-responses",
			stream: streamOpenAIResponses,
			streamSimple: streamSimpleOpenAIResponses,
		};
	});

	registerApiProviderLoader("azure-openai-responses", async () => {
		const { streamAzureOpenAIResponses, streamSimpleAzureOpenAIResponses } = await import("./azure-openai-responses.js");
		return {
			api: "azure-openai-responses",
			stream: streamAzureOpenAIResponses,
			streamSimple: streamSimpleAzureOpenAIResponses,
		};
	});

	registerApiProviderLoader("openai-codex-responses", async () => {
		const { streamOpenAICodexResponses, streamSimpleOpenAICodexResponses } = await import("./openai-codex-responses.js");
		return {
			api: "openai-codex-responses",
			stream: streamOpenAICodexResponses,
			streamSimple: streamSimpleOpenAICodexResponses,
		};
	});

	registerApiProviderLoader("google-generative-ai", async () => {
		const { streamGoogle, streamSimpleGoogle } = await import("./google.js");
		return {
			api: "google-generative-ai",
			stream: streamGoogle,
			streamSimple: streamSimpleGoogle,
		};
	});

	registerApiProviderLoader("google-gemini-cli", async () => {
		const { streamGoogleGeminiCli, streamSimpleGoogleGeminiCli } = await import("./google-gemini-cli.js");
		return {
			api: "google-gemini-cli",
			stream: streamGoogleGeminiCli,
			streamSimple: streamSimpleGoogleGeminiCli,
		};
	});

	registerApiProviderLoader("google-vertex", async () => {
		const { streamGoogleVertex, streamSimpleGoogleVertex } = await import("./google-vertex.js");
		return {
			api: "google-vertex",
			stream: streamGoogleVertex,
			streamSimple: streamSimpleGoogleVertex,
		};
	});

	registerApiProviderLoader("bedrock-converse-stream", async () => {
		const { streamBedrock, streamSimpleBedrock } = await import("./amazon-bedrock.js");
		return {
			api: "bedrock-converse-stream",
			stream: streamBedrock,
			streamSimple: streamSimpleBedrock,
		};
	});
}

export function resetApiProviders(): void {
	clearApiProviders();
	registerBuiltInApiProviders();
}

registerBuiltInApiProviders();
