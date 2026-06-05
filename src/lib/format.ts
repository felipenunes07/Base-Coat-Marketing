export function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

export function compact(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 10000 ? 1 : 0
  }).format(value);
}

export function roas(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A';
  }

  return `${value.toFixed(2)}x`;
}

export function moneyWithCents(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}
