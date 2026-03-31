import { wrapLayout, generateSemanticStatsParagraph, generateItemJsonLd, formatDescription } from './shared.js';

export function characterDetailTemplate(char, stats, videosHtml, cardItemsHtml, relicItemsHtml, displayName) {
    return wrapLayout(
        char.name, 
        `
        <h1>${displayName}</h1>
        <div class="stats-summary">
            ${generateSemanticStatsParagraph(displayName, stats, 'character')}
        </div>
        <div style="background: #1a1a1a; padding: 25px; border-radius: 12px; border: 1px solid #333; line-height: 1.6; max-width: 800px;">${formatDescription(char.description)}</div>
        ${videosHtml}
        <h2 class="section-title">${displayName} Cards</h2>
        <div class="grid">${cardItemsHtml}</div>
        <h2 class="section-title">${displayName} Relics</h2>
        <div class="grid">${relicItemsHtml}</div>`,
        [{ name: 'characters', url: '/characters/' }, { name: displayName, url: '' }],
        `${displayName} winrates and run statistics for Slay the Spire 2.`,
        generateItemJsonLd(displayName, "Character", stats)
    );
}