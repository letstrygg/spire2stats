import { wrapLayout, generateItemSummaryBox, generateItemJsonLd, formatDescription } from './shared.js';

export function cardDetailTemplate(card, stats, videosHtml, costDisplay, canonicalPath = "") {
    const description = formatDescription(card.description);
    const upgradeDescription = formatDescription(card.upgrade);
    return wrapLayout(
        card.name, 
        `
        ${generateItemSummaryBox(card.name, stats)}
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
                <div class="description">${upgradeDescription || description}</div>
                <div class="card-footer">${card.rarity}</div>
            </div>
        </div>
        ${videosHtml}`,
        [{ name: 'cards', url: '/cards/' }, { name: card.name, url: '' }],
        `${card.name} ${stats.formatted}% winrate across ${stats.seen} runs on Slay the Spire 2.`,
        generateItemJsonLd(card.name, "Card", stats),
        canonicalPath
    );
}