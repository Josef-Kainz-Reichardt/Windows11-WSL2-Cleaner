import { z } from 'zod'

const ResultLine = z.object({
  v: z.literal(1),
  check: z.string(),
  phase: z.literal('result'),
  bytes: z.number().nullable(),
  ok: z.boolean(),
  message: z.string().optional()
})

const LogLine = z.object({
  v: z.literal(1),
  check: z.string(),
  phase: z.literal('log'),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string()
})

const Line = z.union([ResultLine, LogLine])

export type ResultLineT = z.infer<typeof ResultLine>
export type LogLineT = z.infer<typeof LogLine>
export type ParsedLine = z.infer<typeof Line>

/**
 * Parses one line of a check script's stdout as our NDJSON envelope.
 * Returns null for anything that isn't valid JSON matching the schema —
 * callers must treat that as diagnostic noise, never as a hard error,
 * since stray tool banners on stdout must not abort parsing of later lines.
 */
export function parseNdjsonLine(raw: string): ParsedLine | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let obj: unknown
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return null
  }
  const parsed = Line.safeParse(obj)
  return parsed.success ? parsed.data : null
}

export function isResultLine(line: ParsedLine): line is ResultLineT {
  return line.phase === 'result'
}

export function isLogLine(line: ParsedLine): line is LogLineT {
  return line.phase === 'log'
}
