/**
 * [INPUT]: MemoryEntry/WorkEntry, config weights
 * [OUTPUT]: utility score for eviction ordering
 * [POS]: Implements Utility-Weighted Memory eviction (Ebbinghaus-aligned)
 *
 * Formula: Utility = (w_freq * AccessFrequency + w_impact * BaseImpact) * e^(-lambda * Age)
 * Uses per-entry adaptive strength for the decay component.
 */

import { daysSince, decay } from "./scoring.js";
import type { MemoryEntry, WorkEntry } from "./types.js";

export interface EvictionWeights {
	accessFrequency: number;
	baseImpact: number;
}

export function utilityEntry(e: MemoryEntry, defaultHalfLife: Record<string, number>, w: EvictionWeights): number {
	const strength = e.strength || defaultHalfLife[e.type] || 30;
	const accessNorm = Math.min(1, (e.accessCount ?? 0) / 10);
	const impactNorm = Math.min(1, e.importance / 10);
	return (w.accessFrequency * accessNorm + w.baseImpact * impactNorm) * decay(daysSince(e.created), strength);
}

export function utilityWork(w: WorkEntry, defaultHalfLife: Record<string, number>, ew: EvictionWeights): number {
	const strength = w.strength || defaultHalfLife.work || 45;
	const accessNorm = Math.min(1, (w.accessCount ?? 0) / 10);
	const impactNorm = Math.min(1, w.importance / 10);
	return (ew.accessFrequency * accessNorm + ew.baseImpact * impactNorm) * decay(daysSince(w.created), strength);
}
