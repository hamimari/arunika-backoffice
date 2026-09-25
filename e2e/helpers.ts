import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const API = process.env.E2E_API_URL ?? 'http://localhost:8090'
export const ADMIN_EMAIL = 'admin@arunika.id'
export const ADMIN_PASSWORD = 'admin123'

// Unique per run so specs never collide with seeded rows or each other.
export const uniq = (prefix: string) => `${prefix} ${Date.now().toString(36)}`

export async function adminLogin(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('admin@arunika.id').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('••••••••').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Arunika Admin' })).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/login/)
}

export async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/admin/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).access_token as string
}

// Picks an option from the antd Select whose form label is `label`.
export async function pickOption(page: Page, label: string, optionTitle: string | RegExp) {
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(label, { exact: true }).click()
  const option = page.locator('.ant-select-item-option').filter({ hasText: optionTitle })
  await option.first().click()
}

export function row(page: Page, text: string) {
  return page.getByRole('row').filter({ hasText: text })
}
