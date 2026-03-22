/**
 * API Key Guidance for MCP Tools
 *
 * Provides user-friendly instructions for obtaining API keys for various MCP servers.
 */

export interface APIKeyGuidance {
	/** Server ID */
	serverId: string;
	/** Server name */
	serverName: string;
	/** Whether key is required */
	required: boolean;
	/** API key environment variable name */
	envVar: string;
	/** User-friendly instructions */
	instructions: string;
	/** URL to get the key */
	getKeyUrl?: string;
	/** Free tier information */
	freeTier?: string;
	/** Alternative (skip key) */
	alternative?: string;
}

/**
 * Guidance for MCP servers that require API keys
 */
export const API_KEY_GUIDANCE: Record<string, APIKeyGuidance> = {
	github: {
		serverId: "github",
		serverName: "GitHub",
		required: false,
		envVar: "GITHUB_TOKEN",
		instructions: `GitHub Token 用于访问 GitHub 仓库、issues 和 PRs。

**获取步骤:**
1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token" (classic)
3. 勾选权限:
   - ✅ repo (Full control of private repositories)
   - ✅ public_repo (Access public repositories)
4. 点击 "Generate token"
5. 复制 token (格式: ghp_xxxxxxxxxxxxxxxxxxxx)
6. 在 mcp.json 中配置:
   {
     "id": "github",
     "enabled": true,
     "env": {
       "GITHUB_TOKEN": "你的token"
     }
   }`,
		getKeyUrl: "https://github.com/settings/tokens",
		freeTier: "✅ 完全免费",
		alternative: "不使用 token 仍可访问公开仓库",
	},

	"brave-search": {
		serverId: "brave-search",
		serverName: "Brave Search",
		required: false,
		envVar: "BRAVE_API_KEY",
		instructions: `Brave Search API Key 用于网页搜索功能。

**获取步骤:**
1. 访问 https://api.search.brave.com/app/keys
2. 注册账号（或登录）
3. 点击 "Create API Key"
4. 复制 API Key (格式: BSxxxxx)
5. 在 mcp.json 中配置:
   {
     "id": "brave-search",
     "enabled": true,
     "env": {
       "BRAVE_API_KEY": "你的API key"
     }
   }`,
		getKeyUrl: "https://api.search.brave.com/app/keys",
		freeTier: "✅ 免费额度: 每月 2000 次查询",
		alternative: "不使用搜索功能，仍可使用其他工具",
	},

	postgres: {
		serverId: "postgres",
		serverName: "PostgreSQL",
		required: false,
		envVar: "POSTGRES_CONNECTION_STRING",
		instructions: `PostgreSQL 连接字符串用于连接本地数据库。

**配置步骤:**
1. 确保已安装 PostgreSQL
2. 准备连接字符串，格式:
   postgresql://user:password@localhost:5432/dbname
3. 在 mcp.json 中配置:
   {
     "id": "postgres",
     "enabled": true,
     "env": {
       "POSTGRES_CONNECTION_STRING": "你的连接字符串"
     }
   }`,
		freeTier: "✅ 完全免费 (本地数据库)",
		alternative: "使用 SQLite (默认启用)",
	},
};

/**
 * Get guidance for a specific server
 */
export function getAPIKeyGuidance(serverId: string): APIKeyGuidance | undefined {
	return API_KEY_GUIDANCE[serverId];
}

/**
 * Check if a server requires an API key
 */
export function requiresAPIKey(serverId: string): boolean {
	const guidance = API_KEY_GUIDANCE[serverId];
	return guidance ? guidance.required : false;
}

/**
 * Get list of servers that require API keys
 */
export function getRequiringAPIKeyServers(): string[] {
	return Object.values(API_KEY_GUIDANCE)
		.filter((g) => g.required)
		.map((g) => g.serverId);
}

/**
 * Get list of servers with optional API keys
 */
export function getOptionalAPIKeyServers(): string[] {
	return Object.values(API_KEY_GUIDANCE)
		.filter((g) => !g.required)
		.map((g) => g.serverId);
}

/**
 * Format guidance as a user-friendly message
 */
export function formatGuidanceMessage(guidance: APIKeyGuidance, missingKey: boolean = true): string {
	const prefix = missingKey ? "⚠️  " : "ℹ️  ";
	const keyStatus = missingKey ? "未配置 API Key" : "API Key 配置";

	let message = `${prefix}${guidance.serverName} - ${keyStatus}\n\n`;
	message += `${guidance.instructions}\n`;

	if (guidance.getKeyUrl) {
		message += `\n🔗 获取 API Key: ${guidance.getKeyUrl}\n`;
	}

	if (guidance.freeTier) {
		message += `\n💰 ${guidance.freeTier}\n`;
	}

	if (guidance.alternative) {
		message += `\n💡 ${guidance.alternative}\n`;
	}

	return message;
}

/**
 * Get all servers that are configured but missing keys
 */
export function getMissingKeyServers(configuredServers: string[]): string[] {
	const optionalServers = getOptionalAPIKeyServers();
	const missing: string[] = [];

	for (const serverId of configuredServers) {
		if (optionalServers.includes(serverId)) {
			// Check if server has the required env var set
			const guidance = getAPIKeyGuidance(serverId);
			if (guidance && guidance.envVar) {
				// Check if env var is set (simplified check)
				// In production, would check the actual value
				const envValue = process.env[guidance.envVar];
				if (!envValue || envValue.trim() === "" || envValue === "YOUR_TOKEN") {
					missing.push(serverId);
				}
			}
		}
	}

	return missing;
}
