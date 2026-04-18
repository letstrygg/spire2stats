import { wrapLayout, generateItemJsonLd, generateSemanticStatsParagraph } from './shared.js';
import { slugify } from '../paths.js';

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