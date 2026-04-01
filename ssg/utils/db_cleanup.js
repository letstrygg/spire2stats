import sqlite3 from 'sqlite3';
import { PATHS } from '../sts2/paths.js';

/**
 * Slay the Spire 2 - Database Cleanup Utility
 * Handles one-off migrations and manual data corrections.
 */

const db = new sqlite3.Database(PATHS.DATABASE);

async function runCommand(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function cleanup() {
    try {
        console.log('🧹 Starting database cleanup and migrations...');

        // 1. Migration: Reassign runs from RarelyViolent to RarelyVlolent
        const runUpdate = await runCommand("UPDATE runs SET username = 'rarelyvlolent' WHERE username = 'rarelyviolent'");
        console.log(`✅ Reassigned ${runUpdate.changes} runs to the correct spelling.`);

        // 2. Remove users accidentally registered with timestamped slugs (e.g., rarelyvlolent_runs_...)
        const userCleanup = await runCommand("DELETE FROM users WHERE slug LIKE '%_runs_%' OR display_name LIKE '%_runs_%'");
        console.log(`🗑️  Removed ${userCleanup.changes} junk timestamped user entries.`);

        // 3. Delete the incorrect spelling record
        // build-users.js will re-seed the correct one next time it runs
        const oldUserDel = await runCommand("DELETE FROM users WHERE slug = 'rarelyviolent'");
        if (oldUserDel.changes > 0) console.log('👋 Removed "rarelyviolent" user record.');

        console.log('✨ Database cleanup complete!');
        db.close();
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
    }
}

cleanup();