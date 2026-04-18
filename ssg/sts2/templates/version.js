import { 
    wrapLayout, 
    generateItemJsonLd, 
    generateSemanticStatsParagraph,
    generateSummaryPanel,
    generateCollectionJsonLd,
    generateCardItemHtml,
    getItemStats
} from './shared.js';
import { slugify } from '../paths.js';

/** Sort logic: Major versions descending, children ascending within groups. */
export function sortVersions(minorKeys, majorKeys) {
    return [...new Set([...minorKeys, ...majorKeys])].sort((a, b) => {
        const getMajor = (v) => v.split('.').slice(0, 2).join('.');
        const majorA = getMajor(a);
        const majorB = getMajor(b);

        if (majorA !== majorB) {
            return majorB.localeCompare(majorA, undefined, { numeric: true });
        }

        const partsA = a.split('.');
        const partsB = b.split('.');

        // Major version (fewer parts) comes first in its group
        if (partsA.length !== partsB.length) {
            return partsA.length - partsB.length;
        }

        // Same length (e.g. two minor versions), sort ascending
        return a.localeCompare(b, undefined, { numeric: true });
    });
}

export function versionDetailTemplate(version, stats, videosHtml) {
    const title = `Build ${version}`;
    
    return wrapLayout(
        title, 
        `
        <div class="stats-summary">
            ${generateSemanticStatsParagraph(title, stats, 'version')}
        </div>
        <div class="item-box">
            <h1>${title}</h1>
            <div class="subtitle">Game Version</div>
            <div class="description">
                <p>Run statistics, winrates, and performance history for Slay the Spire 2 build version <strong>${version}</strong>.</p>
            </div>
        </div>
        ${videosHtml}`,
        [{ name: 'versions', url: '/versions/' }, { name: version, url: '' }],
        `${title} winrates and run statistics for Slay the Spire 2.`,
        generateItemJsonLd(title, "Version", stats),
        `/versions/${slugify(version)}/`
    );
}

export function versionIndexTemplate(runStats, allVersionKeys) {
    const majorKeys = allVersionKeys.filter(v => v.split('.').length === 2);
    const minorKeys = allVersionKeys.filter(v => v.split('.').length === 3);

    const majorLinks = majorKeys.map(v => {
        const slug = slugify(v);
        const stats = getItemStats(runStats.majorVersionStats[v], runStats.globalWinRate);
        return generateCardItemHtml(`/versions/${slug}/`, v, stats, 'major-version');
    }).join('');

    const minorLinks = minorKeys.map(v => {
        const slug = slugify(v);
        const stats = getItemStats(runStats.versionStats[v], runStats.globalWinRate);
        return generateCardItemHtml(`/versions/${slug}/`, v, stats);
    }).join('');

    const indexDesc = `Performance statistics and run history for Slay the Spire 2 build versions.`;
    return wrapLayout('Versions', `
        ${generateSummaryPanel(runStats, "Versions", majorKeys.length, runStats.uniqueVersionsSeen)}
        <div class="grid">${majorLinks}</div>
        <h3 style="margin-top: 40px; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 10px;">Specific Build Versions</h3>
        <div class="grid">${minorLinks}</div>`, [{ name: 'versions', url: '' }], indexDesc, generateCollectionJsonLd(`Versions`, indexDesc));
}