import type { TaskLog } from './types';

export interface ChartDatum {
  label: string;
  date: Date;
  tasks: number;
  credits: number;
}

export interface UsageStats {
  totalTasks: number;
  totalCreditsUsed: number;
  data: ChartDatum[];
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toInt(v: unknown): number {
  if (typeof v === 'number') return Math.trunc(v);
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildUsageStats(logs: TaskLog[], days = 7): UsageStats {
  const now = new Date();
  const today = dateOnly(now);

  const tasksByDay = new Map<string, number>();
  const creditsByDay = new Map<string, number>();
  let totalTasks = 0;
  let totalCreditsUsed = 0;

  for (const log of logs) {
    const createdAt = new Date(log.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    const day = dateOnly(createdAt);
    const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
    if (diff < 0 || diff >= days) continue;

    const key = day.toDateString();
    const tasks = toInt(log.ordersCount);
    const credits = toInt(log.creditsUsed);
    tasksByDay.set(key, (tasksByDay.get(key) || 0) + tasks);
    creditsByDay.set(key, (creditsByDay.get(key) || 0) + credits);
    totalTasks += tasks;
    totalCreditsUsed += credits;
  }

  const data: ChartDatum[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 86400000);
    const key = day.toDateString();
    data.push({
      label: DAYS[day.getDay()],
      date: day,
      tasks: tasksByDay.get(key) || 0,
      credits: creditsByDay.get(key) || 0,
    });
  }

  return { totalTasks, totalCreditsUsed, data };
}
