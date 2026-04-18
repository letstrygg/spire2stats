import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PATHS } from '../sts2/paths.js';
import { isRunByUser, normalizeId } from '../sts2/helpers.js';
import { getUserSummaryTemplate } from './templates/build-png/user-png.js';
import { getUserThumbnailTemplate } from './templates/build-png/user-thumbnail.js';
import { getVersionSummaryTemplate } from './templates/build-png/version-png.js';

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
async function renderPng(template, outputPath, fonts, width = 1200, height = 630) {
    const svg = await satori(template, {
        width: width,
        height: height,
        fonts: fonts
    });

    const resvg = new Resvg(svg, {
        background: '#111',
        fitTo: { mode: 'width', value: width }
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
        const oldSwordIcon = getBase64Image('images/sts2_images/ui/stats/stats_swords.png');
        const newStatsIcon = getBase64Image('images/sts2_images/ui/menu/submenu_stats_icon.png');

        const users = await query("SELECT * FROM users");
        const allRuns = await query("SELECT * FROM runs ORDER BY id DESC");
        const charLookup = Object.fromEntries((await query("SELECT character_id, name FROM characters")).map(c => [
            normalizeId(c.character_id), 
            c.name.replace(/^The\s+/i, '')
        ]));

        for (const user of users) {
            const userRuns = allRuns.filter(r => isRunByUser(r, user));
            if (userRuns.length === 0) continue;

            console.log(`📸 Generating summary images for: ${user.display_name}...`);
            
            // 1. Standard OG Summary (1200x630)
            const summaryTemplate = getUserSummaryTemplate(user, userRuns, charLookup, oldSwordIcon);
            const summaryPath = path.join(PATHS.WEB_ROOT, 'users', user.slug, 'summary.png');
            await renderPng(summaryTemplate, summaryPath, fonts, 1200, 630);

            // 2. Google Thumbnail (1000x1000)
            const thumbTemplate = getUserThumbnailTemplate(user, userRuns, oldSwordIcon);
            const thumbPath = path.join(PATHS.WEB_ROOT, 'users', user.slug, 'thumbnail.png');
            await renderPng(thumbTemplate, thumbPath, fonts, 1000, 1000);
            
            console.log(`✅ Saved: ${user.slug} image set`);
        }

        // 3. Global Version Summary (6 most recent major versions)
        console.log('📸 Generating global version summary image...');
        const versionMap = {};
        allRuns.forEach(run => {
            const buildId = run.build_id || 'Unknown';
            const parts = buildId.split('.');
            if (parts.length >= 2) {
                const majorId = parts.slice(0, 2).join('.');
                if (!versionMap[majorId]) versionMap[majorId] = { id: majorId, wins: 0, total: 0 };
                versionMap[majorId].total++;
                if (run.win) versionMap[majorId].wins++;
            }
        });

        const latestMajorVersions = Object.values(versionMap)
            .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' }))
            .slice(0, 6);

        if (latestMajorVersions.length > 0) {
            const versionTemplate = getVersionSummaryTemplate(latestMajorVersions, newStatsIcon);
            const versionPath = path.join(PATHS.WEB_ROOT, 'versions', 'summary.png');
            await renderPng(versionTemplate, versionPath, fonts, 1200, 630);
        }

        console.log('✨ PNG build complete!');
        db.close();

    } catch (error) {
        console.error('❌ PNG build failed:', error);
        process.exit(1);
    }
}

buildPngs();