import { wrapLayout, generateSemanticStatsParagraph, generateItemJsonLd, formatDescription } from './shared.js';

export function ascensionDetailTemplate(asc, stats, videosHtml) {
    const title = asc.name || `Ascension ${asc.level}`;
    return wrapLayout(
        title, 
        `
        <div class="stats-summary">
            ${generateSemanticStatsParagraph(title, stats, 'ascension')}
        </div>
        <div class="item-box">
            <h1>${title}</h1>
            <div class="subtitle">Ascension: Level ${asc.level}</div>
            <div class="description">${formatDescription(asc.description)}</div>
        </div>
        ${videosHtml}`,
        [{ name: 'ascensions', url: '/ascensions/' }, { name: title, url: '' }],
        `${title} winrates and run statistics for Slay the Spire 2.`,
        generateItemJsonLd(title, "Ascension", stats)
    );
}