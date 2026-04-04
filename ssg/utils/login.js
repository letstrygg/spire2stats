(function() {
    console.log("Auth: Initializing Supabase client...");
    const supabaseUrl = 'https://fnwmtytnltmqjaflfwyr.supabase.co';
    const supabaseKey = 'sb_publishable_y12qZF_dSbUPmV_aieiUgA_CibDsxQV';
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
        auth: { 
            flowType: 'pkce',
            lock: null // Fixes "Lock contention" by disabling Navigator Lock API
        }
    });

    const authBtn = document.getElementById('auth-user-btn');
    const authMenu = document.getElementById('auth-dropdown-menu');

    if (!authBtn || !authMenu) {
        console.error("Auth: UI elements not found (auth-user-btn or auth-dropdown-menu)");
        return;
    }

    authBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        authMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => authMenu.classList.remove('show'));

    window.authLogin = async (provider) => {
        console.log(`Auth: Redirecting to ${provider} login...`);
        await supabase.auth.signInWithOAuth({ provider });
    };

    window.authLogout = async () => {
        console.log("Auth: Logging out...");
        await supabase.auth.signOut();
        window.location.reload();
    };

    let isProcessing = false;
    let lastUserId = null;

    supabase.auth.onAuthStateChange(async (event, session) => {
        const user = session?.user;
        console.log(`Auth: Event [${event}]`, user ? `(User: ${user.id})` : '(No User)');

        if (!user) {
            lastUserId = null;
            authBtn.textContent = 'Login';
            authMenu.innerHTML = `<button onclick="authLogin('google')">Google</button><button onclick="authLogin('twitch')">Twitch</button>`;
            return;
        }

        if (isProcessing || user.id === lastUserId) return;

        try {
            isProcessing = true;
            
            const fetchPromise = supabase
                .from('ltg_profiles')
                .select('username')
                .eq('user_id', user.id)
                .maybeSingle();

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Timeout")), 4000)
            );

            const { data: profile, error } = await Promise.race([fetchPromise, timeoutPromise]);
            if (error) throw error;

            lastUserId = user.id;

            if (!profile) {
                console.log("Auth: Creating new profile...");
                const rawName = user.user_metadata?.display_name || ('unknown' + Math.floor(1000 + Math.random() * 9000));
                const slug = rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
                console.log(`Auth: Attempting insert with Name: ${rawName}, Slug: ${slug}`);

                const { data: newProfile, error: insError } = await supabase.from('ltg_profiles').insert([{ user_id: user.id, username: rawName, slug: slug }]).select().single();
                console.log("Auth: Insert result - Data:", newProfile, "Error:", insError);
                if (insError) throw insError;
                profile = newProfile;
            }

            authBtn.textContent = profile.username;
            authMenu.innerHTML = `<a href="/settings.html">Settings</a><button onclick="authLogout()">Logout</button>`;
        } catch (err) {
            console.error("Auth Exception:", err.message);
            authBtn.textContent = 'Account';
            authMenu.innerHTML = `<a href="/settings.html">Settings</a><button onclick="authLogout()">Logout</button>`;
        } finally {
            isProcessing = false;
        }
    });
})();