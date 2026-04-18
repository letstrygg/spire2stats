import { html } from 'satori-html';
import { normalizeId, calculateWinRate } from '../../../sts2/helpers.js';

const PNG_COLORS = {
    ironclad: '#ff6565',
    silent: '#7fff00',
    defect: '#87ceeb',
    necrobinder: '#c18cff',
    regent: '#e67e22'
};

/**
 * Generates the Satori-compatible HTML template for a user summary.
 * @param {object} user - User record from DB.
 * @param {Array} userRuns - Filtered list of runs for this user.
 * @param {object} charLookup - Mapping of character IDs to display names.
 * @param {string} icon - Base64 string of the primary branding icon.
 */
export function getUserSummaryTemplate(user, userRuns, charLookup, icon) {
    const userWins = userRuns.filter(r => r.win).length;
    const userTotal = userRuns.length;
    const userWinRate = calculateWinRate(userRuns).toFixed(1);

    // Calculate Max Ascensions
    const charIds = ['ironclad', 'silent', 'defect', 'necrobinder', 'regent'];
    const maxAscensionsMap = {};
    charIds.forEach(id => maxAscensionsMap[id] = -1);
    userRuns.filter(r => r.win).forEach(run => {
        const cid = normalizeId(run.character);
        if (maxAscensionsMap.hasOwnProperty(cid)) {
            const level = run.ascension || 0;
            if (level > maxAscensionsMap[cid]) maxAscensionsMap[cid] = level;
        }
    });
    const totalCompletedAscensions = Object.values(maxAscensionsMap)
        .reduce((sum, val) => sum + (val === -1 ? 0 : val + 1), 0);

    const characterPanels = charIds.map(charId => {
        const charRuns = userRuns.filter(r => normalizeId(r.character) === charId);
        const color = PNG_COLORS[charId] || '#444';
        const name = charLookup[charId] || charId;
        const wr = calculateWinRate(charRuns).toFixed(1);
        const opacity = charRuns.length > 0 ? 1 : 0.3;

        return `
        <div style="display: flex; flex-direction: column; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-top: 4px solid ${color}; padding: 15px; border-radius: 8px; width: 180px; opacity: ${opacity};">
            <div style="color: ${color}; font-size: 14px; text-transform: uppercase; margin-bottom: 10px;">${name}</div>
            <div style="font-size: 32px; font-weight: bold; color: #fff;">${wr}%</div>
            <div style="font-size: 14px; color: #888;">${charRuns.length} Runs</div>
        </div>`;
    }).join('');

    return html(`
    <div style="display: flex; flex-direction: column; width: 1200px; height: 630px; background-color: #111; color: #e3e3e3; font-family: 'Kreon'; padding: 50px 60px; position: relative;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px;">
            <div style="display: flex; flex-direction: column;">
                <div style="font-size: 24px; color: #00e8ff; font-style: italic; margin-bottom: 5px;">Slay the Spire 2 Stats</div>
                <div style="font-size: 72px; font-weight: bold; color: #fff; line-height: 1;">${user.display_name}</div>
            </div>
            <div style="display: flex; align-items: center; background: rgba(0,0,0,0.4); padding: 20px 30px; border-radius: 12px; border: 1px solid #333;">
                <img src="${icon}" style="width: 60px; height: 60px; margin-right: 20px;" />
                <div style="display: flex; flex-direction: column;">
                            <div style="display: flex; font-size: 32px; font-weight: bold;">
                        <span style="color: #fff;">Ascensions</span>
                        <span style="color: #87ceeb; margin-left: 10px;">${totalCompletedAscensions} / 50</span>
                    </div>
                    <div style="font-size: 24px; color: #888;">${userTotal} Total Runs</div>
                </div>
            </div>
        </div>

        <!-- Main Stats Row -->
        <div style="display: flex; gap: 30px; margin-bottom: 50px;">
            <div style="display: flex; flex-direction: column; flex: 1; background: rgba(0,255,137,0.05); border: 1px solid rgba(0,255,137,0.2); padding: 25px; border-radius: 12px;">
                <div style="font-size: 18px; color: #00ff89; text-transform: uppercase;">Winrate</div>
                <div style="font-size: 64px; font-weight: bold; color: #00ff89;">${userWinRate}%</div>
            </div>
            <div style="display: flex; flex-direction: column; flex: 1; background: rgba(127,255,0,0.05); border: 1px solid rgba(127,255,0,0.2); padding: 25px; border-radius: 12px;">
                <div style="font-size: 18px; color: #7fff00; text-transform: uppercase;">Wins</div>
                <div style="font-size: 64px; font-weight: bold; color: #7fff00;">${userWins}</div>
            </div>
            <div style="display: flex; flex-direction: column; flex: 1; background: rgba(255,75,75,0.05); border: 1px solid rgba(255,75,75,0.2); padding: 25px; border-radius: 12px;">
                <div style="font-size: 18px; color: #ff4b4b; text-transform: uppercase;">Losses</div>
                <div style="font-size: 64px; font-weight: bold; color: #ff4b4b;">${userTotal - userWins}</div>
            </div>
        </div>

        <!-- Character Grid -->
        <div style="display: flex; justify-content: space-between;">
            ${characterPanels}
        </div>

        <!-- Branding Footer -->
        <div style="position: absolute; bottom: 40px; left: 60px; font-size: 20px; color: #444;">
            Generated on spire2stats.com
        </div>
    </div>
    `);
}