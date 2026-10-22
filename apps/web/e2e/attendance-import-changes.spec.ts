import { expect, test, type Page } from '@playwright/test';

const batch = {
  id: '000000000000000000000001',
  source: 'biometric',
  importType: 'csv',
  fileName: 'june-attendance.csv',
  status: 'completed',
  createdAt: '2026-06-02T10:00:00Z',
  successfulRows: 4,
  duplicateRows: 0,
  ignoredRows: 0,
  failedRows: 0,
  errors: [],
  totalRows: 4,
  provisionedEmployees: 0,
  reconciledTimecards: 2,
  removedRows: 0,
  removedAt: null,
};
const preview = {
  previewToken: 'a'.repeat(64),
  source: 'biometric',
  existingEvents: 4,
  existingEmployees: 2,
  existingWorkdays: 2,
  replacementEvents: 2,
};

async function mockApplication(page: Page) {
  const writes: Array<{
    method: string;
    url: URL;
    body: string | null;
    headers: Record<string, string>;
  }> = [];
  let deleted = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body: unknown;
    if (url.pathname === '/api/v1/auth/refresh') {
      body = {
        accessToken: 'test-token',
        user: {
          id: 'admin',
          employeeId: 'employee',
          employeeCode: 'TEST001',
          displayName: 'Test Admin',
          email: 'admin@example.invalid',
          permissions: ['imports:create'],
          scopes: [{ type: 'company', ids: [] }],
          grants: [
            {
              roleCode: 'ATTENDANCE_ADMIN',
              permissions: ['imports:create'],
              scope: { type: 'company', ids: [] },
            },
          ],
        },
      };
    } else if (url.pathname === '/api/v1/notifications') {
      body = { notifications: { unreadCount: 0, items: [] } };
    } else if (url.pathname === '/api/v1/imports') {
      body = {
        batches: [
          {
            ...batch,
            ...(deleted
              ? { status: 'deleted', removedRows: 4, removedAt: '2026-06-03T10:00:00Z' }
              : {}),
          },
        ],
      };
    } else if (
      url.pathname.endsWith('/delete-preview') ||
      url.searchParams.get('mode') === 'replacement-preview'
    ) {
      body = preview;
    } else if (request.method() === 'DELETE' || url.searchParams.get('mode') === 'replace') {
      writes.push({
        method: request.method(),
        url,
        body: request.postData(),
        headers: request.headers(),
      });
      deleted = request.method() === 'DELETE';
      body = {
        removedEvents: 4,
        reconciledTimecards: 2,
        batch: deleted ? null : { ...batch, successfulRows: 2 },
      };
    } else {
      await route.fulfill({ status: 404, json: { error: { message: 'Unexpected test request' } } });
      return;
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/administration?section=imports');
  await expect(
    page.getByRole('heading', { name: 'Attendance imports', exact: true }),
  ).toBeVisible();
  return writes;
}

test('deleting an import requires preview, a reason, and confirmation; cancel makes no change', async ({
  page,
}) => {
  const writes = await mockApplication(page);
  await page.getByRole('button', { name: 'Delete import june-attendance.csv' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/removes 4 active punches/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Delete import', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Delete import june-attendance.csv' }).click();
  await dialog.getByLabel('Reason for this change').fill('Incorrect source export');
  await dialog.getByRole('button', { name: 'Delete import', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(/4 punches removed from active attendance/)).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0]!.body!)).toEqual({
    reason: 'Incorrect source export',
    previewToken: preview.previewToken,
  });
  await expect(
    page.getByRole('button', { name: 'Delete import june-attendance.csv' }),
  ).toBeDisabled();
});

test('replacement previews the selected source, period and uploaded file before submission', async ({
  page,
}, testInfo) => {
  const writes = await mockApplication(page);
  await page.getByRole('combobox', { name: 'Upload action' }).click();
  await page.getByRole('option', { name: 'Replace attendance for a period' }).click();
  await page.getByLabel('First work date').fill('2026-06-01');
  await page.getByLabel('Last work date').fill('2026-06-01');
  const content = 'employee_code,occurred_at,event_type\nTEST001,2026-06-01 09:30:00,in';
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'corrected.csv', mimeType: 'text/csv', buffer: Buffer.from(content) });
  await page.getByRole('button', { name: 'Preview replacement' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText('Biometric · 2026-06-01 to 2026-06-01 · all employees'),
  ).toBeVisible();
  await expect(dialog.getByText(/new file supplies 2 punch rows/)).toBeVisible();
  expect(writes).toHaveLength(0);
  await dialog.getByLabel('Reason for this change').fill('Updated attendance export');
  await page.screenshot({ path: testInfo.outputPath('replacement-preview.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Replace attendance', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(/2 replacement punches imported/)).toBeVisible();
  expect(writes).toHaveLength(1);
  const write = writes[0]!;
  expect(write.url.pathname).toBe('/api/v1/imports/attendance/biometric/csv');
  expect(write.url.searchParams.get('from')).toBe('2026-06-01');
  expect(write.url.searchParams.get('to')).toBe('2026-06-01');
  expect(write.headers['x-preview-token']).toBe(preview.previewToken);
  expect(decodeURIComponent(write.headers['x-change-reason']!)).toBe('Updated attendance export');
  expect(write.body).toBe(content);
});
