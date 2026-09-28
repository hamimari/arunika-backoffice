import { test, expect } from '@playwright/test'
import { API, adminLogin, adminToken, row, uniq } from './helpers'

// An admin turns a paid AR card free from the AR Cards page, and back. The
// app-facing card list shows the effect: unlocked with nothing to buy.
test('admin makes a paid AR card free and premium again → the app sees it unlock and lock', async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${await adminToken(request)}` }
  const title = uniq('E2E Free Card')

  const card = await request.post(`${API}/admin/content/ar-cards`, {
    headers,
    data: {
      title,
      type: 'animal',
      file_url: 'https://e2e.test/model.glb',
      short_code: `E2F${Date.now().toString(36).toUpperCase().slice(-6)}`,
      is_free: false,
    },
  })
  expect(card.ok(), await card.text()).toBeTruthy()
  const cardId = (await card.json()).data.id as string
  const product = await request.post(`${API}/admin/products`, {
    headers,
    data: { feature_code: 'AR_CARD', price_idr: 15000, ar_card_id: cardId },
  })
  expect(product.ok(), await product.text()).toBeTruthy()

  const publicCard = async () => {
    const res = await request.get(`${API}/ar/cards/${cardId}`)
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()) as { is_unlocked: boolean; product_id?: string }
  }
  expect((await publicCard()).is_unlocked).toBe(false)

  await adminLogin(page)
  await page.goto('/content/ar-cards')
  const cardRow = row(page, title)
  await expect(cardRow).toContainText('Paid')
  await expect(cardRow).toContainText('Rp 15.000')

  await cardRow.getByRole('button', { name: 'Make free' }).click()
  await page.getByRole('button', { name: 'Yes, make free' }).click()
  await expect(cardRow).toContainText('was Rp 15.000')

  const free = await publicCard()
  expect(free.is_unlocked).toBe(true)
  expect(free.product_id).toBeUndefined()

  await cardRow.getByRole('button', { name: 'Make premium' }).click()
  await page.getByRole('button', { name: 'Yes, make premium' }).click()
  await expect(cardRow).toContainText('Paid')
  await expect(cardRow).not.toContainText('was Rp')
  expect((await publicCard()).is_unlocked).toBe(false)

  // The Products page shows the override while the card is free.
  await cardRow.getByRole('button', { name: 'Make free' }).click()
  await page.getByRole('button', { name: 'Yes, make free' }).click()
  await expect(cardRow).toContainText('was Rp 15.000')
  await page.goto('/products')
  await expect(row(page, 'Free override').first()).toBeVisible()
})
