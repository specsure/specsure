import { beforeEach, describe, expect, it } from 'vitest'
import { handTo, takeHandover } from '../src/lib/handover'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage
})

describe('handover from Token Diff to Token Fix', () => {
  it('puts a package into the address, and the code into the tab, read once', () => {
    const code = { kind: 'files' as const, files: [{ path: 'a.css', text: '.a{color:#fff}' }] }
    const r = handTo('/tools/fix', {
      source: { kind: 'npm', pkg: '@scope/tokens', version: '2.0.0' },
      include: '',
      code,
    })
    expect(r).toEqual({ href: '/tools/fix?pkg=@scope/tokens&v=2.0.0&handover', saved: true })
    expect(takeHandover()?.code).toEqual(code)
    expect(takeHandover()).toBeUndefined()
  })

  it('needs no storage for a package alone, and falls back to the address when storage is full', () => {
    expect(
      handTo('/tools/fix', { source: { kind: 'npm', pkg: 'x', version: '1.0.0' }, include: '' }),
    ).toEqual({
      href: '/tools/fix?pkg=x&v=1.0.0',
      saved: false,
    })
    globalThis.sessionStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    const files = { kind: 'files' as const, files: [{ path: 't.css', text: ':root{}' }] }
    expect(handTo('/tools/fix', { source: files, include: '' }).saved).toBe(false)
  })
})
