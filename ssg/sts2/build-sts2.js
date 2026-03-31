import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir, slugify } from './paths.js';

/**
 * Slay the Spire 2 - Static Site Generator
 * Reads from local SQLite and builds the card database
 */

const db = new sqlite3.Database(PATHS.DATABASE);

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
        const cardsRoot = ensureDir(path.join(PATHS.WEB_ROOT, 'cards'));

        console.log(`🎴 Generating ${cards.length} card pages...`);

        for (const card of cards) {
            const slug = slugify(card.name);
            const cardDir = ensureDir(path.join(cardsRoot, slug));
            
            const costDisplay = getCostDisplay(card);
            const description = formatDescription(card.description);

            const detailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${card.name} - Spire 2 Stats</title>
    <link rel="stylesheet" href="/css/main.css">
    <style>
        body { background: #121212; color: #e0e0e0; font-family: sans-serif; padding: 40px; }
        .card-preview { border: 2px solid #444; border-radius: 12px; padding: 20px; max-width: 400px; background: #1a1a1a; }
        .card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 10px; }
        .cost { color: #ffd700; font-weight: bold; font-size: 1.2em; }
        .type-rarity { color: #888; text-transform: uppercase; font-size: 0.8em; margin: 10px 0; }
        .description { line-height: 1.6; font-size: 1.1em; }
        .text-gold { color: #ffd700; } .text-red { color: #ff4b4b; } .text-green { color: #00ff89; }
        .back-link { display: block; margin-top: 30px; color: #4a90e2; text-decoration: none; }
    </style>
</head>
<body>
    <div class="card-preview">
        <div class="card-header">
            <h1>${card.name}</h1>
            <div class="cost">${costDisplay}</div>
        </div>
        <div class="type-rarity">${card.color} ${card.type} &bull; ${card.rarity}</div>
        <div class="description">${description}</div>
    </div>
    <a href="/cards/" class="back-link">← Back to all cards</a>
</body>
</html>`;

            fs.writeFileSync(path.join(cardDir, 'index.html'), detailHtml);
        }

        // --- INDEX PAGE ---
        console.log('📂 Generating index page...');
        
        const cardLinks = cards.map(card => {
            const slug = slugify(card.name);
            const cost = getCostDisplay(card);
            return `
            <a href="/cards/${slug}/" class="card-item ${card.color}">
                <span class="card-name">${card.name}</span>
                <span class="card-cost">${cost}</span>
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
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
        .card-item { 
            background: #1a1a1a; border: 1px solid #333; padding: 15px; text-decoration: none; color: inherit;
            display: flex; justify-content: space-between; border-radius: 8px; transition: border-color 0.2s;
        }
        .card-item:hover { border-color: #ffd700; }
        .card-cost { color: #ffd700; font-weight: bold; }
        .ironclad { border-left: 4px solid #ff4b4b; }
        .silent { border-left: 4px solid #00ff89; }
        .defect { border-left: 4px solid #4a90e2; }
        .necrobinder { border-left: 4px solid #c18cff; }
        .regent { border-left: 4px solid #e67e22; }
    </style>
</head>
<body>
    <h1>Slay the Spire 2 Cards</h1>
    <div class="grid">
        ${cardLinks}
    </div>
</body>
</html>`;

        fs.writeFileSync(path.join(cardsRoot, 'index.html'), indexHtml);

        console.log('✨ Build complete!');
        db.close();

    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

build();
