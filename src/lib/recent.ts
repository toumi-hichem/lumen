/**
 * Return the `count` most recent items, newest first, by a numeric timestamp
 * selector. Does not mutate the input.
 */
export function mostRecent<T>(
  items: readonly T[],
  timestamp: (item: T) => number,
  count: number,
): T[] {
  return [...items].sort((a, b) => timestamp(b) - timestamp(a)).slice(0, count)
}
