import { test, expect } from './fixtures'
import { API, adminLogin, adminToken, row } from './helpers'

// The Tumbuh Kembang rollout switch: seeded off by the backend migration, and
// turned on from App Features like any other flag. The app reads the public
// flag map, so that is what this asserts against.
test('admin turns Tumbuh Kembang on and off → the app flag follows', async ({ page, request }) => {
  const appFlags = async () => {
    const res = await request.get(`${API}/app/feature-flags`)
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).data as Record<string, boolean>
  }
  const headers = { Authorization: `Bearer ${await adminToken(request)}` }
  // Start from the seeded state, whatever an earlier run left behind.
  await request.patch(`${API}/admin/feature-flags/growth_tracking`, { headers, data: { is_enabled: false } })
  expect((await appFlags()).growth_tracking).toBe(false)

  await adminLogin(page)
  await page.goto('/feature-flags')
  const flagRow = row(page, 'Tumbuh Kembang')
  await expect(flagRow).toContainText('Hidden')

  await flagRow.getByRole('switch', { name: 'Toggle Tumbuh Kembang' }).click()
  await expect(flagRow).toContainText('Visible')
  expect((await appFlags()).growth_tracking).toBe(true)

  await flagRow.getByRole('switch', { name: 'Toggle Tumbuh Kembang' }).click()
  await expect(flagRow).toContainText('Hidden')
  expect((await appFlags()).growth_tracking).toBe(false)
})
