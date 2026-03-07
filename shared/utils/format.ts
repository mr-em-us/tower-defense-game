/** Format a number with comma delimiters and 'c' suffix for credits */
export function fmtC(n: number): string {
  return Math.round(n).toLocaleString() + 'c';
}

/** Format a number with comma delimiters */
export function fmtN(n: number): string {
  return Math.round(n).toLocaleString();
}
