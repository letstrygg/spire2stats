import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { PATHS, ensureDir } from './paths.js';

/**
 * Slay the Spire 2 - Card Data Importer
 * Reads from Spire Codex JSON and inputs into local SQLite
 */

const JSON_FILE = path.join(PATHS.CODEX_DATA, 'cards.json');
const DB_FILE = PATHS.DATABASE;

async function run() {
    try {
        console.log(`📂 Reading card data from: ${JSON_FILE}`);
        if (!fs.existsSync(JSON_FILE)) {
            throw new Error(`Source file not found at ${JSON_FILE}`);
        }

        const rawData = fs.readFileSync(JSON_FILE, 'utf8');
        const cards = JSON.parse(rawData);
        console.log(`✅ Loaded ${cards.length} cards.`);

        // Ensure the directory for the database exists
        ensureDir(path.dirname(DB_FILE));

        console.log(`🗄️  Connecting to database: ${DB_FILE}`);
        const db = new sqlite3.Database(DB_FILE);

        // Using serialize to ensure the schema is ready before insertion
        db.serialize(() => {
            // 0. Drop the table to ensure schema is synchronized with code
            db.run("DROP TABLE IF EXISTS cards");

            // 1. Create table (matches your existing schema in setup.js)
            db.run(`
                CREATE TABLE IF NOT EXISTS cards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    card_id TEXT,
                    name TEXT NOT NULL,
                    type TEXT,
                    rarity TEXT,
                    cost INTEGER,
                    is_x_cost INTEGER,
                    is_x_star_cost INTEGER,
                    star_cost INTEGER,
                    color TEXT,
                    description TEXT,
                    keywords TEXT,
                    spawns_cards TEXT,
                    vars TEXT,
                    upgrade TEXT,
                    tags TEXT
                )
            `);

            // 3. Batch insert using a Transaction for performance
            console.log('🚀 Importing cards...');
            db.run("BEGIN TRANSACTION");
            
            const stmt = db.prepare(`
                INSERT INTO cards (
                    card_id, name, type, rarity, cost, 
                    is_x_cost, is_x_star_cost, star_cost, color, 
                    description, keywords, spawns_cards, vars, upgrade, tags
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const card of cards) {
                stmt.run(
                    card.id,
                    card.name, 
                    card.type, 
                    card.rarity, 
                    card.cost, 
                    card.is_x_cost ? 1 : 0,
                    card.is_x_star_cost ? 1 : 0,
                    card.star_cost,
                    card.color,
                    card.description || '',
                    card.keywords ? JSON.stringify(card.keywords) : null,
                    card.spawns_cards ? JSON.stringify(card.spawns_cards) : null,
                    card.vars ? JSON.stringify(card.vars) : null,
                    card.upgrade ? JSON.stringify(card.upgrade) : null,
                    card.tags ? JSON.stringify(card.tags) : null
                );
            }
            
            stmt.finalize();
            db.run("COMMIT", () => {
                console.log('✨ Success: All cards imported to local database.');
                db.close();
            });
        });

    } catch (error) {
        console.error('❌ Import failed:', error.message);
        process.exit(1);
    }
}

run();