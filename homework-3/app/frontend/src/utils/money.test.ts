import { describe, expect, it } from "vitest";
import { formatEurMinor, MoneyParseError, parseEurToMinor } from "./money";

describe("parseEurToMinor", () => {
  it("parses a dot-decimal string", () => {
    expect(parseEurToMinor("1234.56")).toBe(123456);
  });

  it("parses a German thousands+decimal string", () => {
    expect(parseEurToMinor("1.234,56")).toBe(123456);
  });

  it("parses a plain integer string as whole euros", () => {
    expect(parseEurToMinor("1234")).toBe(123400);
  });

  it("parses a comma-decimal string without thousands separator", () => {
    expect(parseEurToMinor("1234,56")).toBe(123456);
  });

  it("parses negative amounts", () => {
    expect(parseEurToMinor("-1234.56")).toBe(-123456);
    expect(parseEurToMinor("-1.234,56")).toBe(-123456);
  });

  it("parses zero", () => {
    expect(parseEurToMinor("0")).toBe(0);
    expect(parseEurToMinor("0.00")).toBe(0);
  });

  it("pads a single fraction digit", () => {
    expect(parseEurToMinor("1234.5")).toBe(123450);
    expect(parseEurToMinor("1234,5")).toBe(123450);
  });

  it("handles a leading '+' sign", () => {
    expect(parseEurToMinor("+123.45")).toBe(12345);
  });

  it("handles amounts without a leading zero", () => {
    expect(parseEurToMinor(".50")).toBe(50);
    expect(parseEurToMinor(",50")).toBe(50);
  });

  it("rejects garbage input", () => {
    expect(() => parseEurToMinor("abc")).toThrow(MoneyParseError);
    expect(() => parseEurToMinor("12a34")).toThrow(MoneyParseError);
    expect(() => parseEurToMinor("")).toThrow(MoneyParseError);
    expect(() => parseEurToMinor("   ")).toThrow(MoneyParseError);
  });

  it("rejects more than two fraction digits", () => {
    expect(() => parseEurToMinor("1234.567")).toThrow(MoneyParseError);
  });

  it("rejects malformed separators", () => {
    expect(() => parseEurToMinor("1,234,56")).toThrow(MoneyParseError);
    expect(() => parseEurToMinor("1..234")).toThrow(MoneyParseError);
    expect(() => parseEurToMinor("1.234.56.78")).toThrow(MoneyParseError);
  });

  it("round-trips through the formatter", () => {
    const cases = ["1234.56", "0.01", "-9999.99", "42"];
    for (const raw of cases) {
      const minor = parseEurToMinor(raw);
      const formatted = formatEurMinor(minor);
      expect(parseEurToMinor(formatted.replace(/[^\d,.-]/g, ""))).toBe(minor);
    }
  });
});

// de-DE Intl currency formatting uses a non-breaking space (U+00A0) before the
// currency symbol, not a regular space.
const NBSP = " ";

describe("formatEurMinor", () => {
  it("formats a positive amount in de-DE style", () => {
    expect(formatEurMinor(123456)).toBe(`1.234,56${NBSP}€`);
  });

  it("formats zero", () => {
    expect(formatEurMinor(0)).toBe(`0,00${NBSP}€`);
  });

  it("formats a negative amount", () => {
    expect(formatEurMinor(-123456)).toBe(`-1.234,56${NBSP}€`);
  });

  it("formats small cent-only amounts", () => {
    expect(formatEurMinor(5)).toBe(`0,05${NBSP}€`);
    expect(formatEurMinor(-5)).toBe(`-0,05${NBSP}€`);
  });

  it("throws for non-integer input", () => {
    expect(() => formatEurMinor(1.5)).toThrow(MoneyParseError);
  });
});
