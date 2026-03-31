/**
 * Standardized slugification for tags, games, and directories
 */
export function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

/**
 * Converts seconds to "1h 05m 02s" or "05m 02s"
 */
export function formatDuration(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 
        ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` 
        : `${m}m ${String(s).padStart(2, '0')}s`;
}

/**
 * Formats seconds into YouTube/Schema.org ISO 8601 duration (PT1H2M3S)
 */
export function isoDuration(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `PT${h > 0 ? h + 'H' : ''}${m > 0 ? m + 'M' : ''}${s}S`;
}