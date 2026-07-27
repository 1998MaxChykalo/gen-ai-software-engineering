import { allocateFreeCashFlow } from '../../../src/modules/forecast/engine/allocation';

describe('allocateFreeCashFlow', () => {
  it('returns zero allocations and reports the deficit when cash flow is negative', () => {
    const result = allocateFreeCashFlow(-5000n as never, [
      { id: 'g1', priority: 1, remainingNeedMinor: 10000n as never, explicitDueMinor: 0n as never },
    ]);
    expect(result.allocations).toEqual({});
    expect(result.leftoverMinor).toBe(0n);
    expect(result.deficitMinor).toBe(5000n);
  });

  it('returns zero allocations when cash flow is exactly zero', () => {
    const result = allocateFreeCashFlow(0n as never, [
      { id: 'g1', priority: 1, remainingNeedMinor: 10000n as never, explicitDueMinor: 0n as never },
    ]);
    expect(result.allocations).toEqual({});
    expect(result.deficitMinor).toBe(0n);
  });

  it('funds the higher-priority goal fully before any lower-priority allocation', () => {
    const result = allocateFreeCashFlow(1000n as never, [
      { id: 'low', priority: 2, remainingNeedMinor: 10000n as never, explicitDueMinor: 0n as never },
      { id: 'high', priority: 1, remainingNeedMinor: 500n as never, explicitDueMinor: 0n as never },
    ]);
    expect(result.allocations.high).toBe(500n);
    expect(result.allocations.low).toBe(500n);
  });

  it('honors explicit contributions before priority-based leftover allocation', () => {
    const result = allocateFreeCashFlow(1000n as never, [
      { id: 'explicit-low-priority', priority: 5, remainingNeedMinor: 300n as never, explicitDueMinor: 300n as never },
      { id: 'implicit-high-priority', priority: 1, remainingNeedMinor: 10000n as never, explicitDueMinor: 0n as never },
    ]);
    expect(result.allocations['explicit-low-priority']).toBe(300n);
    expect(result.allocations['implicit-high-priority']).toBe(700n);
  });

  it('sums allocations + leftover exactly to the free cash flow (no leaked or created cents)', () => {
    const freeCashFlow = 12345n;
    const result = allocateFreeCashFlow(freeCashFlow as never, [
      { id: 'a', priority: 1, remainingNeedMinor: 5000n as never, explicitDueMinor: 0n as never },
      { id: 'b', priority: 2, remainingNeedMinor: 5000n as never, explicitDueMinor: 0n as never },
      { id: 'c', priority: 3, remainingNeedMinor: 5000n as never, explicitDueMinor: 0n as never },
    ]);
    const totalAllocated = Object.values(result.allocations).reduce((acc, v) => acc + v, 0n);
    expect(totalAllocated + result.leftoverMinor).toBe(freeCashFlow);
  });

  it('never allocates more than a goal needs', () => {
    const result = allocateFreeCashFlow(100000n as never, [
      { id: 'a', priority: 1, remainingNeedMinor: 250n as never, explicitDueMinor: 0n as never },
    ]);
    expect(result.allocations.a).toBe(250n);
    expect(result.leftoverMinor).toBe(99750n);
  });
});
