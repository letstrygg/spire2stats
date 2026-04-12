import { wrapLayout, generateItemSummaryBox, generateItemJsonLd, formatDescription } from './shared.js';

export function cardDetailTemplate(card, stats, videosHtml, costDisplay, upgCostDisplay, canonicalPath = "", topUser = null) {
    const description = formatDescription(card.description);
    const upgradeDescription = formatDescription(card.upgrade);
    const topUserHtml = topUser ? `
        <div style="text-align: center; margin: 20px 0; font-size: 0.9rem; color: #888;">
            Top <span style="color: var(--gold);">${card.name}</span> Specialist: 
            <a href="/users/${topUser.slug}/" style="color: var(--blue); text-decoration: underline;">${topUser.name}</a> 
            (${topUser.winrate}% winrate over ${topUser.seen} runs)
        </div>` : '';

    return wrapLayout(
        card.name, 
        `
        ${generateItemSummaryBox(card.name, stats)}
        ${topUserHtml}
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
                <div class="cost-circle">${upgCostDisplay}</div>
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