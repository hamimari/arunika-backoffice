import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './fixtures'
import { API, adminLogin, row } from './helpers'

// Seeded by the backend's test seed: a paid AR card and its Play-mapped product.
const PAID_AR_CARD_ID = 'e2e0ac00-0000-0000-0000-000000000004'
const PAID_PRODUCT_ID = 'e2e0ac00-0000-0000-0000-0000000000a4'

// Buys the paid card through Google Play as a fresh user. The held stack's
// fake Google accepts any "e2e-hold-" purchase token (see hold_test.go).
async function buyCardOnPlay(request: APIRequestContext) {
  const suffix = Date.now().toString()
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      name: 'Refund E2E',
      phone_number: `0813${suffix.slice(-8)}`,
      email_address: `refund-e2e-${suffix}@example.test`,
      address: 'Jl. E2E',
      city: 'Jakarta',
      password: 'secret123',
      child: [{ name: 'Ani', gender: 'F', date_of_birth: '2021-03-04T00:00:00.000' }],
    },
  })
  expect(signup.ok(), await signup.text()).toBeTruthy()
  const userToken = (await signup.json()).data.token as string
  const auth = { Authorization: `Bearer ${userToken}` }

  const created = await request.post(`${API}/payment/play/create-product`, {
    headers: auth,
    data: { product_id: PAID_PRODUCT_ID },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const orderId = (await created.json()).data.order_id as string

  const verified = await request.post(`${API}/payment/play/verify`, {
    headers: auth,
    data: { order_id: orderId, product_id: PAID_PRODUCT_ID, purchase_token: `e2e-hold-${suffix}` },
  })
  expect(verified.ok(), await verified.text()).toBeTruthy()
  return { orderId, userToken }
}

async function cardUnlocked(request: APIRequestContext, userToken: string) {
  const res = await request.get(`${API}/ar/cards`, { headers: { Authorization: `Bearer ${userToken}` } })
  const cards = (await res.json()).data as { id: string; is_unlocked: boolean }[]
  return cards.find((c) => c.id === PAID_AR_CARD_ID)?.is_unlocked
}

test('admin refunds a Google Play order → access removed, refund on record', async ({ page, request }) => {
  const { orderId, userToken } = await buyCardOnPlay(request)
  expect(await cardUnlocked(request, userToken)).toBe(true)

  await adminLogin(page)
  await page.goto('/orders')
  await page.getByPlaceholder(/Search by name/).fill(orderId)
  await page.getByPlaceholder(/Search by name/).press('Enter')
  const orderRow = row(page, 'Refund E2E')
  await expect(orderRow).toContainText('PAID')

  await orderRow.getByRole('button', { name: /Refund$/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Refund reason').fill('Pengguna salah beli kartu (E2E)')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Refund' }).click()
  await expect(dialog).toBeHidden()

  await expect(orderRow).toContainText('REFUNDED')
  await expect.poll(() => cardUnlocked(request, userToken)).toBe(false)

  await orderRow.getByRole('button', { name: 'Refunds (1)' }).click()
  const record = page.getByTestId('refund-record')
  await expect(record).toContainText('SUCCEEDED')
  await expect(record).toContainText('admin@arunika.id')
  await expect(record).toContainText('Pengguna salah beli kartu (E2E)')
})
