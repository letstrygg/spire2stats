import { wrapLayout, generateSemanticStatsParagraph, generateItemJsonLd, formatDescription, getCharacterBgStyle } from './shared.js';

export function relicDetailTemplate(relic, stats, videosHtml) {
    const subtitle = [relic.rarity, relic.pool ? `${relic.pool} Pool` : null].filter(Boolean).join(' • ');
    const descriptionHtml = formatDescription(relic.description || relic.description_raw || "");
    const bgStyle = getCharacterBgStyle(relic.pool);

    return wrapLayout(
        relic.name,
        `
        <div class="stats-summary">
            ${generateSemanticStatsParagraph(relic.name, stats, 'relic')}
        </div>
        <div class="relic-box" style="${bgStyle}">
            <h1>${relic.name}</h1>
            <div class="subtitle">${subtitle}</div>
            <div class="description">${descriptionHtml}</div>
            ${relic.flavor ? `<div class="flavor">${relic.flavor}</div>` : ''}
        </div>
        ${videosHtml}`,
        [{ name: 'relics', url: '/relics/' }, { name: relic.name.toLowerCase(), url: '' }],
        `${relic.name} relic winrates and run statistics for Slay the Spire 2, based on tracked gameplay.`,
        generateItemJsonLd(relic.name, "Relic", stats)
    );
}