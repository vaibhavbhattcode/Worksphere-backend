// utils/dateUtils.js

/**
 * Formats a Date object as 'dd mm yyyy'.
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d} ${m} ${y}`;
}

/**
 * Formats a Date object as 'HH:MM AM/PM'.
 * @param {Date} date
 * @returns {string}
 */
export function formatTime(date) {
  if (!(date instanceof Date)) date = new Date(date);
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  h = h ? h : 12;
  return `${h}:${m} ${ampm}`;
}
