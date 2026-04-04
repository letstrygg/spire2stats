(function() {
    console.log("Auth: Initializing...");
    const supabase = window.supabase.createClient('https://fnwmtytnltmqjaflfwyr.supabase.co', 'sb_publishable_y12qZF_dSbUPmV_aieiUgA_CibDsxQV', { auth: { lock: null } });
    const btn = document.getElementById('auth-user-btn'), menu = document.getElementById('auth-dropdown-menu');

    btn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle('show'); };
    document.onclick = () => menu.classList.remove('show');

    window.authLogin = (provider) => supabase.auth.signInWithOAuth({ provider });
    window.authLogout = () => supabase.auth.signOut().then(() => location.reload());

    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("Auth: Event ->", event);
        const user = session?.user;
        btn.textContent = user ? 'Account' : 'Login';
        menu.innerHTML = user 
            ? '<a href="/settings.html">Settings</a><button onclick="authLogout()">Logout</button>'
            : '<button onclick="authLogin(\'google\')">Google</button><button onclick="authLogin(\'twitch\')">Twitch</button>';
        
        if (user) {
            console.log("Auth: Fetching profile for UUID:", user.id);
            console.log("Auth: Query starting...");
            const result = await supabase.from('ltg_profiles').select('username').eq('user_id', user.id).maybeSingle();
            console.log("Auth: Query finished. Result ->", result);

            if (result.error) {
                console.log("Auth: Supabase Error Object ->", result.error);
            }

            if (result.data?.username) btn.textContent = result.data.username;
        }
    });
})();