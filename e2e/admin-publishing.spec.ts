import { test, expect } from './fixtures'
import { API, adminLogin, adminToken, pickOption, row, uniq } from './helpers'

test.describe('admin publishing flows', () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page)
  })

  test('create category → create AR card → set visibility → published', async ({ page, request }) => {
    const categoryName = uniq('E2E Category')
    const cardTitle = uniq('E2E Card')

    await page.goto('/content/categories')
    await page.getByRole('button', { name: 'Add New' }).click()
    const categoryDialog = page.getByRole('dialog')
    await categoryDialog.getByLabel('Name').fill(categoryName)
    await categoryDialog.getByLabel('Image URL').fill('https://e2e.test/category.png')
    await categoryDialog.getByRole('button', { name: 'OK' }).click()
    await expect(row(page, categoryName)).toBeVisible()

    await page.goto('/content/ar-cards')
    await page.getByRole('button', { name: 'Add New' }).click()
    const cardDialog = page.getByRole('dialog')
    await cardDialog.getByLabel('Title').fill(cardTitle)
    await pickOption(page, 'Type', 'Animal')
    await cardDialog.getByLabel('File URL').fill('https://e2e.test/model.glb')
    await cardDialog.getByLabel('Short Code').fill(`E2E${Date.now().toString(36).toUpperCase().slice(-6)}`)
    await cardDialog.getByRole('button', { name: 'OK' }).click()

    const cardRow = row(page, cardTitle)
    await expect(cardRow).toContainText('Visible')

    // Hide, then publish again — the app's public list must follow each step.
    const publicTitles = async () => {
      const res = await request.get(`${API}/ar/cards`)
      expect(res.ok()).toBeTruthy()
      return ((await res.json()).data as { title: string }[]).map((c) => c.title)
    }
    expect(await publicTitles()).toContain(cardTitle)

    await cardRow.getByRole('switch').click()
    await expect(cardRow).toContainText('Hidden')
    await expect.poll(publicTitles).not.toContain(cardTitle)

    await cardRow.getByRole('switch').click()
    await expect(cardRow).toContainText('Visible')
    await expect.poll(publicTitles).toContain(cardTitle)
  })

  test('create dongeng → publish', async ({ page, request }) => {
    const title = uniq('E2E Dongeng')

    await page.goto('/content/fairy-tales')
    await page.getByRole('button', { name: 'Add New' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Title').fill(title)
    await dialog.getByLabel('Image URL').fill('https://e2e.test/img.png')
    await dialog.getByLabel('Audio URL').fill('https://e2e.test/audio.mp3')
    await pickOption(page, 'Access', 'Free')
    await dialog.getByRole('button', { name: 'OK' }).click()

    const dongengRow = row(page, title)
    await expect(dongengRow).toContainText('Visible')

    const list = await request.get(`${API}/fairy-tales?search=${encodeURIComponent(title)}`)
    expect(list.ok()).toBeTruthy()
    expect(JSON.stringify(await list.json())).toContain(title)

    // Unpublish and republish.
    await dongengRow.getByRole('switch').click()
    await expect(dongengRow).toContainText('Hidden')
    await dongengRow.getByRole('switch').click()
    await expect(dongengRow).toContainText('Visible')
  })

  test('create package → add items → publish', async ({ page, request }) => {
    const name = uniq('E2E Package')

    await page.goto('/packages')
    await page.getByRole('button', { name: 'Add Package' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name', { exact: true }).fill(name)
    await dialog.getByLabel('Subtitle').fill('Created by Playwright')
    await dialog.getByLabel('Price (IDR)').fill('45000')
    await pickOption(page, 'Type', 'Content')
    await dialog.getByLabel('Play Product ID').fill(`e2e_pw_${Date.now().toString(36)}`)
    await dialog.getByRole('button', { name: 'Create' }).click()

    const packRow = row(page, name)
    await expect(packRow).toBeVisible()

    await packRow.getByRole('button', { name: 'Manage Items' }).click()
    const items = page.getByRole('dialog').filter({ hasText: 'Manage Items' })
    for (const product of ['E2E Paid Card 1', 'E2E Paid Card 2']) {
      await items.getByRole('combobox').click()
      await page.locator('.ant-select-item-option').filter({ hasText: product }).first().click()
      await items.getByRole('button', { name: 'Add' }).click()
      await expect(items.getByRole('listitem').filter({ hasText: product })).toBeVisible()
    }
    await items.getByRole('button', { name: 'Close' }).first().click()

    // Publish: flip Active on, then confirm through the app-facing API.
    const activeSwitch = packRow.getByRole('switch')
    if ((await activeSwitch.getAttribute('aria-checked')) !== 'true') {
      await activeSwitch.click()
    }
    await expect(activeSwitch).toHaveAttribute('aria-checked', 'true')

    const packs = await request.get(`${API}/premium/packs?type=content`)
    expect(packs.ok()).toBeTruthy()
    const published = ((await packs.json()).data as { id: string; name: string }[]).find((p) => p.name === name)
    expect(published, 'published package must be listed for the app').toBeTruthy()

    const token = await adminToken(request)
    const itemsRes = await request.get(`${API}/admin/premium/packs/${published!.id}/items`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(itemsRes.ok()).toBeTruthy()
    expect(((await itemsRes.json()).data as unknown[]).length).toBe(2)
  })
})
