import 'dotenv/config';

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { User } from '../modules/auth/user.model.js';
import { Employee } from '../modules/employees/employee.model.js';
import {
  importAttendanceCsv,
  importDoorAttendanceWorkbook,
} from '../modules/imports/attendance-import.service.js';
import { importApprovalRoutesCsv } from '../modules/imports/approval-route-import.service.js';
import { importUserDirectoryCsv } from '../modules/imports/user-directory-import.service.js';

async function existingFile(filePath: string): Promise<boolean> {
  return stat(filePath)
    .then((value) => value.isFile())
    .catch(() => false);
}

async function importDataFolder(): Promise<void> {
  const dataDirectory = path.resolve(process.argv[2] ?? 'data');
  const actorEmployeeCode = (
    process.env.IMPORT_ACTOR_EMPLOYEE_CODE ??
    process.env.ADMIN_EMPLOYEE_CODE ??
    'DDI0001'
  ).toUpperCase();
  await connectDatabase();

  let actorEmployee = await Employee.findOne({
    employeeCode: actorEmployeeCode,
    status: 'active',
  })
    .select({ _id: 1 })
    .lean()
    .exec();
  let actor = actorEmployee
    ? await User.findOne({ employeeId: actorEmployee._id, status: 'active' })
        .select({ _id: 1, employeeId: 1 })
        .lean()
        .exec()
    : null;
  if (!actor) {
    actor = await User.findOne({ status: 'active' })
      .select({ _id: 1, employeeId: 1 })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    actorEmployee = actor
      ? await Employee.findOne({ _id: actor.employeeId, status: 'active' })
          .select({ _id: 1 })
          .lean()
          .exec()
      : null;
  }
  if (!actorEmployee || !actor) {
    throw new Error(`No active import actor is available (preferred code ${actorEmployeeCode})`);
  }
  actor = await User.findOne({ employeeId: actorEmployee._id, status: 'active' })
    .select({ _id: 1 })
    .lean()
    .exec();
  if (!actor) throw new Error('The selected import actor does not have an active account');

  const results: unknown[] = [];
  const usersPath = path.join(dataDirectory, 'users.csv');
  if (await existingFile(usersPath)) {
    results.push({
      file: 'users.csv',
      result: await importUserDirectoryCsv({
        fileName: 'users.csv',
        csvText: await readFile(usersPath, 'utf8'),
        importedBy: String(actor._id),
      }),
    });
  }

  const approvalsPath = path.join(dataDirectory, 'approvals.csv');
  if (await existingFile(approvalsPath)) {
    results.push({
      file: 'approvals.csv',
      result: await importApprovalRoutesCsv({
        fileName: 'approvals.csv',
        csvText: await readFile(approvalsPath, 'utf8'),
        importedBy: String(actor._id),
      }),
    });
  }

  const workbookPath = path.join(dataDirectory, 'attendance.xls');
  if (await existingFile(workbookPath)) {
    results.push({
      file: 'attendance.xls',
      result: await importDoorAttendanceWorkbook({
        fileName: 'attendance.xls',
        workbookBuffer: await readFile(workbookPath),
        importedBy: String(actor._id),
      }),
    });
  }

  const biometricFileName = (await existingFile(path.join(dataDirectory, 'biometrix.csv')))
    ? 'biometrix.csv'
    : 'biometric.csv';
  const biometricPath = path.join(dataDirectory, biometricFileName);
  if (await existingFile(biometricPath)) {
    results.push({
      file: biometricFileName,
      result: await importAttendanceCsv({
        source: 'biometric',
        fileName: biometricFileName,
        csvText: await readFile(biometricPath, 'utf8'),
        importedBy: String(actor._id),
      }),
    });
  }

  if (results.length === 0) {
    throw new Error(
      `No supported users.csv, approvals.csv, attendance.xls, biometric.csv, or biometrix.csv files found in ${dataDirectory}`,
    );
  }
  process.stdout.write(`${JSON.stringify({ dataDirectory, results }, null, 2)}\n`);
}

importDataFolder()
  .then(disconnectDatabase)
  .catch(async (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    await disconnectDatabase();
    process.exitCode = 1;
  });
