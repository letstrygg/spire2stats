import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir, slugify } from './paths.js';

/**
 * Slay the Spire 2 - Static Site Generator
 * Reads from local SQLite and builds the card database
 */

const db = new sqlite3.Database(PATHS.DATABASE);

const CATEGORIES = [
    { table: 'relics', folder: 'relics', titleField: 'name' },
    { table: 'potions', folder: 'potions', titleField: 'name' },
    { table: 'characters', folder: 'characters', titleField: 'name' },
    { table: 'monsters', folder: 'monsters', titleField: 'name' },
    { table: 'events', folder: 'events', titleField: 'name' },
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
        .replace(/\[energy:(\d+)\]/ig, '<span class="icon-energy">($1)</span>')
        .replace(/\n/g, '<br>');
}

function getCostDisplay(card) {
    let cost = card.is_x_cost ? 'X' : (card.cost ?? '');
    let star = card.is_x_star_cost ? 'X★' : (card.star_cost ? `${card.star_cost}★` : '');
    return [cost, star].filter(Boolean).join(' ');
}

async function getCardStats() {
    return new Promise((resolve, reject) => {
        db.all("SELECT deck_list, win FROM runs", (err, rows) => {
            if (err) return reject(err);
            
            console.log(`📡 Database returned ${rows.length} run rows.`);

            const totalRuns = rows.length;
            const totalWins = rows.filter(r => r.win).length;
            const globalWinRate = totalRuns > 0 ? (totalWins / totalRuns) * 100 : 0;

            const stats = {};
            rows.forEach(row => {
                const deck = JSON.parse(row.deck_list || '[]');
                // Strip 'CARD.' prefix to match the card_id in the database
                const uniqueCardsInDeck = new Set(deck.map(c => (c.id || '').replace(/^CARD\./, '')));
                uniqueCardsInDeck.forEach(cardId => {
                    if (!stats[cardId]) stats[cardId] = { seen: 0, wins: 0 };
                    stats[cardId].seen++;
                    if (row.win) stats[cardId].wins++;
                });
            });
            console.log(`📊 Processed stats for ${Object.keys(stats).length} unique cards across ${rows.length} runs. Global Average: ${globalWinRate.toFixed(1)}%`);
            resolve({ stats, globalWinRate });
        });
    });
}

async function buildGeneralCategory(cat) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${cat.table} ORDER BY ${cat.titleField} ASC`, (err, items) => {
            if (err) return reject(err);
            
            console.log(`📂 Building ${items.length} pages for ${cat.folder}...`);
            const root = ensureDir(path.join(PATHS.WEB_ROOT, cat.folder));
            
            for (const item of items) {
                const title = item[cat.titleField];
                if (!title) continue;
                const slug = slugify(title);
                const dir = ensureDir(path.join(root, slug));
                
                const subtitle = [item.rarity, item.type, item.act].filter(Boolean).join(' • ');
                const description = formatDescription(item.description || item.flavor || item.unlock_text || "");

                const detailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title} - Spire 2 Stats</title>
    <link rel="stylesheet" href="/css/main.css">
    <style>
        body { background: #121212; color: #e0e0e0; font-family: sans-serif; padding: 40px; }
        .breadcrumbs { margin-bottom: 20px; font-size: 0.9rem; color: #888; }
        .breadcrumbs a { color: #4a90e2; text-decoration: none; }
        .breadcrumbs a:hover { text-decoration: underline; }
        .item-box { background: #1a1a1a; border: 1px solid #333; padding: 30px; border-radius: 12px; max-width: 700px; }
        .subtitle { color: #888; text-transform: uppercase; font-size: 0.85rem; margin-bottom: 15px; }
        .description { line-height: 1.6; font-size: 1.15rem; border-top: 1px solid #333; padding-top: 15px; }
        .text-gold { color: #ffd700; } .text-red { color: #ff4b4b; } .text-green { color: #00ff89; }
    </style>
</head>
<body>
    <nav class="breadcrumbs"><a href="/">spire2stats</a> / <a href="/${cat.folder}/">${cat.folder}</a> / ${title.toLowerCase()}</nav>
    <div class="item-box">
        <h1>${title}</h1>
        ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
        <div class="description">${description}</div>
    </div>
</body>
</html>`;
                fs.writeFileSync(path.join(dir, 'index.html'), detailHtml);
            }

            // Index Page
            const itemLinks = items.map(i => {
                const title = i[cat.titleField];
                if (!title) return '';
                return `<a href="/${cat.folder}/${slugify(title)}/" class="item-link">${title}</a>`;
            }).join('');

            const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${cat.folder.toUpperCase()} - Spire 2 Stats</title>
    <link rel="stylesheet" href="/css/main.css">
    <style>
        body { background: #121212; color: #e0e0e0; font-family: sans-serif; padding: 40px; }
        .breadcrumbs { margin-bottom: 20px; font-size: 0.9rem; color: #888; }
        .breadcrumbs a { color: #4a90e2; text-decoration: none; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
        .item-link { background: #1a1a1a; border: 1px solid #333; padding: 15px; border-radius: 8px; text-decoration: none; color: inherit; text-align: center; font-weight: bold; transition: border-color 0.2s; }
        .item-link:hover { border-color: #4a90e2; }
    </style>
</head>
<body>
    <nav class="breadcrumbs"><a href="/">spire2stats</a> / ${cat.folder}</nav>
    <h1>${cat.folder.charAt(0).toUpperCase() + cat.folder.slice(1)}</h1>
    <div class="grid">${itemLinks}</div>
</body>
</html>`;
            fs.writeFileSync(path.join(root, 'index.html'), indexHtml);
            resolve();
        });
    });
}

async function getAllCards() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM cards ORDER BY color, name ASC", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function build() {
    try {
        console.log('🛠️  Starting build process...');
        const cards = await getAllCards();
        if (cards.length > 0) {
            console.log(`🗃️  Sample card_id from cards table: "${cards[0].card_id}" (Card Name: ${cards[0].name})`);
        }

        const cardStats = await getCardStats();
        const cardsRoot = ensureDir(path.join(PATHS.WEB_ROOT, 'cards'));

        console.log(`🎴 Generating ${cards.length} card pages...`);

        for (const card of cards) {
            const slug = slugify(card.name);
            const cardDir = ensureDir(path.join(cardsRoot, slug));
            
            const costDisplay = getCostDisplay(card);
            const description = formatDescription(card.description);
            
            const stats = cardStats.stats[card.card_id] || { seen: 0, wins: 0 };
            const winRateNum = stats.seen > 0 ? (stats.wins / stats.seen) * 100 : 0;
            const winRate = winRateNum.toFixed(1);
            
            let wrColor = '#888'; 
            if (stats.seen > 0) {
                if (winRateNum > cardStats.globalWinRate) wrColor = '#00ff89';
                else if (winRateNum < cardStats.globalWinRate) wrColor = '#ff4b4b';
            }

            const detailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${card.name} - Spire 2 Stats</title>
    <link rel="stylesheet" href="/css/main.css">
    <style>
        body { background: #121212; color: #e0e0e0; font-family: sans-serif; padding: 40px; }
        .breadcrumbs { margin-bottom: 20px; font-size: 0.9rem; color: #888; }
        .breadcrumbs a { color: #4a90e2; text-decoration: none; }
        .breadcrumbs a:hover { text-decoration: underline; }
        .stats-summary { background: #1a1a1a; border: 1px solid #333; padding: 20px; border-radius: 8px; margin-bottom: 30px; max-width: 800px; }
        .stat-val { color: #ffd700; font-weight: bold; }
        
        .sts-card-display { display: flex; gap: 40px; align-items: center; flex-wrap: wrap; }
        .sts-card { position: relative; border: 2px solid #444; border-radius: 12px; padding: 25px; width: 320px; background: #1a1a1a; box-shadow: 0 10px 20px rgba(0,0,0,0.5); }
        .cost-circle { position: absolute; top: -15px; left: -15px; background: #ffd700; color: #000; width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.3rem; border: 3px solid #121212; }
        .card-title { font-size: 1.5rem; font-weight: bold; margin-bottom: 10px; text-align: center; }
        .type-banner { background: #2a2a2a; color: #888; text-transform: uppercase; font-size: 0.75rem; padding: 4px; text-align: center; margin: 10px -25px; border-top: 1px solid #333; border-bottom: 1px solid #333; }
        .description { line-height: 1.5; font-size: 1rem; min-height: 100px; display: flex; align-items: center; justify-content: center; text-align: center; }
        .card-footer { margin-top: 15px; text-align: right; color: #555; font-size: 0.8rem; font-style: italic; }
        .arrow { font-size: 3rem; color: #333; }

        .text-gold { color: #ffd700; } .text-red { color: #ff4b4b; } .text-green { color: #00ff89; }
    </style>
</head>
<body>
    <nav class="breadcrumbs"><a href="/">spire2stats</a> / <a href="/cards/">cards</a> / ${card.name.toLowerCase()}</nav>

    <div class="stats-summary">
        <h2>Run Data</h2>
        ${stats.seen > 0 ? 
            `<p>This card was found in <span class="stat-val">${stats.seen}</span> run final decks with a <span class="stat-val" style="color: ${wrColor}">${winRate}%</span> winrate.</p>` :
            `<p>No runs recorded for this card yet.</p>`
        }
    </div>

    <div class="sts-card-display">
        <div class="sts-card">
            <div class="cost-circle">${costDisplay}</div>
            <div class="card-title">${card.name}</div>
            <div class="type-banner">${card.color} ${card.type}</div>
            <div class="description">${description}</div>
            <div class="card-footer">${card.rarity}</div>
        </div>
        <div class="arrow">→</div>
        <div class="sts-card">
            <div class="cost-circle">${costDisplay}</div>
            <div class="card-title text-green">${card.name}+</div>
            <div class="type-banner">${card.color} ${card.type}</div>
            <div class="description">${description}</div>
            <div class="card-footer">${card.rarity}</div>
        </div>
    </div>
</body>
</html>`;

            fs.writeFileSync(path.join(cardDir, 'index.html'), detailHtml);
        }

        // --- INDEX PAGE ---
        console.log('📂 Generating index page...');
        
        const cardLinks = cards.map(card => {
            const slug = slugify(card.name);
            const stats = cardStats.stats[card.card_id] || { seen: 0, wins: 0 };
            const winRateNum = stats.seen > 0 ? (stats.wins / stats.seen) * 100 : 0;

            let wrText = '';
            let wrColor = '#888';
            let barStyle = 'background: #444;'; 

            if (stats.seen > 0) {
                wrText = `${winRateNum.toFixed(0)}% Winrate`;
                if (winRateNum > cardStats.globalWinRate) wrColor = '#00ff89';
                else if (winRateNum < cardStats.globalWinRate) wrColor = '#ff4b4b';
                barStyle = `background: linear-gradient(to right, #00ff89 ${winRateNum}%, #ff4b4b ${winRateNum}%);`;
            }

            return `
            <a href="/cards/${slug}/" class="card-item ${card.color}">
                <div class="card-info">
                    <span class="card-name">${card.name}</span>
                </div>
                <div class="card-stats">
                    <div class="win-rate" style="color: ${wrColor}">${wrText}</div>
                    <div class="run-count">${stats.seen} runs</div>
                </div>
                <div class="win-bar" style="${barStyle}"></div>
            </a>`;
        }).join('');

        const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Cards Database - Spire 2 Stats</title>
    <style>
        body { background: #121212; color: #e0e0e0; font-family: sans-serif; padding: 40px; }
        .breadcrumbs { margin-bottom: 20px; font-size: 0.9rem; color: #888; }
        .breadcrumbs a { color: #4a90e2; text-decoration: none; }
        .breadcrumbs a:hover { text-decoration: underline; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
        .card-item {
            position: relative;
            overflow: hidden;
            background: #1a1a1a; border: 1px solid #333; padding: 15px; text-decoration: none; color: inherit;
            display: flex; justify-content: space-between; border-radius: 8px; transition: border-color 0.2s;
        }
        .card-item:hover { border-color: #ffd700; }
        .card-info { display: flex; flex-direction: column; justify-content: center; }
        .card-name { font-weight: bold; }
        .card-stats { text-align: right; display: flex; flex-direction: column; justify-content: center; }
        .win-rate { color: #ffd700; font-weight: bold; font-size: 1.1rem; }
        .run-count { font-size: 0.7rem; color: #666; text-transform: uppercase; }
        .win-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 4px; }
        .ironclad { border-left: 4px solid #ff4b4b; }
        .silent { border-left: 4px solid #00ff89; }
        .defect { border-left: 4px solid #4a90e2; }
        .necrobinder { border-left: 4px solid #c18cff; }
        .regent { border-left: 4px solid #e67e22; }
    </style>
</head>
<body>
    <nav class="breadcrumbs"><a href="/">spire2stats</a> / cards</nav>
    <h1>Slay the Spire 2 Cards</h1>
    <div class="grid">
        ${cardLinks}
    </div>
</body>
</html>`;

        fs.writeFileSync(path.join(cardsRoot, 'index.html'), indexHtml);

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
