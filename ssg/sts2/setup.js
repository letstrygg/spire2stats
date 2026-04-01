import fs from 'fs/promises';
import path from 'path';
import sqlite3 from 'sqlite3';
import { DATABASE_PATH } from '../utils/paths.js';

export async function setupDatabase() {
    // Ensure database directory exists (sqlite fails if directory missing)
    const databaseDir = path.dirname(DATABASE_PATH);
    await fs.mkdir(databaseDir, { recursive: true });

    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DATABASE_PATH, (err) => {
            if (err) {
                reject(err);
                return;
            }

            // Create tables here
            db.serialize(() => {
                // Example tables - adjust based on your data structure
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

                db.run(`
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        display_name TEXT NOT NULL,
                        slug TEXT NOT NULL UNIQUE,
                        supabase_user_id TEXT
                    )
                `);

                db.run(`
                    CREATE TABLE IF NOT EXISTS runs (
                        id INTEGER PRIMARY KEY,
                        run_id TEXT UNIQUE,
                        character TEXT,
                        ascension INTEGER,
                        victory BOOLEAN,
                        score INTEGER,
                        playtime INTEGER,
                        timestamp DATETIME
                    )
                `);

                // Add more tables as needed

                console.log('Database tables created successfully');
                db.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    });
}

export async function updateDatabase() {
    // Implement database migrations/updates here
    console.log('Database update functionality not yet implemented');
}