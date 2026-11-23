import { defaultTipsSettings, type TipsSettings } from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

export type TipMoment = 'morning' | 'midday' | 'afternoon' | 'evening' | 'any';
export type TipIcon =
  | 'clock'
  | 'water'
  | 'coffee'
  | 'eye'
  | 'stretch'
  | 'food'
  | 'calendar'
  | 'timer'
  | 'list'
  | 'heart'
  | 'lock'
  | 'save'
  | 'breath';

export interface Tip {
  id: string;
  moment: TipMoment;
  icon: TipIcon;
  title: string;
  text: string;
}

/** Twenty friendly nudges; each is shown at a fitting time of day (India time). */
export const tips: readonly Tip[] = [
  {
    id: 'on-time',
    moment: 'morning',
    icon: 'clock',
    title: 'Come in on time',
    text: 'A punctual start makes the whole day feel lighter. Good morning!',
  },
  {
    id: 'start-timer',
    moment: 'morning',
    icon: 'timer',
    title: 'Start your timecard',
    text: 'Start your timecard as soon as you sit down, so every minute counts.',
  },
  {
    id: 'top-three',
    moment: 'morning',
    icon: 'list',
    title: 'Plan your day',
    text: 'Pick your top three tasks before you open the inbox.',
  },
  {
    id: 'water',
    moment: 'any',
    icon: 'water',
    title: 'Drink some water',
    text: 'Time for a glass of water. A hydrated brain thinks faster!',
  },
  {
    id: '20-20-20',
    moment: 'any',
    icon: 'eye',
    title: 'Rest your eyes',
    text: 'Look at something 20 feet away for 20 seconds. Your eyes will thank you.',
  },
  {
    id: 'stretch',
    moment: 'any',
    icon: 'stretch',
    title: 'Stretch a little',
    text: 'Stand up and stretch for a minute: shoulders, neck and back.',
  },
  {
    id: 'lunch',
    moment: 'midday',
    icon: 'food',
    title: 'Lunch break',
    text: 'Have you eaten? Step away from the screen and enjoy a proper lunch.',
  },
  {
    id: 'coffee',
    moment: 'afternoon',
    icon: 'coffee',
    title: 'Coffee or chai?',
    text: 'Afternoon slump? A short walk or a cup of coffee can recharge you.',
  },
  {
    id: 'posture',
    moment: 'any',
    icon: 'stretch',
    title: 'Check your posture',
    text: 'Feet flat, back supported, screen at eye level. Sit tall!',
  },
  {
    id: 'leave-early',
    moment: 'any',
    icon: 'calendar',
    title: 'Planning time off?',
    text: "Don't forget your leave application. Apply early so your team can plan.",
  },
  {
    id: 'regularise',
    moment: 'any',
    icon: 'clock',
    title: 'Missed a punch?',
    text: 'Raise a regularisation request while you still remember the times.',
  },
  {
    id: 'timesheet',
    moment: 'evening',
    icon: 'list',
    title: 'Log your show hours',
    text: 'Before you leave, add today’s hours in Timesheets. It takes a minute.',
  },
  {
    id: 'stop-timer',
    moment: 'evening',
    icon: 'timer',
    title: 'Heading out?',
    text: 'Stop your timecard so today’s hours are recorded correctly.',
  },
  {
    id: 'save',
    moment: 'any',
    icon: 'save',
    title: 'Save your work',
    text: 'Save often and keep important files backed up. Future you says thanks.',
  },
  {
    id: 'breathe',
    moment: 'any',
    icon: 'breath',
    title: 'Take a breath',
    text: 'Breathe in for 4, hold for 4, out for 4. Repeat three times.',
  },
  {
    id: 'thanks',
    moment: 'any',
    icon: 'heart',
    title: 'Say thanks',
    text: 'Thank a teammate today. Small things build great teams.',
  },
  {
    id: 'snack',
    moment: 'afternoon',
    icon: 'food',
    title: 'Healthy snack',
    text: 'Fruit or a handful of nuts beats another biscuit.',
  },
  {
    id: 'lock',
    moment: 'any',
    icon: 'lock',
    title: 'Lock your screen',
    text: 'Stepping away? Press Win + L (or Ctrl + Cmd + Q on Mac) to lock your screen.',
  },
  {
    id: 'tomorrow',
    moment: 'evening',
    icon: 'list',
    title: 'Note for tomorrow',
    text: 'Jot down what to pick up first tomorrow. Mornings get easier.',
  },
  {
    id: 'balance',
    moment: 'any',
    icon: 'calendar',
    title: 'Know your balance',
    text: 'Check your leave balance now and then so you can plan proper breaks.',
  },
];

export function tipMoment(now = new Date()): Exclude<TipMoment, 'any'> {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Kolkata',
    }).format(now),
  );
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 15) return 'midday';
  if (hour >= 15 && hour < 18) return 'afternoon';
  return 'evening';
}

/** Picks a tip for this time of day, avoiding the ones shown most recently. */
export function pickTip(recentIds: readonly string[], now = new Date(), random = Math.random): Tip {
  const moment = tipMoment(now);
  const fitting = tips.filter((tip) => tip.moment === moment || tip.moment === 'any');
  const fresh = fitting.filter((tip) => !recentIds.includes(tip.id));
  const pool = fresh.length ? fresh : fitting;
  // Tips made for this moment are twice as likely as general ones.
  const weighted = pool.flatMap((tip) => (tip.moment === moment ? [tip, tip] : [tip]));
  return weighted[Math.floor(random() * weighted.length)] ?? tips[0]!;
}

const tipsQueryKey = ['tips-settings'];

export function useTipsSettings() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions.includes('policy:manage') ?? false;
  const query = useQuery({
    queryKey: tipsQueryKey,
    queryFn: () => request<{ tips: TipsSettings }>('/api/v1/tips'),
    enabled: Boolean(user),
    staleTime: 10 * 60_000,
  });
  const save = useMutation({
    mutationFn: (input: TipsSettings) =>
      request<{ tips: TipsSettings }>('/api/v1/administration/tips', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (response) => queryClient.setQueryData(tipsQueryKey, response),
  });
  return {
    canManage,
    settings: query.data?.tips ?? defaultTipsSettings,
    isLoaded: Boolean(query.data),
    save,
  };
}

/** Lets Site preferences show a tip immediately as a preview. */
export const SHOW_TIP_EVENT = 'gnomon:show-tip';
export function previewTip(): void {
  window.dispatchEvent(new Event(SHOW_TIP_EVENT));
}
