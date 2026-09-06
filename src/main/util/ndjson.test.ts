import { describe, it, expect } from 'vitest'
import { parseNdjsonLine, isResultLine, isLogLine } from './ndjson'

describe('parseNdjsonLine', () => {
  it('parses a valid result line', () => {
    const line = parseNdjsonLine('{"v":1,"check":"wsl-cache-npm","phase":"result","bytes":12345,"ok":true}')
    expect(line).not.toBeNull()
    expect(line && isResultLine(line)).toBe(true)
    if (line && isResultLine(line)) {
      expect(line.bytes).toBe(12345)
      expect(line.ok).toBe(true)
    }
  })

  it('parses a null bytes value (not estimable checks like fstrim/DISM)', () => {
    const line = parseNdjsonLine('{"v":1,"check":"wsl-fstrim","phase":"result","bytes":null,"ok":true}')
    expect(line).not.toBeNull()
    if (line && isResultLine(line)) {
      expect(line.bytes).toBeNull()
    }
  })

  it('parses a log line', () => {
    const line = parseNdjsonLine('{"v":1,"check":"wsl-docker-prune","phase":"log","level":"warn","message":"daemon slow to respond"}')
    expect(line).not.toBeNull()
    expect(line && isLogLine(line)).toBe(true)
  })

  it('tolerates stray non-JSON stdout noise instead of throwing', () => {
    expect(parseNdjsonLine('Reading package lists... Done')).toBeNull()
    expect(parseNdjsonLine('')).toBeNull()
    expect(parseNdjsonLine('   ')).toBeNull()
  })

  it('rejects JSON that does not match the envelope schema', () => {
    expect(parseNdjsonLine('{"foo":"bar"}')).toBeNull()
    expect(parseNdjsonLine('{"v":2,"check":"x","phase":"result","bytes":1,"ok":true}')).toBeNull()
  })
})
