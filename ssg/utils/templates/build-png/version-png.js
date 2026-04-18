import { html } from 'satori-html';

/**
 * Generates the Satori-compatible HTML template for a version summary image.
 * Shows the 6 most recent major versions.
 */
export function getVersionSummaryTemplate(versions, icon) {
    const totalSetWins = versions.reduce((s, v) => s + v.wins, 0);
    const totalSetRuns = versions.reduce((s, v) => s + v.total, 0);
    const setAvg = totalSetRuns > 0 ? (totalSetWins / totalSetRuns) * 100 : 0;

    const versionPanels = versions.map(v => {
        const winRateNum = v.total > 0 ? (v.wins / v.total) * 100 : 0;
        const winrate = winRateNum.toFixed(1);
        const diff = winRateNum - setAvg;
        const diffColor = diff >= 0 ? '#00ff89' : '#ff4b4b';
        const diffSign = diff >= 0 ? '+' : '';
        
        return `
        <div style="display: flex; flex-direction: column; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-top: 4px solid #00e8ff; padding: 20px; border-radius: 12px; width: 340px; margin-bottom: 20px;">
            <div style="color: #00e8ff; font-size: 32px; margin-bottom: 8px; font-weight: bold; letter-spacing: 1px;">${v.id}</div>
            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div style="display: flex; align-items: flex-start; font-size: 38px; font-weight: bold; color: #fff; line-height: 1;">
                    <span style="align-self: flex-end;">${winrate}%</span>
                    <span style="font-size: 22px; color: ${diffColor}; margin-left: 6px; font-weight: normal; transform: translateY(-6px);">(${diffSign}${diff.toFixed(1)})</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                    <div style="font-size: 16px; color: #00ff89; font-weight: bold;">Wins ${v.wins}</div>
                    <div style="font-size: 16px; color: #ff4b4b; font-weight: bold;">Losses ${v.total - v.wins}</div>
                    <div style="font-size: 16px; color: #888; margin-top: 4px;">Total Runs ${v.total}</div>
                </div>
            </div>
        </div>`;
    }).join('');

    return html(`
    <div style="display: flex; flex-direction: column; width: 1200px; height: 630px; background-color: #111; color: #e3e3e3; font-family: 'Kreon'; padding: 50px 60px; position: relative;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px;">
            <div style="display: flex; flex-direction: column;">
                <div style="font-size: 24px; color: #00e8ff; font-style: italic; margin-bottom: 5px;">Slay the Spire 2 Stats</div>
                <div style="font-size: 72px; font-weight: bold; color: #fff; line-height: 1;">Versions</div>
            </div>
            <div style="display: flex; align-items: center; background: rgba(0,0,0,0.4); padding: 20px 30px; border-radius: 12px; border: 1px solid #333;">
                <img src="${icon}" style="width: 104px; height: 60px; margin-right: 20px;" />
                <div style="display: flex; flex-direction: column;">
                    <div style="font-size: 32px; font-weight: bold; color: #fff;">Recent Versions</div>
                    <div style="font-size: 24px; color: #888;">${totalSetRuns} Total Runs</div>
                </div>
            </div>
        </div>

        <!-- Versions Grid -->
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; row-gap: 25px;">
            ${versionPanels}
        </div>

        <!-- Branding Footer -->
        <div style="position: absolute; bottom: 40px; left: 60px; font-size: 20px; color: #444;">
            Generated on spire2stats.com
        </div>
    </div>
    `);
}