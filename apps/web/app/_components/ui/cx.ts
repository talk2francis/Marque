/** Join class names, dropping the falsy ones. */
export const cx = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(' ')
