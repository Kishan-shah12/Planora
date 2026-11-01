import { expect, test, type Page } from '@playwright/test';

/**
 * Regenerates the README screenshots in docs/screenshots. Skipped in normal runs:
 *   SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts --project=desktop
 * The AI routes are mocked so the images are reproducible.
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate README images');

const intake = {
  occasion: 'wedding',
  totalBudget: 800000,
  guests: 200,
  eventDate: '2027-02-15',
  vibe: 'simple ceremony, premium food',
  nonNegotiables: ['catering'],
  city: 'Pune',
};

async function createWedding(page: Page) {
  await page.route('**/api/parse-intake', (route) => route.fulfill({ json: intake }));
  await page.route('**/api/ask-planner', (route) =>
    route.fulfill({
      json: {
        answer:
          'Aapka catering 60 extra guests ki wajah se short hai. Budget tab mein "Reduce guests" ya "Trim flexible categories" option dekhiye, phir venue aur caterer ko pehle confirm kijiye.',
      },
    }),
  );
  await page.goto('/');
  await page.getByLabel('Event description').fill('Shaadi in Pune, 200 guests, 8 lakh, mid-Feb');
  await page.getByRole('button', { name: 'Fill form from description' }).click();
  await expect(page.getByText(/Filled occasion/)).toBeVisible();
  await page.getByRole('button', { name: 'Create my plan' }).click();
  await page.getByRole('spinbutton', { name: 'Number of guests' }).fill('260');
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `docs/screenshots/${name}.jpg`, type: 'jpeg', quality: 82 });

test('assistant, light, desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await createWedding(page);
  await page.getByRole('button', { name: 'Are we over budget?' }).click();
  await expect(page.getByRole('log', { name: 'Conversation' })).toContainText('Aapka catering');
  await shot(page, 'assistant-light');
});

test('timeline with a delay, dark, desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await createWedding(page);
  await page.getByRole('tab', { name: 'Timeline' }).click();
  const venue = page.getByTestId('task-venue');
  await venue.getByRole('button', { name: 'Mark delayed' }).click();
  await venue.getByLabel('Delayed by (days)').fill('40');
  await venue.getByRole('button', { name: 'Apply delay' }).click();
  await page.getByRole('heading', { name: 'Your timeline' }).scrollIntoViewIfNeeded();
  await shot(page, 'timeline-dark');
});

test('budget on a phone, light', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await createWedding(page);
  await page.getByRole('heading', { name: 'Where the money goes' }).scrollIntoViewIfNeeded();
  await shot(page, 'budget-mobile');
});
