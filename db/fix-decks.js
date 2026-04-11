import sqlite3 from 'sqlite3';
import { PATHS } from '../ssg/sts2/paths.js';

/**
 * Slay the Spire 2 - One-off Deck List Fixer
 * Consolidates duplicate cards in the runs table and adds a "count" field.
 * Usage: node db/fix-decks.js
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

async function run() {
    try {
        console.log('📦 Fetching all runs to normalize deck lists...');
        const runs = await query("SELECT id, deck_list FROM runs");
        console.log(`📡 Found ${runs.length} runs in local database.`);

        let fixCount = 0;

        for (const run of runs) {
            let deck;
            try {
                deck = JSON.parse(run.deck_list || '[]');
            } catch (e) {
                console.warn(`⚠️ Skipped run ${run.id}: Invalid JSON in deck_list.`);
                continue;
            }
            
            if (!Array.isArray(deck) || deck.length === 0) continue;

            const deckMap = {};
            let needsUpdate = false;

            for (const card of deck) {
                // Handle variation in field names between old raw imports and cleaned objects
                const id = (card.id || '').replace('CARD.', '');
                const upgrades = card.upgrades ?? card.current_upgrade_level ?? 0;
                const enchantment = typeof card.enchantment === 'object' ? (card.enchantment?.id || null) : (card.enchantment || null);
                
                const key = `${id}|${upgrades}|${enchantment}`;

                if (deckMap[key]) {
                    deckMap[key].count = (deckMap[key].count || 1) + (card.count || 1);
                    needsUpdate = true;
                } else {
                    deckMap[key] = { id, upgrades, enchantment, count: card.count || 1 };
                }
            }

            if (needsUpdate) {
                const fixedDeck = Object.values(deckMap);
                await query("UPDATE runs SET deck_list = ? WHERE id = ?", [JSON.stringify(fixedDeck), run.id]);
                fixCount++;
            }
        }

        console.log(`✨ Success: Consolidated deck lists for ${fixCount} runs.`);
    } catch (err) {
        console.error('❌ Script failed:', err.message);
    } finally {
        db.close();
    }
}

run();