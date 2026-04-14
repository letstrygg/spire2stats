import { wrapLayout } from './shared.js';

export function contributeTemplate() {
    const content = `
    <div class="item-box" style="max-width: 1300px; margin: 0 auto; text-align: left;">
        <div class="description">
            <p>Spire 2 Stats is built on community data. By sharing your run history, you help improve winrate accuracy and monster lethality statistics for everyone!</p>
            
            <section style="margin-top: 30px;">
                <h2 style="color: var(--gold, #ffd700); font-size: 1.2rem;">Step 1: Locate your Run History</h2>
                <p>On Windows, navigate to your Steam user data folder for Slay the Spire 2. It is usually located at:</p>
                <div class="code-block" style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; border: 1px solid #444; font-family: monospace; word-break: break-all; margin: 15px 0;">
                    C:\\Users\\<strong style="color: #4bff87; background: rgba(75, 255, 135, 0.1); padding: 2px 4px; border-radius: 3px;">{Your_Windows_Username}</strong>\\AppData\\Roaming\\SlayTheSpire2\\steam\\<strong style="color: #4bff87; background: rgba(75, 255, 135, 0.1); padding: 2px 4px; border-radius: 3px;">{12345678901234567}</strong>\\profile1\\saves
                </div>
                <p class="text-muted" style="font-size: 0.85rem;">Pro tip: You can also paste <strong style="color: #4bff87;"><code>%appdata%\\SlayTheSpire2\\steam</code></strong> into your File Explorer address bar to jump there quickly.</p>
            </section>

            <section style="margin-top: 30px;">
                <h2 style="color: var(--gold, #ffd700); font-size: 1.2rem;">Step 2: Log In</h2>
                <p>Use the <strong>Login</strong> button in the top right corner of the site to sign in with your <strong>Google</strong> or <strong>Twitch</strong> account.</p>
            </section>

            <section style="margin-top: 30px;">
                <h2 style="color: var(--gold, #ffd700); font-size: 1.2rem;">Step 3: Upload via Settings</h2>
                <p>Click on your <strong>Username</strong> in the top right and select <a href="/settings.html" style="color: var(--blue);">Settings</a>. From there, you can:</p>
                <ul style="line-height: 1.6; margin-top: 10px;">
                    <li>Select your entire <code>history</code> folder to sync all runs at once.</li>
                    <li>Upload individual <code>.run</code> files.</li>
                    <li>Customize your public <strong>Display Name</strong> and URL slug.</li>
                </ul>
                <p style="margin-top: 15px;">New runs are processed and added to the global statistics daily!</p>
            </section>

            <hr style="border: 0; border-top: 1px solid #333; margin: 40px 0;">

            <section>
                <h2 style="font-size: 1.1rem; color: #aaa;">Need Help?</h2>
                <p style="font-size: 0.9rem; color: #888;">If you encounter issues with the automated uploader, you can reach out to the community:</p>
                <ul style="font-size: 0.9rem; color: #888; line-height: 1.6; margin-top: 10px;">
                    <li><strong>Discord:</strong> Join our <a href="https://discord.gg/wMEWQut72X" target="_blank" style="color: #448aff;">Discord Community</a>.</li>
                    <li><strong>Email:</strong> Contact me at <a href="mailto:letstrygg@gmail.com" style="color: #448aff;">letstrygg@gmail.com</a>.</li>
                </ul>
            </section>
        </div>
    </div>`;

    return wrapLayout(
        "Contribute",
        content,
        [{ name: "Contribute", url: "" }],
        "Learn how to contribute your Slay the Spire 2 run data to Spire 2 Stats."
    );
}