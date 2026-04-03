import { wrapLayout, generateSemanticStatsParagraph, generateItemJsonLd, formatDescription } from './shared.js';

export function characterDetailTemplate(char, stats, videosHtml, cardItemsHtml, relicItemsHtml, displayName, globalWinRate) {
    const diff = stats.num - globalWinRate;
    const comparisonText = stats.seen > 0 ? 
        `<div style="text-align: center; margin-top: 15px; font-size: 0.95rem; opacity: 0.9;">
            This character is currently <strong>${diff >= 0 ? 'above' : 'below'}</strong> the global average winrate 
            of ${globalWinRate.toFixed(1)}% by <span style="color: ${stats.color}">${Math.abs(diff).toFixed(1)}%</span>.
        </div>` : '';

    const pageTitle = `${displayName} Character`;
    const metaDesc = `${displayName} ${stats.formatted}% winrate across ${stats.seen} runs on Slay the Spire 2.`;

    return wrapLayout(
        pageTitle, 
        `
        <h1>${displayName}</h1>
        <div class="stats-summary" style="margin-bottom: 30px;">
            ${generateSemanticStatsParagraph(displayName, stats, 'character')}
            ${comparisonText}
        </div>
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