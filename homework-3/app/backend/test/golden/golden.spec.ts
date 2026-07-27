import { runGoldenFixture } from './golden-harness';

const PERSONAS = ['broke-student', 'median-family', 'fire-aspirant', 'retiree'];

describe('golden persona fixtures', () => {
  it.each(PERSONAS)('%s matches its committed expected snapshot byte-for-byte', (persona) => {
    const { actual, expected, expectedPath } = runGoldenFixture(persona);
    expect(actual).toEqual(expected);
    void expectedPath;
  });

  it('broke-student has a negative-cash-flow unreachable goal', () => {
    const { actual } = runGoldenFixture('broke-student') as {
      actual: { goalOutcomes: { status: string }[] };
    };
    expect(actual.goalOutcomes[0].status).toBe('unreachable');
  });

  it('runs twice with byte-identical results (determinism at the golden-fixture level)', () => {
    const first = runGoldenFixture('median-family');
    const second = runGoldenFixture('median-family');
    expect(first.actual).toEqual(second.actual);
  });
});
