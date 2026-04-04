(function() {
    const supabase = window.supabase.createClient('https://fnwmtytnltmqjaflfwyr.supabase.co', 'sb_publishable_y12qZF_dSbUPmV_aieiUgA_CibDsxQV', { auth: { lock: null } });
    const btn = document.getElementById('auth-user-btn'), menu = document.getElementById('auth-dropdown-menu');

    btn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle('show'); };
    document.onclick = () => menu.classList.remove('show');

    window.authLogin = (provider) => supabase.auth.signInWithOAuth({ provider });
    window.authLogout = () => supabase.auth.signOut().then(() => location.reload());

    supabase.auth.onAuthStateChange(async (_, session) => {
        const user = session?.user;
        btn.textContent = user ? 'Account' : 'Login';
        menu.innerHTML = user 
            ? '<a href="/settings.html">Settings</a><button onclick="authLogout()">Logout</button>'
            : '<button onclick="authLogin(\'google\')">Google</button><button onclick="authLogin(\'twitch\')">Twitch</button>';
        
        if (user) {
            const { data } = await supabase.from('ltg_profiles').select('username').eq('user_id', user.id).maybeSingle();
            if (data) btn.textContent = data.username;
        }
    });
})();