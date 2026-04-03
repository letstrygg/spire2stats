import { wrapLayout, generateSemanticStatsParagraph, generateItemJsonLd, formatDescription, CHARACTER_COLORS } from './shared.js';

export function characterDetailTemplate(char, stats, videosHtml, cardItemsHtml, relicItemsHtml, displayName, globalWinRate, topStats) {
    const diff = stats.num - globalWinRate;
    const diffAbs = Math.abs(diff).toFixed(1);
    let relationship = 'from';
    if (diff > 0) relationship = 'above';
    else if (diff < 0) relationship = 'below';

    const charId = (char.character_id || '').replace('CHARACTER.', '').toUpperCase();
    const charColor = CHARACTER_COLORS[charId] || 'var(--gray)';

    const comparisonText = stats.seen > 0 ? 
        `<div style="text-align: center; margin-top: 15px; font-size: 0.95rem; opacity: 0.9;">
            <span style="color: ${charColor}">${displayName}</span> has a <span style="color: ${stats.color}">${stats.formatted}%</span> winrate across ${stats.seen} runs, 
            <span style="color: ${stats.color}">${diffAbs}% ${relationship}</span> the character average.
        </div>` : '';

    const highlights = [];
    if (topStats.card) highlights.push(`Most popular card is <strong>${topStats.card.name}</strong> (used in ${topStats.card.count} runs)`);
    if (topStats.relic) highlights.push(`Most popular relic is <strong>${topStats.relic.name}</strong> (found in ${topStats.relic.count} runs)`);
    if (topStats.killer) highlights.push(`Deadliest foe is <strong>${topStats.killer.name}</strong> (ended ${topStats.killer.count} runs)`);

    const highlightsHtml = highlights.length > 0 ? `
        <div class="highlights-panel" style="margin: 20px 0; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.95rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: center;">
                ${highlights.map(h => `<div style="display: flex; align-items: center; gap: 8px;"><span class="material-symbols-outlined" style="font-size: 18px; color: var(--gold);">verified</span> <span>${h}</span></div>`).join('')}
            </div>
        </div>` : '';

    const pageTitle = `${displayName} Character`;
    const metaDesc = `${displayName} ${stats.formatted}% winrate across ${stats.seen} runs on Slay the Spire 2.`;

    return wrapLayout(
        pageTitle, 
        `
        <h1>${displayName}</h1>
        <div class="stats-summary" style="margin-bottom: 10px;">
            ${generateSemanticStatsParagraph(displayName, stats, 'character')}
            ${comparisonText}
        </div>
        ${highlightsHtml}
        <div style="background: #1a1a1a; padding: 25px; border-radius: 12px; border: 1px solid #333; line-height: 1.6; max-width: 800px;">${formatDescription(char.description)}</div>
        ${videosHtml}
        <h2 class="section-title">${displayName} Specific Cards</h2>
        <div class="grid">${cardItemsHtml}</div>
        <h2 class="section-title">${displayName} Specific Relics</h2>
        <div class="grid">${relicItemsHtml}</div>`,
        [{ name: 'characters', url: '/characters/' }, { name: displayName, url: '' }],
        metaDesc,
        generateItemJsonLd(pageTitle, "Character", stats)
    );
}