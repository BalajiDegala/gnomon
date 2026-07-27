import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test('renders the authenticated workforce overview', async ({ page }, testInfo) => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
  await page.getByLabel('Work email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in to Gnomon' }).click();

  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening),/ }),
  ).toBeVisible();
  await expect(page.getByText('Attendance signals')).toBeVisible();
  await expect(page.getByText('Daily reconciliation')).toBeVisible();
  await expect(page.getByText('Website timecard').first()).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page
    .locator('button:visible, [role="button"]:visible')
    .filter({ hasText: 'My timecard' })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'My timecard' })).toBeVisible();

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page
    .locator('button:visible, [role="button"]:visible')
    .filter({ hasText: 'Administration' })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Attendance imports' })).toBeVisible();
  await expect(page.getByText('New CSV import')).toBeVisible();

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.getByRole('button', { name: 'Shows & tasks' }).click();
  await expect(page.getByRole('heading', { name: 'Shows & tasks' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('shows-and-tasks.png'), fullPage: true });

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.getByRole('button', { name: 'Timesheets' }).click();
  await expect(page.getByRole('heading', { name: 'Timesheets' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('timesheets.png'), fullPage: true });
});

test('imports a biometric CSV idempotently', async ({ page }, testInfo) => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Covered once on desktop');

  await page.goto('/');
  await page.getByLabel('Work email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in to Gnomon' }).click();
  await page.getByRole('button', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { name: 'Attendance imports' })).toBeVisible();

  const uniqueId = `${Date.now()}-${testInfo.workerIndex}`;
  const fileName = `biometric-e2e-${uniqueId}.csv`;
  const csv = [
    'employee_code,occurred_at,event_type,source_event_id,device_id,device_name',
    `DDI0001,2026-07-24 09:03:00,in,E2E-${uniqueId}-IN,TEST-DEVICE,E2E gate`,
    `DDI0001,2026-07-24 18:07:00,out,E2E-${uniqueId}-OUT,TEST-DEVICE,E2E gate`,
  ].join('\n');

  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByRole('button', { name: 'Import Biometric CSV' }).click();

  const latestResult = page
    .getByText('Latest result')
    .locator('xpath=ancestor::*[contains(@class,"MuiCard-root")][1]');
  await expect(latestResult.getByText(fileName)).toBeVisible();
  await expect(latestResult.getByText('Imported').locator('..').getByText('2')).toBeVisible();
  await expect(latestResult.getByText('completed')).toBeVisible();

  await page.getByRole('button', { name: 'Import Biometric CSV' }).click();
  await expect(page.getByText(/exact file was already processed/i)).toBeVisible();
});

test('creates a show assignment and submits task time', async ({ page }, testInfo) => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Covered once on desktop');

  await page.goto('/');
  await page.getByLabel('Work email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in to Gnomon' }).click();
  await page.getByRole('button', { name: 'Shows & tasks' }).click();

  const suffix = `${Date.now()}`.slice(-8);
  const showCode = `VFX${suffix}`;
  const showName = `E2E Show ${suffix}`;
  const taskName = `Compositing ${suffix}`;

  await page.getByLabel('Show code').fill(showCode);
  await page.getByLabel('Show name').fill(showName);
  await page.getByRole('button', { name: 'Create show' }).click();
  await expect(page.getByText(showName).first()).toBeVisible();

  await page.getByLabel('Task code').fill(`COMP${suffix}`);
  await page.getByLabel('Task name').fill(taskName);
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText(taskName)).toBeVisible();

  await page.getByLabel('Employee code').fill('DDI0001');
  await page.getByRole('button', { name: 'Assign employee' }).click();
  await expect(page.locator('main').getByText('DDI0001')).toBeVisible();

  await page.getByRole('button', { name: 'Timesheets' }).click();
  await page.getByLabel('Timesheet date').fill('2026-07-24');
  const showSelect = page.getByRole('combobox', { name: 'Show', exact: true });
  const taskSelect = page.getByRole('combobox', { name: 'Task', exact: true });
  await showSelect.click();
  await page.getByRole('option', { name: new RegExp(showCode) }).click();
  await taskSelect.click();
  await page.getByRole('option', { name: new RegExp(taskName) }).click();
  await expect(showSelect).toHaveText(new RegExp(showCode));
  await expect(taskSelect).toHaveText(new RegExp(taskName));
  await page.getByLabel('Task details').fill(`Final comp review for ${showCode}`);
  await page.getByRole('button', { name: 'Add draft entry' }).click();

  await expect(page.getByText(`Final comp review for ${showCode}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit 1 draft' })).toBeEnabled();
  await page.getByRole('button', { name: 'Submit 1 draft' }).click();
  await expect(page.getByText('submitted', { exact: true })).toBeVisible();
});
