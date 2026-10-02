export const BYTES_PER_GB = 1024 * 1024 * 1024;

export function formatGigabytes(bytes: number): string {
  const gigabytes = (bytes / BYTES_PER_GB).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${gigabytes} GB`;
}
