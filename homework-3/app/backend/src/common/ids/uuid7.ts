/**
 * App-generated UUIDv7 (specification.md §5.6: "IDs are UUIDv7 everywhere").
 *
 * DEVIATION (approved): the schema stores IDs as plain strings (SQLite has
 * no native uuid type), so UUIDs are generated here in application code
 * rather than by the database. Layout per draft-ietf-uuidv7:
 *   48 bits  unix_ts_ms
 *    4 bits  version (0111)
 *   12 bits  rand_a
 *    2 bits  variant (10)
 *   62 bits  rand_b
 * This keeps IDs time-sortable (index-friendly) while remaining globally
 * unique via the random bits.
 */
import { randomBytes } from 'crypto';

export function uuid7(): string {
  const timestamp = BigInt(Date.now());
  const bytes = Buffer.alloc(16);

  // 48-bit big-endian timestamp (ms).
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  const rand = randomBytes(10);
  rand.copy(bytes, 6);

  // Version 7 in the high nibble of byte 6.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variant 10xxxxxx in byte 8.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
