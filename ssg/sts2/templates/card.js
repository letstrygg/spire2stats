import { wrapLayout, generateItemSummaryBox, generateItemJsonLd, formatDescription, CHARACTER_COLORS, generateVideoPanel } from './shared.js';
import { normalizeId } from '../helpers.js';

/** Formats numeric cost and star cost into a string (e.g. "1 1★") */
function getCostDisplay(costVal, isX, starCostVal, isXStar) {
    let cost = isX ? 'X' : (costVal === -1 || costVal === undefined || costVal === null ? '' : String(costVal));
    let star = isXStar ? 'X★' : (starCostVal === undefined || starCostVal === null ? '' : `${starCostVal}★`);
    return [cost, star].filter(s => s !== '').join(' ');
}

/** Generates the HTML for a card's energy cost icon and value */
export function generateCostHtml(card, overrideCost = null, overrideStar = null) {
    const mainColors = new Set(['ironclad', 'silent', 'defect', 'necrobinder', 'regent']);
    const iconKey = mainColors.has(normalizeId(card.color)) ? normalizeId(card.color) : 'colorless';
    const iconUrl = `/images/sts2_images/ui/compendium/card/energy_${iconKey}.png`;
    const text = getCostDisplay(overrideCost ?? card.cost, card.is_x_cost, overrideStar ?? card.star_cost, card.is_x_star_cost);
    if (!text && text !== '0') return '';
    return `<img src="${iconUrl}" class="cost-icon" alt="Energy"><span class="cost-value">${text}</span>`;
}

export function cardDetailTemplate(card, stats, videosHtml, costDisplay, upgCostDisplay, canonicalPath = "", topUser = null, energyIconHtml = "") {
    const description = formatDescription(card.description, energyIconHtml);
    const upgradeDescription = formatDescription(card.upgrade, energyIconHtml);
    const charKey = card.color ? normalizeId(card.color) : null;
    const charColor = CHARACTER_COLORS[charKey] || 'var(--text)';
    const topUserHtml = topUser ? `
        <div style="text-align: center; margin: 20px 0; font-size: 0.9rem; color: #888;">
            Top <span style="color: ${charColor};">${card.name}</span> Specialist: 
            <a href="/users/${topUser.slug}/" style="color: var(--blue); text-decoration: underline;">${topUser.name}</a> 
            (${topUser.winrate}% winrate over ${topUser.seen} runs)
        </div>` : '';

    return wrapLayout(
        card.name, 
        `
        ${generateItemSummaryBox(card.name, stats)}
        ${topUserHtml}
        <div class="card-display">
            <div class="card ${charKey}">
                <div class="cost-circle">${costDisplay}</div>
                <div class="card-title">${card.name}</div>
                <div class="type-banner">${card.color || ''} ${card.type}</div>
                <div class="description">${description}</div>
                <div class="card-footer">${card.rarity}</div>
            </div>
            <div class="card-arrow">→</div>
            <div class="card ${charKey}">
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