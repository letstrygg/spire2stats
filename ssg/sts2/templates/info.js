import { wrapLayout } from './shared.js';

export function infoTemplate() {
    const content = `
    <div style="max-width: 900px; margin: 0 auto; text-align: left; font-family: monospace;">
        <p>Spire 2 Stats displays a simple percentage win rate and total run count because they are easy to understand. Card rankings use a Bayesian Average for sorting so that 1-win cards do not dominate the top of the lists.</p>

        <h3>Bayesian Average</h3>
        
        <ul style="list-style-type: none; padding-left: 0;">
            <li>
                <strong>Formula:</strong> 
                <math xmlns="http://www.w3.org/1998/Math/MathML" display="inline">
                    <mi>Score</mi>
                    <mo>=</mo>
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
            <li>C = confidence constant (5 runs)</li>
            <li>M = global average win rate</li>
            <li>R = runs with card</li>
            <li>W = card win rate</li>
        </ul>

        <h3>Example</h3>
        <p>Using a Confidence Constant (C) of 5, and a Global Average Win Rate (M) of 20% (0.20).</p>

        <ul style="list-style-type: none; padding-left: 0;">
            <li>
                <strong>Example 1: The "Lucky" Card (1 run, 1 win)</strong><br>
                Even though this card has a 100% actual win rate (W = 1.0) over 1 run (R = 1), the formula pulls it down toward the 20% average because we lack confidence in a single run.<br>
                <math xmlns="http://www.w3.org/1998/Math/MathML" display="inline">
                    <mi>Score</mi>
                    <mo>=</mo>
                    <mfrac>
                        <mrow>
                            <mn>5</mn>
                            <mo>&times;</mo>
                            <mn>0.20</mn>
                            <mo>+</mo>
                            <mn>1</mn>
                            <mo>&times;</mo>
                            <mn>1.0</mn>
                        </mrow>
                        <mrow>
                            <mn>5</mn>
                            <mo>+</mo>
                            <mn>1</mn>
                        </mrow>
                    </mfrac>
                    <mo>=</mo>
                    <mfrac>
                        <mn>2</mn>
                        <mn>6</mn>
                    </mfrac>
                    <mo>=</mo>
                    <mn>33.3%</mn>
                </math>
            </li>
            <br>
            <li>
                <strong>Example 2: The "Proven" Card (10 runs, 6 wins)</strong><br>
                This card has a lower actual win rate of 60% (W = 0.60) over 10 runs (R = 10). Because it has proven itself over more runs, it does not get dragged down as much.<br>
                <math xmlns="http://www.w3.org/1998/Math/MathML" display="inline">
                    <mi>Score</mi>
                    <mo>=</mo>
                    <mfrac>
                        <mrow>
                            <mn>5</mn>
                            <mo>&times;</mo>
                            <mn>0.20</mn>
                            <mo>+</mo>
                            <mn>10</mn>
                            <mo>&times;</mo>
                            <mn>0.60</mn>
                        </mrow>
                        <mrow>
                            <mn>5</mn>
                            <mo>+</mo>
                            <mn>10</mn>
                        </mrow>
                    </mfrac>
                    <mo>=</mo>
                    <mfrac>
                        <mn>7</mn>
                        <mn>15</mn>
                    </mfrac>
                    <mo>=</mo>
                    <mn>46.7%</mn>
                </math>
            </li>
        </ul>
        <p>Result: The proven 60% card (46.7%) outranks the lucky 100% card (33.3%).</p>
    </div>
    `;

    return wrapLayout(
        "Ranking Info",
        content,
        [{ name: "Info", url: "" }],
        "Learn how Bayesian average rankings work on Spire 2 Stats."
    );
}