import { wrapLayout } from './shared.js';

export function settingsTemplate() {
    const content = `
    <div class="item-box" style="max-width: 600px; margin: 0 auto; text-align: left;">
        <h2 style="margin-bottom: 25px; border-bottom: 1px solid #333; padding-bottom: 10px; font-size: 1.4rem;">User Settings</h2>
        
        <div id="settings-loading" style="text-align: center; padding: 40px;">
            <p class="text-muted">Loading your profile...</p>
        </div>

        <div id="settings-form" style="display: none;">
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-size: 0.75rem; color: #888; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px;">Display Name</label>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <input type="text" id="username-input" class="input" maxlength="25" placeholder="Enter new username" style="flex-grow: 1;">
                    <div id="availability-indicator" style="font-size: 1.2rem; width: 24px; text-align: center;"></div>
                </div>
                <div style="margin-top: 10px; font-size: 0.85rem; color: #666; display: flex; align-items: center; gap: 6px;">
                    <span>URL Slug:</span>
                    <span id="slug-preview" style="color: var(--blue); font-family: monospace; font-weight: bold;"></span>
                </div>
            </div>

            <div style="margin-top: 40px; display: flex; justify-content: flex-end; align-items: center; gap: 20px;">
                <div id="save-status" style="font-size: 0.9rem;"></div>
                <button id="save-settings-btn" class="btn btn-green" style="padding: 10px 25px;">Save Changes</button>
            </div>

            <div style="margin-top: 40px; border-top: 1px solid #333; padding-top: 30px;">
                <h3 style="margin-bottom: 10px; font-size: 1.2rem;">Upload Run History</h3>
                <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 20px;">Contribute your <code>.run</code> files to the global statistics. You can select your entire <code>history</code> folder or individual files.</p>
                
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <input type="file" id="run-folder-input" webkitdirectory directory multiple style="display: none;">
                    <input type="file" id="run-files-input" accept=".run" multiple style="display: none;">
                    <button onclick="document.getElementById('run-folder-input').click()" class="btn btn-blue">Select History Folder</button>
                    <button onclick="document.getElementById('run-files-input').click()" class="btn btn-gray">Select .run Files</button>
                </div>
                <div id="upload-status" style="margin-top: 20px; font-size: 0.9rem; line-height: 1.4;"></div>
            </div>
        </div>
    </div>

    <script>
    document.addEventListener("DOMContentLoaded", function() {
        const supabase = window.supabaseClient;
        console.log("Settings: DOM loaded. Global client detected:", !!supabase);

        const form = document.getElementById('settings-form');
        const loader = document.getElementById('settings-loading');
        const usernameInput = document.getElementById('username-input');
        const slugPreview = document.getElementById('slug-preview');
        const availabilityIcon = document.getElementById('availability-indicator');
        const saveBtn = document.getElementById('save-settings-btn');
        const saveStatus = document.getElementById('save-status');
        
        const folderInput = document.getElementById('run-folder-input');
        const filesInput = document.getElementById('run-files-input');
        const uploadStatus = document.getElementById('upload-status');

        let originalSlug = '';
        let currentUserId = null;
        let isAvailable = true;

        const slugify = (text) => text.toString().toLowerCase().trim()
            .replace(/\\s+/g, '-')
            .replace(/[^\\w\\-]+/g, '')
            .replace(/\\-\\-+/g, '-');

        async function checkAvailability(slug) {
            if (!slug || slug === originalSlug) {
                availabilityIcon.innerHTML = '';
                isAvailable = true;
                return;
            }

            console.log("Settings: Checking availability for slug:", slug);
            const { data } = await supabase.from('ltg_profiles').select('slug').eq('slug', slug).maybeSingle();
            if (!data) {
                availabilityIcon.innerHTML = '<span style="color: var(--green)">check_circle</span>';
                availabilityIcon.className = 'material-symbols-outlined';
                isAvailable = true;
            } else {
                availabilityIcon.innerHTML = '<span style="color: var(--red)">cancel</span>';
                availabilityIcon.className = 'material-symbols-outlined';
                isAvailable = false;
            }
        }

        usernameInput.addEventListener('input', (e) => {
            const slug = slugify(e.target.value);
            slugPreview.textContent = slug;
            checkAvailability(slug);
        });

        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Settings: Received Auth Event ->", event);
            const user = session?.user;
            if (user && user.id !== currentUserId) {
                currentUserId = user.id;
                setTimeout(async () => {
                    console.log("Settings: Fetching profile for", user.id);
                    const { data: profile } = await supabase.from('ltg_profiles').select('username, slug').eq('user_id', user.id).maybeSingle();
                    console.log("Settings: Profile fetch result ->", !!profile);
                    if (profile) {
                        usernameInput.value = profile.username;
                        slugPreview.textContent = profile.slug;
                        originalSlug = profile.slug;
                        loader.style.display = 'none';
                        form.style.display = 'block';
                    }
                }, 500);
            } else if (event === 'SIGNED_OUT') {
                window.location.href = '/';
            }
        });

        saveBtn.onclick = async () => {
            if (!isAvailable || saveBtn.disabled) return;
            const newName = usernameInput.value.trim();
            const newSlug = slugify(newName);
            if (!newName) return;

            saveBtn.disabled = true;
            saveStatus.textContent = 'Saving...';
            saveStatus.style.color = 'var(--gray)';

            const { error } = await supabase.from('ltg_profiles').update({ username: newName, slug: newSlug }).eq('user_id', currentUserId);

            if (error) {
                saveStatus.textContent = 'Error: ' + error.message;
                saveStatus.style.color = 'var(--red)';
                saveBtn.disabled = false;
            } else {
                saveStatus.textContent = 'Profile updated!';
                saveStatus.style.color = 'var(--green)';
                setTimeout(() => window.location.reload(), 1000);
            }
        };

        async function processAndUploadRuns(files) {
            const runFiles = Array.from(files).filter(f => f.name.endsWith('.run'));
            if (runFiles.length === 0) return;

            uploadStatus.innerHTML = '<span style="color: var(--gray)">Reading ' + runFiles.length + ' files...</span>';
            let successCount = 0;
            let skipCount = 0;
            let failCount = 0;
            const currentUsername = usernameInput.value.trim();

            // Process in chunks to avoid overwhelming the browser/API
            const chunkSize = 20;
            for (let i = 0; i < runFiles.length; i += chunkSize) {
                const chunk = runFiles.slice(i, i + chunkSize);
                const uploadData = [];

                for (const file of chunk) {
                    try {
                        const text = await file.text();
                        const json = JSON.parse(text);
                        const player = json.players?.[0] || {};
                        
                        // Map JSON fields to s2s_runs_todo schema (aligned with input-runs.js)
                        uploadData.push({
                            id: json.run_id || (Date.now() + Math.random().toString(36).substr(2, 9)),
                            user_run_num: json.run_number || null,
                            username: currentUsername,
                            schema_version: json.schema_version,
                            build_id: json.build_id,
                            platform_type: json.platform_type || null,
                            seed: json.seed ? String(json.seed) : null,
                            start_time: json.start_time || null,
                            run_time: json.run_time || null,
                            ascension: json.ascension || 0,
                            game_mode: json.game_mode || null,
                            win: json.win ? 1 : 0,
                            was_abandoned: json.was_abandoned ? 1 : 0,
                            killed_by_encounter: json.killed_by_encounter?.replace('ENCOUNTER.', '') || null,
                            killed_by_event: json.killed_by_event?.replace('EVENT.', '') || null,
                            acts: (json.acts || []).map(a => a.replace('ACT.', '')),
                            character: player.character?.replace('CHARACTER.', ''),
                            relic_list: (player.relics || []).map(r => r.id?.replace('RELIC.', '')),
                            deck_list: (player.deck || []).map(c => ({ 
                                id: c.id?.replace('CARD.', ''), 
                                upgrades: c.current_upgrade_level || 0, 
                                enchantment: c.enchantment?.id || null 
                            })),
                            path_history: (json.map_point_history || []).flat().map((pt, idx) => {
                                const room = pt.rooms?.[0] || {};
                                const stats = pt.player_stats?.[0] || {};
                                const entry = {
                                    floor: pt.floor ?? (idx + 1),
                                    room_type: room.room_type,
                                    current_hp: stats.current_hp,
                                    max_hp: stats.max_hp,
                                    current_gold: stats.current_gold,
                                    damage_taken: stats.damage_taken,
                                    hp_healed: stats.hp_healed,
                                    gold_gained: stats.gold_gained,
                                    gold_lost: stats.gold_lost,
                                    gold_spent: stats.gold_spent,
                                    gold_stolen: stats.gold_stolen,
                                    max_hp_gained: stats.max_hp_gained,
                                    max_hp_lost: stats.max_hp_lost
                                };
                                if (['boss', 'monster', 'elite'].includes(room.room_type)) {
                                    entry.encounter_id = room.model_id?.replace('ENCOUNTER.', '');
                                    entry.monster_ids = (room.monster_ids || []).map(m => m.replace('MONSTER.', ''));
                                } else if (room.room_type === 'event') {
                                    entry.event_id = room.model_id?.replace('EVENT.', '');
                                } else if (room.room_type === 'rest_site') {
                                    entry.rest_choices = stats.rest_site_choices || [];
                                }
                                return entry;
                            })
                        });
                    } catch (e) {
                        failCount++;
                    }
                }

                if (uploadData.length > 0) {
                    // Check if these IDs already exist in the finalized s2s_runs table
                    const { data: existing } = await supabase.from('s2s_runs').select('id').in('id', uploadData.map(d => d.id));
                    const existingIds = new Set(existing?.map(r => r.id) || []);
                    
                    const finalUpload = uploadData.filter(d => !existingIds.has(d.id));
                    skipCount += (uploadData.length - finalUpload.length);

                    if (finalUpload.length > 0) {
                        const { error } = await supabase.from('s2s_runs_todo').upsert(finalUpload, { onConflict: 'id' });
                        if (error) {
                            failCount += finalUpload.length;
                            console.error("Upload Error:", error);
                        } else {
                            successCount += finalUpload.length;
                        }
                    }
                }
                uploadStatus.innerHTML = '<span style="color: var(--blue)">Uploading... (' + (successCount + skipCount) + '/' + runFiles.length + ')</span>';
            }

            uploadStatus.innerHTML = \`<span style="color: var(--green)">Uploaded \${successCount} new runs!</span> \` + 
                (skipCount > 0 ? \`<span style="color: var(--gray)">(\${skipCount} already existed)</span> \` : '') + 
                (failCount > 0 ? \`<span style="color: var(--red)">(\${failCount} failed)</span>\` : '');
        }

        folderInput.onchange = (e) => processAndUploadRuns(e.target.files);
        filesInput.onchange = (e) => processAndUploadRuns(e.target.files);
    });
    </script>`;

    return wrapLayout(
        "Settings",
        content,
        [{ name: "Settings", url: "" }],
        "Manage your Spire 2 Stats profile and display name.",
        "",
        "/settings.html"
    );
}