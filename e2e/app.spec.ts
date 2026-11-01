import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const intake = {
  occasion: 'wedding',
  totalBudget: 800000,
  guests: 200,
  eventDate: '2030-02-15',
  vibe: 'simple ceremony, premium food',
  nonNegotiables: ['catering'],
  city: 'Pune',
};

async function mockApi(page: Page) {
  await page.route('**/api/parse-intake', (route) => route.fulfill({ json: intake }));
  await page.route('**/api/review-plan', (route) =>
    route.fulfill({
      json: {
        summary: 'The guest list grew, so close the budget gap first.',
        steps: [{ title: 'Close the budget gap', why: 'Catering now needs more.' }],
      },
    }),
  );
}

async function createPlan(page: Page) {
  await page.goto('/');
  await page.getByLabel('Event description').fill('Shaadi in Pune, 200 guests, 8 lakh, Feb 2030');
  await page.getByRole('button', { name: 'Fill form from description' }).click();
  await expect(page.getByText(/Filled occasion, budget, guests, date/)).toBeVisible();
  await page.getByRole('button', { name: 'Create my plan' }).click();
  await expect(page.getByRole('heading', { name: 'Budget at a glance' })).toBeVisible();
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('describe, create, grow the guest list, get options and apply one', async ({ page }) => {
  await createPlan(page);
  await page.getByRole('spinbutton', { name: 'Number of guests' }).fill('260');
  await expect(page.getByText(/Over budget by ₹/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).first().click();
  await page.getByRole('button', { name: 'Yes, apply' }).click();
  await expect(page.getByTestId('over-budget-region')).toContainText('Within budget');
});

test('the assistant explains the plan and the AI review renders', async ({ page }) => {
  await createPlan(page);
  await page.getByRole('button', { name: 'Ask AI for a plan review' }).click();
  await expect(page.getByTestId('ai-review')).toContainText('Close the budget gap');
});

test('a share link reopens the same plan in a fresh browser', async ({ page, browser }) => {
  await createPlan(page);
  // Force the visible fallback so the link can be read the same way on every browser.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('blocked')) },
      configurable: true,
    });
  });
  await page.getByRole('button', { name: 'Share link' }).click();
  const url = await page.getByLabel('Copy this link').inputValue();
  expect(url).toContain('#plan=');
  const fresh = await browser.newPage();
  await fresh.goto(url);
  await expect(fresh.getByText('Opened a shared plan', { exact: false })).toBeVisible();
  await expect(fresh.getByRole('heading', { name: /Wedding/ }).first()).toBeVisible();
  await fresh.close();
});

test('runs under the production CSP with no console errors or CSP violations', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("style-src 'self';");
  await createPlan(page);
  for (const tab of ['Budget', 'Timeline', 'Vendors', 'Plan setup']) {
    await page.getByRole('tab', { name: tab }).click();
  }
  await page.getByRole('button', { name: /Switch to (dark|light) theme/ }).click();
  expect(problems).toEqual([]);
});

test('no horizontal scrolling on any tab', async ({ page }) => {
  await createPlan(page);
  for (const tab of ['Plan setup', 'Budget', 'Timeline', 'Vendors']) {
    await page.getByRole('tab', { name: tab }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, tab).toBeLessThanOrEqual(0);
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe finds no WCAG 2.1 AA issues in ${scheme} mode, including colour contrast`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expectNoAxeViolations(page);
    await createPlan(page);
    for (const tab of ['Budget', 'Timeline', 'Vendors', 'Plan setup']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(350);
      await expectNoAxeViolations(page);
    }
  });
}
