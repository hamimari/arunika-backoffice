import { test, expect } from '@playwright/test'
import { API, adminLogin, adminToken, row, uniq } from './helpers'

// A single AR card can only be bought through Google Play once its product
// is mapped to a Play SKU — which an admin does from the Products page.
test('admin maps a product to a Google Play SKU → the app can buy it', async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${await adminToken(request)}` }
  const title = uniq('E2E Play Card')
  const sku = `e2e_sku_${Date.now().toString(36)}`

  const card = await request.post(`${API}/admin/content/ar-cards`, {
    headers,
    data: {
      title,
      type: 'animal',
      file_url: 'https://e2e.test/model.glb',
      short_code: `E2E${Date.now().toString(36).toUpperCase().slice(-6)}`,
    },
  })
  expect(card.ok(), await card.text()).toBeTruthy()
  const cardId = (await card.json()).data.id as string
  const product = await request.post(`${API}/admin/products`, {
    headers,
    data: { feature_code: 'AR_CARD', price_idr: 15000, ar_card_id: cardId },
  })
  expect(product.ok(), await product.text()).toBeTruthy()
  const productId = (await product.json()).data.id as string

  await adminLogin(page)
  await page.goto('/products')
  // The table identifies a product by the first 8 characters of its id.
  const productRow = row(page, productId.slice(0, 8))
  await expect(productRow).toContainText('Unmapped')

  await productRow.getByRole('button', { name: 'Edit' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Play Product ID').fill(sku)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(productRow).toContainText('Mapped')
  await expect(productRow).toContainText(sku)

  // The app's card list now carries the SKU, so its Beli button can buy it.
  const cards = await (await request.get(`${API}/ar/cards`)).json()
  const listed = (cards.data as { id: string; play_product_id?: string }[]).find((c) => c.id === cardId)
  expect(listed?.play_product_id).toBe(sku)
})
