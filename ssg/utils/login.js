(function() {
    console.log("Auth: Initializing Supabase client...");
    const supabaseUrl = 'https://fnwmtytnltmqjaflfwyr.supabase.co';
    const supabaseKey = 'sb_publishable_y12qZF_dSbUPmV_aieiUgA_CibDsxQV';
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
        auth: { flowType: 'pkce' }
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

    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`Auth: Event [${event}] detected.`);
        if (isProcessing) {
            console.log("Auth: Logic already running, ignoring concurrent event.");
            return;
        }
        
        const user = session?.user;
        if (!user) {
            authBtn.textContent = 'Login';
            authMenu.innerHTML = `<button onclick="authLogin('google')">Google</button><button onclick="authLogin('twitch')">Twitch</button>`;
            return;
        }

        try {
            isProcessing = true;
            console.log("Auth: Fetching profile for UUID:", user.id);

            // Use a timeout to prevent the UI from hanging if the Supabase Lock is stuck
            const fetchPromise = supabase
                .from('ltg_profiles')
                .select('username')
                .eq('user_id', user.id)
                .maybeSingle();

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Supabase request timed out (Lock contention?)")), 10000)
            );

            const { data: profile, error } = await Promise.race([fetchPromise, timeoutPromise]);
            console.log("Auth: Profile fetch result:", { profile, error });

            if (error) throw error;

            if (!profile) {
                console.log("Auth: No profile found. Generating...");
                const rawName = user.user_metadata?.display_name || ('unknown' + Math.floor(1000 + Math.random() * 9000));
                const slug = rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
                console.log(`Auth: Attempting insert with Name: ${rawName}, Slug: ${slug}`);

                const { data: newProfile, error: insError } = await supabase.from('ltg_profiles').insert([{ user_id: user.id, username: rawName, slug: slug }]).select().single();
                console.log("Auth: Insert result - Data:", newProfile, "Error:", insError);
                if (insError) throw insError;
                profile = newProfile;
            }

            console.log("Auth: Logged in as:", profile.username);
            authBtn.textContent = profile.username;
            authMenu.innerHTML = `<a href="/settings.html">Settings</a><button onclick="authLogout()">Logout</button>`;
        } catch (err) {
            console.error("Auth Critical Exception:", err);
            authBtn.textContent = 'Account';
            authMenu.innerHTML = `<a href="/settings.html">Settings</a><button onclick="authLogout()">Logout</button>`;
        } finally {
            isProcessing = false;
        }
    });
})();