export const FALLBACK_USD_KRW_RATE = 1500;

export function isKrwTicker(ticker: string): boolean {
  return /^[0-9]/.test(ticker);
}

export function toKrw(value: number, ticker: string, usdKrwRate: number): number {
  return isKrwTicker(ticker) ? value : value * usdKrwRate;
}
