import { wrapLayout } from './shared.js';

export function infoTemplate() {
    const content = `
    <div class="item-box" style="max-width: 900px; margin: 0 auto; text-align: left;">
        
        <div>
            <p>Spire 2 Stats displays a simple percentage win rate and total run count on card items because they are intuitive and easy to understand at a glance. However, to ensure that card rankings are more useful, we use a <strong>Bayesian Average</strong> for sorting.</p>
            
            <p>This helps prevent "lucky" cards with only 1 run and 1 win from dominating the top of the lists.</p>

            <div style="background: rgba(0,0,0,0.2); padding: 25px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); margin: 30px 0;">
                <h3 style="margin-top: 0; color: var(--gold);">Bayesian Average</h3>
                <p>This is used by sites like IMDb for movie ratings. It pads a card's win rate with the <em>average win rate of all cards</em> until the card proves it deserves to be higher or lower.</p>
                
                <ul style="line-height: 1.8; list-style-type: none; padding-left: 0;">
                    <li>
                        <i>Score</i> = 
                        <math xmlns="http://www.w3.org/1998/Math/MathML" display="inline">
                            <mfrac>
                                <mrow>
                                    <mi>C</mi>
                                    <mo>&times;</mo>
                                    <mi>M</mi>
                                    <mo>+</mo>
                                    <mi>R</mi>
                                    <mo>&times;</mo>
                                    <mi>W</mi>
                                </mrow>
                                <mrow>
                                    <mi>C</mi>
                                    <mo>+</mo>
                                    <mi>R</mi>
                                </mrow>
                            </mfrac>
                        </math>
                    </li>
                    <li>
                        <ul style="margin-top: 5px; margin-bottom: 10px; padding-left: 20px; list-style-type: none;">
                            <li><i>C</i> is a confidence constant (e.g., <strong>5 runs</strong>). This represents how much "weight" we give the global average before trusting specific data.</li>
                            <li><i>M</i> is the global average win rate across all your cards.</li>
                            <li><i>R</i> is the runs with this specific card.</li>
                            <li><i>W</i> is the card's actual win rate.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Pros:</strong> Highly accurate; naturally adjusts to the player's overall skill level.
                    </li>
                    <li>
                        <strong>Cons:</strong> Requires calculating the global average win rate first.
                    </li>
                </ul>
            </div>

            <h3 style="margin-top: 40px; padding-bottom: 10px;">Example</h3>
            <p>Using a <strong>Confidence Constant (<i>C</i>) of 5</strong>, and a character's <strong>Global Average Win Rate (<i>M</i>) of 20% (0.20)</strong>.</p>

            <ul style="line-height: 1.6; list-style-type: none; padding-left: 0;">
                <li style="margin-bottom: 25px;">
                    <strong style="color: var(--subtitle);">Example 1: The "Lucky" Card (1 run, 1 win)</strong><br>
                    Even though this card has a 100% actual win rate (<i>W</i> = 1.0) over 1 run (<i>R</i> = 1), the formula pulls it down toward the 20% average because we lack confidence in a single run.<br>
                    <div style="font-family: monospace; background: #111; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        Score = (5 &times; 0.20 + 1 &times; 1.0) &divide; (5 + 1) = 2 &divide; 6 = <strong>33.3%</strong>
                    </div>
                </li>
                
                <li style="margin-bottom: 25px;">
                    <strong style="color: var(--subtitle);">Example 2: The "Proven" Card (10 runs, 6 wins)</strong><br>
                    This card has a lower actual win rate of 60% (<i>W</i> = 0.60) over 10 runs (<i>R</i> = 10). Because it has proven itself over more runs (overcoming the confidence constant), it doesn't get dragged down as much.<br>
                    <div style="font-family: monospace; background: #111; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        Score = (5 &times; 0.20 + 10 &times; 0.60) &divide; (5 + 10) = 7 &divide; 15 = <strong>46.7%</strong>
                    </div>
                </li>
            </ul>
            
            <p style="margin-top: 30px; padding: 15px; background: rgba(0,232,255,0.05); border-left: 4px solid var(--subtitle); font-style: italic;">
                <strong>The Result:</strong> The proven 60% card (46.7% Bayesian Score) correctly outranks the lucky 100% card (33.3% Bayesian Score).
            </p>
        </div>
    </div>
    `;

    return wrapLayout(
        "Ranking Info",
        content,
        [{ name: "Info", url: "" }],
        "Learn how Bayesian average rankings work on Spire 2 Stats."
    );
}