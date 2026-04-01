import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir, slugify } from './paths.js';
import { 
    wrapLayout, 
    generateItemJsonLd,
    getCharacterBgStyle
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
        const allRuns = await query("SELECT * FROM runs ORDER BY id DESC");

        // Fetch lookup maps for names to generate accurate slugs and labels
        const cardLookup = Object.fromEntries((await query("SELECT card_id, name FROM cards")).map(c => [c.card_id, c.name]));
        const relicLookup = Object.fromEntries((await query("SELECT relic_id, name FROM relics")).map(r => [r.relic_id, r.name]));
        const eventLookup = Object.fromEntries((await query("SELECT event_id, name FROM events")).map(e => [e.event_id, e.name]));
        const enchantmentLookup = Object.fromEntries((await query("SELECT enchantment_id, name FROM enchantments")).map(e => [e.enchantment_id, e.name]));
        const charLookup = Object.fromEntries((await query("SELECT character_id, name FROM characters")).map(c => [
            c.character_id.replace('CHARACTER.', '').toUpperCase(), 
            c.name.replace(/^The\s+/i, '')
        ]));
        const ascLookup = Object.fromEntries((await query("SELECT level, name FROM ascensions")).map(a => [
            String(a.level), 
            a.name || `Ascension ${a.level}`
        ]));

        for (const user of users) {
            console.log(`📂 Building pages for user: ${user.display_name}...`);
            const userRoot = ensureDir(path.join(PATHS.WEB_ROOT, 'users', user.slug));
            const userRunsDir = ensureDir(path.join(userRoot, 'runs'));

            const userRuns = allRuns.filter(r => {
                const runUser = (r.username || '').toLowerCase();
                return runUser === user.slug.toLowerCase() || runUser === user.display_name.toLowerCase();
            });

            // --- USER DIRECTORY (index.html) ---
            const runLinksHtml = userRuns.map(run => {
                const charName = (run.character || 'Unknown').replace('CHARACTER.', '');
                const charClass = charName.toLowerCase();
                const bgStyle = getCharacterBgStyle(charName);
                const statusClass = run.win ? 'win' : 'loss';
                const statusText = run.win ? 'Victory' : 'Defeat';
                
                return `
                <a href="/users/${user.slug}/runs/${run.id}/" class="card-item ${statusClass} ${charClass}" style="${bgStyle}">
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
                [{ name: 'Users', url: '/users/' }, { name: user.display_name, url: '' }],
                `View Slay the Spire 2 run history and statistics for ${user.display_name}.`
            );
            fs.writeFileSync(path.join(userRoot, 'index.html'), indexHtml);

            // --- INDIVIDUAL RUN PAGES ---
            for (const run of userRuns) {
                const runDir = ensureDir(path.join(userRunsDir, String(run.id)));
                
                const charId = (run.character || '').replace('CHARACTER.', '').toUpperCase();
                const charName = charLookup[charId] || charId;
                const charSlug = slugify(charName);
                
                const ascLevel = String(run.ascension || 0);
                const ascName = ascLookup[ascLevel] || `Ascension ${ascLevel}`;
                const ascSlug = slugify(ascName);

                const bgStyle = getCharacterBgStyle(charName);
                
                const deck = JSON.parse(run.deck_list || '[]');
                const relicIds = JSON.parse(run.relic_list || '[]');
                const pathHistory = JSON.parse(run.path_history || '[]');

                const uniqueCards = [...new Set(deck.map(c => c.id))].filter(Boolean);
                const cardsLinks = uniqueCards.map(id => `<a href="/cards/${slugify(cardLookup[id] || id)}/" class="item-link">${cardLookup[id] || id}</a>`).join('');

                const uniqueEnchs = [...new Set(deck.filter(c => c.enchantment).map(c => c.enchantment))];
                const enchsLinks = uniqueEnchs.map(id => `<a href="/enchantments/${slugify(enchantmentLookup[id] || id)}/" class="item-link">${enchantmentLookup[id] || id}</a>`).join('');

                const relicsLinks = relicIds.map(id => `<a href="/relics/${slugify(relicLookup[id] || id)}/" class="item-link">${relicLookup[id] || id}</a>`).join('');

                const uniqueEventIds = [...new Set(pathHistory.filter(p => p.event_id).map(p => p.event_id))];
                const eventsLinks = uniqueEventIds.map(id => `<a href="/events/${slugify(eventLookup[id] || id)}/" class="item-link">${eventLookup[id] || id}</a>`).join('');

                // Chart.js Data processing
                const floorData = pathHistory.map(p => ({ floor: p.floor, hp: p.hp })).filter(p => p.floor !== undefined && p.hp !== undefined);
                const chartJson = JSON.stringify([{
                    label: `Run ${run.id} (${charName})`,
                    win: !!run.win,
                    floorData: floorData
                }]);

                const runHtml = wrapLayout(
                    `Run #${run.id} - ${user.display_name}`,
                    `
                    <div class="item-box" style="${bgStyle}">
                        <h1>Run #${run.id}</h1>
                        <div class="subtitle">
                            <a href="/characters/${charSlug}/">${charName}</a> • 
                            <a href="/ascensions/${ascSlug}/">${ascName}</a> • 
                            ${run.win ? 'Victory' : 'Defeat'}
                        </div>
                        
                        <div class="run-summary-container" style="margin-top: 30px; margin-bottom: 30px; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 8px; border: 1px solid var(--border, #333);">
                            <h3 style="margin-top: 0; color: var(--text-muted, #aaa); font-size: 1.1em; border-bottom: 1px solid var(--border, #333); padding-bottom: 10px; margin-bottom: 15px;">Run Summary: HP per Floor</h3>
                            <div style="height: 300px; width: 100%;">
                                <canvas id="hpChart_${run.id}"></canvas>
                            </div>
                        </div>

                        <div class="run-details-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; text-align: left;">
                            <div>
                                <h3>Deck</h3>
                                <div class="grid-sm">${cardsLinks || 'No cards recorded.'}</div>
                            </div>
                            <div>
                                <h3>Enchantments</h3>
                                <div class="grid-sm">${enchsLinks || 'No enchantments used.'}</div>
                            </div>
                            <div>
                                <h3>Relics</h3>
                                <div class="grid-sm">${relicsLinks || 'No relics obtained.'}</div>
                            </div>
                            <div>
                                <h3>Events</h3>
                                <div class="grid-sm">${eventsLinks || 'No events encountered.'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                    <script>
                    document.addEventListener("DOMContentLoaded", function() {
                        const ctx = document.getElementById('hpChart_${run.id}');
                        if (!ctx) return;
                        const rawRuns = ${chartJson};
                        if (rawRuns.length === 0 || rawRuns[0].floorData.length === 0) return;

                        const maxFloor = Math.max(...rawRuns[0].floorData.map(d => d.floor));
                        const labels = Array.from({length: maxFloor}, (_, i) => i + 1);
                        const color = run.win ? '#00ff89' : '#ff4b4b';

                        const hpMap = {};
                        rawRuns[0].floorData.forEach(d => { hpMap[d.floor] = d.hp; });
                        const dataArr = labels.map(floor => hpMap[floor] !== undefined ? hpMap[floor] : null);

                        new Chart(ctx, {
                            type: 'line',
                            data: { labels: labels, datasets: [{
                                label: rawRuns[0].label,
                                data: dataArr,
                                borderColor: color,
                                backgroundColor: color + '22',
                                borderWidth: 2,
                                fill: true,
                                tension: 0.3,
                                spanGaps: true
                            }]},
                            options: {
                                responsive: true, maintainAspectRatio: false,
                                scales: { y: { beginAtZero: true, grid: { color: '#333' } }, x: { grid: { color: '#333' } } }
                            }
                        });
                    });
                    </script>`,
                    [{ name: user.display_name, url: `/users/${user.slug}/` }, { name: `Run #${run.id}`, url: '' }],
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