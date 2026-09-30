import { test as base, expect } from '@playwright/test'

// Every spec imports `test` from here so each one also asserts the page ran
// without Content-Security-Policy violations: nginx.conf serves a strict CSP,
// and a blocked script, style or request would otherwise fail silently.
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) {
          violations.push(msg.text())
        }
      })
      await use()
      expect(violations, 'CSP violations').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
