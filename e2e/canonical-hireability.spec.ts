import { expect, test } from '@playwright/test'

const registry = '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432'
const rejected = `56:${registry}:2468`
const accepted = `56:${registry}:900001`

test('generic inventory and exact Hire share canonical eligibility', async ({ page }) => {
  await page.goto('/app/charter?category=yield')
  const options = await page.locator('select').first().locator('option').evaluateAll((nodes) => nodes.map((n) => ({ value: (n as HTMLOptionElement).value, text: n.textContent })))
  expect(options.some((o) => o.value === rejected)).toBe(false)
  expect(options.some((o) => o.value === accepted)).toBe(true)

  await page.goto(`/app/charter?category=yield&agent=${encodeURIComponent(rejected)}`)
  await expect(page.getByRole('status')).toContainText('Nothing has been selected on your behalf')
  await expect(page.locator('select').first()).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Grant a charter' })).toBeDisabled()

  await page.goto(`/app/charter?category=yield&agent=${encodeURIComponent(accepted)}`)
  await expect(page.locator('select').first()).toHaveValue(accepted)
  await expect(page.getByRole('button', { name: 'Grant a charter' })).toBeEnabled()
})

test('unsupported category fails closed', async ({ page }) => {
  await page.goto(`/app/charter?category=security&agent=${encodeURIComponent(accepted)}`)
  await expect(page.getByText('This Charter category is not supported.', { exact: true })).toBeVisible()
  await expect(page.locator('select')).toHaveCount(0)
})
