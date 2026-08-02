import type { AuthUser, CreateShowRequest, ShowAdminDto, UpdateShowRequest } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Show } from './show.model.js';

let indexesReady: Promise<unknown> | null = null;

function ensureShowIndexes(): Promise<unknown> {
  indexesReady ??= Show.createIndexes();
  return indexesReady;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function hasCompanyShowManagement(user: AuthUser): boolean {
  return user.grants.some(
    (grant) => grant.permissions.includes('show:manage') && grant.scope.type === 'company',
  );
}

function manageableShowIds(user: AuthUser): string[] {
  return user.grants
    .filter((grant) => grant.permissions.includes('show:manage') && grant.scope.type === 'show')
    .flatMap((grant) => grant.scope.ids);
}

async function buildAdminDtos(showIds?: Types.ObjectId[]): Promise<ShowAdminDto[]> {
  const shows = await Show.find(showIds ? { _id: { $in: showIds } } : {})
    .sort({ status: 1, name: 1 })
    .lean()
    .exec();
  return shows.map((show) => ({
    id: String(show._id),
    code: show.code,
    name: show.name,
    status: show.status,
  }));
}

export async function listManageableShows(user: AuthUser): Promise<ShowAdminDto[]> {
  await ensureShowIndexes();
  if (hasCompanyShowManagement(user)) return buildAdminDtos();
  return buildAdminDtos(
    manageableShowIds(user)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id)),
  );
}

export async function createShow(user: AuthUser, input: CreateShowRequest): Promise<ShowAdminDto> {
  await ensureShowIndexes();
  if (!hasCompanyShowManagement(user)) {
    throw new HttpError(403, 'Creating shows requires company scope', 'SCOPE_FORBIDDEN');
  }

  try {
    const show = await Show.create({ ...input, status: 'active', createdBy: user.id });
    return (await buildAdminDtos([show._id]))[0]!;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'A show with this code already exists', 'SHOW_CODE_EXISTS');
    }
    throw error;
  }
}

export async function updateShow(
  user: AuthUser,
  showId: string,
  input: UpdateShowRequest,
): Promise<ShowAdminDto> {
  await ensureShowIndexes();
  if (!Types.ObjectId.isValid(showId)) {
    throw new HttpError(404, 'Show not found', 'SHOW_NOT_FOUND');
  }
  if (!hasCompanyShowManagement(user) && !manageableShowIds(user).includes(showId)) {
    throw new HttpError(403, 'This show is outside your management scope', 'SCOPE_FORBIDDEN');
  }

  const show = await Show.findById(showId).exec();
  if (!show) throw new HttpError(404, 'Show not found', 'SHOW_NOT_FOUND');

  show.code = input.code;
  show.name = input.name;
  show.status = input.status;
  try {
    await show.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'A show with this code already exists', 'SHOW_CODE_EXISTS');
    }
    throw error;
  }
  return (await buildAdminDtos([show._id]))[0]!;
}
