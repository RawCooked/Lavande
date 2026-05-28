import { format } from 'date-fns';
import { z } from 'zod';
import type { Tool } from '../types.js';

const schema = z.object({
  timezone: z
    .string()
    .optional()
    .describe('IANA timezone, e.g. "Europe/Paris". Defaults to the system timezone.'),
});

export const dateTimeTool: Tool<typeof schema> = {
  name: 'date_time',
  description:
    'Return the current date, time, day of week, and timezone. Use whenever the user asks "what time/day/date is it" or needs an anchor in time.',
  schema,
  async execute({ timezone }) {
    const now = new Date();
    const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

    let localized: string;
    try {
      localized = new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }).format(now);
    } catch {
      return { ok: false, output: `Unknown timezone: ${tz}` };
    }

    return {
      ok: true,
      output: localized,
      meta: {
        iso: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        formatted: format(now, "yyyy-MM-dd HH:mm:ss"),
        timezone: tz,
      },
    };
  },
};
