/**
 * Public surface of the forecast engine. Modules outside `forecast/engine/`
 * must import only through this barrel — never reach into engine internals
 * directly — so the engine's dependency direction stays enforceable.
 */
export * from './money';
export * from './types';
export * from './month-math';
export * from './allocation';
export * from './month-step';
export * from './goal-solver';
export * from './net-worth';

export const ENGINE_VERSION = '1.0.0';
export const MAX_HORIZON_MONTHS = 720;
export const DEFAULT_HORIZON_MONTHS = 480;
