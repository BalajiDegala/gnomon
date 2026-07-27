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

test('completes scoped timesheet submission and manager approval', async ({ page }, testInfo) => {
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
    await page.getByRole('button', { name: 'Approvals', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
    await expect(page.getByText('Timesheet queue')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('timesheet-approvals-mobile.png'),
      fullPage: true,
    });
    return;
  }

  const workDate = previousWeekdayDate(21);
  const suffix = `${Date.now()}`.slice(-8);
  const showCode = `TS${suffix}`;
  const showName = `Approval Show ${suffix}`;
  const taskName = `Lighting ${suffix}`;
  const taskDetails = `Scoped lighting review ${suffix}`;
  const rejectedTaskDetails = `Lighting correction request ${suffix}`;
  const rejectionReason = `Separate review time from production work ${suffix}`;

  await page.goto('/');
  await page.getByLabel('Work email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in to Gnomon' }).click();
  await page.getByRole('button', { name: 'Shows & tasks' }).click();
  await page.getByLabel('Show code').fill(showCode);
  await page.getByLabel('Show name').fill(showName);
  await page.getByRole('button', { name: 'Create show' }).click();
  await page.getByLabel('Task code').fill(`LGT${suffix}`);
  await page.getByLabel('Task name').fill(taskName);
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.getByLabel('Employee code').fill('E2EEMP01');
  await page.getByRole('button', { name: 'Assign employee' }).click();
  await expect(page.locator('main').getByText('E2EEMP01')).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.employee);
  await page.getByRole('button', { name: 'Timesheets' }).click();
  await page.getByLabel('Timesheet date').fill(workDate);
  const showSelect = page.getByRole('combobox', { name: 'Show', exact: true });
  const taskSelect = page.getByRole('combobox', { name: 'Task', exact: true });
  await showSelect.click();
  await page.getByRole('option', { name: new RegExp(showCode) }).click();
  await taskSelect.click();
  await page.getByRole('option', { name: new RegExp(taskName) }).click();
  await page.getByLabel('Started at').fill(`${workDate}T09:00`);
  await page.getByLabel('Ended at').fill(`${workDate}T10:30`);
  await page.getByLabel('Task details').fill(taskDetails);
  await page.getByRole('button', { name: 'Add draft entry' }).click();
  await page.getByLabel('Started at').fill(`${workDate}T10:30`);
  await page.getByLabel('Ended at').fill(`${workDate}T11:15`);
  await page.getByLabel('Task details').fill(rejectedTaskDetails);
  await page.getByRole('button', { name: 'Add draft entry' }).click();
  await page.getByRole('button', { name: 'Submit 2 drafts' }).click();
  await expect(page.getByText('2 awaiting')).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.manager);
  await page.getByRole('button', { name: 'Approvals', exact: true }).click();
  const approvalCard = page
    .getByText(taskDetails)
    .locator('xpath=ancestor::*[contains(@class,"MuiCard-root")][1]');
  await expect(approvalCard.getByText('Eshan Artist')).toBeVisible();
  await expect(approvalCard.getByText(showName, { exact: false })).toBeVisible();
  await approvalCard.getByRole('button', { name: 'Approve' }).click();
  const rejectionCard = page
    .getByText(rejectedTaskDetails)
    .locator('xpath=ancestor::*[contains(@class,"MuiCard-root")][1]');
  await rejectionCard.getByLabel(`Decision comment for LGT${suffix}`).fill(rejectionReason);
  await rejectionCard.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('No timesheets waiting')).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.employee);
  await page.getByRole('button', { name: 'Timesheets' }).click();
  await page.getByLabel('Timesheet date').fill(workDate);
  await expect(page.getByText(taskDetails)).toBeVisible();
  await expect(page.getByText(rejectedTaskDetails)).toBeVisible();
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  await expect(page.getByText('rejected', { exact: true })).toBeVisible();
  await expect(page.getByText(/Approved by Meera Manager/)).toBeVisible();
  await expect(page.getByText(/Rejected by Meera Manager/)).toBeVisible();
  await expect(page.getByText(rejectionReason)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('timesheet-approved.png'),
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
    await page.getByRole('button', { name: 'Regularisation' }).click();
    await expect(page.getByRole('heading', { name: 'Regularisation' })).toBeVisible();
    await expect(page.getByText('New correction request')).toBeVisible();
    await expect(page.getByText('Request history')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('regularisation-mobile.png'),
      fullPage: true,
    });
    return;
  }

  const workDate = closedWeekdayDate();
  const reason = `E2E missed biometric checkout ${Date.now()}`;

  await signIn(page, regularisationUsers.employee);
  await page.getByRole('button', { name: 'Regularisation' }).click();
  await expect(page.getByRole('heading', { name: 'Regularisation' })).toBeVisible();
  await page.getByLabel('Work date').fill(workDate);
  await page.getByLabel('Corrected start').fill(`${workDate}T09:00`);
  await page.getByLabel('Corrected end').fill(`${workDate}T18:00`);
  await page.getByLabel('Reason').fill(reason);
  await page.getByRole('button', { name: 'Submit for manager review' }).click();
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByText('Manager review', { exact: true })).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.manager);
  await page.getByRole('button', { name: 'Approvals', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
  await expect(page.getByText('Eshan Artist')).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Queue is clear')).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.hr);
  await page.getByRole('button', { name: 'Approvals', exact: true }).click();
  await expect(page.getByText('Final HR review', { exact: true })).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Queue is clear')).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.employee);
  await page.getByRole('button', { name: 'Regularisation' }).click();
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText(/Step 1 approved by Meera Manager/)).toBeVisible();
  await expect(page.getByText(/Step 2 approved by Harini HR/)).toBeVisible();
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
    await page.getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Leave', exact: true })).toBeVisible();
    await expect(page.getByText('New leave request')).toBeVisible();
    await expect(page.getByText('Request history')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('leave-mobile.png'), fullPage: true });

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('calendar-mobile.png'), fullPage: true });
    return;
  }

  const leaveDate = previousWeekdayDate(14);
  const reason = `E2E personal leave ${Date.now()}`;

  await signIn(page, regularisationUsers.employee);
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Leave', exact: true })).toBeVisible();
  await page.getByLabel('Start date').fill(leaveDate);
  await page.getByLabel('End date').fill(leaveDate);
  await page.getByLabel('Private reason').fill(reason);
  await page.getByRole('button', { name: 'Submit for manager review' }).click();
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByText('Manager review', { exact: true })).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.manager);
  await page.getByRole('button', { name: 'Approvals', exact: true }).click();
  const leaveCard = page
    .getByText(reason)
    .locator('xpath=ancestor::*[contains(@class,"MuiCard-root")][1]');
  await expect(leaveCard.getByText('Eshan Artist')).toBeVisible();
  await leaveCard.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('No leave decisions waiting')).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.employee);
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  const historyCard = page
    .getByText(reason)
    .locator('xpath=ancestor::*[contains(@class,"MuiCard-root")][1]');
  await expect(historyCard.getByText('Approved', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByLabel('Jump to month').fill(leaveDate.slice(0, 7));
  await expect(page.getByText('Casual leave', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('leave-calendar-approved.png'),
    fullPage: true,
  });
});

test('configures a company holiday and an employee leave balance', async ({ page }, testInfo) => {
  const credentialsReady = regularisationUsers.hr.email && regularisationUsers.employee.email;
  test.skip(!credentialsReady, 'HR and employee E2E credentials are required');

  await signIn(page, regularisationUsers.hr);
  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.getByRole('button', { name: 'Administration', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Leave & holidays', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Leave & holidays', exact: true })).toBeVisible();

  if (testInfo.project.name === 'mobile-chromium') {
    await page.screenshot({
      path: testInfo.outputPath('leave-policy-administration-mobile.png'),
      fullPage: true,
    });
    return;
  }

  const holidayDate = futureWeekdayDate(35);
  const holidayName = `E2E Studio Holiday ${Date.now()}`;
  await page.getByLabel('Policy year').fill(holidayDate.slice(0, 4));
  await page.getByLabel('Holiday date').fill(holidayDate);
  await page.getByLabel('Holiday name').fill(holidayName);
  await page.getByRole('button', { name: 'Save holiday' }).click();
  await expect(page.getByText(holidayName)).toBeVisible();

  await page.getByLabel('Employee code').fill('E2EEMP01');
  await page.getByRole('button', { name: 'Load balances' }).click();
  await expect(page.getByText('Eshan Artist')).toBeVisible();
  await page.getByLabel('Casual leave entitlement').fill('12');
  await page.getByLabel('Casual leave adjustment').fill('1');
  await page.getByLabel('Casual leave note').fill('E2E annual balance configuration');
  await page.getByRole('button', { name: 'Save casual leave' }).click();
  await expect(page.getByText(/1[23] available/)).toBeVisible();
  await signOut(page);

  await signIn(page, regularisationUsers.employee);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByLabel('Jump to month').fill(holidayDate.slice(0, 7));
  await expect(page.getByText(holidayName)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('holiday-calendar-and-balance.png'),
    fullPage: true,
  });
});
