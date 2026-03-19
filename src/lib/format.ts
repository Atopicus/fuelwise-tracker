/**
 * Format a number using comma as decimal separator (European format).
 * @param value - number to format
 * @param decimals - number of decimal places (default 2)
 * @returns formatted string with comma decimal separator
 */
export function fmtNum(value: number, decimals = 2): string {
  return value.toFixed(decimals).replace(".", ",");
}
