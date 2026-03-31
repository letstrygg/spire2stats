import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir, slugify } from './paths.js';

import { 
    ISO_BUILD_DATE, 
    FORMATTED_BUILD_DATE, 
    generateItemJsonLd, 
    generateCollectionJsonLd, 
    generateSummaryPanel, 
    generateVideoPanel, 
    generateSemanticStatsParagraph, 
    wrapLayout, 
    formatDescription,
    Sitemap
} from './templates/shared.js';

import { cardDetailTemplate } from './templates/card.js';
import { relicDetailTemplate } from './templates/relic.js';
import { eventDetailTemplate } from './templates/event.js';
import { characterDetailTemplate } from './templates/character.js';

/**
 * Slay the Spire 2 - Static Site Generator
 * Reads from local SQLite and builds the card database
 */

const db = new sqlite3.Database(PATHS.DATABASE);

const CATEGORIES = [
    { table: 'potions', folder: 'potions', titleField: 'name' },
    { table: 'monsters', folder: 'monsters', titleField: 'name' },
    { table: 'encounters', folder: 'encounters', titleField: 'name' },
    { table: 'acts', folder: 'acts', titleField: 'name' },
    { table: 'achievements', folder: 'achievements', titleField: 'name' },
    { table: 'afflictions', folder: 'afflictions', titleField: 'name' },
    { table: 'enchantments', folder: 'enchantments', titleField: 'name' },
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

/** Helper for win bar background styles */
function getWinBarStyle(seen, winRateNum) {
    if (seen === 0) return 'background: #444;';
    return `background: linear-gradient(to right, #00ff89 ${winRateNum}%, #ff4b4b ${winRateNum}%);`;
}

/** Helper for win rate text color logic */
function getWinRateColor(seen, winRateNum, globalWinRate) {
    if (seen === 0) return '#888';
    if (winRateNum > globalWinRate) return '#00ff89';
    if (winRateNum < globalWinRate) return '#ff4b4b';
    return '#888';
}

/** Standardizes item statistics for display */
function getItemStats(stats, globalWinRate) {
    const seen = stats?.seen || 0;
    const wins = stats?.wins || 0;
    const num = seen > 0 ? (wins / seen) * 100 : 0;
    const losses = seen - wins;
    return {
        seen, wins, losses, num,
        formatted: num.toFixed(1),
        color: getWinRateColor(seen, num, globalWinRate),
        bar: getWinBarStyle(seen, num),
        text: seen > 0 ? `${num.toFixed(0)}% Winrate` : ''
    };
}

function getCostDisplay(card) {
    let cost = card.is_x_cost ? 'X' : (card.cost ?? '');
    let star = card.is_x_star_cost ? 'X★' : (card.star_cost ? `${card.star_cost}★` : '');
    return [cost, star].filter(Boolean).join(' ');
}

async function getCardStats() {
    const rows = await query("SELECT character, relic_list, deck_list, path_history, win, username, yt_video, ltg_url, ascension FROM runs");
    console.log(`📡 Database returned ${rows.length} run rows.`);

    const totalRuns = rows.length;
    if (totalRuns === 0) return { stats: {}, charStats: {}, relicStats: {}, eventStats: {}, ascensionStats: {}, globalWinRate: 0, totalRuns: 0, totalWins: 0, totalLosses: 0, uniqueUsers: 0, uniqueCardsSeen: 0, uniqueRelicsSeen: 0, uniqueEventsSeen: 0, uniqueCharsSeen: 0, uniqueAscensionsSeen: 0 };

            const totalWins = rows.filter(r => r.win).length;
            const globalWinRate = totalRuns > 0 ? (totalWins / totalRuns) * 100 : 0;
            const uniqueUsers = new Set(rows.map(r => r.username)).size;

            const stats = {}; // Card stats
            const charStats = {}; // Character stats
            const relicStats = {}; // Relic stats
            const eventStats = {}; // Event stats
            const ascensionStats = {}; // Ascension stats

            const updateStat = (obj, id, win, video) => {
                if (!obj[id]) obj[id] = { seen: 0, wins: 0, videos: [] };
                obj[id].seen++;
                if (win) obj[id].wins++;
                if (video.yt || video.ltg) obj[id].videos.push(video);
            };

            rows.forEach(row => {
                const video = { yt: row.yt_video, ltg: row.ltg_url };
                const charId = (row.character || '').toUpperCase(); // Matches clean IDs like "SILENT"
                updateStat(charStats, charId, row.win, video);

                const relics = JSON.parse(row.relic_list || '[]');
                relics.forEach(relicId => updateStat(relicStats, relicId, row.win, video));

                const pathHistory = JSON.parse(row.path_history || '[]');
                const uniqueEventsInRun = new Set();
                pathHistory.forEach(p => {
                    if (p.event_id) {
                        // Strip prefix to match events table IDs (e.g., 'EVENT.NEOW' -> 'NEOW')
                        uniqueEventsInRun.add(p.event_id.replace('EVENT.', ''));
                    }
                });
                uniqueEventsInRun.forEach(eventId => updateStat(eventStats, eventId, row.win, video));

                const deck = JSON.parse(row.deck_list || '[]');
                const uniqueCardsInDeck = new Set(deck.map(c => c.id || ''));
                uniqueCardsInDeck.forEach(cardId => updateStat(stats, cardId, row.win, video));

                const ascLevel = String(row.ascension || 0);
                updateStat(ascensionStats, ascLevel, row.win, video);
            });
            
            const uniqueCardsSeen = Object.keys(stats).length;
            console.log(`📊 Processed stats for ${uniqueCardsSeen} cards, ${Object.keys(relicStats).length} relics, ${Object.keys(eventStats).length} events, and ${Object.keys(ascensionStats).length} ascensions across ${totalRuns} runs.`);

            console.log(` Character keys found in runs: [${Object.keys(charStats).join(', ')}]`);

            return { 
                stats, 
                charStats,
                relicStats,
                eventStats,
                ascensionStats,
                globalWinRate, 
                totalRuns, 
                totalWins, 
                totalLosses: totalRuns - totalWins, 
                uniqueUsers, 
                uniqueCardsSeen,
                uniqueRelicsSeen: Object.keys(relicStats).length,
                uniqueEventsSeen: Object.keys(eventStats).length,
                uniqueCharsSeen: Object.keys(charStats).length,
                uniqueAscensionsSeen: Object.keys(ascensionStats).length
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

        const detailHtml = wrapLayout(
            title, 
            `
            <div class="item-box">
                <h1>${title}</h1>
                ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
                <div class="description">${description}</div>
            </div>`,
            [{ name: cat.folder, url: `/${cat.folder}/` }, { name: title, url: '' }],
            `${title} ${cat.folder.slice(0, -1)} details and descriptions for Slay the Spire 2.`,
            generateItemJsonLd(title, cat.folder.slice(0, -1), null)
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
        <h1>${catName}</h1>
        <div class="grid">${itemLinks}</div>`, 
        [{ name: cat.folder, url: '' }],
        indexDesc,
        generateCollectionJsonLd(`${catName} Database`, indexDesc)
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
        const rawStats = runStats.relicStats[cleanRelicId] || { seen: 0, wins: 0, videos: [] };
        const stats = getItemStats(rawStats, runStats.globalWinRate);

        const videosHtml = generateVideoPanel(rawStats.videos, "Featured Videos");
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

        return `
        <a href="/relics/${slug}/" class="card-item ${poolClass}" aria-label="${relic.name}: ${stats.seen} runs, ${stats.text}">
            <div class="card-info"><span class="card-name">${relic.name}</span></div>
            <div class="card-stats">
                <div class="win-rate" style="color: ${stats.color}">${stats.text}</div>
                <div class="run-count">${stats.seen} runs</div>
            </div>
            <div class="win-bar" style="${stats.bar}"></div>
        </a>`;
    }).join('');

    const indexDesc = `View global winrates, run statistics, and win/loss records for all Slay the Spire 2 relics.`;
    const indexHtml = wrapLayout(
        'Relics Database', 
        `
        <h1>Slay the Spire 2 Relics</h1>
        ${generateSummaryPanel(runStats, "Relics", totalRelics, relicsSeen)}
        <div class="grid">${relicLinks}</div>`,
        [{ name: 'relics', url: '' }],
        indexDesc,
        generateCollectionJsonLd(`Relics Database`, indexDesc)
    );
    fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
}

async function buildEvents(events, runStats, sitemap) {
    console.log(`🌀 Building ${events.length} event pages...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, 'events'));

    for (const event of events) {
        const slug = slugify(event.name);
        const dir = ensureDir(path.join(root, slug));
        
        const rawStats = runStats.eventStats[event.event_id] || { seen: 0, wins: 0, videos: [] };
        const stats = getItemStats(rawStats, runStats.globalWinRate);

        const videosHtml = generateVideoPanel(rawStats.videos);
        const detailHtml = eventDetailTemplate(event, stats, videosHtml);
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

        return `
        <a href="/events/${slug}/" class="card-item" aria-label="${e.name}: ${stats.seen} runs, ${stats.text}">
            <div class="card-info"><span class="card-name">${e.name}</span></div>
            <div class="card-stats">
                <div class="win-rate" style="color: ${stats.color}">${stats.text}</div>
                <div class="run-count">${stats.seen} runs</div>
            </div>
            <div class="win-bar" style="${stats.bar}"></div>
        </a>`;
    }).join('');

    const indexDesc = `View global winrates, run statistics, and encounter records for all Slay the Spire 2 events.`;
    const indexHtml = wrapLayout(
        'Events Database', 
        `
        <h1>Slay the Spire 2 Events</h1>
        ${generateSummaryPanel(runStats, "Events", totalEvents, eventsSeen)}
        <div class="grid">${eventLinks}</div>`,
        [{ name: 'events', url: '' }],
        indexDesc,
        generateCollectionJsonLd(`Events Database`, indexDesc)
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
        
        const rawStats = runStats.ascensionStats[String(asc.level)] || { seen: 0, wins: 0, videos: [] };
        const stats = getItemStats(rawStats, runStats.globalWinRate);
        const videosHtml = generateVideoPanel(rawStats.videos);

        const detailHtml = wrapLayout(
            title, 
            `
            <div class="stats-summary">
                ${generateSemanticStatsParagraph(title, stats, 'ascension')}
            </div>
            <div class="item-box">
                <h1>${title}</h1>
                <div class="subtitle">Ascension: Level ${asc.level}</div>
                <div class="description">${formatDescription(asc.description)}</div>
            </div>
            ${videosHtml}`,
            [{ name: 'ascensions', url: '/ascensions/' }, { name: title, url: '' }],
            `${title} winrates and run statistics for Slay the Spire 2.`,
            generateItemJsonLd(title, "Ascension", stats)
        );
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

        return `
        <a href="/ascensions/${slug}/" class="card-item" aria-label="${displayName}: ${stats.seen} runs, ${stats.text}">
            <div class="card-info"><span class="card-name">${displayName}</span></div>
            <div class="card-stats">
                <div class="win-rate" style="color: ${stats.color}">${stats.text}</div>
                <div class="run-count">${stats.seen} runs</div>
            </div>
            <div class="win-bar" style="${stats.bar}"></div>
        </a>`;
    }).join('');

    const indexDesc = `Global winrates and statistics per Ascension level in Slay the Spire 2.`;
    const indexHtml = wrapLayout('Ascensions Database', `<h1>Slay the Spire 2 Ascensions</h1>${generateSummaryPanel(runStats, "Ascensions", totalAsc, ascSeen)}<div class="grid">${ascLinks}</div>`, [{ name: 'ascensions', url: '' }], indexDesc, generateCollectionJsonLd(`Ascensions Database`, indexDesc));
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

        const rawStats = runStats.charStats[charKey] || { seen: 0, wins: 0, videos: [] };
        const stats = getItemStats(rawStats, runStats.globalWinRate);
                
        if (rawStats.seen > 0) console.log(`   ✅ Found ${rawStats.seen} runs for ${charKey}`);
        else console.log(`   ⚠️ No runs found for ID "${charKey}"`);

                const videosHtml = generateVideoPanel(rawStats.videos);

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
                const relicItemsHtml = charRelics.map(r => `<a href="/relics/${slugify(r.name)}/" class="item-link">${r.name}</a>`).join('');

                const detailHtml = characterDetailTemplate(char, stats, videosHtml, cardItemsHtml, relicItemsHtml, displayName);
                fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
                sitemap.add(`/characters/${slug}/`);
    }

    // Index Page
    sitemap.add('/characters/');
    const charLinks = chars.map(c => {
                const displayName = c.name.replace(/^The\s+/i, '');
                const charKey = (c.character_id || '').replace('CHARACTER.', '').toUpperCase();
                const stats = getItemStats(runStats.charStats[charKey], runStats.globalWinRate);

                return `
                <a href="/characters/${slugify(displayName)}/" class="card-item ${displayName.toLowerCase()}" aria-label="${displayName}: ${stats.wins} wins, ${stats.losses} losses">
                    <div class="card-info"><span class="card-name">${displayName}</span></div>
                    <div class="card-stats">
                        <div class="win-rate" style="color: ${stats.color}">${stats.text}</div>
                        <div class="run-count">${stats.wins}W / ${stats.seen - stats.wins}L</div>
                    </div>
                    <div class="win-bar" style="${stats.bar}"></div>
                </a>`;
            }).join('');

            const indexDesc = `View global winrates, run statistics, and win/loss records for all Slay the Spire 2 characters.`;
            const indexHtml = wrapLayout(
                'Characters Database', 
                `
                <h1>Slay the Spire 2 Characters</h1>
                ${generateSummaryPanel(runStats, "Characters", chars.length, runStats.uniqueCharsSeen)}
                <div class="grid">${charLinks}</div>`,
                [{ name: 'characters', url: '' }],
                indexDesc,
                generateCollectionJsonLd(`Characters Database`, indexDesc)
            );
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
        const ascensions = await query("SELECT * FROM ascensions ORDER BY level ASC");

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
            const rawStats = cardStats.stats[cleanCardId] || { videos: [] };

            const videosHtml = generateVideoPanel(rawStats.videos, "Featured Videos");

            const detailHtml = cardDetailTemplate(card, stats, videosHtml, costDisplay);

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

            return `
            <a href="/cards/${slug}/" class="card-item ${card.color}" aria-label="${card.name}: ${stats.seen} runs, ${stats.text}">
                <div class="card-info"><span class="card-name">${card.name}</span></div>
                <div class="card-stats">
                    <div class="win-rate" style="color: ${stats.color}">${stats.text}</div>
                    <div class="run-count">${stats.seen} runs</div>
                </div>
                <div class="win-bar" style="${stats.bar}"></div>
            </a>`;
        }).join('');

        const indexDesc = `View global winrates, run statistics, and pick-rate records for all Slay the Spire 2 cards.`;
        const indexHtml = wrapLayout(
            'Cards Database', 
            `
            <h1>Slay the Spire 2 Cards</h1>
            ${generateSummaryPanel(cardStats, "Cards", totalCards, cardStats.uniqueCardsSeen)}
            <div class="grid">${cardLinks}</div>`,
            [{ name: 'cards', url: '' }],
            indexDesc,
            generateCollectionJsonLd(`Cards Database`, indexDesc)
        );

        fs.writeFileSync(path.join(cardsRoot, 'index.html'), indexHtml);

        // --- ROOT LANDING PAGE ---
        console.log('🏠 Generating root landing page...');
        sitemap.add('/');
        const lastUpdated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        const getSubText = (seen, total) => seen === total ? total : `${seen} / ${total}`;

        const cardSub = getSubText(cardStats.uniqueCardsSeen, totalCards);
        const charSub = getSubText(cardStats.uniqueCharsSeen, chars.length);
        const relicSub = getSubText(cardStats.uniqueRelicsSeen, relics.length);
        const eventSub = getSubText(cardStats.uniqueEventsSeen, events.length);
        const ascSub = getSubText(cardStats.uniqueAscensionsSeen, ascensions.length);

        // Generate the Cards link with stats first
        let landingLinks = `<a href="/cards/" class="item-link-large"><div>Cards</div><div class="stat-sub">${cardSub}</div></a>`;
        landingLinks += `<a href="/characters/" class="item-link-large"><div>Characters</div><div class="stat-sub">${charSub}</div></a>`;
        landingLinks += `<a href="/relics/" class="item-link-large"><div>Relics</div><div class="stat-sub">${relicSub}</div></a>`;
        landingLinks += `<a href="/events/" class="item-link-large"><div>Events</div><div class="stat-sub">${eventSub}</div></a>`;
        landingLinks += `<a href="/ascensions/" class="item-link-large"><div>Ascensions</div><div class="stat-sub">${ascSub}</div></a>`;

        // Append the rest of the categories
        landingLinks += CATEGORIES.map(cat => {
            const display = cat.folder.charAt(0).toUpperCase() + cat.folder.slice(1);
            return `<a href="/${cat.folder}/" class="item-link-large">${display}</a>`;
        }).join('');

        const landingDesc = "Comprehensive gameplay statistics and database for Slay the Spire 2. Tracked winrates, card details, relic data, and more.";
        const landingHtml = wrapLayout(
            "Home",
            `
    <h1>Slay the Spire 2 Stats</h1>
    <p style="font-size: 0.8rem; color: #666; margin-top: -15px; margin-bottom: 20px; text-transform: uppercase;">
        Data last updated: <time datetime="${ISO_BUILD_DATE}">${FORMATTED_BUILD_DATE}</time>
    </p>
    <div class="stats-summary">
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-label">Total Runs</div>
                <div class="stat-value">${cardStats.totalRuns}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Wins / Losses</div>
                <div class="stat-value"><span style="color: #00ff89">${cardStats.totalWins}</span> <span style="color: #444">/</span> <span style="color: #ff4b4b">${cardStats.totalLosses}</span></div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Global Winrate</div>
                <div class="stat-value" style="color: #ffd700">${cardStats.globalWinRate.toFixed(1)}%</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Contributors</div>
                <div class="stat-value">${cardStats.uniqueUsers}</div>
            </div>
        </div>
    </div>
    <div class="grid">${landingLinks}</div>`,
            [],
            landingDesc,
            generateCollectionJsonLd("Slay the Spire 2 Stats Hub", landingDesc)
        );

        fs.writeFileSync(path.join(PATHS.WEB_ROOT, 'index.html'), landingHtml);

        // --- CHARACTERS ---
        await buildCharacters(chars, cardStats, sitemap);

        // --- RELICS ---
        await buildRelics(relics, cardStats, sitemap);

        // --- EVENTS ---
        await buildEvents(events, cardStats, sitemap);

        // --- ASCENSIONS ---
        await buildAscensions(ascensions, cardStats, sitemap);

        // --- GENERAL CATEGORY BUILDS ---
        for (const cat of CATEGORIES) {
            await buildGeneralCategory(cat, sitemap);
        }

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
