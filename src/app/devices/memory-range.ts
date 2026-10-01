import { Address, DataSpace, Op } from '../core';

/** Reads one byte; addresses outside memory read as 0 (spec 06 §4). */
export type ByteReader = (address: number) => number;

/** A byte reader over the machine's memory that never raises the out-of-range flag. */
export function memoryReader(dsp: DataSpace): ByteReader {
  const { memory, offset, memorySize } = dsp;
  const end = offset + memorySize;
  return (address) => (address >= offset && address < end ? memory.get(address) : 0);
}

/** Reads `count` bytes starting at `address`. */
export function readBytes(read: ByteReader, address: number, count: number): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < count; i++) bytes.push(read(address + i));
  return bytes;
}

/**
 * Flips bit `bit` (counted from bit 0 of the byte at `address`) of the `count`
 * watched bytes: a read-modify-write of the whole range, like `PolygonObject.invertBit`.
 * Bytes outside memory are left alone. Returns false if the bit's byte is outside memory.
 */
export function toggleMemoryBit(
  dsp: DataSpace,
  address: number,
  count: number,
  bit: number,
): boolean {
  const target = address + Math.floor(bit / 8);
  const end = dsp.offset + dsp.memorySize;
  if (target < dsp.offset || target >= end) return false;
  const inRange = address >= dsp.offset && address + count <= end;
  const start = inRange ? address : target;
  const size = inRange ? count : 1;
  const shift = BigInt(bit - (start - address) * 8);
  const value = dsp.getUnsignedMemory(start, size) ^ (1n << shift);
  dsp.put(value, new Address(Op.MEM, size, start), null);
  return true;
}
