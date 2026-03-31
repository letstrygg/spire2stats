import { wrapLayout, generateSemanticStatsParagraph, generateItemJsonLd, formatDescription } from './shared.js';

export function cardDetailTemplate(card, stats, videosHtml, costDisplay) {
    const description = formatDescription(card.description);
    return wrapLayout(
        card.name, 
        `
        <div class="stats-summary">
            ${generateSemanticStatsParagraph(card.name, stats, 'card')}
        </div>
        <div class="card-display">
            <div class="card">
                <div class="cost-circle">${costDisplay}</div>
                <div class="card-title">${card.name}</div>
                <div class="type-banner">${card.color || ''} ${card.type}</div>
                <div class="description">${description}</div>
                <div class="card-footer">${card.rarity}</div>
            </div>
            <div class="card-arrow">→</div>
            <div class="card">
                <div class="cost-circle">${costDisplay}</div>
                <div class="card-title text-green">${card.name}+</div>
                <div class="type-banner">${card.color || ''} ${card.type}</div>
                <div class="description">${description}</div>
                <div class="card-footer">${card.rarity}</div>
            </div>
        </div>
        ${videosHtml}`,
        [{ name: 'cards', url: '/cards/' }, { name: card.name, url: '' }],
        `${card.name} card winrates and run statistics for Slay the Spire 2.`,
        generateItemJsonLd(card.name, "Card", stats)
    );
}