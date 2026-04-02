import { wrapLayout, generateLethalitySummaryBox, generateItemJsonLd } from './shared.js';

export function monsterDetailTemplate(monster, stats, averagesHtml, lethalRunsHtml, subtitle) {
    return wrapLayout(
        monster.name, 
        `
        ${generateLethalitySummaryBox(stats, "Monster")}
        ${averagesHtml}
        <div class="item-box">
            <h1>${monster.name}</h1>
            <div class="subtitle">${subtitle}</div>
            <div class="description">
                <p>Monster behavior data and finishing blow records for Slay the Spire 2.</p>
            </div>
        </div>
        ${lethalRunsHtml ? `<div style="margin-top: 40px;"><h3>Lethal Runs</h3><p class="text-muted">Runs where this monster delivered the finishing blow:</p>${lethalRunsHtml}</div>` : ''}`,
        [{ name: 'monsters', url: '/monsters/' }, { name: monster.name, url: '' }],
        `${monster.name} lethality statistics and kill history for Slay the Spire 2.`,
        generateItemJsonLd(monster.name, "Monster", null)
    );
}