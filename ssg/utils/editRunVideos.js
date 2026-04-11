document.addEventListener("DOMContentLoaded", function() {
    const supabase = window.supabaseClient;
    if (!supabase) return;

    let currentUserId = null;

    // Helper to extract the 11-character YouTube ID from various URL formats or raw IDs
    const extractYoutubeId = (url) => {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|\/shorts\/)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : (url.length === 11 ? url : null);
    };

    const authChange = (event, session) => {
        const user = session?.user;
        if (user) {
            currentUserId = user.id;
            document.querySelectorAll('.run-record').forEach(card => {
                if (card.dataset.userId === currentUserId) {
                    const btn = card.querySelector('.edit-run-videos-btn');
                    if (btn) btn.style.display = 'block';
                }
            });
        }
    };

    supabase.auth.onAuthStateChange(authChange);
    supabase.auth.getSession().then(({data}) => authChange('INITIAL', data.session));

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.edit-run-videos-btn');
        if (!btn) return;

        const card = btn.closest('.run-record');
        const editArea = card.querySelector('.run-edit-area');
        const runId = card.dataset.runId;

        if (btn.textContent === 'settings') {
            // Enter Edit Mode
            btn.textContent = 'save';
            btn.style.color = 'var(--green)';
            editArea.style.display = 'block';
            
            const ytVideo = card.dataset.ytVideo || '';
            const shorts = JSON.parse(card.dataset.shorts || '[]');

            editArea.innerHTML = `
                <div class="edit-box" style="background: rgba(0,0,0,0.9); border: 1px solid #444; border-radius: 8px; padding: 15px; margin-top: 10px; font-size: 0.8rem; display: flex; flex-direction: column; gap: 12px; text-align: left;">
                    <div>
                        <label style="display: block; color: #888; margin-bottom: 4px; text-transform: uppercase; font-size: 0.65rem;">Add YouTube Video</label>
                        <input type="text" class="input" value="${ytVideo}" placeholder="Paste YouTube URL..." style="width: 100%; box-sizing: border-box; background: #222; border: 1px solid #444; color: #eee; padding: 6px; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; color: #888; margin-bottom: 4px; text-transform: uppercase; font-size: 0.65rem;">Add YouTube Short URL</label>
                        <div style="display: flex; gap: 8px; align-items: stretch;">
                            <input type="text" class="input" placeholder="Paste Short URL..." style="flex: 1; min-width: 0; box-sizing: border-box; background: #222; border: 1px solid #444; color: #eee; padding: 6px; border-radius: 4px;">
                            <button class="btn btn-blue" style="padding: 6px 12px; font-size: 0.7rem; white-space: nowrap;">Add</button>
                        </div>
                    </div>
                    <div class="edit-shorts-list" style="display: flex; gap: 10px; flex-wrap: wrap;"></div>
                </div>
            `;

            const list = editArea.querySelector('.edit-shorts-list');
            const updateShortsUI = () => {
                const current = JSON.parse(card.dataset.shorts || '[]');
                list.innerHTML = current.map((s, idx) => `
                    <div style="position: relative; display: inline-block;">
                        <img src="/images/250px-Youtube_shorts_icon.svg.png" style="height: 32px; width: auto;" alt="Short">
                        <span class="remove-short-btn material-symbols-outlined" data-idx="${idx}" style="position: absolute; top: -8px; right: -8px; background: var(--red); color: white; border-radius: 50%; font-size: 14px; cursor: pointer; padding: 2px;">close</span>
                    </div>
                `).join('');
                
                list.querySelectorAll('.remove-short-btn').forEach(x => {
                    x.onclick = () => {
                        const idx = parseInt(x.dataset.idx);
                        const arr = JSON.parse(card.dataset.shorts || '[]');
                        arr.splice(idx, 1);
                        card.dataset.shorts = JSON.stringify(arr);
                        updateShortsUI();
                    };
                });
            };

            updateShortsUI();

            // Use generic selectors since classes are now standardized
            const inputs = editArea.querySelectorAll('.input');
            editArea.querySelector('.btn-blue').onclick = () => {
                const inp = inputs[1]; // The short URL input
                const val = inp.value.trim();
                console.log("[DEBUG] 'Add' button clicked. Raw Input:", val);
                const shortId = extractYoutubeId(val);
                console.log("[DEBUG] Extracted Short ID:", shortId);
                if (!shortId) {
                    console.warn("[DEBUG] Rejection: Input did not resolve to a valid 11-char YouTube ID.");
                    return;
                }
                const arr = JSON.parse(card.dataset.shorts || '[]');
                arr.push(shortId);
                card.dataset.shorts = JSON.stringify(arr);
                console.log("[DEBUG] Updated local shorts dataset:", card.dataset.shorts);
                inp.value = '';
                updateShortsUI();
            };

        } else {
            // Save and Exit
            console.log("[DEBUG] 'Save' (Gear) clicked. Run ID target:", runId);
            const inputs = editArea.querySelectorAll('.input');
            const ytInput = inputs[0];
            const shortInput = inputs[1];
            
            const newYt = extractYoutubeId(ytInput.value.trim());
            console.log("[DEBUG] Primary Video ID to save:", newYt);
            
            // Capture any pending text in the short input box that wasn't "Added" yet
            const pendingShort = extractYoutubeId(shortInput.value.trim());
            const finalShorts = JSON.parse(card.dataset.shorts || '[]');
            if (pendingShort && !finalShorts.includes(pendingShort)) {
                console.log("[DEBUG] Adding pending text from input box to final list:", pendingShort);
                finalShorts.push(pendingShort);
            }
            console.log("[DEBUG] Final Shorts array being sent to Supabase:", finalShorts);

            btn.style.pointerEvents = 'none';
            btn.textContent = 'sync'; // Show loading state

            const updatePayload = { yt_video: newYt, shorts: finalShorts };
            console.log("[DEBUG] Sending UPDATE to s2s_runs table:", updatePayload);

            const { error } = await supabase.from('s2s_runs').update(updatePayload).eq('id', runId);
            if (error) {
                console.error("[DEBUG] Supabase Update FAILED:", error);
                alert("Update failed: " + error.message);
                btn.textContent = 'save';
                btn.style.pointerEvents = 'auto';
            } else {
                console.log("[DEBUG] Supabase Update SUCCESSFUL. Reloading page...");
                window.location.reload();
            }
        }
    });
});