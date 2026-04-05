(function() {
    console.log("Auth: Initializing global client...");
    window.supabaseClient = window.supabase.createClient('https://fnwmtytnltmqjaflfwyr.supabase.co', 'sb_publishable_y12qZF_dSbUPmV_aieiUgA_CibDsxQV', { auth: { lock: null } });
    const supabase = window.supabaseClient;

    const btn = document.getElementById('auth-user-btn'), menu = document.getElementById('auth-dropdown-menu');

    btn.onclick = (e) => { 
        e.stopPropagation(); 
        menu.classList.toggle('show'); 
    };
    document.onclick = () => menu.classList.remove('show');

    window.authLogin = (provider) => supabase.auth.signInWithOAuth({ provider });
    window.authLogout = () => supabase.auth.signOut().then(() => location.reload());

    let currentUid = null;
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("Auth: Event ->", event);
        const user = session?.user;
        
        if (!user) {
            currentUid = null;
            btn.textContent = 'Login';
            menu.innerHTML = '<button onclick="authLogin(\'google\')">Google</button><button onclick="authLogin(\'twitch\')">Twitch</button>';
            return;
        }

        if (user.id !== currentUid) {
            currentUid = user.id;
            btn.textContent = 'Account';
            menu.innerHTML = '<a href="/settings.html">Settings</a><button onclick="authLogout()">Logout</button>';

            setTimeout(async () => {
                console.log("Auth: Fetching profile for", user.id);
                const { data } = await supabase.from('ltg_profiles').select('username').eq('user_id', user.id).maybeSingle();
                if (data?.username) {
                    console.log("Auth: Username found ->", data.username);
                    btn.textContent = data.username;
                }
            }, 500);
        }
    });
})();