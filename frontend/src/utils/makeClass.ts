export const makeClass = (...classes: (string | false | undefined | null | 0 | 0n | '')[]) =>
  classes.filter(Boolean).join(' ')
