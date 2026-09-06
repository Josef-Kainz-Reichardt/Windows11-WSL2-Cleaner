let secrets: string[] = []

/** Registers a runtime secret (e.g. the decrypted sudo password) for redaction. */
export function registerSecret(value: string): void {
  if (value && !secrets.includes(value)) {
    secrets = [...secrets, value]
  }
}

export function clearSecrets(): void {
  secrets = []
}

/** Strips every registered secret from a string before it is logged or displayed. */
export function redact(input: string): string {
  let out = input
  for (const s of secrets) {
    if (!s) continue
    out = out.split(s).join('[REDACTED]')
  }
  return out
}
