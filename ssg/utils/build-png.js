import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PATHS } from '../sts2/paths.js';
import { isRunByUser, normalizeId } from '../sts2/helpers.js';
import { getUserSummaryTemplate } from './templates/build-png/user-png.js';

/**
 * Slay the Spire 2 - PNG Image Generator
 * Orchestrates Open Graph and summary image generation for various pages.
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

/**
 * Shared rendering logic
 */
async function renderPng(template, outputPath, fonts) {
    const svg = await satori(template, {
        width: 1200,
        height: 630,
        fonts: fonts
    });

    const resvg = new Resvg(svg, {
        background: '#111',
        fitTo: { mode: 'width', value: 1200 }
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    fs.writeFileSync(outputPath, pngBuffer);
}

async function buildPngs() {
    try {
        console.log('🖼️  Starting PNG generation process...');

        // 1. Load Fonts
        const fontRegular = fs.readFileSync('C:\\GitHub\\spire2stats\\assets\\fonts\\Kreon\\static\\Kreon-Regular.ttf');
        const fontBold = fs.readFileSync('C:\\GitHub\\spire2stats\\assets\\fonts\\Kreon\\static\\Kreon-Bold.ttf');

        const fonts = [
            { name: 'Kreon', data: fontRegular, weight: 400, style: 'normal' },
            { name: 'Kreon', data: fontBold, weight: 700, style: 'normal' },
        ];

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
            const template = getUserSummaryTemplate(user, userRuns, charLookup, swordIcon);
            const outputPath = path.join(PATHS.WEB_ROOT, 'users', user.slug, 'summary.png');
            
            await renderPng(template, outputPath, fonts);
            console.log(`✅ Saved: ${outputPath}`);
        }

        console.log('✨ PNG build complete!');
        db.close();

    } catch (error) {
        console.error('❌ PNG build failed:', error);
        process.exit(1);
    }
}

buildPngs();