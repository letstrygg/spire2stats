import { wrapLayout, generateSemanticStatsParagraph, generateItemJsonLd, formatDescription, CHARACTER_COLORS } from './shared.js';

export function characterDetailTemplate(char, stats, videosHtml, cardItemsHtml, relicItemsHtml, displayName, globalWinRate, topStats) {
    const diff = stats.num - globalWinRate;
    const diffAbs = Math.abs(diff).toFixed(1);
    let relationship = 'from';
    if (diff > 0) relationship = 'above';
    else if (diff < 0) relationship = 'below';

    const charId = (char.character_id || '').replace('CHARACTER.', '').toUpperCase();
    const charColor = CHARACTER_COLORS[charId] || 'var(--gray)';

    const highlights = [];
    if (topStats.card) highlights.push(`Most popular card is <strong style="padding-left:6px;">${topStats.card.name}</strong> (used in ${topStats.card.count} runs)`);
    if (topStats.relic) highlights.push(`Most popular relic is <strong style="padding-left:6px;">${topStats.relic.name}</strong> (found in ${topStats.relic.count} runs)`);
    if (topStats.killer) highlights.push(`Deadliest foe is <strong style="padding-left:6px;">${topStats.killer.name}</strong> (ended ${topStats.killer.count} runs)`);

    const comparisonHtml = stats.seen > 0 ? 
        `<div style="text-align: center; margin-top: 15px; font-size: 1rem;">
            <span style="color: ${charColor}">${displayName}</span> has a <span style="color: ${stats.color}">${stats.formatted}%</span> winrate across ${stats.seen} runs, 
            <span style="color: ${stats.color}">${diffAbs}% ${relationship}</span> the character average.
        </div>` : '';

    const highlightsHtml = highlights.length > 0 ? `
        <div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; margin-top: 15px; opacity: 0.8; font-size: 0.9rem;">
            ${highlights.map(h => `<div style="display: flex; align-items: center;">${h}</div>`).join('')}
        </div>` : '';

    const pageTitle = `${displayName} Character Winrates & Statistics`;
    const metaDesc = `${displayName} ${stats.formatted}% winrate across ${stats.seen} runs on Slay the Spire 2.`;

    return wrapLayout(
        pageTitle, 
        `
        <h1 style="font-size: 1.6rem; margin-bottom: 10px;">${displayName} Character Winrates & Statistics</h1>
        <div style="margin-bottom: 40px;">
            ${generateSemanticStatsParagraph(displayName, stats, 'character')}
            ${highlightsHtml}
            ${comparisonHtml}
        </div>
        ${videosHtml}
        <div style="margin-top: 30px;">
            <h3 style="margin-bottom: 15px;">${displayName} Specific Cards</h3>
            <div class="grid">${cardItemsHtml}</div>
        </div>
        <div style="margin-top: 30px;">
            <h3 style="margin-bottom: 15px;">${displayName} Specific Relics</h3>
            <div class="grid">${relicItemsHtml}</div>
        </div>`,
        [{ name: 'characters', url: '/characters/' }, { name: displayName, url: '' }],
        metaDesc,
        generateItemJsonLd(pageTitle, "Character", stats)
    );
}