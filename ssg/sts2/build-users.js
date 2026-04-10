import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir, slugify } from './paths.js';
import { 
    wrapLayout, 
    generateItemJsonLd,
    getCharacterBgStyle,
    generateItemSummaryBox,
    getWinRateColor,
    generateFilterControlsHtml,
    generateFilterScript,
    generateRunCardHtml,
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
        const eventLookup = Object.fromEntries((await query("SELECT event_id, name FROM events")).map(e => [e.event_id.replace('EVENT.', ''), e.name]));
        const encounterLookup = Object.fromEntries((await query("SELECT encounter_id, name FROM encounters")).map(e => [e.encounter_id.replace('ENCOUNTER.', ''), e.name]));
        const enchantmentLookup = Object.fromEntries((await query("SELECT enchantment_id, name FROM enchantments")).map(e => [e.enchantment_id, e.name]));
        const charLookup = Object.fromEntries((await query("SELECT character_id, name FROM characters")).map(c => [
            c.character_id.replace('CHARACTER.', '').toUpperCase(), 
            c.name.replace(/^The\s+/i, '')
        ]));
        const starterCards = new Set((await query("SELECT card_id FROM cards WHERE starter = 1")).map(c => c.card_id.toUpperCase()));
        const starterRelics = new Set((await query("SELECT relic_id FROM relics WHERE starter = 1")).map(r => r.relic_id.toUpperCase()));
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
            `<div class="grid">${contributorLinks || '<p>No contributors found.</p>'}</div>`,
            [{ name: 'Users', url: '' }],
            `${allRuns.length} runs contributed by the Slay the Spire 2 community.`,
            "",
            "/users/"
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

            // --- CHARACTER PERFORMANCE PANELS ---
            const charIds = ['IRONCLAD', 'SILENT', 'DEFECT', 'NECROBINDER', 'REGENT'];
            const charPanelsHtml = charIds.map(charId => {
                const charRuns = userRuns.filter(r => (r.character || '').replace('CHARACTER.', '').toUpperCase() === charId);
                const color = CHARACTER_COLORS[charId] || '#444';
                const name = charLookup[charId] || charId;
                const charUrl = `/characters/${slugify(name)}/`;

                if (charRuns.length === 0) {
                    return `
                    <div class="char-panel" style="border: 1px solid #333; padding: 15px; border-radius: 8px; opacity: 0.3; background: rgba(0,0,0,0.1);">
                        <h4 style="margin: 0 0 10px 0; color: ${color}; font-size: 0.8rem; text-transform: uppercase;"><a href="${charUrl}" style="color: inherit; text-decoration: underline;">${name}</a></h4>
                        <div style="font-size: 0.75rem; color: #666;">No runs recorded</div>
                    </div>`;
                }

                const wins = charRuns.filter(r => r.win).length;
                const wr = ((wins / charRuns.length) * 100).toFixed(1);
                const M = wins / charRuns.length; // Character winrate prior
                const C = 5; // Confidence factor
                
                const cardStats = {}; // { id: { seen, wins } }
                const killers = {}; // { id: count }

                charRuns.forEach(r => {
                    const deck = JSON.parse(r.deck_list || '[]');
                    const uniqueCardIds = new Set(deck.map(c => c.id).filter(Boolean));
                    uniqueCardIds.forEach(cid => {
                        if (!cardStats[cid]) cardStats[cid] = { seen: 0, wins: 0 };
                        cardStats[cid].seen += 1;
                        if (r.win) cardStats[cid].wins += 1;
                    });

                    if (!r.win) {
                        const kid = r.killed_by_encounter || r.killed_by_event;
                        if (kid) killers[kid] = (killers[kid] || 0) + 1;
                    }
                });

                // Filter out starter cards for more interesting insights
                const nonStarterStats = Object.entries(cardStats).filter(([id]) => !starterCards.has(id.toUpperCase()));
                
                let mpHtml = '—', mpTitle = '—', mpSlug = '';
                let hwrHtml = '—', hwrTitle = '—', hwrSlug = '';
                let lwrHtml = '—', lwrTitle = '—', lwrSlug = '';

                if (nonStarterStats.length > 0) {
                    const sortedByPicked = [...nonStarterStats].sort((a, b) => b[1].seen - a[1].seen);
                    const mp = sortedByPicked[0];
                    mpTitle = cardLookup[mp[0]] || mp[0];
                    mpSlug = slugify(mpTitle);
                    mpHtml = `<a href="/cards/${mpSlug}/" style="color: inherit; text-decoration: underline;">${mpTitle}</a> <span style="color: #666; font-size: 0.8em;">(${mp[1].seen} runs, ${((mp[1].wins/mp[1].seen)*100).toFixed(0)}%)</span>`;

                    // Bayesian Average Score: (C * M + Wins) / (C + Runs)
                    const getScore = (s) => (C * M + s.wins) / (C + s.seen);
                    const sortedByScore = [...nonStarterStats].sort((a, b) => getScore(b[1]) - getScore(a[1]));

                    const hwr = sortedByScore[0];
                    hwrTitle = cardLookup[hwr[0]] || hwr[0];
                    hwrSlug = slugify(hwrTitle);
                    hwrHtml = `<a href="/cards/${hwrSlug}/" style="color: inherit; text-decoration: underline;">${hwrTitle}</a> <span style="color: #666; font-size: 0.8em;">(${hwr[1].seen}r, ${((hwr[1].wins/hwr[1].seen)*100).toFixed(0)}%)</span>`;

                    const lwr = sortedByScore[sortedByScore.length - 1];
                    lwrTitle = cardLookup[lwr[0]] || lwr[0];
                    lwrSlug = slugify(lwrTitle);
                    lwrHtml = `<a href="/cards/${lwrSlug}/" style="color: inherit; text-decoration: underline;">${lwrTitle}</a> <span style="color: #666; font-size: 0.8em;">(${lwr[1].seen}r, ${((lwr[1].wins/lwr[1].seen)*100).toFixed(0)}%)</span>`;
                }

                const deadliestEntry = Object.entries(killers).sort((a, b) => b[1] - a[1])[0];
                let deadliestLink = 'None';
                let deadliestHtml = 'None';
                let deadliestTitle = 'None';

                if (deadliestEntry) {
                    const rawDeadliestId = deadliestEntry[0];
                    deadliestTitle = encounterLookup[rawDeadliestId] || eventLookup[rawDeadliestId] || rawDeadliestId.split('.').pop().replace(/_/g, ' ');
                    const deadliestSlug = slugify(deadliestTitle);

                    let category = '';
                    if (encounterLookup[rawDeadliestId]) {
                        category = 'encounters';
                    } else if (eventLookup[rawDeadliestId]) {
                        category = 'events';
                    }

                    if (category) {
                        deadliestLink = `<a href="/${category}/${deadliestSlug}/" style="color: inherit; text-decoration: underline;">${deadliestTitle}</a>`;
                    } else {
                        deadliestLink = deadliestTitle; // Fallback if category not determined
                    }
                    deadliestHtml = `${deadliestLink} <span style="color: var(--red); font-size: 0.8em;">(${deadliestEntry[1]} deaths)</span>`;
                }

                return `
                <div class="char-panel" style="border: 1px solid ${color}44; border-top: 3px solid ${color}; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; display: flex; flex-direction: column; gap: 10px;">
                    <h4 style="margin: 0; color: ${color}; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 1px;"><a href="${charUrl}" style="color: inherit; text-decoration: underline;">${name}</a></h4>
                    <div style="font-size: 1.4rem; font-weight: bold;">${wr}% <span style="font-size: 0.7rem; color: #666; font-weight: normal;">WR</span></div>
                    
                    <div>
                        <div style="color: #666; text-transform: uppercase; font-size: 0.6rem; margin-bottom: 2px;">Most Picked</div>
                        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${mpTitle}">${mpHtml}</div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div style="font-size: 0.75rem;">
                            <div style="color: #666; text-transform: uppercase; font-size: 0.6rem; margin-bottom: 2px;">Top Card</div>
                            <div style="color: var(--green); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${hwrTitle}">${hwrHtml}</div>
                        </div>
                        <div style="font-size: 0.75rem;">
                            <div style="color: #666; text-transform: uppercase; font-size: 0.6rem; margin-bottom: 2px;">Low Card</div>
                            <div style="color: var(--red); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${lwrTitle}">${lwrHtml}</div>
                        </div>
                    </div>

                    <div style="font-size: 0.75rem; margin-top: 5px; border-top: 1px solid #333; padding-top: 8px;">
                        <div style="color: #666; text-transform: uppercase; font-size: 0.6rem; margin-bottom: 2px;">Deadliest Foe</div>
                        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #eee;" title="${deadliestTitle}">${deadliestHtml}</div>
                    </div>
                </div>`;
            }).join('');

            // --- USER DIRECTORY (index.html) ---
            const runLinksHtml = userRuns.map(run => generateRunCardHtml(run, user)).join('');

            const indexHtml = wrapLayout(
                user.display_name,
                `
                ${generateItemSummaryBox(user.display_name, userStats)}
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 40px;">
                    ${charPanelsHtml}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;">
                    ${generateFilterControlsHtml()}
                </div>
                <div class="grid" id="runs-grid">${runLinksHtml || '<p>No runs recorded yet.</p>'}</div>
                ${generateFilterScript(globalWinRate)}`,
                [{ name: 'Users', url: '/users/' }, { name: user.display_name, url: '' }],
                `${user.display_name} ${userStats.formatted}% winrate across ${userStats.seen} runs on Slay the Spire 2.`,
                "",
                `/users/${user.slug}/`
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

                const cardsLinks = deck.map(c => {
                    const name = cardLookup[c.id] || c.id;
                    const upgSuffix = c.upgrades > 0 ? '+' + c.upgrades : '';
                    const countSuffix = c.count > 1 ? ' x' + c.count : '';
                    const displayName = name + upgSuffix + countSuffix;
                    return `<a href="/cards/${slugify(name)}/" class="item-link">${displayName}</a>`;
                }).join('');

                const uniqueEnchs = [...new Set(deck.filter(c => c.enchantment).map(c => c.enchantment))];
                const enchsLinks = uniqueEnchs.map(id => `<a href="/enchantments/${slugify(enchantmentLookup[id] || id)}/" class="item-link">${enchantmentLookup[id] || id}</a>`).join('');

                const relicsLinks = relicIds.map(id => `<a href="/relics/${slugify(relicLookup[id] || id)}/" class="item-link">${relicLookup[id] || id}</a>`).join('');

                const uniqueEventIds = [...new Set(pathHistory.filter(p => p.event_id).map(p => p.event_id))];
                const eventsLinks = uniqueEventIds.map(id => `<a href="/events/${slugify(eventLookup[id] || id)}/" class="item-link">${eventLookup[id] || id}</a>`).join('');

                // --- RICH META DESCRIPTION GENERATOR ---
                const generateRunDescription = () => {
                    const status = run.win ? 'Victory' : 'Defeat';
                    let deathInfo = '';
                    if (!run.win && pathHistory.length > 0) {
                        const lastNode = pathHistory[pathHistory.length - 1];
                        const floorNum = lastNode.floor ?? pathHistory.length;
                        const killerId = run.killed_by_encounter || run.killed_by_event;
                        const killerName = encounterLookup[killerId] || eventLookup[killerId] || (killerId ? killerId.split('.').pop().replace(/_/g, ' ') : 'Unknown');
                        deathInfo = ` on floor ${floorNum} to ${killerName}`;
                    }

                    const intro = `${charName} Ascension ${run.ascension || 0} ${status}${deathInfo}`;

                    // Select unique details (exclude starter items)
                    const uniqueCard = deck.find(c => {
                        const cid = (c.id || '').toUpperCase();
                        return !starterCards.has(cid);
                    });
                    const uniqueRelic = relicIds.find(rid => !starterRelics.has(rid.toUpperCase()));

                    let items = [];
                    if (uniqueCard) items.push(cardLookup[uniqueCard.id] || uniqueCard.id);
                    if (uniqueRelic) items.push(relicLookup[uniqueRelic] || uniqueRelic);

                    const itemsText = items.length > 0 
                        ? ` using ${items.length === 1 ? items[0] : items.slice(0, -1).join(', ') + ' and ' + items.slice(-1)}` 
                        : '';

                    // Find the floor with the highest damage taken
                    let maxDmgNode = null;
                    if (Array.isArray(pathHistory)) {
                        for (const node of pathHistory) {
                            if ((node.damage_taken || 0) > 0) {
                                if (!maxDmgNode || node.damage_taken > maxDmgNode.damage_taken) {
                                    maxDmgNode = node;
                                }
                            }
                        }
                    }

                    let encounterInfo = '';
                    if (maxDmgNode) {
                        const id = maxDmgNode.encounter_id || maxDmgNode.event_id;
                        const name = id ? (encounterLookup[id] || eventLookup[id] || id.split('.').pop().replace(/_/g, ' ')) : 'Unknown';
                        encounterInfo = `, including a ${maxDmgNode.damage_taken} Damage ${name} Fight`;
                    }

                    const runInfo = `Run ${runNumber} for ${user.display_name}`;
                    return `${intro}${itemsText}${encounterInfo}. ${runInfo}.`.substring(0, 160);
                };

                const metaDescription = generateRunDescription();

                // Chart.js Data processing - Ensure we have a valid array of floor data
                const floorData = Array.isArray(pathHistory) 
                    ? pathHistory.map((p, idx) => {
                        const id = p.encounter_id || p.event_id;
                        const nodeName = id ? (encounterLookup[id] || eventLookup[id] || id.split('.').pop().replace(/_/g, ' ')) : (p.room_type ? p.room_type.replace(/_/g, ' ') : 'Unknown');
                        let monsters = [];
                        if (p.monster_ids && Array.isArray(p.monster_ids)) {
                            monsters = p.monster_ids.map(mid => mid.split('.').pop().replace(/(_NORMAL|_BOSS|_ELITE)$/, '').replace(/_/g, ' '));
                        }
                        return { 
                            floor: p.floor ?? (idx + 1), 
                            hp: p.current_hp,
                            name: nodeName,
                            damage: p.damage_taken || 0,
                            healed: p.hp_healed || 0,
                            gold: (p.gold_gained || 0) - (p.gold_lost || 0) - (p.gold_stolen || 0),
                            monsters: monsters
                        };
                    }).filter(p => p.hp !== undefined)
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
                        <div class="item-box" style="${bgStyle} margin: 0 auto; text-align: center;">
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

                        const floorMap = {}; 
                        rawRuns[0].floorData.forEach(d => { floorMap[d.floor] = d; });
                        const dataArr = labels.map(floor => {
                            const d = floorMap[floor];
                            return d ? { x: floor, y: d.hp, ...d } : null;
                        });

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
                                    legend: { display: false },
                                    tooltip: {
                                        callbacks: {
                                            title: (items) => \`Floor \${items[0].label}\`,
                                            label: (context) => {
                                                const d = context.raw;
                                                if (!d || typeof d === 'number') return \`HP: \${d}\`;
                                                const hpStart = d.y + d.damage - d.healed;
                                                const lines = [d.name];
                                                if (Array.isArray(d.monsters) && d.monsters.length > 0) {
                                                    lines.push('Monsters:');
                                                    d.monsters.forEach(m => lines.push('  ' + m));
                                                }
                                                lines.push(\`HP: \${hpStart} -> \${d.y}\`);
                                                if (d.damage > 0) lines.push(\`Damage Taken: \${d.damage}\`);
                                                if (d.healed > 0) lines.push(\`Healed: \${d.healed}\`);
                                                if (d.gold !== 0) lines.push(\`Gold: \${d.gold > 0 ? '+' : ''}\${d.gold}\`);
                                                return lines;
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    });
                    </script>
                    <link rel="stylesheet" href="/css/sts2-style.css">`,
                    [{ name: user.display_name, url: `/users/${user.slug}/` }, { name: `Run ${run.id}`, url: '' }],
                    metaDescription,
                    `/users/${user.slug}/runs/${run.id}/`
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