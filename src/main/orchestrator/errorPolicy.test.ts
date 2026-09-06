import { describe, it, expect } from 'vitest'
import { isRancherDependentCheckId, looksLikeSudoAuthFailure } from './errorPolicy'

describe('isRancherDependentCheckId', () => {
  it('flags docker-prune and vhdx-rancher-* checks', () => {
    expect(isRancherDependentCheckId('wsl-docker-prune')).toBe(true)
    expect(isRancherDependentCheckId('vhdx-rancher-distro-data')).toBe(true)
    expect(isRancherDependentCheckId('vhdx-rancher-distro')).toBe(true)
  })

  it('does not flag unrelated or non-Rancher VHDX checks', () => {
    expect(isRancherDependentCheckId('vhdx-ubuntu-store')).toBe(false)
    expect(isRancherDependentCheckId('wsl-cache-npm')).toBe(false)
  })
})

describe('looksLikeSudoAuthFailure', () => {
  it('matches the exact message emitted by require_sudo in cleaner.sh', () => {
    expect(looksLikeSudoAuthFailure('sudo authentication failed')).toBe(true)
  })

  it('does not match unrelated errors, including ones that merely mention sudo', () => {
    expect(looksLikeSudoAuthFailure(undefined)).toBe(false)
    expect(looksLikeSudoAuthFailure('check produced no result (exit code 1)')).toBe(false)
    expect(looksLikeSudoAuthFailure('sudo: command not found')).toBe(false)
  })
})
