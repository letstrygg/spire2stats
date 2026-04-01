import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import unzipper from 'unzipper';
import { ensureDir, PATHS, slugify } from '../sts2/paths.js';

/**
 * Slay the Spire 2 - Run Data Unpackager
 * Extracts a specific run backup zip into a dedicated subfolder.
 */

const PKG_DIR = 'C:\\GitHub\\sts2\\runs_pkg\\';
const DEST_BASE_DIR = 'C:\\GitHub\\sts2\\runs_unpkg\\';

/**
 * Ensures a user exists in the database, creating them if necessary.
 */
async function ensureUserExists(username) {
    const db = new sqlite3.Database(PATHS.DATABASE);
    const slug = slugify(username);
    
    return new Promise((resolve, reject) => {
        db.get("SELECT id FROM users WHERE slug = ?", [slug], (err, row) => {
            if (err) {
                db.close();
                return reject(err);
            }
            if (row) {
                db.close();
                return resolve();
            }
            
            console.log(`👤 New user detected: ${username}. Registering...`);
            db.run("INSERT INTO users (display_name, slug) VALUES (?, ?)", [username, slug], (err) => {
                db.close();
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

async function unpkgRuns() {
    try {
        console.log('🛠️  Starting run unpackaging...');

        if (!fs.existsSync(PKG_DIR)) {
            throw new Error(`Package directory not found: ${PKG_DIR}`);
        }

        const files = fs.readdirSync(PKG_DIR).filter(f => f.endsWith('.zip'));

        if (files.length === 0) {
            console.log('ℹ️ No zip files found in package directory.');
            return;
        }

        for (const file of files) {
            const zipPath = path.join(PKG_DIR, file);
            
            // Generic Username Extraction:
            // Takes everything before the first occurrence of "_runs" or "_history"
            const baseName = path.basename(file, '.zip');
            const username = baseName.split(/_runs|_history/i)[0];
            const userSlug = slugify(username);

            // Generate timestamped folder name (e.g., rarelyvlolent_runs_2024-04-01_12-00-00)
            const now = new Date();
            const timestamp = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
            const folderName = `${userSlug}_runs_${timestamp}`;
            const targetDir = path.join(DEST_BASE_DIR, folderName);

            ensureDir(targetDir);

            console.log(`📦 Extracting and flattening: ${file}`);
            const zip = fs.createReadStream(zipPath).pipe(unzipper.Parse({ forceStream: true }));
            
            for await (const entry of zip) {
                const fileName = path.basename(entry.path);
                // Flatten structure by moving all .run files directly to targetDir
                if (entry.type === 'File' && fileName.endsWith('.run')) {
                    const destPath = path.join(targetDir, fileName);
                    const writeStream = fs.createWriteStream(destPath);
                    entry.pipe(writeStream);
                    await new Promise((res, rej) => {
                        writeStream.on('finish', res);
                        writeStream.on('error', rej);
                    });
                } else {
                    entry.autodrain();
                }
            }

            // 3. Register user if they are new
            await ensureUserExists(username);

            // 4. Remove the source zip file upon success
            fs.unlinkSync(zipPath);
            console.log(`✅ Unpacked and removed source: ${file}`);
        }

        console.log(`✨ All discovered packages processed!`);

    } catch (error) {
        console.error('❌ Unpackaging failed:', error.message);
        process.exit(1);
    }
}

unpkgRuns();