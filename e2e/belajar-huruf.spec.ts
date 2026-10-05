import { test, expect } from './fixtures'
import { API, adminLogin, adminToken, row } from './helpers'
import path from 'node:path'

// Belajar Huruf content flow against the e2e stack (letters A–Z seeded as
// drafts, A published by db/seeds/test/seed.sql): an admin uploads a picture
// and sounds, draws a stroke, saves, publishes and rolls back — and the app's
// manifest follows.
const fixture = (name: string) => path.join(__dirname, 'fixtures', name)

test('admin edits, publishes and rolls back letter C → the app sees each version', async ({
  page,
  request,
}) => {
  const headers = { Authorization: `Bearer ${await adminToken(request)}` }
  const letters = (await (await request.get(`${API}/admin/huruf/letters`, { headers })).json())
    .data as { id: string; upper: string; version: number | null }[]
  const c = letters.find((l) => l.upper === 'C')!
  const startVersion = c.version ?? 0

  await adminLogin(page)
  await page.goto('/huruf')
  await expect(row(page, 'Cc')).toBeVisible()
  await row(page, 'Cc').getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'Huruf C' })).toBeVisible()

  await page.getByLabel('Kata contoh').fill('Cicak')
  await page.getByLabel('Unggah Cicak').setInputFiles(fixture('apel.webp'))
  await expect(page.getByText(/apel.webp · 512 × 512/)).toBeVisible()
  await page.getByLabel('Unggah Bunyi huruf "C"').setInputFiles(fixture('a.mp3'))
  await page.getByLabel('Unggah Bunyi kata "Cicak"').setInputFiles(fixture('a.mp3'))
  await expect(page.getByText(/a.mp3 ·/)).toHaveCount(2)

  // A stroke typed as a path, then a second one drawn on the grid.
  await page.getByRole('button', { name: 'Tambah garis' }).click()
  await page.getByLabel('Path garis 1').fill('M200 80 Q60 60 80 160 Q100 250 210 230')
  await page.getByRole('button', { name: 'Gambar garis' }).click()
  const grid = page.getByRole('img', { name: 'Garis panduan tebalkan' }).first()
  const box = (await grid.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByLabel('Path garis 2')).toHaveValue(/^M\d+ \d+ L\d+ \d+$/)

  await page.getByRole('button', { name: 'Simpan draft' }).click()
  await expect(page.getByText(/Draft disimpan/)).toBeVisible()

  await page.getByRole('button', { name: 'Terbitkan' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Terbitkan' }).click()
  await expect(page.getByText(`Versi terbit: v${startVersion + 1}`)).toBeVisible()

  // The app's manifest shows the new version.
  const userRes = await request.post(`${API}/auth/login`, {
    data: { email: 'e2e-subscriber@arunika.test', password: 'e2e-test-password' },
  })
  const userToken = (await userRes.json()).data.token as string
  const manifest = async () =>
    (
      await (
        await request.get(`${API}/learn/huruf/manifest`, { headers: { Authorization: `Bearer ${userToken}` } })
      ).json()
    ).data.letters as { upper: string; word: string; version: number }[]
  expect((await manifest()).find((l) => l.upper === 'C')).toMatchObject({
    word: 'Cicak',
    version: startVersion + 1,
  })

  // Roll back to the version before (when there was one) or re-publish v1.
  await page.getByRole('button', { name: 'Riwayat versi' }).click()
  const drawer = page.locator('.ant-drawer')
  await expect(drawer.getByText(`v${startVersion + 1}`)).toBeVisible()
  if (startVersion > 0) {
    await drawer.getByRole('button', { name: 'Kembalikan' }).first().click()
    await page.getByRole('dialog').last().getByRole('button', { name: 'Kembalikan' }).click()
    await expect(page.getByText(`Versi terbit: v${startVersion + 2}`)).toBeVisible()
    expect((await manifest()).find((l) => l.upper === 'C')?.version).toBe(startVersion + 2)
  }
  await drawer.getByRole('tab', { name: 'Aktivitas' }).click()
  await expect(drawer.getByText('Menerbitkan').first()).toBeVisible()
})

test('admin turns Belajar Huruf on and off → the app flag follows', async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${await adminToken(request)}` }
  const appFlags = async () =>
    (await (await request.get(`${API}/app/feature-flags`)).json()).data as Record<string, boolean>
  // The e2e seed turns it on for the app's flows; restore that at the end.
  await request.patch(`${API}/admin/feature-flags/belajar_huruf`, { headers, data: { is_enabled: true } })

  await adminLogin(page)
  await page.goto('/feature-flags')
  const flagRow = row(page, 'Belajar Huruf')
  await expect(flagRow).toContainText('Visible')
  await flagRow.getByRole('switch', { name: 'Toggle Belajar Huruf' }).click()
  await expect(flagRow).toContainText('Hidden')
  expect((await appFlags()).belajar_huruf).toBe(false)
  await flagRow.getByRole('switch', { name: 'Toggle Belajar Huruf' }).click()
  await expect(flagRow).toContainText('Visible')
  expect((await appFlags()).belajar_huruf).toBe(true)
})
