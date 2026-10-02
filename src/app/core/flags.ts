/** Flag selectors for `Command.setFlags` and the lazy flags of `DataSpace`. */
export const Flag = { CF: 1, OF: 2, SF: 4, ZF: 8, PF: 16, AF: 32 } as const;

/** 1 where a byte has an even number of set bits (PF). */
export const EVEN_PARITY = Uint8Array.from({ length: 256 }, (_, v) => {
  let ones = 0;
  for (let i = 0; i < 8; i++) ones += (v >> i) & 1;
  return ones % 2 === 0 ? 1 : 0;
});
