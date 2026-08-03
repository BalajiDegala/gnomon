import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const regularisationUsers = {
  employee: {
    email: process.env.E2E_EMPLOYEE_EMAIL,
    password: process.env.E2E_EMPLOYEE_PASSWORD,
  },
  manager: {
    email: process.env.E2E_MANAGER_EMAIL,
    password: process.env.E2E_MANAGER_PASSWORD,
  },
  hr: {
    email: process.env.E2E_HR_EMAIL,
    password: process.env.E2E_HR_PASSWORD,
  },
};
const policyEmployee = {
  code: process.env.E2E_EMPLOYEE_CODE ?? 'E2EEMP01',
  name: process.env.E2E_EMPLOYEE_NAME ?? 'Eshan Artist',
};

function closedWeekdayDate(): string {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

function previousWeekdayDate(daysAgo: number): string {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

function futureWeekdayDate(daysAhead: number): string {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + daysAhead);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

async function signIn(
  page: import('@playwright/test').Page,
  user: typeof regularisationUsers.employee,
) {
  await page.goto('/');
  await page.getByLabel('Work email').fill(user.email!);
  await page.getByLabel('Password').fill(user.password!);
  await page.getByRole('button', { name: 'Sign in to Gnomon' }).click();
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening),/ }),
  ).toBeVisible();
}

async function signOut(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
}

function navigationLink(page: import('@playwright/test').Page, name: string) {
  return page.getByRole('link', { name, exact: true });
}

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
  await navigationLink(page, 'My timecard').click();
  await expect(page.getByRole('heading', { name: 'My timecard' })).toBeVisible();

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await navigationLink(page, 'Administration').click();
  await expect(page.getByRole('heading', { name: 'Attendance imports' })).toBeVisible();
  await expect(page.getByText('New CSV import')).toBeVisible();
  await page.getByRole('tab', { name: 'Access & roles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Access & roles', exact: true })).toBeVisible();
  await expect(page.getByLabel('Search access directory')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Access directory' })).toBeVisible();
  await expect(page.getByLabel('Employee account')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('access-and-roles.png'), fullPage: true });

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await navigationLink(page, 'Shows').click();
  await expect(page.getByRole('heading', { name: 'Shows', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/shows$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Shows', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Shows | Gnomon');
  await page.screenshot({ path: testInfo.outputPath('shows.png'), fullPage: true });

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await navigationLink(page, 'Timesheets').click();
  await expect(page.getByRole('heading', { name: 'Timesheets' })).toBeVisible();
  await expect(page).toHaveURL(/\/timesheets$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Shows', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Timesheets' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous timesheet day' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next timesheet day' })).toBeVisible();
  if (testInfo.project.name === 'mobile-chromium') {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('timesheets.png'), fullPage: true });

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await navigationLink(page, 'People').click();
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
  await expect(page.getByLabel('Search people')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('people.png'), fullPage: true });

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await navigationLink(page, 'Reports').click();
  await expect(page.getByRole('heading', { name: 'Workforce reports' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run report' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^attendance-.*\.csv$/);
  await page.screenshot({ path: testInfo.outputPath('workforce-reports.png'), fullPage: true });
});

test('opens a direct page route through sign-in', async ({ page }, testInfo) => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Covered once on desktop');

  await page.goto('/timesheets');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('Work email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in to Gnomon' }).click();

  await expect(page.getByRole('heading', { name: 'Timesheets' })).toBeVisible();
  await expect(page).toHaveURL(/\/timesheets$/);
});

test('restores durable page context after refresh', async ({ page }, testInfo) => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Covered once on desktop');

  await signIn(page, { email, password });

  await page.goto('/timesheets');
  await page.getByLabel('Timesheet date').fill('2026-07-24');
  await page.getByRole('button', { name: 'Previous timesheet day' }).click();
  await expect(page.getByLabel('Timesheet date')).toHaveValue('2026-07-23');
  await page.getByRole('button', { name: 'Next timesheet day' }).click();
  await expect(page).toHaveURL(/\/timesheets\?date=2026-07-24$/);
  await page.reload();
  await expect(page.getByLabel('Timesheet date')).toHaveValue('2026-07-24');

  await page.goto('/regularisation?date=2026-07-23');
  await page.getByRole('button', { name: 'New correction' }).click();
  await expect(page.getByLabel('Work date')).toHaveValue('2026-07-23');
  await page.reload();
  await page.getByRole('button', { name: 'New correction' }).click();
  await expect(page.getByLabel('Work date')).toHaveValue('2026-07-23');

  await page.goto('/calendar?month=2026-07');
  await expect(page.getByLabel('Jump to month')).toHaveValue('2026-07');
  await page.reload();
  await expect(page.getByLabel('Jump to month')).toHaveValue('2026-07');

  await page.goto('/team-calendar?month=2026-07');
  await expect(page.getByLabel('Calendar month')).toHaveValue('2026-07');
  await page.reload();
  await expect(page.getByLabel('Calendar month')).toHaveValue('2026-07');

  await page.goto('/administration');
  await page.getByRole('tab', { name: 'Access & roles', exact: true }).click();
  await expect(page).toHaveURL(/\/administration\?section=security$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Access & roles', exact: true })).toBeVisible();
  await page.getByLabel('Search access directory').fill('Asha');
  await expect(page).toHaveURL(/q=Asha/);
  await page.getByRole('button', { name: 'Manage access for Asha Rao' }).click();
  await expect(page.getByRole('tab', { name: 'Account', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/employee=[a-f\d]{24}/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Close access details' })).toBeVisible();

  await page.goto('/people');
  await page.getByLabel('Search people').fill('Asha');
  await page.getByRole('tab', { name: /All/ }).click();
  await expect(page).toHaveURL(/\/people\?q=Asha&status=all$/);
  await page.reload();
  await expect(page.getByLabel('Search people')).toHaveValue('Asha');
  await expect(page.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');

  await page.goto('/reports?from=2026-07-01&to=2026-07-31&tab=timesheets');
  await expect(page.getByLabel('From')).toHaveValue('2026-07-01');
  await expect(page.getByLabel('To')).toHaveValue('2026-07-31');
  await expect(page.getByRole('tab', { name: /Timesheets/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('tab', { name: /Timesheets/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('restores the team calendar month after refresh', async ({ page }, testInfo) => {
  const manager = regularisationUsers.manager;
  test.skip(!manager.email || !manager.password, 'Manager E2E credentials are required');
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Covered once on desktop');

  await signIn(page, manager);
  await page.goto('/team-calendar?month=2026-07');
  await expect(page.getByLabel('Calendar month')).toHaveValue('2026-07');
  await page.reload();
  await expect(page.getByLabel('Calendar month')).toHaveValue('2026-07');
  await expect(page.getByLabel('Calendar audience')).toHaveCount(0);
  await expect(page).toHaveURL(/month=2026-07/);
});

test('imports a biometric CSV idempotently', async ({ page }, testInfo) => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Covered once on desktop');

  await page.goto('/');
  await page.getByLabel('Work email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in to Gnomon' }).click();
  await navigationLink(page, 'Administration').click();
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

test('manages a show lifecycle while preserving historical show time', async ({
  page,
}, testInfo) => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Covered once on desktop');

  await page.goto('/');
  await page.getByLabel('Work email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in to Gnomon' }).click();
  await navigationLink(page, 'Shows').click();

  const suffix = `${Date.now()}`.slice(-8);
  const seed = Number(suffix);
  const showCode = `VFX${suffix}`;
  const showName = `E2E Show ${suffix}`;
  const updatedShowName = `${showName} Updated`;
  const workComment = `Final comp review for ${showCode}`;
  const updatedWorkComment = `Updated final comp review for ${showCode}`;
  const workDate = previousWeekdayDate(14 + (seed % 120));
  const startMinutes = 8 * 60 + (Math.floor(seed / 120) % 48) * 15;
  const startedAt = `${workDate}T${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`;
  const endedAt = `${workDate}T${String(Math.floor((startMinutes + 15) / 60)).padStart(2, '0')}:${String((startMinutes + 15) % 60).padStart(2, '0')}`;

  await page.getByRole('button', { name: 'Add show' }).click();
  await page.getByLabel('Show code').fill(showCode);
  await page.getByLabel('Show name').fill(showName);
  await page.getByRole('button', { name: 'Create show' }).click();
  await expect(page.getByText(showName).first()).toBeVisible();

  await page.getByRole('button', { name: 'Edit show' }).click();
  await page.getByLabel('Show name').fill(updatedShowName);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(updatedShowName).first()).toBeVisible();

  await page.getByRole('button', { name: 'Close show details' }).click();

  await navigationLink(page, 'Timesheets').click();
  await page.getByLabel('Timesheet date').fill(workDate);
  await page.getByRole('button', { name: 'Add entry' }).click();
  const showSelect = page.getByRole('combobox', { name: 'Show', exact: true });
  await showSelect.click();
  await page.getByRole('option', { name: new RegExp(showCode) }).click();
  await expect(showSelect).toHaveText(new RegExp(showCode));
  await page.getByLabel('Started at').fill(startedAt);
  await page.getByLabel('Ended at').fill(startedAt);
  await expect(page.getByText('End time must be after start time.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save entry' })).toBeDisabled();
  await page.getByLabel('Ended at').fill(endedAt);
  await page.getByLabel('Work comment').fill(workComment);
  await page.getByRole('combobox', { name: 'Progress' }).click();
  await page.getByRole('option', { name: '70%' }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();

  await expect(
    page.getByLabel('Timesheet entries').getByText(workComment, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Timesheet entries').getByText('70%', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Submit/ })).toHaveCount(0);

  await navigationLink(page, 'Shows').click();
  await page.getByText(updatedShowName).first().click();
  await page.getByRole('button', { name: 'Edit show' }).click();
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Completed' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Not available for new entries')).toBeVisible();
  await page.getByRole('button', { name: 'Close show details' }).click();

  await navigationLink(page, 'Timesheets').click();
  await page.getByLabel('Timesheet date').fill(workDate);
  await expect(
    page.getByLabel('Timesheet entries').getByText(workComment, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByRole('combobox', { name: 'Show', exact: true }).click();
  await expect(page.getByRole('option', { name: new RegExp(showCode) })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: `Edit ${showCode} entry` }).click();
  await expect(page.getByRole('combobox', { name: 'Show', exact: true })).toHaveText(
    /\(inactive\)/,
  );
  await page.getByLabel('Work comment').fill(updatedWorkComment);
  await page.getByRole('combobox', { name: 'Progress' }).click();
  await page.getByRole('option', { name: '80%' }).click();
  await page.getByRole('button', { name: 'Update entry' }).click();
  await expect(
    page.getByLabel('Timesheet entries').getByText(updatedWorkComment, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: `Delete ${showCode} entry` }).click();
  await expect(page.getByRole('heading', { name: 'Delete time entry?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByLabel('Timesheet entries').getByText(updatedWorkComment, { exact: true }),
  ).toBeVisible();
});

test('saves and edits timesheets without an approval workflow', async ({ page }, testInfo) => {
  const credentialsReady =
    email &&
    password &&
    regularisationUsers.employee.email &&
    regularisationUsers.employee.password &&
    regularisationUsers.manager.email &&
    regularisationUsers.manager.password;
  test.skip(!credentialsReady, 'Administrator, employee, and manager credentials are required');

  if (testInfo.project.name === 'mobile-chromium') {
    await signIn(page, regularisationUsers.manager);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await navigationLink(page, 'Approvals').click();
    await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Timesheets/ })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('timesheet-approvals-mobile.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await navigationLink(page, 'Team calendar').click();
    await expect(page.getByRole('heading', { name: 'Team calendar' })).toBeVisible();
    await expect(page.locator('main').getByText(/^\d+ people$/)).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Calendar audience' })).toHaveCount(0);
    await expect(page.getByText('Not assigned', { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('team-calendar-mobile.png'),
      fullPage: true,
    });
    return;
  }

  const workDate = previousWeekdayDate(21);
  const suffix = `${Date.now()}`.slice(-8);
  const showCode = `TS${suffix}`;
  const showName = `Direct Time Show ${suffix}`;
  const showComment = `Scoped lighting review ${suffix}`;
  const secondComment = `Lighting correction request ${suffix}`;
  const updatedComment = `Updated lighting review ${suffix}`;

  await page.goto('/');
  await page.getByLabel('Work email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in to Gnomon' }).click();
  await navigationLink(page, 'Shows').click();
  await page.getByRole('button', { name: 'Add show' }).click();
  await page.getByLabel('Show code').fill(showCode);
  await page.getByLabel('Show name').fill(showName);
  await page.getByRole('button', { name: 'Create show' }).click();
  await page.getByRole('button', { name: 'Close show details' }).click();
  await signOut(page);

  await signIn(page, regularisationUsers.employee);
  await navigationLink(page, 'Timesheets').click();
  await page.getByLabel('Timesheet date').fill(workDate);
  await page.getByRole('button', { name: 'Add entry' }).click();
  const showSelect = page.getByRole('combobox', { name: 'Show', exact: true });
  await showSelect.click();
  await page.getByRole('option', { name: new RegExp(showCode) }).click();
  await page.getByLabel('Started at').fill(`${workDate}T09:00`);
  await page.getByLabel('Ended at').fill(`${workDate}T10:30`);
  await page.getByLabel('Work comment').fill(showComment);
  await page.getByRole('combobox', { name: 'Progress' }).click();
  await page.getByRole('option', { name: '60%' }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByRole('combobox', { name: 'Show', exact: true }).click();
  await page.getByRole('option', { name: new RegExp(showCode) }).click();
  await page.getByLabel('Started at').fill(`${workDate}T10:30`);
  await page.getByLabel('Ended at').fill(`${workDate}T11:15`);
  await page.getByLabel('Work comment').fill(secondComment);
  await page.getByRole('combobox', { name: 'Progress' }).click();
  await page.getByRole('option', { name: '40%' }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByLabel('Timesheet entries').getByText(showComment)).toBeVisible();
  await expect(page.getByLabel('Timesheet entries').getByText(secondComment)).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.manager);
  await navigationLink(page, 'Approvals').click();
  await expect(page.getByRole('tab', { name: /Timesheets/ })).toHaveCount(0);
  await signOut(page);

  await signIn(page, regularisationUsers.employee);
  await navigationLink(page, 'Timesheets').click();
  await page.getByLabel('Timesheet date').fill(workDate);
  await expect(page.getByText(showComment)).toBeVisible();
  await expect(page.getByText(secondComment)).toBeVisible();
  await page
    .getByRole('button', { name: `Edit ${showCode} entry` })
    .first()
    .click();
  await page.getByLabel('Work comment').fill(updatedComment);
  await page.getByRole('combobox', { name: 'Progress' }).click();
  await page.getByRole('option', { name: '90%' }).click();
  await page.getByRole('button', { name: 'Update entry' }).click();
  await expect(page.getByText(updatedComment)).toBeVisible();
  await expect(
    page.getByLabel('Timesheet entries').getByText('90%', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('timesheet-direct-saved.png'),
    fullPage: true,
  });
});

test('completes scoped regularisation approval and attendance finalisation', async ({
  page,
}, testInfo) => {
  const credentialsReady = Object.values(regularisationUsers).every(
    (user) => user.email && user.password,
  );
  test.skip(!credentialsReady, 'Employee, manager, and HR E2E credentials are required');

  if (testInfo.project.name === 'mobile-chromium') {
    await signIn(page, regularisationUsers.employee);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await navigationLink(page, 'Regularisation').click();
    await expect(page.getByRole('heading', { name: 'Regularisation' })).toBeVisible();
    await page.getByRole('button', { name: 'New correction' }).click();
    await expect(page.getByRole('heading', { name: 'New correction request' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Regularisation requests' })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('regularisation-mobile.png'),
      fullPage: true,
    });
    return;
  }

  const workDate = closedWeekdayDate();
  const reason = `E2E missed biometric checkout ${Date.now()}`;

  await signIn(page, regularisationUsers.employee);
  await navigationLink(page, 'Regularisation').click();
  await expect(page.getByRole('heading', { name: 'Regularisation' })).toBeVisible();
  await page.getByRole('button', { name: 'New correction' }).click();
  await page.getByLabel('Work date').fill(workDate);
  await page.getByLabel('Corrected start').fill(`${workDate}T09:00`);
  await page.getByLabel('Corrected end').fill(`${workDate}T18:00`);
  await page.getByLabel('Reason').fill(reason);
  await page.getByRole('button', { name: 'Submit for manager review' }).click();
  const correctionDetails = page.getByRole('dialog').last();
  await expect(correctionDetails.getByText(reason)).toBeVisible();
  await expect(correctionDetails.getByText('Manager review', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close regularisation details' }).click();
  await signOut(page);

  await signIn(page, regularisationUsers.manager);
  await navigationLink(page, 'Approvals').click();
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
  await page.getByRole('tab', { name: /Regularisation/ }).click();
  await expect(page.getByText('Eshan Artist')).toBeVisible();
  await page.getByText(reason).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Queue is clear')).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.hr);
  await navigationLink(page, 'Approvals').click();
  await page.getByRole('tab', { name: /Regularisation/ }).click();
  await expect(page.getByText('Final HR review', { exact: true })).toBeVisible();
  await page.getByText(reason).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Queue is clear')).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.employee);
  await navigationLink(page, 'Regularisation').click();
  await expect(page.getByText(reason)).toBeVisible();
  await page.getByText(reason).click();
  const approvedCorrection = page.getByRole('dialog').last();
  await expect(approvedCorrection.getByText('Approved', { exact: true })).toBeVisible();
  await expect(approvedCorrection.getByText(/Step 1 approved by Meera Manager/)).toBeVisible();
  await expect(approvedCorrection.getByText(/Step 2 approved by Harini HR/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('regularisation-approved.png'),
    fullPage: true,
  });
});

test('completes leave approval and shows approved leave in the personal calendar', async ({
  page,
}, testInfo) => {
  const credentialsReady = regularisationUsers.employee.email && regularisationUsers.manager.email;
  test.skip(!credentialsReady, 'Employee and manager E2E credentials are required');

  if (testInfo.project.name === 'mobile-chromium') {
    await signIn(page, regularisationUsers.employee);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await navigationLink(page, 'Leave').click();
    await expect(page.getByRole('heading', { name: 'Leave', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'New request' }).click();
    await expect(page.getByRole('heading', { name: 'New leave request' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Leave requests' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('leave-mobile.png'), fullPage: true });

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await navigationLink(page, 'Calendar').click();
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('calendar-mobile.png'), fullPage: true });
    return;
  }

  const leaveDate = previousWeekdayDate(14);
  const reason = `E2E personal leave ${Date.now()}`;

  await signIn(page, regularisationUsers.employee);
  await navigationLink(page, 'Leave').click();
  await expect(page.getByRole('heading', { name: 'Leave', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New request' }).click();
  await page.getByLabel('Start date').fill(leaveDate);
  await page.getByLabel('End date').fill(leaveDate);
  await page.getByLabel('Private reason').fill(reason);
  await page.getByRole('button', { name: 'Submit for manager review' }).click();
  const leaveDetails = page.getByRole('dialog').last();
  await expect(leaveDetails.getByText(reason)).toBeVisible();
  await expect(leaveDetails.getByText('Manager review', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close leave details' }).click();
  await signOut(page);

  await signIn(page, regularisationUsers.manager);
  await navigationLink(page, 'Approvals').click();
  await page.getByRole('tab', { name: /Leave/ }).click();
  await page.getByText(reason).click();
  await expect(page.getByText('Eshan Artist').last()).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('No leave decisions waiting')).toBeVisible();
  await navigationLink(page, 'Team calendar').click();
  await expect(page.getByRole('heading', { name: 'Team calendar' })).toBeVisible();
  await page.getByLabel('Calendar month').fill(leaveDate.slice(0, 7));
  await expect(page.locator('main p:visible').filter({ hasText: 'Eshan Artist' })).toBeVisible();
  await expect(
    page.locator(`[aria-label="${leaveDate}: Approved leave · Full day"]:visible`),
  ).toBeVisible();
  await expect(page.getByText(reason)).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('team-calendar-approved-leave.png'),
    fullPage: true,
  });
  await signOut(page);

  await signIn(page, regularisationUsers.employee);
  await navigationLink(page, 'Leave').click();
  const leaveRow = page
    .getByRole('table', { name: 'Leave requests' })
    .getByRole('row')
    .filter({ hasText: reason });
  await expect(leaveRow.getByText('Approved', { exact: true })).toBeVisible();

  await navigationLink(page, 'Calendar').click();
  await page.getByLabel('Jump to month').fill(leaveDate.slice(0, 7));
  await expect(page.getByText('Casual leave', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('leave-calendar-approved.png'),
    fullPage: true,
  });
});

test('configures a company holiday and an employee leave balance', async ({ page }, testInfo) => {
  const credentialsReady =
    regularisationUsers.hr.email &&
    regularisationUsers.employee.email &&
    regularisationUsers.manager.email;
  test.skip(!credentialsReady, 'HR, employee, and manager E2E credentials are required');

  await signIn(page, regularisationUsers.hr);
  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await navigationLink(page, 'Administration').click();
  await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
  const leavePolicyTab = page.getByRole('tab', { name: 'Leave & holidays', exact: true });
  if (await leavePolicyTab.count()) await leavePolicyTab.click();
  await expect(page.getByRole('heading', { name: 'Leave & holidays', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Holiday scope' })).toHaveCount(0);
  await expect(page.getByLabel('Studio location')).toHaveCount(0);

  if (testInfo.project.name === 'mobile-chromium') {
    await page.screenshot({
      path: testInfo.outputPath('leave-policy-administration-mobile.png'),
      fullPage: true,
    });
    return;
  }

  const holidayDate = futureWeekdayDate(35);
  const suffix = `${Date.now()}`.slice(-8);
  const holidayName = `E2E Company Holiday ${suffix}`;

  await page.getByLabel('Policy year').fill(holidayDate.slice(0, 4));
  await page.getByLabel('Holiday date').fill(holidayDate);
  await page.getByLabel('Holiday name').fill(holidayName);
  await page.getByRole('button', { name: 'Save holiday' }).click();
  await expect(page.getByText(holidayName)).toBeVisible();

  const balanceCard = page
    .getByText('Employee leave balances')
    .locator('xpath=ancestor::*[contains(@class,"MuiCard-root")][1]');
  await balanceCard.getByLabel('Employee code').fill(policyEmployee.code);
  await balanceCard.getByRole('button', { name: 'Load balances' }).click();
  await expect(balanceCard.getByText(policyEmployee.name)).toBeVisible();
  await balanceCard.getByLabel('Casual leave entitlement').fill('12');
  await balanceCard.getByLabel('Casual leave adjustment').fill('1');
  await balanceCard.getByLabel('Casual leave note').fill('E2E annual balance configuration');
  await balanceCard.getByRole('button', { name: 'Save casual leave' }).click();
  await expect(balanceCard.getByText(/\d+(?:\.\d+)? available/).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('company-policy-administration.png'),
    fullPage: true,
  });
  await signOut(page);

  await signIn(page, regularisationUsers.employee);
  await navigationLink(page, 'Calendar').click();
  await page.getByLabel('Jump to month').fill(holidayDate.slice(0, 7));
  await expect(page.getByText(holidayName)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('holiday-calendar-and-balance.png'),
    fullPage: true,
  });
  await signOut(page);

  await signIn(page, regularisationUsers.manager);
  await navigationLink(page, 'Calendar').click();
  await page.getByLabel('Jump to month').fill(holidayDate.slice(0, 7));
  await expect(page.getByText(holidayName)).toBeVisible();
});
