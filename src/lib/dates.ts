/** Datas de operação. Sempre no fuso do processo do servidor. */

export function startOfDay(value: Date = new Date()): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value: Date = new Date()): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function daysAgo(days: number): Date {
  return startOfDay(addDays(new Date(), -days));
}

/** Data local no formato `YYYY-MM-DD` para querystring e `<input type="date">`. */
export function toIsoDate(value: Date = new Date()): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}
