import sqlite3 from 'sqlite3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PATHS } from '../ssg/sts2/paths.js';

/**
 * Slay the Spire 2 - Manual User Importer
 * Fetches a user from Supabase ltg_profiles by slug and syncs to local SQLite.
 * Usage: node input-user.js <slug>
 */

// Load credentials from C:\GitHub\.env
dotenv.config({ path: 'C:\\GitHub\\.env' });

const db = new sqlite3.Database(PATHS.DATABASE);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function run() {
    const slugArg = process.argv[2];

    if (!slugArg) {
        console.error('❌ Error: Please provide a user slug. Usage: node input-user.js <slug>');
        process.exit(1);
    }

    try {
        // 1. Ensure local schema has supabase_user_id column
        const info = await query("PRAGMA table_info(users)");
        if (!info.some(c => c.name === 'supabase_user_id')) {
            console.log("➕ Adding supabase_user_id column to local users table...");
            await query("ALTER TABLE users ADD COLUMN supabase_user_id TEXT");
        }

        // 2. Fetch user from Supabase
        console.log(`📡 Fetching profile for slug: "${slugArg}" from Supabase...`);
        const { data: profile, error } = await supabase
            .from('ltg_profiles')
            .select('user_id, username, slug')
            .eq('slug', slugArg)
            .maybeSingle();

        if (error) throw error;
        if (!profile) {
            console.error(`❌ No user found in Supabase with slug: "${slugArg}"`);
            return;
        }

        // 3. Upsert into local SQLite
        console.log(`👤 Syncing user: ${profile.username} (${profile.user_id})...`);
        await query(`
            INSERT INTO users (display_name, slug, supabase_user_id) 
            VALUES (?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                display_name = excluded.display_name,
                supabase_user_id = excluded.supabase_user_id
        `, [profile.username, profile.slug, profile.user_id]);

        console.log(`✅ Successfully synced ${profile.username} to ${PATHS.DATABASE}`);
    } catch (err) {
        console.error('❌ Script failed:', err.message);
    } finally {
        db.close();
    }
}

run();