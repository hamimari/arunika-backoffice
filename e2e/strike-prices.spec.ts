import { test, expect, type Page } from '@playwright/test'
import { API, adminLogin, adminToken, pickOption, row } from './helpers'

// Types a promo end date into the open form's "Periode promo" range picker.
async function setPromoEnd(scope: Page | ReturnType<Page['getByTestId']>, daysFromNow: number) {
  const end = new Date(Date.now() + daysFromNow * 24 * 3600 * 1000)
  const text = `${String(end.getDate()).padStart(2, '0')} ${end.toLocaleString('en-US', { month: 'short' })} ${end.getFullYear()} 23:00`
  const input = scope.getByPlaceholder('Berakhir')
  await input.click()
  await input.fill(text)
  await input.press('Enter')
}

test.describe('strike prices (harga coret)', () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page)
  })

  test('global rule → saved and shown as active', async ({ page, request }) => {
    const token = await adminToken(request)
    const headers = { Authorization: `Bearer ${token}` }

    await page.goto('/strike-prices')
    const card = page.getByTestId('strike-rule-DONGENG')
    await card.getByLabel('Mode').click()
    await page.locator('.ant-select-item-option').filter({ hasText: 'Persen' }).first().click()
    await card.getByLabel('Diskon (%)').fill('20')
    await setPromoEnd(card, 10)
    await expect(card.getByTestId('strike-preview')).toContainText('Rp 49.000')
    await card.getByRole('button', { name: 'Save' }).click()
    await expect(card.getByText('Aktif', { exact: true })).toBeVisible()

    const rules = await (await request.get(`${API}/admin/strike-price-rules`, { headers })).json()
    const dongeng = (rules.data as { scope: string; mode: string; value: number; status: string }[])
      .find((r) => r.scope === 'DONGENG')
    expect(dongeng).toMatchObject({ mode: 'PERCENT', value: 20, status: 'ACTIVE' })

    // Shared database: turn the promo back off for the other specs.
    const off = await request.put(`${API}/admin/strike-price-rules/DONGENG`, {
      headers,
      data: { mode: 'NONE', value: 0, starts_at: null, ends_at: null },
    })
    expect(off.ok()).toBeTruthy()
  })

  test('package override → public package list shows the strike price', async ({ page, request }) => {
    await page.goto('/packages')
    const firstRow = page.getByRole('row').nth(1)
    const name = (await firstRow.getByRole('cell').first().innerText()).trim()
    await firstRow.getByRole('button', { name: 'Edit' }).click()

    const dialog = page.getByRole('dialog')
    await pickOption(page, 'Harga coret', 'Nominal')
    await dialog.getByLabel('Tambahan nominal (Rp)').fill('10000')
    await setPromoEnd(dialog, 7)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect(row(page, name)).toContainText('Own promo')

    const packs = await (await request.get(`${API}/premium/packs`)).json()
    const pack = (packs.data as { name: string; price_idr: number; strike_price_idr: number | null }[])
      .find((p) => p.name === name)
    expect(pack?.strike_price_idr).toBe((pack?.price_idr ?? 0) + 10000)

    // Restore: back to the global rule.
    await row(page, name).getByRole('button', { name: 'Edit' }).click()
    await pickOption(page, 'Harga coret', 'Ikuti global')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(row(page, name)).toContainText('Global')
  })
})
