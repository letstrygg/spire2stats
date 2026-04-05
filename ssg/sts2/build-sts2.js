import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir, slugify } from './paths.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../utils/config.js';

import { 
    ISO_BUILD_DATE, 
    FORMATTED_BUILD_DATE, 
    generateItemJsonLd, 
    getWinRateColor,
    generateCollectionJsonLd, 
    generateSummaryPanel, 
    generateVideoPanel, 
    generateRunLinksList,
    generateAveragesPanel,
    generateLethalityIndexSummary,
    generateLethalitySummaryBox,
    generateSemanticStatsParagraph, 
    getItemStats,
    generateFilterControlsHtml,
    generateFilterScript,
    wrapLayout, 
    formatDescription,
    getCharacterBgStyle,
    CHARACTER_COLORS,
    Sitemap
} from './templates/shared.js';

import { cardDetailTemplate } from './templates/card.js';
import { relicDetailTemplate } from './templates/relic.js';
import { eventDetailTemplate } from './templates/event.js';
import { characterDetailTemplate } from './templates/character.js';
import { monsterDetailTemplate } from './templates/monster.js';
import { encounterDetailTemplate } from './templates/encounter.js';
import { ascensionDetailTemplate } from './templates/ascension.js';
import { enchantmentDetailTemplate } from './templates/enchantment.js';
import { settingsTemplate } from './templates/settings.js';

/**
 * Slay the Spire 2 - Static Site Generator
 * Reads from local SQLite and builds the card database
 */

const db = new sqlite3.Database(PATHS.DATABASE);

const CATEGORIES = [
    { table: 'potions', folder: 'potions', titleField: 'name' },
    { table: 'acts', folder: 'acts', titleField: 'name' },
    { table: 'achievements', folder: 'achievements', titleField: 'name' },
    { table: 'afflictions', folder: 'afflictions', titleField: 'name' },
    { table: 'epochs', folder: 'epochs', titleField: 'title' },
    { table: 'keywords', folder: 'keywords', titleField: 'name' },
    { table: 'intents', folder: 'intents', titleField: 'name' },
    { table: 'modifiers', folder: 'modifiers', titleField: 'name' },
    { table: 'orbs', folder: 'orbs', titleField: 'name' },
    { table: 'powers', folder: 'powers', titleField: 'name' },
    { table: 'stories', folder: 'stories', titleField: 'name' }
];

// --- SHARED HELPERS ---

/** Promise-based DB query helper */
async function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getCostDisplay(card) {
    let cost = card.is_x_cost ? 'X' : (card.cost ?? '');
    let star = card.is_x_star_cost ? 'X★' : (card.star_cost ? `${card.star_cost}★` : '');
    return [cost, star].filter(Boolean).join(' ');
}

/** Helper to generate standardized card-item HTML for index pages */
function generateCardItemHtml(url, name, stats, extraClass = '', levelId = '') {
    const charId = (extraClass || '').toUpperCase();
    const charColor = CHARACTER_COLORS[charId] || 'var(--gray)';
    let subtitleHtml = '';
    let nameStyle = '';

    if (extraClass) {
        if (name.toLowerCase() !== extraClass.toLowerCase()) {
            subtitleHtml = `<br><span style="color: ${charColor}; font-size: 0.8em; font-weight: normal; text-transform: capitalize;">${extraClass}</span>`;
        } else {
            nameStyle = `style="color: ${charColor}"`;
        }
    }

    const winBarHtml = stats.seen > 0 ? `<div class="win-bar" style="${stats.bar}"></div>` : '';

    return `
    <a href="${url}" id="asc-card-${levelId}" class="card-item ${extraClass ? extraClass.toLowerCase() : ''}" aria-label="${name}: ${stats.seen} runs, ${stats.text}">
        <div class="card-info"><span class="card-name" ${nameStyle}>${name}${subtitleHtml}</span></div>
        <div class="card-stats">
            <div class="win-rate" id="asc-wr-${levelId}" style="color: ${stats.color}">${stats.text}</div>
            <div class="run-count">${stats.seen} runs</div>
        </div>
        ${winBarHtml}
    </a>`;
}

async function getCardStats() {
    const rows = await query("SELECT id, user_run_num, character, relic_list, deck_list, path_history, win, username, yt_video, ltg_url, ascension, build_id, killed_by_encounter FROM runs");
    console.log(`📡 Database returned ${rows.length} run rows.`);

    const totalRuns = rows.length;
    if (totalRuns === 0) return { stats: {}, charStats: {}, relicStats: {}, eventStats: {}, ascensionStats: {}, enchantmentStats: {}, monsterStats: {}, encounterStats: {}, globalWinRate: 0, totalRuns: 0, totalWins: 0, totalLosses: 0, uniqueUsers: 0, uniqueCardsSeen: 0, uniqueRelicsSeen: 0, uniqueEventsSeen: 0, uniqueCharsSeen: 0, uniqueAscensionsSeen: 0, uniqueEnchantmentsSeen: 0, uniqueMonstersSeen: 0, uniqueEncountersSeen: 0 };

            const totalWins = rows.filter(r => r.win).length;
            const globalWinRate = totalRuns > 0 ? (totalWins / totalRuns) * 100 : 0;
            const uniqueUsers = new Set(rows.map(r => r.username)).size;

            const stats = {}; // Card stats
            const charStats = {}; // Character stats
            const relicStats = {}; // Relic stats
            const eventStats = {}; // Event stats
            const ascensionStats = {}; // Ascension stats
            const enchantmentStats = {}; // Enchantment stats
            const monsterStats = {}; // Monster stats
            const encounterStats = {}; // Encounter stats

            const encounterRows = await query("SELECT encounter_id, monsters FROM encounters");
            const encounterMap = {};
            encounterRows.forEach(enc => {
                const monstersList = JSON.parse(enc.monsters || '[]');
                encounterMap[enc.encounter_id] = monstersList.map(m => m.id);
            });

            const updateStat = (obj, id, win, video, runMeta) => {
                if (!obj[id]) obj[id] = { seen: 0, wins: 0, runs: [], damage_taken: 0, hp_healed: 0, gold_lost: 0, gold_stolen: 0, max_hp_gained: 0, max_hp_lost: 0, occurrences: 0 };
                obj[id].seen++;
                if (win) obj[id].wins++;
                
                if (!runMeta.video && (video.yt || video.ltg)) {
                    runMeta.video = video;
                }
                
                obj[id].runs.push(runMeta);
            };

            rows.forEach(row => {
                const video = { yt: row.yt_video, ltg: row.ltg_url };
                const runMeta = { id: row.id, user_run_num: row.user_run_num, username: row.username, win: row.win, character: row.character, build_id: row.build_id, ascension: row.ascension };
                const charId = (row.character || '').toUpperCase(); // Matches clean IDs like "SILENT"
                
                if (!charStats[charId]) {
                    charStats[charId] = { seen: 0, wins: 0, runs: [], damage_taken: 0, hp_healed: 0, gold_lost: 0, gold_stolen: 0, max_hp_gained: 0, max_hp_lost: 0, occurrences: 0, cardFrequencies: {}, relicFrequencies: {}, killerFrequencies: {} };
                }
                updateStat(charStats, charId, row.win, video, runMeta);

                const relics = JSON.parse(row.relic_list || '[]');
                const uniqueRelicsInRun = new Set(relics.map(r => (r || '').toUpperCase()));
                uniqueRelicsInRun.forEach(rid => { charStats[charId].relicFrequencies[rid] = (charStats[charId].relicFrequencies[rid] || 0) + 1; });
                relics.forEach(relicId => updateStat(relicStats, relicId, row.win, video, runMeta));

                const pathHistory = JSON.parse(row.path_history || '[]');
                const uniqueEventsInRun = new Set();
                pathHistory.forEach(p => {
                    const floorStats = {
                        damage_taken: p.current_hp !== undefined ? (p.damage_taken || 0) : 0,
                        hp_healed: p.hp_healed || 0,
                        gold_lost: p.gold_lost || 0,
                        gold_stolen: p.gold_stolen || 0,
                        max_hp_gained: p.max_hp_gained || 0,
                        max_hp_lost: p.max_hp_lost || 0
                    };

                    if (p.event_id) {
                        const eid = p.event_id.replace('EVENT.', '');
                        uniqueEventsInRun.add(eid);
                        if (!eventStats[eid]) eventStats[eid] = { seen: 0, wins: 0, runs: [], damage_taken: 0, hp_healed: 0, gold_lost: 0, gold_stolen: 0, max_hp_gained: 0, max_hp_lost: 0, occurrences: 0 };
                        eventStats[eid].occurrences++;
                        eventStats[eid].damage_taken += floorStats.damage_taken;
                        eventStats[eid].hp_healed += floorStats.hp_healed;
                        eventStats[eid].gold_lost += floorStats.gold_lost;
                        eventStats[eid].gold_stolen += floorStats.gold_stolen;
                        eventStats[eid].max_hp_gained += floorStats.max_hp_gained;
                        eventStats[eid].max_hp_lost += floorStats.max_hp_lost;
                    }
                    if (p.encounter_id) {
                        if (!encounterStats[p.encounter_id]) encounterStats[p.encounter_id] = { encountered: 0, kills: 0, lethalRuns: [], damage_taken: 0, hp_healed: 0, gold_lost: 0, gold_stolen: 0, max_hp_gained: 0, max_hp_lost: 0 };
                        encounterStats[p.encounter_id].encountered++;
                        encounterStats[p.encounter_id].damage_taken += floorStats.damage_taken;
                        encounterStats[p.encounter_id].hp_healed += floorStats.hp_healed;
                        encounterStats[p.encounter_id].gold_lost += floorStats.gold_lost;
                        encounterStats[p.encounter_id].gold_stolen += floorStats.gold_stolen;
                        encounterStats[p.encounter_id].max_hp_gained += floorStats.max_hp_gained;
                        encounterStats[p.encounter_id].max_hp_lost += floorStats.max_hp_lost;
                    }
                    if (p.monster_ids) {
                        p.monster_ids.forEach(mid => {
                            const cleanMid = mid.replace(/(_NORMAL|_BOSS|_ELITE)$/, '');
                            if (!monsterStats[cleanMid]) monsterStats[cleanMid] = { encountered: 0, kills: 0, lethalRuns: [], damage_taken: 0, hp_healed: 0, gold_lost: 0, gold_stolen: 0, max_hp_gained: 0, max_hp_lost: 0 };
                            monsterStats[cleanMid].encountered++;
                            monsterStats[cleanMid].damage_taken += floorStats.damage_taken;
                            monsterStats[cleanMid].hp_healed += floorStats.hp_healed;
                            monsterStats[cleanMid].gold_lost += floorStats.gold_lost;
                            monsterStats[cleanMid].gold_stolen += floorStats.gold_stolen;
                            monsterStats[cleanMid].max_hp_gained += floorStats.max_hp_gained;
                            monsterStats[cleanMid].max_hp_lost += floorStats.max_hp_lost;
                        });
                    }
                });
                uniqueEventsInRun.forEach(eventId => updateStat(eventStats, eventId, row.win, video, runMeta));

                if (!row.win && row.killed_by_encounter) {
                    const killerEncounter = row.killed_by_encounter;
                    
                    // Attribute kill to the encounter
                    if (!encounterStats[killerEncounter]) encounterStats[killerEncounter] = { encountered: 0, kills: 0, lethalRuns: [], damage_taken: 0, hp_healed: 0, gold_lost: 0, gold_stolen: 0, max_hp_gained: 0, max_hp_lost: 0 };
                    encounterStats[killerEncounter].kills++;
                    encounterStats[killerEncounter].lethalRuns.push(runMeta);

                    // Attribute kill to character specific lethality
                    const kid = killerEncounter.toUpperCase();
                    charStats[charId].killerFrequencies[kid] = (charStats[charId].killerFrequencies[kid] || 0) + 1;

                    // Attribute kill to all constituent monsters
                    const associatedMonsters = encounterMap[killerEncounter] || [];
                    associatedMonsters.forEach(mid => {
                        const cleanMid = mid.replace(/(_NORMAL|_BOSS|_ELITE)$/, '');
                        if (!monsterStats[cleanMid]) monsterStats[cleanMid] = { encountered: 0, kills: 0, lethalRuns: [], damage_taken: 0, hp_healed: 0, gold_lost: 0, gold_stolen: 0, max_hp_gained: 0, max_hp_lost: 0 };
                        monsterStats[cleanMid].kills++;
                        monsterStats[cleanMid].lethalRuns.push(runMeta);
                    });
                }

                const deck = JSON.parse(row.deck_list || '[]');
                const uniqueCardsInDeck = new Set(deck.map(c => c.id || ''));
                uniqueCardsInDeck.forEach(cid => { if (cid) charStats[charId].cardFrequencies[cid] = (charStats[charId].cardFrequencies[cid] || 0) + 1; });

                uniqueCardsInDeck.forEach(cardId => updateStat(stats, cardId, row.win, video, runMeta));

                const uniqueEnchantmentsInDeck = new Set();
                deck.forEach(c => {
                    if (c.enchantment) uniqueEnchantmentsInDeck.add(c.enchantment.replace('ENCHANTMENT.', ''));
                });
                uniqueEnchantmentsInDeck.forEach(eId => updateStat(enchantmentStats, eId, row.win, video, runMeta));

                const ascLevel = String(row.ascension || 0);
                updateStat(ascensionStats, ascLevel, row.win, video, runMeta);
            });
            
            const uniqueCardsSeen = Object.keys(stats).length;
            console.log(`📊 Processed stats for ${uniqueCardsSeen} cards, ${Object.keys(relicStats).length} relics, ${Object.keys(eventStats).length} events, ${Object.keys(enchantmentStats).length} enchantments, and ${Object.keys(ascensionStats).length} ascensions across ${totalRuns} runs.`);

            console.log(` Character keys found in runs: [${Object.keys(charStats).join(', ')}]`);

            return { 
                stats, 
                charStats,
                relicStats,
                eventStats,
                ascensionStats,
                enchantmentStats,
                monsterStats,
                encounterStats,
                globalWinRate, 
                totalRuns, 
                totalWins, 
                totalLosses: totalRuns - totalWins, 
                uniqueUsers, 
                uniqueCardsSeen,
                uniqueRelicsSeen: Object.keys(relicStats).length,
                uniqueEventsSeen: Object.keys(eventStats).length,
                uniqueCharsSeen: Object.keys(charStats).length,
                uniqueAscensionsSeen: Object.keys(ascensionStats).length,
                uniqueEnchantmentsSeen: Object.keys(enchantmentStats).length,
                uniqueMonstersSeen: Object.keys(monsterStats).length,
                uniqueEncountersSeen: Object.keys(encounterStats).length
            };
}

async function buildGeneralCategory(cat, sitemap) {
    const items = await query(`SELECT * FROM ${cat.table} ORDER BY ${cat.titleField} ASC`);
    console.log(`📂 Building ${items.length} pages for ${cat.folder}...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, cat.folder));
    
    for (const item of items) {
        const title = item[cat.titleField];
        if (!title) continue;
        const slug = slugify(title);
        const dir = ensureDir(path.join(root, slug));
        
        const subtitle = [item.rarity, item.type, item.act].filter(Boolean).join(' • ');
        const description = formatDescription(item.description || item.flavor || item.unlock_text || "");

        const pageTitle = cat.folder === 'achievements' ? `${title} Achievement` : title;

        const detailHtml = wrapLayout(
            pageTitle, 
            `
            <div class="item-box">
                ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
                <div class="description">${description}</div>
            </div>`,
            [{ name: cat.folder, url: `/${cat.folder}/` }, { name: title, url: '' }],
            `${title} ${cat.folder.slice(0, -1)} details and descriptions for Slay the Spire 2.`,
            generateItemJsonLd(pageTitle, cat.folder.slice(0, -1), null),
            `/${cat.folder}/${slug}/`
        );
        fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
            sitemap.add(`/${cat.folder}/${slug}/`);
    }

    // Index Page
    sitemap.add(`/${cat.folder}/`);
    const itemLinks = items.map(i => {
        const title = i[cat.titleField];
        if (!title) return '';
        return `<a href="/${cat.folder}/${slugify(title)}/" class="item-link">${title}</a>`;
    }).join('');

    const catName = cat.folder.charAt(0).toUpperCase() + cat.folder.slice(1);
    const indexDesc = `Complete list of Slay the Spire 2 ${cat.folder.toLowerCase()} from the game database.`;
    const indexHtml = wrapLayout(
        cat.folder.toUpperCase(), 
        `
        <div class="grid">${itemLinks}</div>`, 
        [{ name: cat.folder, url: '' }],
        indexDesc,
        generateCollectionJsonLd(`${catName}`, indexDesc)
    );
    fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
}

async function buildRelics(relics, runStats, sitemap) {
    console.log(`🏺 Building ${relics.length} relic pages...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, 'relics'));

    for (const relic of relics) {
        const slug = slugify(relic.name);
        const dir = ensureDir(path.join(root, slug));
        
        const cleanRelicId = (relic.relic_id || '').replace('RELIC.', '');
        const rawStats = runStats.relicStats[cleanRelicId] || { seen: 0, wins: 0, runs: [] };
        const stats = getItemStats(rawStats, runStats.globalWinRate);
        const videosHtml = generateRunLinksList(rawStats.runs, `Runs featuring ${relic.name}`);
        const subtitle = [relic.rarity, relic.pool ? `${relic.pool} Pool` : null].filter(Boolean).join(' • ');
        const descriptionHtml = formatDescription(relic.description || relic.description_raw || "");

        const detailHtml = relicDetailTemplate(relic, stats, videosHtml);
        fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
        sitemap.add(`/relics/${slug}/`);
    }

    // Index Page
    sitemap.add('/relics/');
    const totalRelics = relics.length;
    const relicsSeen = runStats.uniqueRelicsSeen;
    const relicLinks = relics.map(relic => {
        const slug = slugify(relic.name);
        const cleanRelicId = (relic.relic_id || '').replace('RELIC.', '');
        const stats = getItemStats(runStats.relicStats[cleanRelicId], runStats.globalWinRate);
        const poolClass = (relic.pool || 'shared').toLowerCase();
        return generateCardItemHtml(`/relics/${slug}/`, relic.name, stats, poolClass);
    }).join('');

    const indexDesc = `View global winrates, run statistics, and win/loss records for all Slay the Spire 2 relics.`;
    const indexHtml = wrapLayout(
        'Relics', 
        `
        ${generateSummaryPanel(runStats, "Relics", totalRelics, relicsSeen)}
        <div class="grid">${relicLinks}</div>`,
        [{ name: 'relics', url: '' }],
        indexDesc,
        generateCollectionJsonLd(`Relics`, indexDesc)
    );
    fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
}

async function buildEvents(events, runStats, sitemap) {
    console.log(`🌀 Building ${events.length} event pages...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, 'events'));

    for (const event of events) {
        const slug = slugify(event.name);
        const dir = ensureDir(path.join(root, slug));
        
        const cleanId = (event.event_id || '').replace('EVENT.', '');
        const rawStats = runStats.eventStats[cleanId] || { seen: 0, wins: 0, runs: [], occurrences: 0 };
        const stats = getItemStats(rawStats, runStats.globalWinRate);
        const averagesHtml = generateAveragesPanel(rawStats, rawStats.occurrences, "Averages per event visit");
        const videosHtml = generateRunLinksList(rawStats.runs, `Runs featuring ${event.name}`);
        const detailHtml = eventDetailTemplate(event, stats, averagesHtml, videosHtml);
        fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
        sitemap.add(`/events/${slug}/`);
    }

    // Index Page
    sitemap.add('/events/');
    const totalEvents = events.length;
    const eventsSeen = runStats.uniqueEventsSeen;
    const eventLinks = events.map(e => {
        const slug = slugify(e.name);
        const stats = getItemStats(runStats.eventStats[e.event_id], runStats.globalWinRate);
        return generateCardItemHtml(`/events/${slug}/`, e.name, stats);
    }).join('');

    const indexDesc = `View global winrates, run statistics, and encounter records for all Slay the Spire 2 events.`;
    const indexHtml = wrapLayout(
        'Events', 
        `
        ${generateSummaryPanel(runStats, "Events", totalEvents, eventsSeen)}
        <div class="grid">${eventLinks}</div>`,
        [{ name: 'events', url: '' }],
        indexDesc,
        generateCollectionJsonLd(`Events`, indexDesc)
    );
    fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
}

async function buildAscensions(ascensions, runStats, sitemap) {
    console.log(`📈 Building ${ascensions.length} ascension pages...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, 'ascensions'));

    for (const asc of ascensions) {
        const title = asc.name || `Ascension ${asc.level}`;
        const slug = slugify(title);
        const dir = ensureDir(path.join(root, slug));
        
        const rawStats = runStats.ascensionStats[String(asc.level)] || { seen: 0, wins: 0, runs: [] };
        const stats = getItemStats(rawStats, runStats.globalWinRate);
        const videosHtml = generateRunLinksList(rawStats.runs, `Runs at Ascension ${asc.level}`);

        const detailHtml = ascensionDetailTemplate(asc, stats, videosHtml);
        fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
        sitemap.add(`/ascensions/${slug}/`);
    }

    // Index Page
    sitemap.add('/ascensions/');
    const totalAsc = ascensions.length;
    const ascSeen = runStats.uniqueAscensionsSeen;
    const ascLinks = ascensions.map(asc => {
        const title = asc.name || `Ascension ${asc.level}`;
        const slug = slugify(title);
        const displayName = `Asc. ${asc.level} ${asc.name || ''}`.trim();
        const stats = getItemStats(runStats.ascensionStats[String(asc.level)], runStats.globalWinRate);
        return generateCardItemHtml(`/ascensions/${slug}/`, displayName, stats, '', asc.level);
    }).join('');

    const buildFilterHtml = `
    <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 15px; background: rgba(0,0,0,0.2); padding: 10px 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        <label for="build-filter" style="font-size: 0.8rem; color: #888; text-transform: uppercase; letter-spacing: 1px;">Filter By Build:</label>
        <select id="build-filter" style="background: #222; color: #eee; border: 1px solid #444; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
            <option value="all">All Builds</option>
            <option value="beta">Beta (v0.100.0+)</option>
            <option value="main">Main Branch (< v0.100.0)</option>
        </select>
    </div>`;

    const scriptHtml = `
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script>
        (function() {
            const supabaseUrl = '${SUPABASE_URL}';
            const supabaseKey = '${SUPABASE_ANON_KEY}';
            const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
            
            const statsCache = {};
            const filter = document.getElementById('build-filter');
            const grid = document.querySelector('.grid');

            async function updateStats() {
                const val = filter.value;
                
                // Visual Loading State
                grid.style.opacity = '0.4';
                grid.style.pointerEvents = 'none';
                grid.style.transition = 'opacity 0.2s';

                let results;
                if (statsCache[val]) {
                    results = statsCache[val];
                } else {
                    // Call the heavy-lifting aggregation function in Supabase
                    const { data, error } = await supabase.rpc('get_ascension_stats', { build_filter: val });
                    if (error) {
                        grid.style.opacity = '1';
                        grid.style.pointerEvents = 'auto';
                        return console.error("Error fetching aggregated stats:", error);
                    }
                    results = data;
                    statsCache[val] = data;
                }

                grid.style.opacity = '1';
                grid.style.pointerEvents = 'auto';

                // Calculate Globals for Summary Box from aggregated results
                const globalTotal = results.reduce((sum, r) => sum + parseInt(r.total_runs), 0);
                const globalWins = results.reduce((sum, r) => sum + parseInt(r.wins), 0);
                const globalWR = globalTotal > 0 ? (globalWins / globalTotal) * 100 : 0;
                const seenCount = results.filter(r => parseInt(r.total_runs) > 0).length;

                document.getElementById('global-total-runs').textContent = globalTotal;
                document.getElementById('global-winrate').textContent = globalWR.toFixed(1) + '%';
                
                // Update the "Ascensions Seen" stat item
                const seenValEl = document.querySelector('.stat-item:nth-child(3) .stat-value');
                if (seenValEl) {
                    const totalPossible = ${ascensions.length};
                    seenValEl.innerHTML = seenCount === totalPossible ? totalPossible : \`\${seenCount} <span style="color: #444; font-size: 0.8em;">/ \${totalPossible}</span>\`;
                }

                // Update Individual Cards
                for (let i = 0; i <= 10; i++) {
                    const card = document.getElementById('asc-card-' + i);
                    const label = document.getElementById('asc-wr-' + i);
                    if (!card || !label) continue;

                    const countLabel = card.querySelector('.run-count');
                    const bar = card.querySelector('.win-bar');
                    
                    const row = results.find(r => r.level_val === i);
                    const seen = row ? parseInt(row.total_runs) : 0;
                    const wins = row ? parseInt(row.wins) : 0;
                    const wr = seen > 0 ? (wins / seen) * 100 : 0;

                    if (seen === 0) {
                        label.textContent = '';
                        label.style.color = 'var(--gray)';
                        countLabel.textContent = '0 runs';
                        if (bar) bar.style.display = 'none';
                    } else {
                        label.textContent = wr.toFixed(1) + '% Winrate';
                        countLabel.textContent = seen + ' runs';
                        
                        let color = 'var(--gray)';
                        if (wr > globalWR) color = 'var(--green)';
                        else if (wr < globalWR) color = 'var(--red)';
                        label.style.color = color;
                        if (bar) {
                            bar.style.display = 'block';
                            bar.style.background = 'linear-gradient(to right, #00ff89 ' + wr + '%, #ff4b4b ' + wr + '%)';
                        }
                    }
                }
            }

            filter.addEventListener('change', updateStats);
        })();
    </script>`;

    const indexDesc = `Global winrates and statistics per Ascension level in Slay the Spire 2.`;
    const indexHtml = wrapLayout(
        'Ascensions', 
        `
        ${generateSummaryPanel(runStats, "Ascensions", totalAsc, ascSeen)}
        ${buildFilterHtml}
        <div class="grid">${ascLinks}</div>
        ${scriptHtml}`, 
        [{ name: 'ascensions', url: '' }], 
        indexDesc, 
        generateCollectionJsonLd(`Ascensions`, indexDesc));
    fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
}

async function buildEnchantments(enchantments, runStats, sitemap) {
    console.log(`✨ Building ${enchantments.length} enchantment pages...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, 'enchantments'));

    for (const enchantment of enchantments) {
        const title = enchantment.name;
        const slug = slugify(title);
        const dir = ensureDir(path.join(root, slug));
        
        const cleanId = (enchantment.enchantment_id || '').replace('ENCHANTMENT.', '');
        const rawStats = runStats.enchantmentStats[cleanId] || { seen: 0, wins: 0, runs: [] };
        const stats = getItemStats(rawStats, runStats.globalWinRate);
        const videosHtml = generateRunLinksList(rawStats.runs, `Runs featuring ${enchantment.name}`);

        const detailHtml = enchantmentDetailTemplate(enchantment, stats, videosHtml);
        fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
        sitemap.add(`/enchantments/${slug}/`);
    }

    // Index Page
    sitemap.add('/enchantments/');
    const total = enchantments.length;
    const seen = runStats.uniqueEnchantmentsSeen;
    const links = enchantments.map(e => {
        const slug = slugify(e.name);
        const cleanId = (e.enchantment_id || '').replace('ENCHANTMENT.', '');
        const stats = getItemStats(runStats.enchantmentStats[cleanId], runStats.globalWinRate);
        return generateCardItemHtml(`/enchantments/${slug}/`, e.name, stats);
    }).join('');

    const indexDesc = `View global winrates and run statistics for all Slay the Spire 2 enchantments.`;
    const indexHtml = wrapLayout('Enchantments', `${generateSummaryPanel(runStats, "Enchantments", total, seen)}<div class="grid">${links}</div>`, [{ name: 'enchantments', url: '' }], indexDesc, generateCollectionJsonLd(`Enchantments`, indexDesc));
    fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
}

async function buildCharacters(chars, runStats, sitemap) {
    console.log(`👤 Building ${chars.length} character pages...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, 'characters'));

    for (const char of chars) {
        const displayName = char.name.replace(/^The\s+/i, '');
        const slug = slugify(displayName);
        const dir = ensureDir(path.join(root, slug));
        // Normalize character ID to match sanitized run data
        const charKey = (char.character_id || '').replace('CHARACTER.', '').toUpperCase();

        console.log(`🔍 Mapping Character: "${displayName}" (ID: ${charKey})`);

        const rawStats = runStats.charStats[charKey] || { seen: 0, wins: 0, runs: [], cardFrequencies: {}, relicFrequencies: {}, killerFrequencies: {} };
        const stats = getItemStats(rawStats, runStats.globalWinRate);
                
                // Calculate Character Highlights (Popular cards/relics and deadliest foe)
                const starterCards = new Set((await query("SELECT card_id FROM cards WHERE starter = 1")).map(c => c.card_id.toUpperCase()));
                const starterRelics = new Set((await query("SELECT relic_id FROM relics WHERE starter = 1")).map(r => r.relic_id.toUpperCase()));
                const cardNames = Object.fromEntries((await query("SELECT card_id, name FROM cards")).map(c => [c.card_id.toUpperCase(), c.name]));
                const relicNames = Object.fromEntries((await query("SELECT relic_id, name FROM relics")).map(r => [r.relic_id.toUpperCase(), r.name]));
                const encounterNames = Object.fromEntries((await query("SELECT encounter_id, name FROM encounters")).map(e => [e.encounter_id.toUpperCase(), e.name]));

                const getTop = (freqMap, ignoreSet, nameMap) => {
                    let bestId = null;
                    let bestCount = 0;
                    for (const [id, count] of Object.entries(freqMap)) {
                        if (ignoreSet && ignoreSet.has(id.toUpperCase())) continue;
                        if (count > bestCount) {
                            bestCount = count;
                            bestId = id;
                        }
                    }
                    return bestId ? { name: nameMap[bestId.toUpperCase()] || bestId, count: bestCount } : null;
                };

                const topStats = {
                    card: getTop(rawStats.cardFrequencies || {}, starterCards, cardNames),
                    relic: getTop(rawStats.relicFrequencies || {}, starterRelics, relicNames),
                    killer: getTop(rawStats.killerFrequencies || {}, null, encounterNames)
                };

        if (rawStats.seen > 0) console.log(`   ✅ Found ${rawStats.seen} runs for ${charKey}`);
        else console.log(`   ⚠️ No runs found for ID "${charKey}"`);

                const videosHtml = generateRunLinksList(rawStats.runs, `${displayName} Runs`);

                // Character Cards
                const charCards = await query("SELECT * FROM cards WHERE LOWER(color) = ? ORDER BY rarity, name ASC", [displayName.toLowerCase()]);
                const cardItemsHtml = charCards.map(c => {
                    const cStats = getItemStats(runStats.stats[c.card_id], runStats.globalWinRate);
                    return `<a href="/cards/${slugify(c.name)}/" class="card-item ${displayName.toLowerCase()}">
                        <div class="card-info"><span class="card-name">${c.name}</span></div>
                        <div class="card-stats"><div class="win-rate">${cStats.text}</div><div class="run-count">${cStats.seen} runs</div></div>
                        <div class="win-bar" style="${cStats.bar}"></div>
                    </a>`;
                }).join('');

                // Character Relics
                const charRelics = await query("SELECT * FROM relics WHERE LOWER(pool) = ? ORDER BY rarity, name ASC", [displayName.toLowerCase()]);
                const relicItemsHtml = charRelics.map(r => {
                    const cleanRelicId = (r.relic_id || '').replace('RELIC.', '');
                    const rStats = getItemStats(runStats.relicStats[cleanRelicId], runStats.globalWinRate);
                    const winBar = rStats.seen > 0 ? `<div class="win-bar" style="${rStats.bar}"></div>` : '';
                    return `<a href="/relics/${slugify(r.name)}/" class="card-item ${displayName.toLowerCase()}" aria-label="${r.name}: ${rStats.seen} runs, ${rStats.text}">
                        <div class="card-info"><span class="card-name">${r.name}</span></div>
                        <div class="card-stats">
                            <div class="win-rate" style="color: ${rStats.color}">${rStats.text}</div>
                            <div class="run-count">${rStats.seen} runs</div>
                        </div>
                        ${winBar}
                    </a>`;
                }).join('');

                const detailHtml = characterDetailTemplate(char, stats, videosHtml, cardItemsHtml, relicItemsHtml, displayName, runStats.globalWinRate, topStats);
                fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
                sitemap.add(`/characters/${slug}/`);
    }

    // Index Page
    sitemap.add('/characters/');
    const charLinks = chars.map(c => {
                const displayName = c.name.replace(/^The\s+/i, '');
                const charKey = (c.character_id || '').replace('CHARACTER.', '').toUpperCase();
                const stats = getItemStats(runStats.charStats[charKey], runStats.globalWinRate);
                return generateCardItemHtml(`/characters/${slugify(displayName)}/`, displayName, stats, displayName.toLowerCase());
            }).join('');

            const indexDesc = `${runStats.globalWinRate.toFixed(1)}% winrate across ${runStats.totalRuns} runs for characters on Slay the Spire 2.`;
            const indexHtml = wrapLayout(
                'Characters', 
                `
                ${generateSummaryPanel(runStats, "Characters", chars.length, runStats.uniqueCharsSeen)}
                <div class="grid">${charLinks}</div>`,
                [{ name: 'characters', url: '' }],
                indexDesc,
                generateCollectionJsonLd(`Characters`, indexDesc)
            );
            fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
}

async function buildEncounters(encounters, runStats, sitemap) {
    console.log(`⚔️ Building ${encounters.length} encounter pages...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, 'encounters'));

    for (const encounter of encounters) {
        const slug = slugify(encounter.name);
        const dir = ensureDir(path.join(root, slug));
        
        const cleanId = (encounter.encounter_id || '').replace('ENCOUNTER.', '');
        const stats = runStats.encounterStats[cleanId] || { encountered: 0, kills: 0, lethalRuns: [], damage_taken: 0, hp_healed: 0, gold_lost: 0, gold_stolen: 0, max_hp_gained: 0, max_hp_lost: 0 };
        const lethalRunsHtml = generateRunLinksList(stats.lethalRuns, `Runs where ${encounter.name} defeated the player`);
        const averagesHtml = generateAveragesPanel(stats, stats.encountered, "Averages for this encounter");
        const subtitle = [encounter.room_type, encounter.act].filter(Boolean).join(' • ');
        
        const detailHtml = encounterDetailTemplate(encounter, stats, averagesHtml, lethalRunsHtml, subtitle);
        fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
        sitemap.add(`/encounters/${slug}/`);
    }

    // Index Page
    sitemap.add('/encounters/');

    let maxAvgDmg = 0;
    encounters.forEach(e => {
        const cleanId = (e.encounter_id || '').replace('ENCOUNTER.', '');
        const stats = runStats.encounterStats[cleanId];
        if (stats && stats.encountered > 0) {
            const avg = stats.damage_taken / stats.encountered;
            if (avg > maxAvgDmg) maxAvgDmg = avg;
        }
    });

    const encounterLinks = encounters.map(e => {
        const slug = slugify(e.name);
        const cleanId = (e.encounter_id || '').replace('ENCOUNTER.', '');
        const stats = runStats.encounterStats[cleanId] || { encountered: 0, kills: 0, damage_taken: 0 };
        const avgDmg = stats.encountered > 0 ? stats.damage_taken / stats.encountered : 0;
        const dmgPercent = maxAvgDmg > 0 ? (avgDmg / maxAvgDmg) * 100 : 0;
        const killDisplay = stats.kills > 0 ? `<div style="color: var(--red); font-size: 1.5rem; font-weight: bold;">${stats.kills} Kills</div>` : '';
        const winBar = stats.encountered > 0 ? `<div class="win-bar" style="background: linear-gradient(to right, var(--red) ${dmgPercent}%, transparent ${dmgPercent}%);"></div>` : '';

        return `
        <a href="/encounters/${slug}/" class="card-item" aria-label="${e.name}: encountered ${stats.encountered} times">
            <div class="card-info">
                <span class="card-name">${e.name}</span>
                <div style="color: #888; font-size: 0.75rem;">Encountered ${stats.encountered} times</div>
                <div style="color: var(--red); font-size: 0.75rem;">Avg Dmg: ${avgDmg.toFixed(1)}</div>
            </div>
            <div class="card-stats">
                ${killDisplay}
            </div>
            ${winBar}
        </a>`;
    }).join('');

    const indexHtml = wrapLayout('Encounters', `${generateLethalityIndexSummary(runStats, runStats.encounterStats, "Encounters", encounters.length, runStats.uniqueEncountersSeen)}<div class="grid">${encounterLinks}</div>`, [{ name: 'encounters', url: '' }], "View Slay the Spire 2 encounter lethality and encounter rates.");
    fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
}

async function buildSettingsPage(sitemap) {
    console.log('📝 Generating settings page...');
    const html = settingsTemplate();

    fs.writeFileSync(path.join(PATHS.WEB_ROOT, 'settings.html'), html);
    sitemap.add('/settings.html');
}

async function buildContributePage(sitemap) {
    console.log('📝 Generating contribute page...');
    const content = `
    <div class="item-box" style="max-width: 1300px; margin: 0 auto; text-align: left;">
        <h1>How to Contribute</h1>
        <div class="description">
            <p>Spire 2 Stats is built on community data. By sharing your run history, you help improve winrate accuracy and monster lethality statistics for everyone!</p>
            
            <section style="margin-top: 30px;">
                <h2 style="color: var(--gold, #ffd700); font-size: 1.2rem;">Step 1: Locate your Run History</h2>
                <p>On Windows, navigate to your Steam user data folder for Slay the Spire 2. It is usually located at:</p>
                <div class="code-block" style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; border: 1px solid #444; font-family: monospace; word-break: break-all; margin: 15px 0;">
                    C:\\Users\\<strong style="color: #4bff87; background: rgba(75, 255, 135, 0.1); padding: 2px 4px; border-radius: 3px;">{Your_Windows_Username}</strong>\\AppData\\Roaming\\SlayTheSpire2\\steam\\<strong style="color: #4bff87; background: rgba(75, 255, 135, 0.1); padding: 2px 4px; border-radius: 3px;">{12345678901234567}</strong>\\profile1\\saves
                </div>
                <p class="text-muted" style="font-size: 0.85rem;">Pro tip: You can also paste <strong style="color: #4bff87;"><code>%appdata%\\SlayTheSpire2\\steam</code></strong> into your File Explorer address bar to jump there more quickly.</p>
            </section>

            <section style="margin-top: 30px;">
                <h2 style="color: var(--gold, #ffd700); font-size: 1.2rem;">Step 2: Zip the History Folder</h2>
                <p>Inside that folder, find the <code>history</code> directory. Right-click it and select <strong>Compress to ZIP file</strong>.</p>
                <img src="/images/zip.png" alt="How to zip the history folder" style="display: block; max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #333; margin: 20px 0;">
            </section>

            <section style="margin-top: 30px;">
                <h2 style="color: var(--gold, #ffd700); font-size: 1.2rem;">Step 3: Send it Over</h2>
                <p>Once you have <code>username_history.zip</code>, share it using,</p>
                <ul style="line-height: 1.8;">
                    <li><strong>Discord:</strong> Join our <a href="https://discord.gg/wMEWQut72X" target="_blank" style="color: #448aff; font-weight: bold;">Discord Community</a> and upload the file.</li>
                    <li><strong>Email:</strong> Attach it to an email and send to <a href="mailto:letstrygg@gmail.com" style="color: var(--blue, #448aff);">letstrygg@gmail.com</a>.</li>
                </ul>
                <p><strong>Note:</strong> Feel free to include the <strong>Display Name</strong> you would like us to use for your runs!</p>
            </section>

            <hr style="border: 0; border-top: 1px solid #333; margin: 40px 0;">

            <section style="opacity: 0.8;">
                <h2 style="font-size: 1.1rem; color: #aaa;">Future Plans</h2>
                <ul style="font-size: 0.9rem; color: #aaa; line-height: 1.6;">
                    <li>Google and Twitch login integration for in-site run submissions.</li>
                    <li>User profiles with the ability to edit your display name.</li>
                    <li>Ability to link your YouTube videos or Twitch VODs to your runs.</li>
                </ul>
            </section>
        </div>
    </div>`;

    const html = wrapLayout(
        "Contribute",
        content,
        [{ name: "Contribute", url: "" }],
        "Learn how to contribute your Slay the Spire 2 run data to Spire 2 Stats."
    );

    fs.writeFileSync(path.join(PATHS.WEB_ROOT, 'contribute.html'), html);
    sitemap.add('/contribute.html');
}

async function buildMonsters(monsters, runStats, sitemap) {
    console.log(`👹 Building ${monsters.length} monster pages...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, 'monsters'));

    for (const monster of monsters) {
        const slug = slugify(monster.name);
        const dir = ensureDir(path.join(root, slug));
        
        const cleanId = (monster.monster_id || '').replace('MONSTER.', '');
        const stats = runStats.monsterStats[cleanId] || { encountered: 0, kills: 0, lethalRuns: [], damage_taken: 0, hp_healed: 0, gold_lost: 0, gold_stolen: 0, max_hp_gained: 0, max_hp_lost: 0 };
        const lethalRunsHtml = generateRunLinksList(stats.lethalRuns, `Runs where ${monster.name} killed the player`);
        const averagesHtml = generateAveragesPanel(stats, stats.encountered, "Averages for encounters with this monster");
        const subtitle = [monster.type, monster.min_hp ? `${monster.min_hp}-${monster.max_hp} HP` : null].filter(Boolean).join(' • ');
        
        const detailHtml = monsterDetailTemplate(monster, stats, averagesHtml, lethalRunsHtml, subtitle);
        fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
        sitemap.add(`/monsters/${slug}/`);
    }

    // Index Page
    sitemap.add('/monsters/');

    let maxAvgDmg = 0;
    monsters.forEach(m => {
        const cleanId = (m.monster_id || '').replace('MONSTER.', '');
        const stats = runStats.monsterStats[cleanId];
        if (stats && stats.encountered > 0) {
            const avg = stats.damage_taken / stats.encountered;
            if (avg > maxAvgDmg) maxAvgDmg = avg;
        }
    });

    const monsterLinks = monsters.map(m => {
        const slug = slugify(m.name);
        const cleanId = (m.monster_id || '').replace('MONSTER.', '');
        const stats = runStats.monsterStats[cleanId] || { encountered: 0, kills: 0, damage_taken: 0 };
        const avgDmg = stats.encountered > 0 ? stats.damage_taken / stats.encountered : 0;
        const dmgPercent = maxAvgDmg > 0 ? (avgDmg / maxAvgDmg) * 100 : 0;
        const killDisplay = stats.kills > 0 ? `<div style="color: #ff4b4b; font-size: 1.5rem; font-weight: bold;">${stats.kills} Kills</div>` : '';
        const winBar = stats.encountered > 0 ? `<div class="win-bar" style="background: linear-gradient(to right, #ff4b4b ${dmgPercent}%, transparent ${dmgPercent}%);"></div>` : '';

        return `
        <a href="/monsters/${slug}/" class="card-item" aria-label="${m.name}: encountered ${stats.encountered} times">
            <div class="card-info">
                <span class="card-name">${m.name}</span>
                <div style="color: #888; font-size: 0.75rem;">Encountered ${stats.encountered} times</div>
                <div style="color: #ff4b4b; font-size: 0.75rem;">Avg Dmg: ${avgDmg.toFixed(1)}</div>
            </div>
            <div class="card-stats">
                ${killDisplay}
            </div>
            ${winBar}
        </a>`;
    }).join('');

    const indexHtml = wrapLayout('Monsters', `${generateLethalityIndexSummary(runStats, runStats.monsterStats, "Monsters", monsters.length, runStats.uniqueMonstersSeen)}<div class="grid">${monsterLinks}</div>`, [{ name: 'monsters', url: '' }], "View Slay the Spire 2 monster lethality and encounter rates.");
    fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
}

async function getAllCards() {
    return query("SELECT * FROM cards ORDER BY color, name ASC");
}

async function build() {
    try {
        console.log('🛠️  Starting build process...');
        const cards = await getAllCards();
        const totalCards = cards.length;

        const sitemap = new Sitemap('https://spire2stats.com');

        if (cards.length > 0) {
            console.log(`🗃️  Sample card_id from cards table: "${cards[0].card_id}" (Card Name: ${cards[0].name})`);
        }

        const chars = await query("SELECT * FROM characters ORDER BY name ASC");
        const relics = await query("SELECT * FROM relics ORDER BY name ASC");
        const events = await query("SELECT * FROM events ORDER BY name ASC");
        const monsters = await query("SELECT * FROM monsters ORDER BY name ASC");
        const encounters = await query("SELECT * FROM encounters ORDER BY name ASC");
        const ascensions = await query("SELECT * FROM ascensions ORDER BY level ASC");
        const enchantments = await query("SELECT * FROM enchantments ORDER BY name ASC");
        const users = await query("SELECT * FROM users ORDER BY display_name ASC");
        const userRunRows = await query("SELECT username, COUNT(*) as count FROM runs GROUP BY username");
        const runCounts = Object.fromEntries(userRunRows.map(r => [(r.username || '').toLowerCase(), r.count]));

        const cardStats = await getCardStats();
        const cardsRoot = ensureDir(path.join(PATHS.WEB_ROOT, 'cards'));

        console.log(`🎴 Generating ${cards.length} card pages...`);

        for (const card of cards) {
            const slug = slugify(card.name);
            const cardDir = ensureDir(path.join(cardsRoot, slug));
            
            const costDisplay = getCostDisplay(card);
            const description = formatDescription(card.description);
            
            const cleanCardId = (card.card_id || '').replace('CARD.', '');
            const stats = getItemStats(cardStats.stats[cleanCardId], cardStats.globalWinRate);
            const rawStats = cardStats.stats[cleanCardId] || { runs: [] };
            const videosHtml = generateRunLinksList(rawStats.runs, `Runs featuring ${card.name}`);

            const detailHtml = cardDetailTemplate(card, stats, videosHtml, costDisplay, `/cards/${slug}/`);

            fs.writeFileSync(path.join(cardDir, 'index.html'), detailHtml);
            sitemap.add(`/cards/${slug}/`);
        }

        // --- INDEX PAGE ---
        sitemap.add('/cards/');
        console.log('📂 Generating index page...');
        
        const cardLinks = cards.map(card => {
            const slug = slugify(card.name);
            const cleanCardId = (card.card_id || '').replace('CARD.', '');
            const stats = getItemStats(cardStats.stats[cleanCardId], cardStats.globalWinRate);
        return generateCardItemHtml(`/cards/${slug}/`, card.name, stats, card.color);
        }).join('');

        const indexDesc = `${cardStats.globalWinRate.toFixed(1)}% winrate across ${cardStats.totalRuns} runs for cards on Slay the Spire 2.`;
        const indexHtml = wrapLayout(
            'Cards', 
            `
            ${generateSummaryPanel(cardStats, "Cards", totalCards, cardStats.uniqueCardsSeen)}
            <div class="grid">${cardLinks}</div>`,
            [{ name: 'cards', url: '' }],
            indexDesc,
            generateCollectionJsonLd(`Cards`, indexDesc)
        );

        fs.writeFileSync(path.join(cardsRoot, 'index.html'), indexHtml);

        // --- ROOT LANDING PAGE ---
        console.log('🏠 Generating root landing page...');
        sitemap.add('/');
        const lastUpdated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        const getSubText = (seen, total) => seen === total ? total : `${seen} / ${total}`;

        const statCategoryConfig = [
            { name: 'Cards', folder: 'cards', seen: cardStats.uniqueCardsSeen, total: totalCards },
            { name: 'Characters', folder: 'characters', seen: cardStats.uniqueCharsSeen, total: chars.length },
            { name: 'Relics', folder: 'relics', seen: cardStats.uniqueRelicsSeen, total: relics.length },
            { name: 'Events', folder: 'events', seen: cardStats.uniqueEventsSeen, total: events.length },
            { name: 'Monsters', folder: 'monsters', seen: cardStats.uniqueMonstersSeen, total: monsters.length },
            { name: 'Encounters', folder: 'encounters', seen: cardStats.uniqueEncountersSeen, total: encounters.length },
            { name: 'Ascensions', folder: 'ascensions', seen: cardStats.uniqueAscensionsSeen, total: ascensions.length },
            { name: 'Enchantments', folder: 'enchantments', seen: cardStats.uniqueEnchantmentsSeen, total: enchantments.length }
        ];

        let landingLinks = statCategoryConfig.map(cat => `
        <a href="/${cat.folder}/" class="card-item">
            <div class="card-info"><span class="card-name">${cat.name}</span></div>
            <div class="card-stats"><div class="run-count">${getSubText(cat.seen, cat.total)}</div></div>
        </a>`).join('');

        // Append the rest of the categories
        landingLinks += CATEGORIES.map(cat => {
            const display = cat.folder.charAt(0).toUpperCase() + cat.folder.slice(1);
            return `<a href="/${cat.folder}/" class="card-item">
                <div class="card-info"><span class="card-name">${display}</span></div>
            </a>`;
        }).join('');

        const contributorLinks = users.map(user => {
            const count = runCounts[user.slug.toLowerCase()] || 0;
            return `
            <a href="/users/${user.slug}/" class="card-item contributor-card">
                <div class="card-info"><span class="card-name">${user.display_name}</span></div>
                <div class="card-stats"><div class="run-count">${count} runs</div></div>
            </a>`;
        }).join('');

        const contributorsSection = users.length > 0 ? `
            <h2 style="margin-top: 40px; border-bottom: 1px solid #333; padding-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                Contributors
                <a href="/contribute.html" title="How to Contribute" aria-label="How to Contribute" style="color: #666; text-decoration: none; display: flex; align-items: center;">
                    <span class="material-symbols-outlined" style="font-size: 20px;">info</span>
                </a>
            </h2>
            <div class="grid">${contributorLinks}</div>` : '';

        const landingDesc = `${cardStats.globalWinRate.toFixed(1)}% overall winrate across ${cardStats.totalRuns} runs on Slay the Spire 2.`;
        const landingHtml = wrapLayout(
            "",
            `
    <div class="averages-panel" style="margin: 20px 0; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Total Runs</div>
                <div class="stat-value" style="font-size: 1.5rem; font-weight: bold;">${cardStats.totalRuns}</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Overall Winrate</div>
                <div class="stat-value" style="font-size: 1.5rem; font-weight: bold; color: #00ff89">${cardStats.globalWinRate.toFixed(1)}%</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div class="stat-label" style="font-size: 0.7rem; color: #666; text-transform: uppercase;">Contributors</div>
                <div class="stat-value" style="font-size: 1.5rem; font-weight: bold;">${cardStats.uniqueUsers}</div>
            </div>
        </div>
    </div>
    <div class="grid">${landingLinks}</div>
    ${contributorsSection}`,
            [],
            landingDesc,
            generateCollectionJsonLd("Slay the Spire 2 Stats Hub", landingDesc) + `<link rel="stylesheet" href="/css/sts2-style.css">`,
            "/"
        );

        fs.writeFileSync(path.join(PATHS.WEB_ROOT, 'index.html'), landingHtml);

        // --- CHARACTERS ---
        await buildCharacters(chars, cardStats, sitemap);

        // --- RELICS ---
        await buildRelics(relics, cardStats, sitemap);

        // --- EVENTS ---
        await buildEvents(events, cardStats, sitemap);

        // --- MONSTERS ---
        await buildMonsters(monsters, cardStats, sitemap);

        // --- ENCOUNTERS ---
        await buildEncounters(encounters, cardStats, sitemap);

        // --- ASCENSIONS ---
        await buildAscensions(ascensions, cardStats, sitemap);

        // --- ENCHANTMENTS ---
        await buildEnchantments(enchantments, cardStats, sitemap);

        // --- GENERAL CATEGORY BUILDS ---
        for (const cat of CATEGORIES) {
            await buildGeneralCategory(cat, sitemap);
        }

        // --- CONTRIBUTE PAGE ---
        await buildContributePage(sitemap);

        // --- SETTINGS PAGE ---
        await buildSettingsPage(sitemap);

        console.log('🗺️  Saving sitemap.xml...');
        sitemap.save(path.join(PATHS.WEB_ROOT, 'sitemap.xml'));

        console.log('✨ Build complete!');
        db.close();

    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

build();
