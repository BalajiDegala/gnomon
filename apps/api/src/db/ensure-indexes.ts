import mongoose from 'mongoose';
import type { Logger } from 'pino';

/**
 * Production runs with autoIndex off, so build every registered model's indexes
 * once at startup (a no-op when they already exist). A conflicting index is
 * logged rather than stopping the API.
 */
export async function ensureAllIndexes(
  logger: Logger,
): Promise<{ models: number; failed: string[] }> {
  const names = mongoose.modelNames();
  const failed: string[] = [];
  for (const name of names) {
    try {
      await mongoose.model(name).createIndexes();
    } catch (error) {
      failed.push(name);
      logger.warn({ error, model: name }, 'Could not create indexes');
    }
  }
  return { models: names.length, failed };
}
