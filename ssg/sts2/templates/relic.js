import { wrapLayout, generateSemanticStatsParagraph, generateItemJsonLd, formatDescription } from './shared.js';

export function relicDetailTemplate(relic, stats, videosHtml) {
    const subtitle = [relic.rarity, relic.pool ? `${relic.pool} Pool` : null].filter(Boolean).join(' • ');
    const descriptionHtml = formatDescription(relic.description || relic.description_raw || "");

    return wrapLayout(
        relic.name,
        `
        <div class="stats-summary">
            ${generateSemanticStatsParagraph(relic.name, stats, 'relic')}
        </div>
        <div class="relic-box">
            <div class="subtitle">${subtitle}</div>
            <div class="description">${descriptionHtml}</div>
            ${relic.flavor ? `<div class="flavor">${relic.flavor}</div>` : ''}
        </div>
        ${videosHtml}`,
        [{ name: 'relics', url: '/relics/' }, { name: relic.name.toLowerCase(), url: '' }],
        `${relic.name} ${stats.formatted}% winrate across ${stats.seen} runs on Slay the Spire 2.`,
        generateItemJsonLd(relic.name, "Relic", stats)
    );
}