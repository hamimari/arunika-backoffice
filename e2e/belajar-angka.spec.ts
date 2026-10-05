import { test, expect } from './fixtures'
import { API, adminLogin, adminToken, row } from './helpers'
import path from 'node:path'

// Belajar Angka content flow against the e2e stack (db/seeds/test/seed.sql:
// three objects, numbers 1–10 and Levels 1–2 published): an admin adds an
// object, builds a level from it, publishes it, and the app's manifest
// shows the new level.
const fixture = (name: string) => path.join(__dirname, 'fixtures', name)

test('admin adds an object and a level and publishes them → the app sees the level', async ({ page, request }) => {
  await adminLogin(page)
  await page.goto('/angka?tab=objects')
  await page.getByRole('button', { name: 'Tambah benda' }).click()
  await page.getByLabel('Nama benda').fill('kucing')
  await expect(page.getByLabel('Teks pertanyaan')).toHaveValue('Ada berapa kucing?')
  await page.getByLabel('Unggah Gambar benda').setInputFiles(fixture('benda.png'))
  await expect(page.getByText(/benda.png · 256 × 256/)).toBeVisible()
  await page.getByLabel('Unggah Suara pertanyaan').setInputFiles(fixture('a.mp3'))
  await expect(page.getByText(/a.mp3 ·/)).toBeVisible()
  await page.locator('.ant-drawer').getByRole('button', { name: 'Terbitkan' }).click()
  await expect(page.getByRole('button', { name: 'Edit kucing' })).toBeVisible()

  await page.getByRole('tab', { name: /Level Hitung Benda/ }).click()
  await page.getByRole('button', { name: 'Tambah level' }).click()
  await expect(page.getByLabel('Nama level')).toBeVisible()
  await page.getByLabel('Nama level').fill('Hitung kucing')
  await page.getByRole('button', { name: /kucing/ }).click()
  await page.getByRole('button', { name: 'Baris' }).click()
  await expect(page.getByText(/Contoh soal 1 dari 10 · draft/)).toBeVisible()

  await page.getByRole('button', { name: 'Terbitkan' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Terbitkan' }).click()
  await expect(page.getByText('Versi terbit: v1')).toBeVisible()

  const userRes = await request.post(`${API}/auth/login`, {
    data: { email: 'e2e-subscriber@arunika.test', password: 'e2e-test-password' },
  })
  const userToken = (await userRes.json()).data.token as string
  const manifest = (
    await (await request.get(`${API}/learn/angka/manifest`, { headers: { Authorization: `Bearer ${userToken}` } })).json()
  ).data as { levels: { name: string; version: number }[] }
  expect(manifest.levels.find((l) => l.name === 'Hitung kucing')).toMatchObject({ version: 1 })

  // Clean up so reruns start from the seed: hide the level.
  const headers = { Authorization: `Bearer ${await adminToken(request)}` }
  const levels = (await (await request.get(`${API}/admin/angka/levels`, { headers })).json()).data as {
    id: string
    name: string
  }[]
  const mine = levels.find((l) => l.name === 'Hitung kucing')!
  await request.post(`${API}/admin/angka/levels/${mine.id}/hide`, { headers })
})

test('admin turns Belajar Angka on and off → the app flag follows', async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${await adminToken(request)}` }
  const appFlags = async () =>
    (await (await request.get(`${API}/app/feature-flags`)).json()).data as Record<string, boolean>
  await request.patch(`${API}/admin/feature-flags/belajar_angka`, { headers, data: { is_enabled: true } })

  await adminLogin(page)
  await page.goto('/feature-flags')
  const flagRow = row(page, 'Belajar Angka')
  await expect(flagRow).toContainText('Visible')
  await flagRow.getByRole('switch', { name: 'Toggle Belajar Angka' }).click()
  await expect(flagRow).toContainText('Hidden')
  expect((await appFlags()).belajar_angka).toBe(false)
  await flagRow.getByRole('switch', { name: 'Toggle Belajar Angka' }).click()
  await expect(flagRow).toContainText('Visible')
  expect((await appFlags()).belajar_angka).toBe(true)
})
