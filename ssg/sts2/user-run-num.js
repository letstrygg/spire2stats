/**
 * Shared utility to recalculate sequential run numbers for users.
 */
export async function recalculateUserRunNumbers(db) {
    return new Promise((resolve, reject) => {
        // We group by supabase_user_id first, then username for those without IDs
        db.all("SELECT DISTINCT username, supabase_user_id FROM runs", async (err, users) => {
            if (err) return reject(err);
            
            try {
                for (const user of users) {
                    const runs = await new Promise((res, rej) => {
                        // Order by ID (timestamp) to ensure chronological order.
                        let sql, param;
                        if (user.supabase_user_id) {
                            sql = "SELECT id FROM runs WHERE supabase_user_id = ? ORDER BY CAST(id AS INTEGER) ASC";
                            param = user.supabase_user_id;
                        } else {
                            sql = "SELECT id FROM runs WHERE username = ? AND supabase_user_id IS NULL ORDER BY CAST(id AS INTEGER) ASC";
                            param = user.username;
                        }
                        
                        db.all(sql, [param], (err, rows) => err ? rej(err) : res(rows || []));
                    });

                    if (runs.length === 0) continue;

                    await new Promise((res, rej) => {
                        db.serialize(() => {
                            db.run("BEGIN TRANSACTION");
                            const updateStmt = db.prepare("UPDATE runs SET user_run_num = ? WHERE id = ?");
                            runs.forEach((run, index) => updateStmt.run(index + 1, run.id));
                            updateStmt.finalize();
                            db.run("COMMIT", (err) => err ? rej(err) : res());
                        });
                    });
                }
                resolve();
            } catch (e) { reject(e); }
        });
    });
}