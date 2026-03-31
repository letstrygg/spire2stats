import fs from 'fs';
import path from 'path';
import { PATHS, ensureDir } from './paths.js';
import { supabase } from '../utils/db.js';

export async function buildStatsPage() {
    console.log(`\n📊 Fetching run history from database to build Stats page...`);

    const { data: runs, error } = await supabase
        .from('ltg_sts2_runs')
        .select('run_number, character, win, run_time, killed_by, floor_history')
        .order('run_number', { ascending: true });

    if (error || !runs || runs.length === 0) {
        console.error("❌ Error fetching runs for stats page:", error?.message);
        return;
    }

    const totalRuns = runs.length;
    const wins = runs.filter(r => r.win).length;
    const winRate = ((wins / totalRuns) * 100).toFixed(1);
    
    const totalSeconds = runs.reduce((sum, r) => sum + r.run_time, 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const killers = {};
    let deadliestEncounter = "None";
    let deadliestCount = 0;
    
    runs.forEach(r => {
        if (!r.win && r.killed_by && r.killed_by !== 'NONE.NONE') {
            const killerClean = r.killed_by.replace('ENCOUNTER.', '');
            killers[killerClean] = (killers[killerClean] || 0) + 1;
            if (killers[killerClean] > deadliestCount) {
                deadliestCount = killers[killerClean];
                deadliestEncounter = killerClean;
            }
        }
    });

    const rgbColorMap = {
        'IRONCLAD': '255, 101, 101',
        'SILENT': '127, 255, 0',
        'DEFECT': '135, 206, 235',
        'NECROBINDER': '193, 140, 255',
        'REGENT': '230, 126, 34'
    };

    let maxFloorOverall = 0;
    
    // Pass the 'index' into the map function to calculate depth
    const datasets = runs.map((run, index) => {
        const charName = run.character.replace('CHARACTER.', '');
        const rgb = rgbColorMap[charName] || '255, 255, 255';
        const dataPoints = [];
        
        run.floor_history.forEach(f => {
            dataPoints.push({ x: f.floor, y: f.hp });
            if (f.floor > maxFloorOverall) maxFloorOverall = f.floor;
        });

        // DYNAMIC TRANSPARENCY: Back layers are 0.15, scaling down to front layers at 0.02
        const maxAlpha = 0.15;
        const minAlpha = 0.005;
        const fillAlpha = maxAlpha - ((index / Math.max(1, runs.length - 1)) * (maxAlpha - minAlpha));

        return {
            label: `Run ${run.run_number} (${charName})`,
            data: dataPoints,
            borderColor: `rgba(${rgb}, 0.5)`, 
            backgroundColor: `rgba(${rgb}, ${fillAlpha.toFixed(3)})`, 
            borderWidth: 2,
            fill: true,
            tension: 0, 
            pointRadius: 2, 
            pointBackgroundColor: `rgba(${rgb}, 0.8)`,
            pointBorderColor: 'transparent',
            pointHitRadius: 10, 
            charName: charName
        };
    });

    const outputDir = ensureDir(path.join(PATHS.STS2_ROOT, 'stats'));
    
    const html = `---
layout: new
title: "Run Stats - Slay the Spire 2"
permalink: /games/slay-the-spire-2/stats/
custom_css: "/css/game/sts2-style.css"
---
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
  .char-toggle {
      background: transparent;
      border: 2px solid #333;
      color: #666;
      padding: 8px 16px;
      border-radius: 20px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s;
  }
  .char-toggle.active {
      background: rgba(var(--char-rgb), 0.15);
      border-color: rgba(var(--char-rgb), 1);
      color: rgb(var(--char-rgb));
      box-shadow: 0 0 8px rgba(var(--char-rgb), 0.3);
  }
</style>

<div class="game-page-wrapper">
  <div class="divider-bottom" style="margin-bottom: 20px; padding-bottom: 15px;">
    <h1 class="title">Run History & Global Stats</h1>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;">
    <div style="background: #1a1a1a; border: 1px solid var(--border); padding: 15px; border-radius: 8px; text-align: center;">
        <div style="color: var(--gray); font-size: 0.9rem; text-transform: uppercase;">Total Runs</div>
        <div style="font-size: 2rem; font-weight: bold; color: var(--yellow);">${totalRuns}</div>
    </div>
    <div style="background: #1a1a1a; border: 1px solid var(--border); padding: 15px; border-radius: 8px; text-align: center;">
        <div style="color: var(--gray); font-size: 0.9rem; text-transform: uppercase;">Win Rate</div>
        <div style="font-size: 2rem; font-weight: bold; color: ${winRate > 0 ? 'var(--green)' : 'var(--red)'};">${winRate}%</div>
        <div style="font-size: 0.85rem; color: #888;">${wins} Wins / ${totalRuns - wins} Losses</div>
    </div>
    <div style="background: #1a1a1a; border: 1px solid var(--border); padding: 15px; border-radius: 8px; text-align: center;">
        <div style="color: var(--gray); font-size: 0.9rem; text-transform: uppercase;">Total Playtime</div>
        <div style="font-size: 2rem; font-weight: bold; color: var(--blue);">${hours}h ${minutes}m</div>
    </div>
    <div style="background: #1a1a1a; border: 1px solid var(--border); padding: 15px; border-radius: 8px; text-align: center;">
        <div style="color: var(--gray); font-size: 0.9rem; text-transform: uppercase;">Deadliest Foe</div>
        <div style="font-size: 1.2rem; font-weight: bold; color: var(--red); margin-top: 10px;">${deadliestEncounter}</div>
        <div style="font-size: 0.85rem; color: #888;">Ended ${deadliestCount} runs</div>
    </div>
  </div>

  <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; justify-content: center;" id="char-toggles">
    <button class="char-toggle active" data-char="IRONCLAD" style="--char-rgb: 255, 101, 101;">Ironclad</button>
    <button class="char-toggle active" data-char="SILENT" style="--char-rgb: 127, 255, 0;">Silent</button>
    <button class="char-toggle active" data-char="DEFECT" style="--char-rgb: 135, 206, 235;">Defect</button>
    <button class="char-toggle active" data-char="NECROBINDER" style="--char-rgb: 193, 140, 255;">Necrobinder</button>
    <button class="char-toggle active" data-char="REGENT" style="--char-rgb: 230, 126, 34;">Regent</button>
  </div>

  <div style="background: #111; border: 1px solid var(--border); border-radius: 8px; padding: 15px; position: relative; height: 500px; width: 100%;">
    <canvas id="runChart"></canvas>
  </div>
</div>

<script>
document.addEventListener("DOMContentLoaded", function() {
    const allDatasets = ${JSON.stringify(datasets)};
    const maxFloor = ${maxFloorOverall};
    
    const labels = Array.from({length: maxFloor}, (_, i) => i + 1);

    const ctx = document.getElementById('runChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: allDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: { display: false }, 
                tooltip: {
                    callbacks: {
                        title: (items) => \`Floor \${items[0].label}\`,
                        label: (item) => \`\${item.dataset.label}: \${item.raw.y} HP\`
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Floor', color: '#a0a0a0' }, grid: { color: '#333' } },
                y: { title: { display: true, text: 'Hit Points', color: '#a0a0a0' }, grid: { color: '#333' }, min: 0 }
            }
        }
    });

    const activeChars = new Set(['IRONCLAD', 'SILENT', 'DEFECT', 'NECROBINDER', 'REGENT']);
    const buttons = document.querySelectorAll('.char-toggle');

    buttons.forEach(btn => {
        btn.addEventListener('click', function() {
            const char = this.getAttribute('data-char');

            if (activeChars.has(char)) {
                activeChars.delete(char);
                this.classList.remove('active');
            } else {
                activeChars.add(char);
                this.classList.add('active');
            }

            chart.data.datasets = allDatasets.filter(d => activeChars.has(d.charName));
            chart.update();
        });
    });
});
</script>
`;

    fs.writeFileSync(path.join(outputDir, 'index.html'), html);
    console.log(`  ✅ Wrote Run Stats graph to /games/slay-the-spire-2/stats/index.html`);
}