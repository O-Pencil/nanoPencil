/**
 * [WHO]: DiscoveryCache - read/write/clear cached discovery results
 * [FROM]: Depends on node:fs, discovery types (DiscoveryResult)
 * [TO]: Consumed by core/model-registry.ts for persistence of discovery data
 * [HERE]: core/model/discovery-cache.ts - filesystem cache for remote model discovery
 *
 * Caches DiscoveryResult objects as JSON files in {agentDir}/.cache/discovery/.
 * Each provider gets its own file: {provider}.json
 * Supports TTL-based expiration (default 24h).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DiscoveryResult } from "./discovery.js";
import { DEFAULT_DISCOVERY_TTL_SECONDS } from "./discovery.js";

/**
 * Filesystem-backed cache for discovery results.
 *
 * Directory structure:
 * ```
 * {cacheDir}/
 * ├── dashscope-coding.json
 * ├── ollama.json
 * └── ali-token-plan-openai.json
 * ```
 *
 * Each file contains a serialized DiscoveryResult with TTL metadata.
 */
export class DiscoveryCache {
	constructor(private cacheDir: string) {}

	/**
	 * Get the filesystem path for a provider's cache file.
	 * Sanitizes provider name to avoid path traversal.
	 */
	private providerCachePath(provider: string): string {
		const safe = provider.replace(/[^a-zA-Z0-9_.-]/g, "_");
		return join(this.cacheDir, `${safe}.json`);
	}

	/**
	 * Read a cached discovery result.
	 * Returns undefined if:
	 * - The file doesn't exist
	 * - The file is corrupted (JSON parse error)
	 * - The result has expired (age > TTL)
	 *
	 * @param provider    Provider name
	 * @param ttlSeconds  Time-to-live in seconds (default: 24h)
	 */
	read(provider: string, ttlSeconds: number = DEFAULT_DISCOVERY_TTL_SECONDS): DiscoveryResult | undefined {
		const path = this.providerCachePath(provider);
		if (!existsSync(path)) return undefined;

		try {
			const raw = readFileSync(path, "utf-8");
			const result: DiscoveryResult = JSON.parse(raw);

			// Validate structure
			if (!result || typeof result !== "object" || !Array.isArray(result.models)) {
				return undefined;
			}

			// Check TTL
			const ageMs = Date.now() - result.fetchedAt;
			if (ageMs > ttlSeconds * 1000) return undefined;

			return result;
		} catch {
			return undefined;
		}
	}

	/**
	 * Write a discovery result to the cache.
	 * Creates the cache directory if it doesn't exist.
	 */
	write(result: DiscoveryResult): void {
		try {
			if (!existsSync(this.cacheDir)) {
				mkdirSync(this.cacheDir, { recursive: true });
			}
			const path = this.providerCachePath(result.provider);
			const tmp = path + ".tmp";
			writeFileSync(tmp, JSON.stringify(result, null, 2), "utf-8");
			renameSync(tmp, path);
		} catch {
			// Cache write failures are non-fatal
		}
	}

	/**
	 * Check if a cache entry exists and is fresh (without reading full content).
	 */
	isFresh(provider: string, ttlSeconds: number = DEFAULT_DISCOVERY_TTL_SECONDS): boolean {
		return this.read(provider, ttlSeconds) !== undefined;
	}

	/**
	 * Remove a single provider's cache file.
	 */
	remove(provider: string): void {
		const path = this.providerCachePath(provider);
		try {
			if (existsSync(path)) {
				rmSync(path);
			}
		} catch {
			// Non-fatal
		}
	}

	/**
	 * Clear all cached discovery data by removing the cache directory.
	 */
	clear(): void {
		try {
			if (existsSync(this.cacheDir)) {
				rmSync(this.cacheDir, { recursive: true, force: true });
			}
		} catch {
			// Non-fatal
		}
	}

	/**
	 * List all provider names that have cached data (fresh or stale).
	 */
	listProviders(): string[] {
		if (!existsSync(this.cacheDir)) return [];

		try {
			const entries = readdirSync(this.cacheDir);
			return entries
				.filter((name) => name.endsWith(".json"))
				.map((name) => name.replace(/\.json$/, ""));
		} catch {
			return [];
		}
	}
}
