import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir, slugify } from './paths.js';

/**
 * Slay the Spire 2 - Static Site Generator
 * Reads from local SQLite and builds the card database
 */

// --- BUILD DATE CONSTANTS ---
const BUILD_DATE = new Date();
const FORMATTED_BUILD_DATE = BUILD_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const ISO_BUILD_DATE = BUILD_DATE.toISOString();

/**
 * Helper to generate JSON-LD for individual item pages
 */
function generateItemJsonLd(name, category, stats) {
    const wr = stats?.formatted || "0.0";
    const seen = stats?.seen || 0;
    return `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemPage",
  "name": "${name} - Spire 2 Stats",
  "description": "${name} gameplay statistics for Slay the Spire 2. Winrate: ${wr}%. Total Runs: ${seen}.",
  "dateModified": "${ISO_BUILD_DATE}",
  "mainEntity": {
    "@type": "Thing",
    "name": "${name}",
    "alternateName": "Slay the Spire 2 ${category}"
  }
}
</script>`;
}

/**
 * Helper to generate JSON-LD for collection pages
 */
function generateCollectionJsonLd(name, description) {
    return `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "${name} - Spire 2 Stats",
  "description": "${description}",
  "dateModified": "${ISO_BUILD_DATE}"
}
</script>`;
}

const db = new sqlite3.Database(PATHS.DATABASE);

const CATEGORIES = [
    { table: 'potions', folder: 'potions', titleField: 'name' },
    { table: 'monsters', folder: 'monsters', titleField: 'name' },
    { table: 'encounters', folder: 'encounters', titleField: 'name' },
    { table: 'acts', folder: 'acts', titleField: 'name' },
    { table: 'achievements', folder: 'achievements', titleField: 'name' },
    { table: 'ascensions', folder: 'ascensions', titleField: 'name' },
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

/** Generates the consistent top summary panel for index pages */
function generateSummaryPanel(runStats, label, total, seen) {
    const completionHtml = seen === total ? total : `${seen} <span class="stat-sub">/ ${total} ${label.toLowerCase()}</span>`;
    return `
    <div class="stats-summary">
        <div class="stats-grid">
            <div class="stat-item"><div class="stat-label">Total Runs</div><div class="stat-value">${runStats.totalRuns}</div></div>
            <div class="stat-item"><div class="stat-label">Wins / Losses</div><div class="stat-value"><span style="color: #00ff89">${runStats.totalWins}</span> <span style="color: #444">/</span> <span style="color: #ff4b4b">${runStats.totalLosses}</span></div></div>
            <div class="stat-item"><div class="stat-label">Overall Winrate</div><div class="stat-value">${runStats.globalWinRate.toFixed(1)}%</div></div>
            <div class="stat-item"><div class="stat-label">Contributors</div><div class="stat-value">${runStats.uniqueUsers}</div></div>
            <div class="stat-item">
                <div class="stat-label">${label} Seen</div>
                <div class="stat-value">${completionHtml}</div>
            </div>
        </div>
    </div>`;
}

/** Generates associated video grid panels */
function generateVideoPanel(videos, title = "Associated Runs") {
    if (!videos || videos.length === 0) return '';
    const videoLinks = videos.map(v => {
        let buttons = '';
        if (v.ltg) buttons += `<a href="https://letstrygg.com${v.ltg}" class="vid-btn ltg-btn" target="_blank">Run Summary</a>`;
        if (v.yt) buttons += `<a href="https://www.youtube.com/watch?v=${v.yt}" class="vid-btn yt-btn" target="_blank"><span class="material-symbols-outlined">smart_display</span> YouTube</a>`;
        return `<div class="video-panel">${buttons}</div>`;
    }).join('');
    return `<div class="featured-videos"><h3>${title}</h3><div class="video-grid">${videoLinks}</div></div>`;
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
    return {
        seen, wins, num,
        formatted: num.toFixed(1),
        color: getWinRateColor(seen, num, globalWinRate),
        bar: getWinBarStyle(seen, num),
        text: seen > 0 ? `${num.toFixed(0)}% Winrate` : ''
    };
}

/** Helper to wrap content in the standard site layout */
function wrapLayout(title, content, breadcrumbs = [], description = "", headExtra = "") {
    const bcHtml = breadcrumbs.length > 0 
        ? `<nav class="breadcrumbs"><a href="/">spire2stats</a> / ${breadcrumbs.map((b, i) => i === breadcrumbs.length - 1 ? b.name.toLowerCase() : `<a href="${b.url}">${b.name.toLowerCase()}</a>`).join(' / ')}</nav>`
        : '';
    const metaDesc = description ? `<meta name="description" content="${description}">` : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title} - Spire 2 Stats</title>
    ${metaDesc}
    <link rel="stylesheet" href="/css/main.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    ${headExtra}
</head>
<body>${bcHtml}${content}</body></html>`;
}

// --- TEXT FORMATTER ---
function formatDescription(text) {
    if (!text) return "";
    return text
        .replace(/\[gold\](.*?)\[\/gold\]/g, '<span class="text-gold">$1</span>')
        .replace(/\[blue\](.*?)\[\/blue\]/g, '<span class="text-blue">$1</span>')
        .replace(/\[green\](.*?)\[\/green\]/g, '<span class="text-green">$1</span>')
        .replace(/\[red\](.*?)\[\/red\]/g, '<span class="text-red">$1</span>')
        .replace(/\[purple\](.*?)\[\/purple\]/g, '<span class="text-purple">$1</span>')
        .replace(/\[pink\](.*?)\[\/pink\]/g, '<span class="text-purple">$1</span>')
        .replace(/\[sine\](.*?)\[\/sine\]/g, '<em>$1</em>')
        .replace(/\[jitter\](.*?)\[\/jitter\]/g, '<strong>$1</strong>')
        .replace(/\[energy:(\d+)\]/ig, '<span class="icon-energy">[E]</span>')
        .replace(/\n/g, '<br>');
}

function getCostDisplay(card) {
    let cost = card.is_x_cost ? 'X' : (card.cost ?? '');
    let star = card.is_x_star_cost ? 'X★' : (card.star_cost ? `${card.star_cost}★` : '');
    return [cost, star].filter(Boolean).join(' ');
}

async function getCardStats() {
    const rows = await query("SELECT character, relic_list, deck_list, path_history, win, username, yt_video, ltg_url FROM runs");
    console.log(`📡 Database returned ${rows.length} run rows.`);

    const totalRuns = rows.length;
    if (totalRuns === 0) return { stats: {}, charStats: {}, relicStats: {}, eventStats: {}, globalWinRate: 0, totalRuns: 0, totalWins: 0, totalLosses: 0, uniqueUsers: 0, uniqueCardsSeen: 0, uniqueRelicsSeen: 0, uniqueEventsSeen: 0, uniqueCharsSeen: 0 };

            const totalWins = rows.filter(r => r.win).length;
            const globalWinRate = totalRuns > 0 ? (totalWins / totalRuns) * 100 : 0;
            const uniqueUsers = new Set(rows.map(r => r.username)).size;

            const stats = {}; // Card stats
            const charStats = {}; // Character stats
            const relicStats = {}; // Relic stats
            const eventStats = {}; // Event stats

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
            });
            
            const uniqueCardsSeen = Object.keys(stats).length;
            console.log(`📊 Processed stats for ${uniqueCardsSeen} cards, ${Object.keys(relicStats).length} relics, and ${Object.keys(eventStats).length} events across ${totalRuns} runs.`);

            console.log(` Character keys found in runs: [${Object.keys(charStats).join(', ')}]`);

            return { 
                stats, 
                charStats,
                relicStats,
                eventStats,
                globalWinRate, 
                totalRuns, 
                totalWins, 
                totalLosses: totalRuns - totalWins, 
                uniqueUsers, 
                uniqueCardsSeen,
                uniqueRelicsSeen: Object.keys(relicStats).length,
                uniqueEventsSeen: Object.keys(eventStats).length,
                uniqueCharsSeen: Object.keys(charStats).length
            };
}

async function buildGeneralCategory(cat) {
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
    }

    // Index Page
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

async function buildRelics(relics, runStats) {
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

        const detailHtml = wrapLayout(
            relic.name,
            `
            <div class="stats-summary">
                <h2>Run Data</h2>
                ${stats.seen > 0 ? `<p>This relic was found in <span class="stat-val">${stats.seen}</span> runs with a <span class="stat-val" style="color: ${stats.color}">${stats.formatted}%</span> winrate.</p>` : `<p>No runs recorded for this relic yet.</p>`}
            </div>
            <div class="relic-box">
                <h1>${relic.name}</h1>
                <div class="subtitle">${subtitle}</div>
                <div class="description">${descriptionHtml}</div>
                ${relic.flavor ? `<div class="flavor">${relic.flavor}</div>` : ''}
            </div>
            ${videosHtml}`,
            [{ name: 'relics', url: '/relics/' }, { name: relic.name.toLowerCase(), url: '' }],
            `${relic.name} relic winrates and run statistics for Slay the Spire 2, based on tracked gameplay.`,
            generateItemJsonLd(relic.name, "Relic", stats)
        );
        fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
    }

    // Index Page
    const totalRelics = relics.length;
    const relicsSeen = runStats.uniqueRelicsSeen;
    const relicLinks = relics.map(relic => {
        const slug = slugify(relic.name);
        const cleanRelicId = (relic.relic_id || '').replace('RELIC.', '');
        const stats = getItemStats(runStats.relicStats[cleanRelicId], runStats.globalWinRate);
        const poolClass = (relic.pool || 'shared').toLowerCase();

        return `
        <a href="/relics/${slug}/" class="card-item ${poolClass}">
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

async function buildEvents(events, runStats) {
    console.log(`🌀 Building ${events.length} event pages...`);
    const root = ensureDir(path.join(PATHS.WEB_ROOT, 'events'));

    for (const event of events) {
        const slug = slugify(event.name);
        const dir = ensureDir(path.join(root, slug));
        
        const stats = getItemStats(runStats.eventStats[event.event_id], runStats.globalWinRate);

        const videosHtml = generateVideoPanel(stats.videos);

        const options = JSON.parse(event.options || '[]');
        let optionsHtml = '';
        if (options.length > 0) {
            optionsHtml = `
            <div class="options-section">
                <h3>Choices & Outcomes</h3>
                <div class="options-grid">
                    ${options.map(opt => `
                        <div class="option-card">
                            <div class="option-title">${opt.title || opt.id}</div>
                            <div class="option-desc">${formatDescription(opt.description)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        const detailHtml = wrapLayout(
            event.name, 
            `
            <div class="stats-summary">
                <h2>Run Data</h2>
                ${stats.seen > 0 ? `<p>This event was encountered in <span class="stat-val">${stats.seen}</span> runs with a <span class="stat-val" style="color: ${stats.color}">${stats.formatted}%</span> winrate for those runs.</p>` : `<p>No runs recorded for this event yet.</p>`}
            </div>
            <div class="event-box">
                <h1>${event.name}</h1>
                <div class="subtitle">${event.act || 'Unknown Act'} • ${event.type || 'Event'}</div>
                <div class="description">${formatDescription(event.description)}</div>
            </div>
            ${optionsHtml}
            ${videosHtml}`,
            [{ name: 'events', url: '/events/' }, { name: event.name, url: '' }],
            `${event.name} event winrates and run statistics for Slay the Spire 2.`,
            generateItemJsonLd(event.name, "Event", stats)
        );
        fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
    }

    // Index Page
    const totalEvents = events.length;
    const eventsSeen = runStats.uniqueEventsSeen;
    const eventLinks = events.map(e => {
        const slug = slugify(e.name);
        const stats = getItemStats(runStats.eventStats[e.event_id], runStats.globalWinRate);

        return `
        <a href="/events/${slug}/" class="card-item">
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

async function buildCharacters(chars, runStats) {
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

                const losses = rawStats.seen - rawStats.wins;
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

                const detailHtml = wrapLayout(
                    char.name, 
                    `
                    <h1>${displayName}</h1>
                    <div class="stats-summary">
                        <p>This character has been played in <span class="stat-val">${rawStats.seen}</span> runs with a <span class="stat-val" style="color: ${stats.color}">${stats.formatted}%</span> winrate (<span style="color: #00ff89">${rawStats.wins} Wins</span> / <span style="color: #ff4b4b">${losses} Losses</span>).</p>
                    </div>
                    <div style="background: #1a1a1a; padding: 25px; border-radius: 12px; border: 1px solid #333; line-height: 1.6; max-width: 800px;">${formatDescription(char.description)}</div>
                    ${videosHtml}
                    <h2 class="section-title">${displayName} Cards</h2>
                    <div class="grid">${cardItemsHtml}</div>
                    <h2 class="section-title">${displayName} Relics</h2>
                    <div class="grid">${relicItemsHtml}</div>`,
                    [{ name: 'characters', url: '/characters/' }, { name: displayName, url: '' }],
                    `${displayName} winrates and run statistics for Slay the Spire 2.`,
                    generateItemJsonLd(displayName, "Character", stats)
                );
                fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
    }

    // Index Page
    const charLinks = chars.map(c => {
                const displayName = c.name.replace(/^The\s+/i, '');
                const charKey = (c.character_id || '').replace('CHARACTER.', '').toUpperCase();
                const stats = getItemStats(runStats.charStats[charKey], runStats.globalWinRate);

                return `
                <a href="/characters/${slugify(displayName)}/" class="card-item ${displayName.toLowerCase()}">
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

        if (cards.length > 0) {
            console.log(`🗃️  Sample card_id from cards table: "${cards[0].card_id}" (Card Name: ${cards[0].name})`);
        }

        const chars = await query("SELECT * FROM characters ORDER BY name ASC");
        const relics = await query("SELECT * FROM relics ORDER BY name ASC");
        const events = await query("SELECT * FROM events ORDER BY name ASC");

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

            const detailHtml = wrapLayout(
                card.name, 
                `
                <div class="stats-summary">
                    <h2>Run Data</h2>
                    ${stats.seen > 0 ? `<p>This card was found in <span class="stat-val">${stats.seen}</span> run final decks with a <span class="stat-val" style="color: ${stats.color}">${stats.formatted}%</span> winrate.</p>` : `<p>No runs recorded for this card yet.</p>`}
                </div>
                <div class="card-display">
                    <div class="card">
                        <div class="cost-circle">${costDisplay}</div>
                        <div class="card-title">${card.name}</div>
                        <div class="type-banner">${card.color || ''} ${card.type}</div>
                        <div class="description">${description}</div>
                        <div class="card-footer">${card.rarity}</div>
                    </div>
                    <div class="card-arrow">→</div>
                    <div class="card">
                        <div class="cost-circle">${costDisplay}</div>
                        <div class="card-title text-green">${card.name}+</div>
                        <div class="type-banner">${card.color || ''} ${card.type}</div>
                        <div class="description">${description}</div>
                        <div class="card-footer">${card.rarity}</div>
                    </div>
                </div>
                ${videosHtml}`,
                [{ name: 'cards', url: '/cards/' }, { name: card.name, url: '' }],
                `${card.name} card winrates and run statistics for Slay the Spire 2.`,
                generateItemJsonLd(card.name, "Card", stats)
            );

            fs.writeFileSync(path.join(cardDir, 'index.html'), detailHtml);
        }

        // --- INDEX PAGE ---
        console.log('📂 Generating index page...');
        
        const cardLinks = cards.map(card => {
            const slug = slugify(card.name);
            const cleanCardId = (card.card_id || '').replace('CARD.', '');
            const stats = getItemStats(cardStats.stats[cleanCardId], cardStats.globalWinRate);

            return `
            <a href="/cards/${slug}/" class="card-item ${card.color}">
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
        const lastUpdated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        const getSubText = (seen, total) => seen === total ? total : `${seen} / ${total}`;

        const cardSub = getSubText(cardStats.uniqueCardsSeen, totalCards);
        const charSub = getSubText(cardStats.uniqueCharsSeen, chars.length);
        const relicSub = getSubText(cardStats.uniqueRelicsSeen, relics.length);
        const eventSub = getSubText(cardStats.uniqueEventsSeen, events.length);

        // Generate the Cards link with stats first
        let landingLinks = `<a href="/cards/" class="item-link-large"><div>Cards</div><div class="stat-sub">${cardSub}</div></a>`;
        landingLinks += `<a href="/characters/" class="item-link-large"><div>Characters</div><div class="stat-sub">${charSub}</div></a>`;
        landingLinks += `<a href="/relics/" class="item-link-large"><div>Relics</div><div class="stat-sub">${relicSub}</div></a>`;
        landingLinks += `<a href="/events/" class="item-link-large"><div>Events</div><div class="stat-sub">${eventSub}</div></a>`;

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
        await buildCharacters(chars, cardStats);

        // --- RELICS ---
        await buildRelics(relics, cardStats);

        // --- EVENTS ---
        await buildEvents(events, cardStats);

        // --- GENERAL CATEGORY BUILDS ---
        for (const cat of CATEGORIES) {
            await buildGeneralCategory(cat);
        }

        console.log('✨ Build complete!');
        db.close();

    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

build();
