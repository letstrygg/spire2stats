document.addEventListener("DOMContentLoaded", function() {
    const supabase = window.supabaseClient;
    if (!supabase) return;

    let currentUserId = null;

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
                        <label style="display: block; color: #888; margin-bottom: 4px; text-transform: uppercase; font-size: 0.65rem;">YouTube Video ID</label>
                        <input type="text" class="yt-video-input" value="${ytVideo}" placeholder="e.g. dQw4w9WgXcQ" style="width: 100%; background: #222; border: 1px solid #444; color: #eee; padding: 6px; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="display: block; color: #888; margin-bottom: 4px; text-transform: uppercase; font-size: 0.65rem;">Add YouTube Short URL</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" class="short-url-input" placeholder="Paste Short URL..." style="flex-grow: 1; background: #222; border: 1px solid #444; color: #eee; padding: 6px; border-radius: 4px;">
                            <button class="add-short-btn" style="background: var(--blue); color: white; border: none; border-radius: 4px; padding: 0 12px; cursor: pointer; font-size: 0.7rem;">Add</button>
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

            editArea.querySelector('.add-short-btn').onclick = () => {
                const inp = editArea.querySelector('.short-url-input');
                const val = inp.value.trim();
                if (!val) return;
                const arr = JSON.parse(card.dataset.shorts || '[]');
                arr.push(val);
                card.dataset.shorts = JSON.stringify(arr);
                inp.value = '';
                updateShortsUI();
            };

        } else {
            // Save and Exit
            const ytInput = editArea.querySelector('.yt-video-input');
            const newYt = ytInput.value.trim() || null;
            const finalShorts = JSON.parse(card.dataset.shorts || '[]');

            btn.style.pointerEvents = 'none';
            btn.textContent = 'sync'; // Show loading state

            const { error } = await supabase.from('s2s_runs').update({ yt_video: newYt, shorts: finalShorts }).eq('id', runId);
            if (error) {
                alert("Update failed: " + error.message);
                btn.textContent = 'save';
                btn.style.pointerEvents = 'auto';
            } else {
                window.location.reload();
            }
        }
    });
});