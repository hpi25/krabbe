/** Create an array of integers from start to end (inclusive) */
export const range = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i)

/**
 * Rotate an array to the right by the given amount, wrapping elements around
 * @example rotateArray([1, 2, 3]) // [3, 1, 2]
 */
export const rotateArray = <T>(arr: T[], amount = 1): T[] => {
  if (arr.length === 0) return []
  const shift = ((amount % arr.length) + arr.length) % arr.length
  return [...arr.slice(arr.length - shift), ...arr.slice(0, arr.length - shift)]
}

/** Split an array into groups, starting a new group wherever shouldSplit(previous, current) is true */
export const splitArrayBy = <T>(arr: T[], shouldSplit: (a: T, b: T) => boolean): T[][] =>
  arr.reduce<T[][]>((groups, item, i) => {
    if (i === 0 || shouldSplit(arr[i - 1], item)) groups.push([item])
    else groups[groups.length - 1].push(item)
    return groups
  }, [])

export const isKeyOfObject = <T extends object>(key: PropertyKey, obj: T): key is keyof T => Object.hasOwn(obj, key)
