/**
 * Canonical serialization + SHA-256 input hash for engine inputs
 * (specification.md Task 13).
 *
 * Deliberately lives OUTSIDE `forecast/engine/`: `crypto` is not an allowed
 * import inside the engine folder (engine's only allowed import is
 * decimal.js). This module converts BigInt values to strings (JSON has no
 * BigInt support) before a stable, sorted-key stringify, so the hash is
 * stable across process restarts and key-order permutations of logically
 * identical inputs.
 */
import { createHash } from 'crypto';
import type { EngineInputs } from './engine';

function sortKeysDeep(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return `bigint:${value.toString()}`;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalizeInputs(inputs: EngineInputs): string {
  return JSON.stringify(sortKeysDeep(inputs));
}

export function canonicalInputHash(inputs: EngineInputs): string {
  return createHash('sha256').update(canonicalizeInputs(inputs)).digest('hex');
}
