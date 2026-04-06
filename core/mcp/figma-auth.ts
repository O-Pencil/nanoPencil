/**
 * [WHO]: registerFigmaMcpOAuthProvider()
 * [FROM]: Depends on ai, node:fs, node:http, node:os, node:path, node:child_process
 * [TO]: Consumed by core/runtime/sdk.ts
 * [HERE]: core/mcp/figma-auth.ts - Figma OAuth integration for MCP servers
 */
import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "@pencil-agent/ai";
import { registerOAuthProvider } from "@pencil-agent/ai";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { exec } from "node:child_process";

const FIGMA_MCP_URL = "https://mcp.figma.com/mcp";
const FIGMA_RESOURCE_METADATA_URL = "https://mcp.figma.com/.well-known/oauth-protected-resource";
const FIGMA_AUTH_METADATA_URL = "https://api.figma.com/.well-known/oauth-authorization-server";
const FIGMA_AUTH_URL = "https://www.figma.com/oauth/mcp";
const FIGMA_TOKEN_URL = "https://api.figma.com/v1/oauth/token";
const FIGMA_REGISTER_URL = "https://api.figma.com/v1/oauth/mcp/register";
const FIGMA_SCOPE = "mcp:connect";
const FIGMA_CLIENT_NAME = "NanoPencil";
const FIGMA_CLIENT_URI = "https://github.com/pencil-agent/nano-pencil";
const FIGMA_CLIENT_METADATA_URL = "https://raw.githubusercontent.com/pencil-agent/nano-pencil/main/README.md";
const CLAUDE_CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/auth/callback";
const CALLBACK_PORT_CANDIDATES = [14565, 14566, 14567, 14568, 14569];

type ImportedOAuthEntry = {
	serverName?: string;
	serverUrl?: string;
	accessToken?: string;
	refreshToken?: string;
	expiresAt?: number;
	clientId?: string;
	clientSecret?: string;
	stepUpScope?: string;
};

type ClaudeCredentialsFile = {
	mcpOAuth?: Record<string, ImportedOAuthEntry>;
};

type FigmaClientInformation = {
	clientId: string;
	clientSecret?: string;
	tokenEndpointAuthMethod?: "client_secret_basic" | "client_secret_post" | "none";
	source?: string;
};

export type FigmaOAuthCredentials = OAuthCredentials & {
	clientId: string;
	clientSecret?: string;
	tokenEndpointAuthMethod?: "client_secret_basic" | "client_secret_post" | "none";
	scope?: string;
	source?: string;
};

export type FigmaImportableSession = {
	source: string;
	expiresAt: number;
};

type FigmaAuthorizationServerMetadata = {
	authorization_endpoint: string;
	token_endpoint: string;
	registration_endpoint?: string;
	scopes_supported?: string[];
	response_types_supported?: string[];
	grant_types_supported?: string[];
	code_challenge_methods_supported?: string[];
	require_state_parameter?: boolean;
};

type CallbackServerInfo = {
	server: Server;
	redirectUri: string;
	cancelWait: () => void;
	waitForCode: () => Promise<{ code: string; state: string } | null>;
};

const SUCCESS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Figma authentication successful</title>
</head>
<body>
  <p>Figma authentication completed. Return to NanoPencil.</p>
</body>
</html>`;

const FAILURE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Figma authentication failed</title>
</head>
<body>
  <p>Figma authentication failed. You can close this window and retry from NanoPencil.</p>
</body>
</html>`;

function base64urlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
	const verifierBytes = new Uint8Array(32);
	crypto.getRandomValues(verifierBytes);
	const verifier = base64urlEncode(verifierBytes);

	const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	const challenge = base64urlEncode(new Uint8Array(hashBuffer));
	return { verifier, challenge };
}

function openBrowser(url: string): void {
	const command =
		process.platform === "darwin"
			? `open "${url}"`
			: process.platform === "win32"
				? `start "" "${url}"`
				: `xdg-open "${url}"`;
	exec(command, () => {
		// Ignore launch failures. The TUI already shows the URL.
	});
}

function createState(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Buffer.from(bytes).toString("hex");
}

function normalizeImportedCredentials(entry: ImportedOAuthEntry, source: string): FigmaOAuthCredentials | undefined {
	if (!entry.accessToken || !entry.refreshToken || !entry.clientId) {
		return undefined;
	}

	return {
		access: entry.accessToken,
		refresh: entry.refreshToken,
		expires: typeof entry.expiresAt === "number" ? entry.expiresAt : 0,
		clientId: entry.clientId,
		clientSecret: entry.clientSecret,
		tokenEndpointAuthMethod: entry.clientSecret ? "client_secret_basic" : "none",
		scope: entry.stepUpScope || FIGMA_SCOPE,
		source,
	};
}

function loadClaudeFigmaCredentials(): FigmaOAuthCredentials | undefined {
	if (!existsSync(CLAUDE_CREDENTIALS_PATH)) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(readFileSync(CLAUDE_CREDENTIALS_PATH, "utf-8")) as ClaudeCredentialsFile;
		const entries = Object.values(parsed.mcpOAuth ?? {})
			.filter((entry) => entry.serverUrl === FIGMA_MCP_URL)
			.map((entry) => normalizeImportedCredentials(entry, "Claude Code"))
			.filter((entry): entry is FigmaOAuthCredentials => !!entry)
			.sort((a, b) => b.expires - a.expires);

		return entries[0];
	} catch {
		return undefined;
	}
}

export function findImportableFigmaOAuthSession(): FigmaImportableSession | undefined {
	const imported = loadClaudeFigmaCredentials();
	if (!imported) {
		return undefined;
	}

	return {
		source: imported.source || "Claude Code",
		expiresAt: imported.expires,
	};
}

function loadConfiguredClientInformation(): FigmaClientInformation | undefined {
	const clientId = process.env.NANOPENCIL_FIGMA_CLIENT_ID?.trim();
	if (!clientId) {
		return undefined;
	}

	const clientSecret = process.env.NANOPENCIL_FIGMA_CLIENT_SECRET?.trim() || undefined;
	const tokenEndpointAuthMethod = clientSecret ? "client_secret_basic" : "none";

	return {
		clientId,
		clientSecret,
		tokenEndpointAuthMethod,
		source: "environment",
	};
}

async function requestRefresh(
	credentials: FigmaOAuthCredentials,
	authMethod: "client_secret_basic" | "client_secret_post" | "none",
): Promise<FigmaOAuthCredentials | undefined> {
	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
		Accept: "application/json",
	};
	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: credentials.refresh,
		resource: FIGMA_MCP_URL,
	});

	if (authMethod === "client_secret_basic") {
		if (!credentials.clientSecret) {
			return undefined;
		}
		const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`, "utf8").toString("base64");
		headers.Authorization = `Basic ${basic}`;
	} else {
		body.set("client_id", credentials.clientId);
		if (authMethod === "client_secret_post" && credentials.clientSecret) {
			body.set("client_secret", credentials.clientSecret);
		}
	}

	const response = await fetch(FIGMA_TOKEN_URL, {
		method: "POST",
		headers,
		body,
	});

	if (!response.ok) {
		return undefined;
	}

	const json = (await response.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
	};

	if (!json.access_token || typeof json.expires_in !== "number") {
		return undefined;
	}

	return {
		...credentials,
		access: json.access_token,
		refresh: json.refresh_token || credentials.refresh,
		expires: Date.now() + json.expires_in * 1000,
	};
}

export async function refreshFigmaOAuthCredentials(credentials: FigmaOAuthCredentials): Promise<FigmaOAuthCredentials> {
	const preferred = credentials.tokenEndpointAuthMethod ?? (credentials.clientSecret ? "client_secret_basic" : "none");
	const attempts: Array<"client_secret_basic" | "client_secret_post" | "none"> =
		preferred === "client_secret_basic"
			? ["client_secret_basic", "client_secret_post", "none"]
			: preferred === "client_secret_post"
				? ["client_secret_post", "client_secret_basic", "none"]
				: ["none", "client_secret_basic", "client_secret_post"];

	for (const method of attempts) {
		const refreshed = await requestRefresh(credentials, method);
		if (refreshed) {
			return {
				...refreshed,
				tokenEndpointAuthMethod: method,
			};
		}
	}

	throw new Error("Failed to refresh Figma MCP OAuth credentials");
}

async function fetchAuthorizationServerMetadata(): Promise<FigmaAuthorizationServerMetadata> {
	const response = await fetch(FIGMA_AUTH_METADATA_URL, {
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch Figma authorization metadata (${response.status} ${response.statusText})`);
	}

	return (await response.json()) as FigmaAuthorizationServerMetadata;
}

async function registerNanoPencilClient(
	redirectUri: string,
	metadata: FigmaAuthorizationServerMetadata,
): Promise<FigmaClientInformation | undefined> {
	if (!metadata.registration_endpoint) {
		return undefined;
	}

	const response = await fetch(metadata.registration_endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_name: FIGMA_CLIENT_NAME,
			redirect_uris: [redirectUri],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "client_secret_basic",
			client_uri: FIGMA_CLIENT_URI,
			client_metadata_url: FIGMA_CLIENT_METADATA_URL,
			scope: FIGMA_SCOPE,
		}),
	});

	if (!response.ok) {
		return undefined;
	}

	const json = (await response.json()) as {
		client_id?: string;
		client_secret?: string;
		token_endpoint_auth_method?: "client_secret_basic" | "client_secret_post" | "none";
	};

	if (!json.client_id) {
		return undefined;
	}

	return {
		clientId: json.client_id,
		clientSecret: json.client_secret,
		tokenEndpointAuthMethod: json.token_endpoint_auth_method || (json.client_secret ? "client_secret_basic" : "none"),
		source: "dynamic-registration",
	};
}

function parseAuthorizationInput(input: string): { code?: string; state?: string } {
	const value = input.trim();
	if (!value) return {};

	try {
		const url = new URL(value);
		return {
			code: url.searchParams.get("code") ?? undefined,
			state: url.searchParams.get("state") ?? undefined,
		};
	} catch {
		// not a URL
	}

	if (value.includes("code=")) {
		const params = new URLSearchParams(value);
		return {
			code: params.get("code") ?? undefined,
			state: params.get("state") ?? undefined,
		};
	}

	return { code: value };
}

async function startCallbackServer(signal?: AbortSignal): Promise<CallbackServerInfo> {
	let lastResult: { code: string; state: string } | null = null;
	let cancelled = false;

	for (const port of CALLBACK_PORT_CANDIDATES) {
		try {
			const server = await new Promise<Server>((resolve, reject) => {
				const created = createServer((req, res) => {
					try {
						const url = new URL(req.url || "", `http://${CALLBACK_HOST}:${port}`);
						if (url.pathname !== CALLBACK_PATH) {
							res.statusCode = 404;
							res.end("Not found");
							return;
						}

						const code = url.searchParams.get("code");
						const state = url.searchParams.get("state");
						const error = url.searchParams.get("error");

						if (code && state) {
							lastResult = { code, state };
							res.statusCode = 200;
							res.setHeader("Content-Type", "text/html; charset=utf-8");
							res.end(SUCCESS_HTML);
							return;
						}

						res.statusCode = 400;
						res.setHeader("Content-Type", "text/html; charset=utf-8");
						res.end(FAILURE_HTML + (error ? `\n<!-- ${error} -->` : ""));
					} catch {
						res.statusCode = 500;
						res.end("Internal error");
					}
				});

				created.once("error", reject);
				created.listen(port, CALLBACK_HOST, () => {
					created.removeListener("error", reject);
					resolve(created);
				});
			});

			signal?.addEventListener("abort", () => {
				cancelled = true;
				server.close();
			}, { once: true });

			return {
				server,
				redirectUri: `http://${CALLBACK_HOST}:${port}${CALLBACK_PATH}`,
				cancelWait: () => {
					cancelled = true;
				},
				waitForCode: async () => {
					const sleep = () => new Promise((resolve) => setTimeout(resolve, 100));
					for (let i = 0; i < 1800; i += 1) {
						if (lastResult) return lastResult;
						if (cancelled) return null;
						await sleep();
					}
					return null;
				},
			};
		} catch {
			// Try the next port.
		}
	}

	throw new Error("Failed to start a local OAuth callback server for Figma");
}

function buildAuthorizationUrl(
	client: FigmaClientInformation,
	redirectUri: string,
	state: string,
	challenge: string,
	scope: string,
	metadata: FigmaAuthorizationServerMetadata,
): string {
	const url = new URL(metadata.authorization_endpoint || FIGMA_AUTH_URL);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", client.clientId);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("scope", scope);
	url.searchParams.set("code_challenge", challenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);
	url.searchParams.set("resource", FIGMA_MCP_URL);
	return url.toString();
}

async function exchangeAuthorizationCode(
	code: string,
	verifier: string,
	redirectUri: string,
	client: FigmaClientInformation,
): Promise<FigmaOAuthCredentials> {
	const method = client.tokenEndpointAuthMethod ?? (client.clientSecret ? "client_secret_basic" : "none");
	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
		Accept: "application/json",
	};
	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		code_verifier: verifier,
		redirect_uri: redirectUri,
		resource: FIGMA_MCP_URL,
	});

	if (method === "client_secret_basic") {
		if (!client.clientSecret) {
			throw new Error("Figma OAuth client is missing client_secret for client_secret_basic");
		}
		headers.Authorization = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`, "utf8").toString("base64")}`;
	} else {
		body.set("client_id", client.clientId);
		if (method === "client_secret_post" && client.clientSecret) {
			body.set("client_secret", client.clientSecret);
		}
	}

	const response = await fetch(FIGMA_TOKEN_URL, {
		method: "POST",
		headers,
		body,
	});

	if (!response.ok) {
		const detail = await response.text().catch(() => "");
		throw new Error(`Figma authorization code exchange failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`);
	}

	const json = (await response.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
	};

	if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
		throw new Error("Figma OAuth token response did not include the expected fields");
	}

	return {
		access: json.access_token,
		refresh: json.refresh_token,
		expires: Date.now() + json.expires_in * 1000,
		clientId: client.clientId,
		clientSecret: client.clientSecret,
		tokenEndpointAuthMethod: method,
		scope: FIGMA_SCOPE,
		source: client.source || "nanopencil",
	};
}

async function loginWithStandaloneOAuth(callbacks: OAuthLoginCallbacks): Promise<FigmaOAuthCredentials> {
	callbacks.onProgress?.("Preparing a standalone Figma OAuth flow...");
	const metadata = await fetchAuthorizationServerMetadata();
	const callback = await startCallbackServer(callbacks.signal);

	try {
		const configuredClient = loadConfiguredClientInformation();
		const registeredClient =
			configuredClient || (await registerNanoPencilClient(callback.redirectUri, metadata));

		if (!registeredClient) {
			throw new Error(
				"NanoPencil could not complete Figma dynamic client registration. Set NANOPENCIL_FIGMA_CLIENT_ID and NANOPENCIL_FIGMA_CLIENT_SECRET, or keep using the import fallback for now.",
			);
		}

		const { verifier, challenge } = await generatePKCE();
		const state = createState();
		const scope = metadata.scopes_supported?.includes(FIGMA_SCOPE) ? FIGMA_SCOPE : FIGMA_SCOPE;
		const authorizationUrl = buildAuthorizationUrl(registeredClient, callback.redirectUri, state, challenge, scope, metadata);

		callbacks.onAuth({
			url: authorizationUrl,
			instructions: "A browser window should open. Approve Figma access to finish linking NanoPencil.",
		});
		openBrowser(authorizationUrl);

		let code: string | undefined;

		if (callbacks.onManualCodeInput) {
			let manualInput: string | undefined;
			let manualError: Error | undefined;
			const manualPromise = callbacks.onManualCodeInput()
				.then((input) => {
					manualInput = input;
					callback.cancelWait();
				})
				.catch((error) => {
					manualError = error instanceof Error ? error : new Error(String(error));
					callback.cancelWait();
				});

			const result = await callback.waitForCode();
			if (manualError) {
				throw manualError;
			}

			if (result?.code) {
				if (result.state !== state) {
					throw new Error("Figma OAuth state mismatch");
				}
				code = result.code;
			} else if (manualInput) {
				const parsed = parseAuthorizationInput(manualInput);
				if (parsed.state && parsed.state !== state) {
					throw new Error("Figma OAuth state mismatch");
				}
				code = parsed.code;
			}

			if (!code) {
				await manualPromise;
				if (manualError) {
					throw manualError;
				}
				if (manualInput) {
					const parsed = parseAuthorizationInput(manualInput);
					if (parsed.state && parsed.state !== state) {
						throw new Error("Figma OAuth state mismatch");
					}
					code = parsed.code;
				}
			}
		} else {
			const result = await callback.waitForCode();
			if (result?.state && result.state !== state) {
				throw new Error("Figma OAuth state mismatch");
			}
			code = result?.code;
		}

		if (!code) {
			throw new Error("Figma OAuth did not complete");
		}

		callbacks.onProgress?.("Finishing Figma authorization...");
		return await exchangeAuthorizationCode(code, verifier, callback.redirectUri, registeredClient);
	} finally {
		callback.server.close();
	}
}

async function loginFigma(callbacks: OAuthLoginCallbacks): Promise<FigmaOAuthCredentials> {
	try {
		return await loginWithStandaloneOAuth(callbacks);
	} catch (standaloneError) {
		callbacks.onProgress?.("Standalone Figma OAuth was unavailable. Checking for an importable official session...");

		const imported = loadClaudeFigmaCredentials();
		if (!imported) {
			throw standaloneError;
		}

		callbacks.onProgress?.(`Refreshing the imported Figma session from ${imported.source}...`);
		return await refreshFigmaOAuthCredentials(imported);
	}
}

const figmaOAuthProvider: OAuthProviderInterface = {
	id: "figma",
	name: "Figma MCP",
	usesCallbackServer: true,

	async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
		return await loginFigma(callbacks);
	},

	async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
		return await refreshFigmaOAuthCredentials(credentials as FigmaOAuthCredentials);
	},

	getApiKey(credentials: OAuthCredentials): string {
		return String(credentials.access ?? "");
	},
};

let registered = false;

export function registerFigmaMcpOAuthProvider(): void {
	if (registered) {
		return;
	}

	registerOAuthProvider(figmaOAuthProvider);
	registered = true;
}
