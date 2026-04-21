import { expect, test } from '@playwright/test'

async function waitForAppReady(page) {
  await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true')
}

test('interactive map loads core UI', async ({ page }) => {
  await page.goto('/')
  await waitForAppReady(page)
  await expect(page.getByRole('heading', { name: 'Randers hide and seek' })).toBeVisible()
  await expect(page.locator('#map')).toBeVisible()
  await expect(page.getByText('Spillegraense')).toBeVisible()
})

test('print page loads map and header', async ({ page }) => {
  await page.goto('/print.html')
  await expect(page.getByRole('heading', { name: 'Randers hide and seek' })).toBeVisible()
  await expect(page.locator('#print-map')).toBeVisible()
})

test('address lookup resolves area information', async ({ page }) => {
  await page.goto('/')
  await waitForAppReady(page)
  const input = page.locator('#address-input')
  await input.fill('Rådhustorvet 1, 8900 Randers C')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Sogneslag op' }).click()

  await expect(page.locator('#result-status')).toHaveText('Position fundet i spilleomraadet.', { timeout: 15000 })
  await expect(page.locator('#result-sogn')).toHaveText('Sankt Mortens')
  await expect(page.locator('#result-postnummer')).toHaveText('8900 Randers C')
  await expect(page.locator('#result-afstemning')).toHaveText('Fritidscentret')
})

test('browser geolocation resolves area information', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' })
  await context.setGeolocation({ longitude: 10.03639, latitude: 56.4607 })

  await page.goto('/')
  await waitForAppReady(page)
  await page.getByRole('button', { name: 'Brug min position' }).click()

  await expect(page.locator('#result-status')).toHaveText('Position fundet i spilleomraadet.', { timeout: 15000 })
  await expect(page.locator('#result-sogn')).toHaveText('Sankt Mortens')
  await expect(page.locator('#result-postnummer')).toHaveText('8900 Randers C')
  await expect(page.locator('#result-afstemning')).toHaveText('Fritidscentret')
})
