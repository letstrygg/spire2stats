import { wrapLayout, generateLethalitySummaryBox, generateItemJsonLd } from './shared.js';

export function monsterDetailTemplate(monster, stats, averagesHtml, lethalRunsHtml, subtitle) {
    return wrapLayout(
        monster.name, 
        `
        ${generateLethalitySummaryBox(stats, "Monster")}
        ${averagesHtml}
        <div class="item-box ${monster.type ? monster.type.toLowerCase() : ''}">
            <div class="subtitle" style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                ${monster.type ? `
                    <img src="${monster.type === 'Boss' ? '/images/map_boss.png' : (monster.type === 'Elite' ? '/images/sts2_images/ui/map_nodes/map_elite.png' : '/images/sts2_images/ui/map_nodes/map_monster.png')}" alt="${monster.type}" style="height: 32px; width: auto;">
                ` : ''}
                ${monster.type ? `
                    <span style="color: ${monster.type === 'Boss' ? 'var(--gold)' : (monster.type === 'Elite' ? 'var(--red)' : '#888')}; font-weight: bold; text-transform: uppercase; font-size: 0.75rem; border: 1px solid currentColor; padding: 2px 8px; border-radius: 4px; letter-spacing: 1px;">${monster.type}</span>
                ` : ''}
                ${monster.min_hp ? `<span style="color: #888;">${monster.min_hp}-${monster.max_hp} HP</span>` : ''}
            </div>
            <div class="description">
                <p>Monster behavior data and finishing blow records for Slay the Spire 2.</p>
            </div>
        </div>
        ${lethalRunsHtml ? `<div style="margin-top: 40px;"><h3>Lethal Runs</h3><p class="text-muted">Runs where this monster delivered the finishing blow:</p>${lethalRunsHtml}</div>` : ''}`,
        [{ name: 'monsters', url: '/monsters/' }, { name: monster.name, url: '' }],
        `${monster.name} has killed ${stats.kills || 0} players across ${stats.encountered || 0} encounters on Slay the Spire 2.`,
        generateItemJsonLd(monster.name, "Monster", null)
    );
}