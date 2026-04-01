import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir, slugify } from './paths.js';
import { 
    wrapLayout, 
    generateItemJsonLd,
    getCharacterBgStyle,
    generateItemSummaryBox,
    CHARACTER_COLORS
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

/** Helper for win rate text color logic */
function getWinRateColor(seen, winRateNum, globalWinRate) {
    if (seen === 0) return 'var(--gray)';
    if (winRateNum > globalWinRate) return 'var(--green)';
    if (winRateNum < globalWinRate) return 'var(--red)';
    return 'var(--gray)';
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
            { name: 'Falterfire', slug: 'falterfire' },
            { name: 'RarelyVlolent', slug: 'rarelyvlolent' }
        ];

        for (const user of seedUsers) {
            await runCommand(
                "INSERT OR IGNORE INTO users (display_name, slug) VALUES (?, ?)", 
                [user.name, user.slug]
            );
        }

        const users = await query("SELECT * FROM users");
        const allRuns = await query("SELECT * FROM runs ORDER BY id DESC");

        const globalTotalWins = allRuns.filter(r => r.win).length;
        const globalWinRate = allRuns.length > 0 ? (globalTotalWins / allRuns.length) * 100 : 0;

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

        // --- GLOBAL USERS DIRECTORY (users/index.html) ---
        console.log('📂 Building global users directory...');
        ensureDir(path.join(PATHS.WEB_ROOT, 'users'));

        const contributorLinks = users.map(user => {
            const count = allRuns.filter(r => {
                const runUser = (r.username || '').toLowerCase();
                return runUser === user.slug.toLowerCase() || runUser === user.display_name.toLowerCase();
            }).length;

            return `
            <a href="/users/${user.slug}/" class="card-item contributor-card">
                <div class="card-info"><span class="card-name">${user.display_name}</span></div>
                <div class="card-stats"><div class="run-count">${count} runs</div></div>
            </a>`;
        }).join('');

        const usersIndexHtml = wrapLayout(
            'Users',
            `<h1>Contributors</h1><div class="grid">${contributorLinks || '<p>No contributors found.</p>'}</div>`,
            [{ name: 'Users', url: '' }],
            `View all Slay the Spire 2 contributors and their run history.`
        );
        fs.writeFileSync(path.join(PATHS.WEB_ROOT, 'users', 'index.html'), usersIndexHtml);

        for (const user of users) {
            console.log(`📂 Building pages for user: ${user.display_name}...`);
            const userRoot = ensureDir(path.join(PATHS.WEB_ROOT, 'users', user.slug));
            const userRunsDir = ensureDir(path.join(userRoot, 'runs'));

            const userRuns = allRuns.filter(r => {
                const runUser = (r.username || '').toLowerCase();
                return runUser === user.slug.toLowerCase() || runUser === user.display_name.toLowerCase();
            });

            const userWins = userRuns.filter(r => r.win).length;
            const userTotal = userRuns.length;
            const userWinRateNum = userTotal > 0 ? (userWins / userTotal) * 100 : 0;

            const userStats = {
                seen: userTotal,
                wins: userWins,
                losses: userTotal - userWins,
                formatted: userWinRateNum.toFixed(1),
                color: getWinRateColor(userTotal, userWinRateNum, globalWinRate)
            };

            // --- USER DIRECTORY (index.html) ---
            const runLinksHtml = userRuns.map((run, index) => {
                const charName = (run.character || 'Unknown').replace('CHARACTER.', '');
                const charClass = charName.toLowerCase();
                const bgStyle = getCharacterBgStyle(charName);
                const statusClass = run.win ? 'win' : 'loss';
                const statusText = run.win ? 'Victory' : 'Defeat';
                const statusColor = run.win ? 'var(--green)' : 'var(--red)';
                const runNumber = run.user_run_num;
                
                const charId = (run.character || '').replace('CHARACTER.', '').toUpperCase();
                const charColor = CHARACTER_COLORS[charId] || 'var(--gray)';
                
                return `
                <a href="/users/${user.slug}/runs/${run.id}/" class="card-item ${statusClass} ${charClass}" style="border-left-width: 6px; --char-color: ${charColor};">
                    <div class="card-info">
                        <span class="card-name">Run ${runNumber}<br><span style="color: ${charColor}">${charName}</span></span>
                    </div>
                    <div class="card-stats">
                        <div class="win-rate" style="color: ${statusColor}">${statusText}</div>
                        <div class="run-count" style="font-size: 0.7rem; opacity: 0.6;">Build ${run.build_id || 'Unknown'}</div>
                        <div class="run-count">Ascension ${run.ascension || 0}</div>
                    </div>
                    
                </a>`;
            }).join('');

            const indexHtml = wrapLayout(
                user.display_name,
                `<style>
                    .card-item:hover { border-color: var(--char-color) !important; }
                </style>
                ${generateItemSummaryBox(user.display_name, userStats)}
                <h1>Runs by ${user.display_name}</h1>
                <div class="grid">${runLinksHtml || '<p>No runs recorded yet.</p>'}</div>`,
                [{ name: 'Users', url: '/users/' }, { name: user.display_name, url: '' }],
                `View Slay the Spire 2 run history and statistics for ${user.display_name}.`
            );
            fs.writeFileSync(path.join(userRoot, 'index.html'), indexHtml);

            // --- INDIVIDUAL RUN PAGES ---
            for (let i = 0; i < userRuns.length; i++) {
                const run = userRuns[i];
                const runNumber = run.user_run_num;
                
                const runDir = ensureDir(path.join(userRunsDir, String(run.id)));
                
                const charId = (run.character || '').replace('CHARACTER.', '').toUpperCase();
                const charName = charLookup[charId] || charId;
                const charSlug = slugify(charName);
                
                const ascLevel = String(run.ascension || 0);
                const ascName = ascLookup[ascLevel] || `Ascension ${ascLevel}`;
                const ascSlug = slugify(ascName);

                const bgStyle = getCharacterBgStyle(charName);
                const statusColor = run.win ? '#00ff89' : '#ff4b4b';
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

                // Chart.js Data processing - Ensure we have a valid array of floor data
                const floorData = Array.isArray(pathHistory) 
                    ? pathHistory.map((p, idx) => ({ 
                        floor: p.floor ?? (idx + 1), 
                        hp: p.current_hp 
                    })).filter(p => p.hp !== undefined)
                    : [];

                // Server-side debug logging for the first run of each user
                if (i === 0) {
                    console.log(`   🔍 [DEBUG] User: ${user.display_name}, Run: #${runNumber}`);
                    console.log(`      Path History length: ${pathHistory.length}`);
                    console.log(`      Floor Data processed: ${floorData.length} points`);
                    if (pathHistory.length > 0 && floorData.length === 0) {
                        console.log(`      ⚠️ WARNING: floorData filtered to zero. Sample entry:`, JSON.stringify(pathHistory[0]));
                    }
                }

                const chartJson = JSON.stringify([{
                    label: `Run ${runNumber} (${charName})`,
                    win: !!run.win,
                    floorData: floorData
                }]);

                const runHtml = wrapLayout(
                    `Run ${runNumber} - ${user.display_name}`,
                    `
                    <div class="game-page-wrapper">
                        <div class="item-box" style="${bgStyle} max-width: 1000px; margin: 0 auto; text-align: center;">
                            <h1 style="font-size: 2.5rem; margin-bottom: 10px;">Run ${runNumber}</h1>
                            <div class="subtitle" style="font-size: 1.2rem; margin-bottom: 30px;">
                                <a href="/characters/${charSlug}/" style="color: inherit; text-decoration: underline;">${charName}</a> • 
                                <a href="/ascensions/${ascSlug}/" style="color: inherit; text-decoration: underline;">${ascName}</a> • 
                                <strong style="color: ${statusColor}">${run.win ? 'Victory' : 'Defeat'}</strong>
                            </div>
                            
                            <div class="run-summary-container" style="background: rgba(0,0,0,0.4); padding: 25px; border-radius: 12px; border: 1px solid #444; margin-bottom: 40px;">
                                <h3 style="margin-top: 0; color: #ccc; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 20px;">Health Progression</h3>
                                <div style="height: 350px; width: 100%;">
                                    <canvas id="hpChart"></canvas>
                                </div>
                            </div>

                            <div class="run-details-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 30px; text-align: left;">
                                <section>
                                    <h3 style="color: var(--gold, #ffd700); border-bottom: 1px solid #333; padding-bottom: 5px;">Deck</h3>
                                    <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 10px;">${cardsLinks || '<span class="text-muted">No cards</span>'}</div>
                                </section>
                                <section>
                                    <h3 style="color: var(--purple, #b388ff); border-bottom: 1px solid #333; padding-bottom: 5px;">Enchantments</h3>
                                    <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 10px;">${enchsLinks || '<span class="text-muted">None</span>'}</div>
                                </section>
                                <section>
                                    <h3 style="color: var(--red, #ff5252); border-bottom: 1px solid #333; padding-bottom: 5px;">Relics</h3>
                                    <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 10px;">${relicsLinks || '<span class="text-muted">None</span>'}</div>
                                </section>
                                <section>
                                    <h3 style="color: var(--blue, #448aff); border-bottom: 1px solid #333; padding-bottom: 5px;">Events</h3>
                                    <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 10px;">${eventsLinks || '<span class="text-muted">None</span>'}</div>
                                </section>
                            </div>
                        </div>
                    </div>
                    
                    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                    <script>
                    document.addEventListener("DOMContentLoaded", function() {
                        const ctx = document.getElementById('hpChart').getContext('2d');
                        if (!ctx) return;
                        const rawRuns = ${chartJson};
                        console.log("📈 Chart Data received by browser:", rawRuns);

                        if (rawRuns.length === 0 || rawRuns[0].floorData.length === 0) {
                            console.warn("⚠️ No floor data available for HP graph.");
                            return;
                        }

                        const maxFloor = Math.max(...rawRuns[0].floorData.map(d => d.floor), 1);
                        const labels = Array.from({length: maxFloor}, (_, i) => i + 1);
                        const color = "${statusColor}";

                        const hpMap = {}; 
                        rawRuns[0].floorData.forEach(d => { hpMap[d.floor] = d.hp; });
                        const dataArr = labels.map(floor => hpMap[floor] !== undefined ? hpMap[floor] : null);

                        new Chart(ctx, {
                            type: 'line',
                            data: { labels: labels, datasets: [{
                                label: rawRuns[0].label,
                                data: dataArr,
                                borderColor: color,
                                backgroundColor: color + '15',
                                borderWidth: 2,
                                fill: true,
                                tension: 0.3,
                                spanGaps: true
                            }]},
                            options: {
                                responsive: true, maintainAspectRatio: false,
                                interaction: { mode: 'index', intersect: false },
                                scales: { 
                                    y: { 
                                        beginAtZero: true, 
                                        grid: { color: 'rgba(255,255,255,0.05)' },
                                        ticks: { color: '#888' },
                                        title: { display: true, text: 'Hit Points', color: '#666' }
                                    }, 
                                    x: { 
                                        grid: { color: 'rgba(255,255,255,0.05)' },
                                        ticks: { color: '#888' },
                                        title: { display: true, text: 'Floor', color: '#666' }
                                    } 
                                },
                                plugins: {
                                    legend: { display: false }
                                }
                            }
                        });
                    });
                    </script>
                    <link rel="stylesheet" href="/css/game/sts2-style.css">`,
                    [{ name: user.display_name, url: `/users/${user.slug}/` }, { name: `Run ${run.id}`, url: '' }],
                    `Detailed view of ${user.display_name}'s Slay the Spire 2 run ${runNumber}.`,
                    `<link rel="stylesheet" href="/css/game/sts2-style.css">`
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