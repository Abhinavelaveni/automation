const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatCompactNumber(value: number): string {
  const v = Math.abs(value);
  if (v >= 1000000) {
    const d = v / 1000000;
    return `${d.toFixed(v >= 10000000 ? 0 : 1)}M`;
  }
  if (v >= 1000) {
    const d = v / 1000;
    return `${d.toFixed(v >= 10000 ? 0 : 1)}k`;
  }
  if (value === Math.round(value)) return `${value}`;
  return value.toFixed(1);
}

export function formatChartValue(value: number): string {
  if (value === Math.round(value)) return `${value}`;
  return value.toFixed(1);
}

export function formatDayLabel(date: Date): string {
  return DAYS[date.getDay()];
}

export function formatDateMedium(date: Date): string {
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]}`;
}

export function formatDateLong(date: Date): string {
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatTime(date: Date): string {
  let h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${pad(h)}:${pad(m)} ${ampm}`;
}

export function formatDateShort(date: Date): string {
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]}`;
}
