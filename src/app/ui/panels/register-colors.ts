/**
 * Highlight colors of the registers that point into memory (spec 02 §7.2,
 * `JasDocument.getRegisterColor`), as theme tokens. ESP, EBP and EIP have none.
 */
export const REGISTER_COLORS: Readonly<Record<string, string>> = {
  EAX: 'var(--reg-eax)',
  EBX: 'var(--reg-ebx)',
  ECX: 'var(--reg-ecx)',
  EDX: 'var(--reg-edx)',
  ESI: 'var(--reg-esi)',
  EDI: 'var(--reg-edi)',
};

/** The highlight color of a 32-bit register, or null. */
export function registerColor(name: string): string | null {
  return REGISTER_COLORS[name] ?? null;
}
