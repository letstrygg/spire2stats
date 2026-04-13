import { wrapLayout, generateSemanticStatsParagraph, generateItemJsonLd, formatDescription, CHARACTER_COLORS } from './shared.js';
import { normalizeId } from '../helpers.js';

export function characterDetailTemplate(char, stats, videosHtml, cardItemsHtml, relicItemsHtml, displayName, globalWinRate, topStats, performancePanelsHtml) {
    const diff = stats.num - globalWinRate;
    const diffAbs = Math.abs(diff).toFixed(1);
    let relationship = 'from';
    if (diff > 0) relationship = 'above';
    else if (diff < 0) relationship = 'below';

    const charId = normalizeId(char.character_id);
    const charColor = CHARACTER_COLORS[charId] || 'var(--gray)';

    const highlights = [];
    if (topStats.card) highlights.push(`Most popular card is <strong title="${topStats.card.name} was used in ${topStats.card.count} runs" style="padding:0px 4px;">${topStats.card.name}</strong> (used in ${topStats.card.count} runs)`);
    if (topStats.relic) highlights.push(`Most popular relic is <strong title="${topStats.relic.name} was found in ${topStats.relic.count} runs" style="padding-left:0px 4px;">${topStats.relic.name}</strong> (found in ${topStats.relic.count} runs)`);
    if (topStats.killer) highlights.push(`Deadliest foe is <strong title="${topStats.killer.name} ended ${topStats.killer.count} runs" style="padding-left:0px 4px;">${topStats.killer.name}</strong> (ended ${topStats.killer.count} runs)`);

    const comparisonHtml = stats.seen > 0 ? 
        `<div style="text-align: center; margin-top: 15px; font-size: 1rem;" title="${displayName} has a ${stats.formatted}% winrate across ${stats.seen} runs">
            <span style="color: ${charColor}">${displayName}</span> has a <span style="color: ${stats.color}">${stats.formatted}%</span> winrate across <span>${stats.seen} runs</span>, 
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
        <div style="margin-bottom: 40px;" class="${charId}">
            ${generateSemanticStatsParagraph(displayName, stats, 'character')}
            ${highlightsHtml}
            ${comparisonHtml}
        </div>
        ${performancePanelsHtml}
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