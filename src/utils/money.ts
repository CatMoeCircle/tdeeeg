/**
 * TDLib 金额格式化：total_amount / amount 为货币最小单位整数。
 * 除数按 ISO 4217 默认 2 位小数；部分货币 0 或 3 位；XTR 为 Telegram Stars 整数。
 */

const EXPONENTS: Record<string, number> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  JPY: '¥',
  RUB: '₽',
  TRY: '₺',
  UAH: '₴',
  KZT: '₸',
  BYN: 'Br',
  INR: '₹',
  VND: '₫',
  ILS: '₪',
  KRW: '₩',
  PHP: '₱',
  THB: '฿',
  NGN: '₦',
  GEL: '₾',
  AMD: '֏',
  AZN: '₼',
  XTR: '⭐',
};

function exponentOf(currency: string): number {
  if (currency === 'XTR') return 0;
  return EXPONENTS[currency] ?? 2;
}

/** 将最小单位金额格式化为可读数字字符串（不含符号），整数部分不带多余小数 */
export function formatAmountNumber(amount: number, currency: string): string {
  const exp = exponentOf(currency);
  const factor = 10 ** exp;
  const value = amount / factor;
  if (exp === 0) return String(Math.round(value));
  const fixed = value.toFixed(exp);
  // 去掉多余尾零：490.00 → 490，490.50 → 490.5
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** 货币符号（无已知符号时回退 ISO 代码） */
export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? currency;
}

/**
 * 账单角标文案，例如：¥490、$4.99、⭐15。
 * Stars（XTR）用星标 + 数字。
 */
export function formatInvoiceAmount(amount: number, currency: string): string {
  const num = formatAmountNumber(amount, currency);
  if (currency === 'XTR') return `${num} ${currencySymbol('XTR')}`;
  const sym = currencySymbol(currency);
  // 已是 ISO 代码（无符号）时加空格，避免与数字粘连
  if (sym === currency) return `${num} ${currency}`;
  return `${sym}${num}`;
}
