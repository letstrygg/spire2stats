import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import satori from 'satori';
import { html } from 'satori-html';
import { Resvg } from '@resvg/resvg-js';
import { PATHS, slugify } from '../sts2/paths.js';
import { isRunByUser, normalizeId, calculateWinRate } from '../sts2/helpers.js';
import { CHARACTER_COLORS } from '../sts2/templates/shared.js';

/**
 * Slay the Spire 2 - User Summary PNG Generator
 * Generates a 1200x630 summary image for each user.
 */

const db = new sqlite3.Database(PATHS.DATABASE);

async function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Helper to convert local images to Base64 for Satori
function getBase64Image(localPath) {
    const fullPath = path.resolve(PATHS.WEB_ROOT, localPath.startsWith('/') ? localPath.slice(1) : localPath);
    if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ Warning: Image not found at ${fullPath}`);
        return '';
    }
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).slice(1);
    return `data:image/${ext};base64,${buffer.toString('base64')}`;
}

async function generateUserPng() {
    try {
        console.log('🖼️  Starting PNG generation process...');

        // 1. Load Fonts (Download Kreon-Regular.ttf and Kreon-Bold.ttf to /assets/fonts/)
        const fontPath = path.join(process.cwd(), 'assets', 'fonts');
        if (!fs.existsSync(fontPath)) fs.mkdirSync(fontPath, { recursive: true });

        const fontRegular = fs.readFileSync(path.join(fontPath, 'Kreon-Regular.ttf'));
        const fontBold = fs.readFileSync(path.join(fontPath, 'Kreon-Bold.ttf'));

        // 2. Load Shared Assets
        const swordIcon = getBase64Image('images/sts2_images/ui/stats/stats_swords.png');

        const users = await query("SELECT * FROM users");
        const allRuns = await query("SELECT * FROM runs ORDER BY id DESC");
        const charLookup = Object.fromEntries((await query("SELECT character_id, name FROM characters")).map(c => [
            normalizeId(c.character_id), 
            c.name.replace(/^The\s+/i, '')
        ]));

        for (const user of users) {
            const userRuns = allRuns.filter(r => isRunByUser(r, user));
            if (userRuns.length === 0) continue;

            console.log(`📸 Generating summary for: ${user.display_name}...`);

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

            // 3. Construct HTML/CSS for the Image
            const characterPanels = charIds.map(charId => {
                const charRuns = userRuns.filter(r => normalizeId(r.character) === charId);
                const color = CHARACTER_COLORS[charId] || '#444';
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

            const template = html(`
            <div style="display: flex; flex-direction: column; width: 1200px; height: 630px; background-color: #111; color: #e3e3e3; font-family: 'Kreon'; padding: 50px; position: relative;">
                
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px;">
                    <div style="display: flex; flex-direction: column;">
                        <div style="font-size: 24px; color: #00e8ff; font-style: italic; margin-bottom: 5px;">Slay the Spire 2 Stats</div>
                        <div style="font-size: 72px; font-weight: bold; color: #fff; line-height: 1;">${user.display_name}</div>
                    </div>
                    <div style="display: flex; align-items: center; background: rgba(0,0,0,0.4); padding: 20px 30px; border-radius: 12px; border: 1px solid #333;">
                        <img src="${swordIcon}" style="width: 60px; height: 60px; margin-right: 20px;" />
                        <div style="display: flex; flex-direction: column;">
                            <div style="font-size: 32px; font-weight: bold;">
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
                <div style="position: absolute; bottom: 40px; left: 50px; font-size: 20px; color: #444;">
                    Generated on spire2stats.com
                </div>
            </div>
            `);

            // 4. Render to SVG
            const svg = await satori(template, {
                width: 1200,
                height: 630,
                fonts: [
                    { name: 'Kreon', data: fontRegular, weight: 400, style: 'normal' },
                    { name: 'Kreon', data: fontBold, weight: 700, style: 'normal' },
                ],
            });

            // 5. Convert SVG to PNG
            const resvg = new Resvg(svg, {
                background: '#111',
                fitTo: { mode: 'width', value: 1200 }
            });
            const pngData = resvg.render();
            const pngBuffer = pngData.asPng();

            // 6. Save to User Directory
            const userDir = path.join(PATHS.WEB_ROOT, 'users', user.slug);
            if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
            
            const outputPath = path.join(userDir, 'summary.png');
            fs.writeFileSync(outputPath, pngBuffer);
            console.log(`✅ Saved: ${outputPath}`);
        }

        console.log('✨ PNG build complete!');
        db.close();

    } catch (error) {
        console.error('❌ PNG build failed:', error);
        process.exit(1);
    }
}

generateUserPng();