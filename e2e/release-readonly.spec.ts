import { expect, test } from '@playwright/test'

const externalId = '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:2468'
const references = ['Bound', 'Lattice', 'Sluicegate', 'Keel', 'Redcell']

test('Marketplace and independent profile render without a wallet', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Find an agent')
  await expect(page.getByText('Connect', { exact: true })).toBeVisible()

  await page.goto('/agents/56/2468')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ClawdMint')
  await expect(page.getByText('#2468', { exact: false })).toBeVisible()
})

test('unavailable exact third party fails closed and never preselects a reference', async ({ page }) => {
  await page.goto(`/app/charter?agent=${encodeURIComponent(externalId)}&category=yield`)
  await expect(page.getByRole('status')).toContainText('Nothing has been selected on your behalf')

  const select = page.locator('select').first()
  await expect(select).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Grant a charter' })).toBeDisabled()
  const selectedText = await select.locator('option:checked').textContent()
  for (const reference of references) expect(selectedText).not.toContain(reference)
})

test('deep link survives reload and browser history without identity substitution', async ({ page }) => {
  const deepLink = `/app/charter?agent=${encodeURIComponent(externalId)}&category=yield`
  await page.goto(deepLink)
  await page.reload()
  expect(new URL(page.url()).searchParams.get('agent')).toBe(externalId)
  await expect(page.locator('select').first()).toHaveValue('')

  await page.goto('/register')
  await page.goBack()
  await expect(page.locator('select').first()).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Grant a charter' })).toBeDisabled()
})
