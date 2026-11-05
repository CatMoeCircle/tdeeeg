/** 字节数 → 人类可读体积（1024 进制）。 */
export function formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return (val >= 100 ? val.toFixed(0) : val.toFixed(1)) + ' ' + units[i];
}
