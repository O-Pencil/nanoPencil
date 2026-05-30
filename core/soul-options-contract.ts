/**
 * [WHO]: Provides SoulOptionsContract for runtime/session Soul enablement
 * [FROM]: No runtime dependencies; pure option contract
 * [TO]: Consumed by core/runtime/sdk.ts and core/soul-integration.ts
 * [HERE]: core/soul-options-contract.ts - contract seam that keeps Soul integration independent from SDK options
 */

export interface SoulOptionsContract {
  /** Enable Soul (AI personality evolution). Default: true */
  enableSoul?: boolean;
}
