/**
 * [WHO]: APIKeyGuidance, getAPIKeyGuidance(), formatGuidanceMessage()
 * [FROM]: No external dependencies
 * [TO]: Consumed by core/mcp/index.ts, core/mcp/mcp-adapter.ts
 * [HERE]: core/mcp/mcp-guidance.ts - API key guidance for MCP servers
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
		instructions: `GitHub Token is used to access GitHub repositories, issues, and PRs.

**Steps to obtain:**
1. Visit https://github.com/settings/tokens
2. Click "Generate new token" (classic)
3. Select permissions:
   - repo (Full control of private repositories)
   - public_repo (Access public repositories)
4. Click "Generate token"
5. Copy the token (format: ghp_xxxxxxxxxxxxxxxxxxxx)
6. Configure in mcp.json:
   {
     "id": "github",
     "enabled": true,
     "env": {
       "GITHUB_TOKEN": "your_token"
     }
   }`,
		getKeyUrl: "https://github.com/settings/tokens",
		freeTier: "Free",
		alternative: "Public repositories can still be accessed without a token",
	},

	"brave-search": {
		serverId: "brave-search",
		serverName: "Brave Search",
		required: false,
		envVar: "BRAVE_API_KEY",
		instructions: `Brave Search API Key is used for web search functionality.

**Steps to obtain:**
1. Visit https://api.search.brave.com/app/keys
2. Sign up (or log in)
3. Click "Create API Key"
4. Copy the API Key (format: BSxxxxx)
5. Configure in mcp.json:
   {
     "id": "brave-search",
     "enabled": true,
     "env": {
       "BRAVE_API_KEY": "your_api_key"
     }
   }`,
		getKeyUrl: "https://api.search.brave.com/app/keys",
		freeTier: "Free tier: 2000 queries per month",
		alternative: "Without search, other tools remain available",
	},

	postgres: {
		serverId: "postgres",
		serverName: "PostgreSQL",
		required: false,
		envVar: "POSTGRES_CONNECTION_STRING",
		instructions: `PostgreSQL connection string is used to connect to a local database.

**Configuration steps:**
1. Ensure PostgreSQL is installed
2. Prepare the connection string in format:
   postgresql://user:password@localhost:5432/dbname
3. Configure in mcp.json:
   {
     "id": "postgres",
     "enabled": true,
     "env": {
       "POSTGRES_CONNECTION_STRING": "your_connection_string"
     }
   }`,
		freeTier: "Free (local database)",
		alternative: "Use SQLite (enabled by default)",
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
	const keyStatus = missingKey ? "API Key not configured" : "API Key configured";

	let message = `${prefix}${guidance.serverName} - ${keyStatus}\n\n`;
	message += `${guidance.instructions}\n`;

	if (guidance.getKeyUrl) {
		message += `\n🔗 Get API Key: ${guidance.getKeyUrl}\n`;
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
