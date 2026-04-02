import { wrapLayout, generateLethalitySummaryBox, generateItemJsonLd } from './shared.js';

export function encounterDetailTemplate(encounter, stats, averagesHtml, lethalRunsHtml, subtitle) {
    return wrapLayout(
        encounter.name, 
        `
        ${generateLethalitySummaryBox(stats, "Encounter")}
        ${averagesHtml}
        <div class="item-box">
            <h1>${encounter.name}</h1>
            <div class="subtitle">${subtitle}</div>
            <div class="description">
                <p>Encounter composition and historical statistics from tracked Slay the Spire 2 gameplay.</p>
            </div>
        </div>
        ${lethalRunsHtml ? `<div style="margin-top: 40px;"><h3>Lethal Runs</h3><p class="text-muted">Runs where this encounter defeated the player:</p>${lethalRunsHtml}</div>` : ''}`,
        [{ name: 'encounters', url: '/encounters/' }, { name: encounter.name, url: '' }],
        `${encounter.name} encounter lethality statistics and history for Slay the Spire 2.`,
        generateItemJsonLd(encounter.name, "Encounter", null)
    );
}