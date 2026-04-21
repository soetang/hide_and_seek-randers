import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const outDir = join(process.cwd(), 'test-results', 'captures')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } })

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await page.screenshot({ path: join(outDir, 'interactive-map.png'), fullPage: true })

await page.goto('http://127.0.0.1:4173/print.html', { waitUntil: 'networkidle' })
await page.screenshot({ path: join(outDir, 'print-map.png'), fullPage: true })
await page.pdf({ path: join(outDir, 'print-map.pdf'), format: 'A3', landscape: false, printBackground: true })

await browser.close()
