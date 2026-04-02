import { wrapLayout, generateSemanticStatsParagraph, generateItemJsonLd, formatDescription } from './shared.js';

export function enchantmentDetailTemplate(enchantment, stats, videosHtml) {
    const title = enchantment.name;
    const descriptionHtml = formatDescription(enchantment.description || "");
    const extraText = enchantment.extra_card_text ? `<div class="extra-text">Adds: ${formatDescription(enchantment.extra_card_text)}</div>` : '';

    return wrapLayout(
        title, 
        `
        <div class="stats-summary">
            ${generateSemanticStatsParagraph(title, stats, 'enchantment')}
        </div>
        <div class="item-box">
            <h1>${title}</h1>
            <div class="subtitle">Enchantment • ${enchantment.card_type || 'Any'}</div>
            <div class="description">${descriptionHtml}</div>
            ${extraText}
        </div>
        ${videosHtml}`,
        [{ name: 'enchantments', url: '/enchantments/' }, { name: title, url: '' }],
        `${title} enchantment winrates and run statistics for Slay the Spire 2.`,
        generateItemJsonLd(title, "Enchantment", stats)
    );
}