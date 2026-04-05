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
            if (session?.user) {
                currentUserId = session.user.id;
                const { data: profile } = await supabase.from('ltg_profiles').select('username, slug').eq('user_id', currentUserId).maybeSingle();
                console.log("Settings: Profile fetch result ->", !!profile);
                if (profile) {
                    usernameInput.value = profile.username;
                    slugPreview.textContent = profile.slug;
                    originalSlug = profile.slug;
                    loader.style.display = 'none';
                    form.style.display = 'block';
                }
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