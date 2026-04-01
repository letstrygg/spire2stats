import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir, slugify } from './paths.js';
import { 
    wrapLayout, 
    generateItemJsonLd
} from './templates/shared.js';

/**
 * Slay the Spire 2 - User Page Generator
 * Creates directory pages and individual run detail pages for users.
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

async function runCommand(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function build() {
    try {
        console.log('🛠️  Starting user build process...');

        // Ensure users table and seed data exists
        await runCommand(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                display_name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                supabase_user_id TEXT
            )
        `);

        const seedUsers = [
            { name: 'LetsTryGG', slug: 'letstrygg' },
            { name: 'Falterfire', slug: 'falterfire' }
        ];

        for (const user of seedUsers) {
            await runCommand(
                "INSERT OR IGNORE INTO users (display_name, slug) VALUES (?, ?)", 
                [user.name, user.slug]
            );
        }

        const users = await query("SELECT * FROM users");
        const allRuns = await query("SELECT * FROM runs");

        for (const user of users) {
            console.log(`📂 Building pages for user: ${user.display_name}...`);
            const userRoot = ensureDir(path.join(PATHS.WEB_ROOT, user.slug));
            const userRunsDir = ensureDir(path.join(userRoot, 'runs'));

            const userRuns = allRuns.filter(r => (r.username || '').toLowerCase() === user.slug.toLowerCase());

            // --- USER DIRECTORY (index.html) ---
            const runLinksHtml = userRuns.map(run => {
                const charName = (run.character || 'Unknown').replace('CHARACTER.', '');
                const statusClass = run.win ? 'win' : 'loss';
                const statusText = run.win ? 'Victory' : 'Defeat';
                
                return `
                <a href="/${user.slug}/runs/${run.id}/" class="card-item ${statusClass}">
                    <div class="card-info">
                        <span class="card-name">Run #${run.id} - ${charName}</span>
                    </div>
                    <div class="card-stats">
                        <div class="win-rate">${statusText}</div>
                        <div class="run-count">Ascension ${run.ascension || 0}</div>
                    </div>
                </a>`;
            }).join('');

            const indexHtml = wrapLayout(
                user.display_name,
                `<h1>Runs by ${user.display_name}</h1>
                <div class="grid">${runLinksHtml || '<p>No runs recorded yet.</p>'}</div>`,
                [{ name: 'Users', url: '#' }, { name: user.display_name, url: '' }],
                `View Slay the Spire 2 run history and statistics for ${user.display_name}.`
            );
            fs.writeFileSync(path.join(userRoot, 'index.html'), indexHtml);

            // --- INDIVIDUAL RUN PAGES ---
            for (const run of userRuns) {
                const runDir = ensureDir(path.join(userRunsDir, String(run.id)));
                const charName = (run.character || 'Unknown').replace('CHARACTER.', '');

                const runHtml = wrapLayout(
                    `Run #${run.id} - ${user.display_name}`,
                    `
                    <div class="item-box">
                        <h1>Run #${run.id}</h1>
                        <div class="subtitle">${charName} • Ascension ${run.ascension || 0} • ${run.win ? 'Victory' : 'Defeat'}</div>
                        <div class="description">
                            <p>Statistics and path history for this run will be displayed here.</p>
                        </div>
                    </div>`,
                    [{ name: user.display_name, url: `/${user.slug}/` }, { name: `Run #${run.id}`, url: '' }],
                    `Detailed view of ${user.display_name}'s Slay the Spire 2 run #${run.id}.`
                );
                fs.writeFileSync(path.join(runDir, 'index.html'), runHtml);
            }
        }

        console.log('✨ User build complete!');
        db.close();

    } catch (error) {
        console.error('❌ User build failed:', error);
        process.exit(1);
    }
}

build();