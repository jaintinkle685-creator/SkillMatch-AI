// Pure SVG and Canvas Interactive Chart Generator — SkillMatch AI
// High-precision, zero-latency, zero external dependencies, responsive SVG

/**
 * 1. Generates an SVG Bar Chart for Skill Gap Analysis
 * FIXED: Dedicated severity column and separate label coordinate tracks prevent any text overlapping!
 */
export function renderSkillGapChart(gapData = []) {
  if (!gapData || gapData.length === 0) {
    return `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 0.9rem;">
        No active project requirements to chart. Define or load a project above.
      </div>
    `;
  }

  const width = 760;
  const labelWidth = 160;
  const statusWidth = 140;
  const chartAreaWidth = width - labelWidth - statusWidth - 40;
  const barHeight = 22;
  const rowGap = 20;
  const rowHeight = barHeight * 2 + rowGap;
  const headerHeight = 55;
  const totalHeight = headerHeight + (gapData.length * rowHeight) + 20;

  let rowsSvg = "";

  gapData.forEach((d, idx) => {
    const y = headerHeight + (idx * rowHeight);
    const reqWidth = Math.max(4, (d.required / 100) * chartAreaWidth);
    const availWidth = Math.max(4, (d.available / 100) * chartAreaWidth);

    const isDeficit = d.available < d.required;
    const deficitVal = Math.max(0, d.required - d.available);

    let badgeText = "✓ Covered";
    let badgeBg = "rgba(16, 185, 129, 0.12)";
    let badgeColor = "#10b981";
    let badgeBorder = "rgba(16, 185, 129, 0.3)";

    if (deficitVal > 20) {
      badgeText = `Critical (-${deficitVal}%)`;
      badgeBg = "rgba(239, 68, 68, 0.12)";
      badgeColor = "#ef4444";
      badgeBorder = "rgba(239, 68, 68, 0.3)";
    } else if (deficitVal > 0) {
      badgeText = `Deficit (-${deficitVal}%)`;
      badgeBg = "rgba(245, 158, 11, 0.12)";
      badgeColor = "#f59e0b";
      badgeBorder = "rgba(245, 158, 11, 0.3)";
    }

    const availBarColor = isDeficit ? "#f59e0b" : "#10b981";
    if (deficitVal > 20) {
      // Critical color
      // availBarColor remains warning/danger
    }

    // Bar label coordinate logic: when bar >= 80px, place inside bar in crisp white text with text-anchor="end"
    // Otherwise place right after the bar, ensuring zero collision with the status column
    const reqInside = reqWidth >= 80;
    const reqTextX = reqInside ? (labelWidth + reqWidth - 8) : Math.min(width - statusWidth - 70, labelWidth + reqWidth + 6);
    const reqAnchor = reqInside ? "end" : "start";
    const reqColor = reqInside ? "#ffffff" : "var(--text-secondary)";

    const availInside = availWidth >= 80;
    const availTextX = availInside ? (labelWidth + availWidth - 8) : Math.min(width - statusWidth - 75, labelWidth + availWidth + 6);
    const availAnchor = availInside ? "end" : "start";
    const availColor = availInside ? "#ffffff" : (isDeficit ? "#ef4444" : "#10b981");

    rowsSvg += `
      <g class="chart-row-group" data-skill="${d.skill}">
        <!-- Row Background Separator -->
        <line x1="10" y1="${y + rowHeight - 6}" x2="${width - 10}" y2="${y + rowHeight - 6}" stroke="var(--border-color)" stroke-dasharray="3 3" opacity="0.6" />

        <!-- Skill Title & Subtitle in Dedicated Left Column -->
        <text x="14" y="${y + 16}" font-size="13px" font-weight="700" fill="var(--text-primary)">
          ${d.skill}
        </text>
        <text x="14" y="${y + 34}" font-size="11px" fill="var(--text-muted)">
          Req: ${d.required}% • Cap: ${d.available}%
        </text>

        <!-- Required Bar Track & Fill -->
        <rect x="${labelWidth}" y="${y}" width="${chartAreaWidth}" height="${barHeight - 6}" rx="4" fill="var(--bg-subtle)" />
        <rect x="${labelWidth}" y="${y}" width="${reqWidth}" height="${barHeight - 6}" rx="4" fill="#3b82f6" opacity="0.9">
          <title>${d.skill} Required: ${d.required}%</title>
        </rect>
        <text x="${reqTextX}" y="${y + 11.5}" font-size="10.5px" font-weight="700" text-anchor="${reqAnchor}" fill="${reqColor}">
          ${d.required}% Target
        </text>

        <!-- Available Bar Track & Fill -->
        <rect x="${labelWidth}" y="${y + barHeight}" width="${chartAreaWidth}" height="${barHeight - 6}" rx="4" fill="var(--bg-subtle)" />
        <rect x="${labelWidth}" y="${y + barHeight}" width="${availWidth}" height="${barHeight - 6}" rx="4" fill="${isDeficit ? '#ef4444' : '#10b981'}" opacity="0.92">
          <title>${d.skill} Available: ${d.available}%</title>
        </rect>
        <text x="${availTextX}" y="${y + barHeight + 11.5}" font-size="10.5px" font-weight="700" text-anchor="${availAnchor}" fill="${availColor}">
          ${d.available}% Capacity
        </text>

        <!-- Dedicated Status Column (Zero Collision) -->
        <rect x="${width - statusWidth}" y="${y + 6}" width="${statusWidth - 14}" height="28" rx="6" fill="${badgeBg}" stroke="${badgeBorder}" stroke-width="1" />
        <text x="${width - statusWidth + (statusWidth - 14)/2}" y="${y + 24}" text-anchor="middle" font-size="11px" font-weight="700" fill="${badgeColor}">
          ${badgeText}
        </text>
      </g>
    `;
  });

  return `
    <svg viewBox="0 0 ${width} ${totalHeight}" class="w-full h-auto" style="width: 100%; font-family: inherit; display: block;">
      <!-- Legend -->
      <g transform="translate(14, 16)">
        <rect x="0" y="0" width="12" height="12" rx="3" fill="#3b82f6" />
        <text x="18" y="10" fill="var(--text-secondary)" font-size="11.5px" font-weight="600">Project Target Requirement</text>

        <rect x="210" y="0" width="12" height="12" rx="3" fill="#10b981" />
        <text x="228" y="10" fill="var(--text-secondary)" font-size="11.5px" font-weight="600">Students Proficient (≥ Target)</text>

        <rect x="430" y="0" width="12" height="12" rx="3" fill="#ef4444" />
        <text x="448" y="10" fill="var(--text-secondary)" font-size="11.5px" font-weight="600">Skill Shortage / Deficit</text>
      </g>
      ${rowsSvg}
    </svg>
  `;
}

/**
 * 2. Generates an SVG Bar Chart for Algorithm vs Team Quality (%)
 */
export function renderAlgoQualityChart(results = []) {
  const width = 500;
  const height = 230;
  const padding = { top: 35, right: 25, bottom: 45, left: 55 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const barWidth = 64;
  const spacing = (chartWidth - (results.length * barWidth)) / (results.length + 1);
  const colors = ["#f59e0b", "#3b82f6", "#10b981"];

  let bars = "";
  results.forEach((r, i) => {
    const x = padding.left + spacing + i * (barWidth + spacing);
    const barH = (r.score / 100) * chartHeight;
    const y = padding.top + (chartHeight - barH);
    const color = colors[i % colors.length];

    bars += `
      <g class="bar-group">
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="6" fill="${color}">
          <title>${r.name}: ${r.score}%</title>
        </rect>
        <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" fill="var(--text-primary)" font-weight="800" font-size="13px">
          ${r.score}%
        </text>
        <text x="${x + barWidth / 2}" y="${height - 20}" text-anchor="middle" fill="var(--text-secondary)" font-size="11px" font-weight="600">
          ${r.type}
        </text>
      </g>
    `;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" style="width: 100%; display: block;">
      <!-- Grid lines -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="var(--border-color)" stroke-dasharray="4" opacity="0.6" />
      <line x1="${padding.left}" y1="${padding.top + chartHeight/2}" x2="${width - padding.right}" y2="${padding.top + chartHeight/2}" stroke="var(--border-color)" stroke-dasharray="4" opacity="0.6" />
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="var(--border-color)" />

      <text x="${padding.left - 10}" y="${padding.top + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5px">100%</text>
      <text x="${padding.left - 10}" y="${padding.top + chartHeight/2 + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5px">50%</text>
      <text x="${padding.left - 10}" y="${height - padding.bottom + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5px">0%</text>

      ${bars}
    </svg>
  `;
}

/**
 * 3. Generates an SVG Bar Chart for Algorithm vs Execution Time (ms)
 */
export function renderAlgoTimeChart(results = []) {
  const width = 500;
  const height = 230;
  const padding = { top: 35, right: 25, bottom: 45, left: 55 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const barWidth = 64;
  const spacing = (chartWidth - (results.length * barWidth)) / (results.length + 1);
  const maxTime = Math.max(...results.map(r => r.timeMs), 20);
  const colors = ["#10b981", "#3b82f6", "#8b5cf6"];

  let bars = "";
  results.forEach((r, i) => {
    const x = padding.left + spacing + i * (barWidth + spacing);
    const barH = Math.max(4, (r.timeMs / maxTime) * chartHeight);
    const y = padding.top + (chartHeight - barH);
    const color = colors[i % colors.length];

    bars += `
      <g class="bar-group">
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="6" fill="${color}">
          <title>${r.name}: ${r.timeMs} ms</title>
        </rect>
        <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" fill="var(--text-primary)" font-weight="800" font-size="13px">
          ${r.timeMs} ms
        </text>
        <text x="${x + barWidth / 2}" y="${height - 20}" text-anchor="middle" fill="var(--text-secondary)" font-size="11px" font-weight="600">
          ${r.type}
        </text>
      </g>
    `;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" style="width: 100%; display: block;">
      <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="var(--border-color)" stroke-dasharray="4" opacity="0.6" />
      <line x1="${padding.left}" y1="${padding.top + chartHeight/2}" x2="${width - padding.right}" y2="${padding.top + chartHeight/2}" stroke="var(--border-color)" stroke-dasharray="4" opacity="0.6" />
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="var(--border-color)" />

      <text x="${padding.left - 10}" y="${padding.top + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5px">${Math.round(maxTime)} ms</text>
      <text x="${padding.left - 10}" y="${padding.top + chartHeight/2 + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5px">${Math.round(maxTime/2)} ms</text>
      <text x="${padding.left - 10}" y="${height - padding.bottom + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5px">0 ms</text>

      ${bars}
    </svg>
  `;
}

/**
 * 4. Generates an Empirical Scalability Chart across Cohort Sizes N = 10 to 500
 */
export function renderScalabilityChart(data = []) {
  const width = 760;
  const height = 280;
  const padding = { top: 40, right: 30, bottom: 45, left: 65 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (!data || data.length === 0) return "";

  const maxN = data[data.length - 1].n;
  const maxTime = 4000; // ms

  const getX = n => padding.left + ((Math.log10(n) - 1) / (Math.log10(maxN) - 1)) * chartWidth;
  const getY = t => padding.top + chartHeight - (Math.min(1, t / maxTime) * chartHeight);

  let greedyPath = "";
  let matchPath = "";
  let optPath = "";

  data.forEach((d, i) => {
    const x = getX(d.n);
    const yG = getY(d.greedy);
    const yM = getY(d.matching);
    const yO = getY(d.optimization);

    greedyPath += `${i === 0 ? 'M' : 'L'} ${x} ${yG} `;
    matchPath += `${i === 0 ? 'M' : 'L'} ${x} ${yM} `;
    optPath += `${i === 0 ? 'M' : 'L'} ${x} ${yO} `;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" style="width: 100%; display: block;">
      <!-- Grid -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="var(--border-color)" stroke-dasharray="4" opacity="0.6" />
      <line x1="${padding.left}" y1="${padding.top + chartHeight/2}" x2="${width - padding.right}" y2="${padding.top + chartHeight/2}" stroke="var(--border-color)" stroke-dasharray="4" opacity="0.6" />
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="var(--border-color)" />

      <text x="${padding.left - 10}" y="${padding.top + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5px">4000 ms</text>
      <text x="${padding.left - 10}" y="${padding.top + chartHeight/2 + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5px">2000 ms</text>
      <text x="${padding.left - 10}" y="${height - padding.bottom + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5px">0 ms</text>

      <!-- Legend -->
      <g transform="translate(${padding.left + 10}, 16)">
        <line x1="0" y1="5" x2="20" y2="5" stroke="#f59e0b" stroke-width="3" />
        <text x="26" y="9" font-size="11px" font-weight="600" fill="var(--text-secondary)">Greedy O(N log N)</text>

        <line x1="160" y1="5" x2="180" y2="5" stroke="#3b82f6" stroke-width="3" />
        <text x="186" y="9" font-size="11px" font-weight="600" fill="var(--text-secondary)">Hungarian-inspired O(N³)</text>

        <line x1="360" y1="5" x2="380" y2="5" stroke="#10b981" stroke-width="3" />
        <text x="386" y="9" font-size="11px" font-weight="600" fill="var(--text-secondary)">Genetic Multi-Objective</text>
      </g>

      <!-- Lines -->
      <path d="${greedyPath}" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" />
      <path d="${matchPath}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" />
      <path d="${optPath}" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" />

      <!-- X Axis points -->
      ${data.map(d => {
        const x = getX(d.n);
        return `
          <circle cx="${x}" cy="${height - padding.bottom}" r="3" fill="var(--border-color)" />
          <text x="${x}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="11px" fill="var(--text-muted)">
            N=${d.n}
          </text>
        `;
      }).join("")}
    </svg>
  `;
}

/**
 * 5. Generates Theoretical Big-O Complexity Asymptotic Growth Curves
 */
export function renderTheoreticalComplexityChart() {
  const width = 500;
  const height = 230;
  const padding = { top: 35, right: 25, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Theoretical points for N = 1 to 50
  const steps = 30;
  let oNlogN = "";
  let oN3 = "";
  let oGenetic = "";

  for (let i = 0; i <= steps; i++) {
    const n = 1 + (i / steps) * 40;
    const x = padding.left + (i / steps) * chartWidth;

    // Normalizing curves for visual clarity
    const yNlogN = padding.top + chartHeight - ((n * Math.log2(n + 1)) / (45 * Math.log2(46))) * chartHeight;
    const yN3 = padding.top + chartHeight - (Math.pow(n, 3) / Math.pow(45, 3)) * chartHeight;
    const yGen = padding.top + chartHeight - (Math.pow(n, 1.8) / Math.pow(45, 1.8)) * chartHeight;

    oNlogN += `${i === 0 ? 'M' : 'L'} ${x} ${Math.max(padding.top, yNlogN)} `;
    oN3 += `${i === 0 ? 'M' : 'L'} ${x} ${Math.max(padding.top, yN3)} `;
    oGenetic += `${i === 0 ? 'M' : 'L'} ${x} ${Math.max(padding.top, yGen)} `;
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" style="width: 100%; display: block;">
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="var(--border-color)" />
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="var(--border-color)" />

      <!-- Curves -->
      <path d="${oNlogN}" fill="none" stroke="#f59e0b" stroke-width="2.5" />
      <path d="${oN3}" fill="none" stroke="#ef4444" stroke-width="2.5" />
      <path d="${oGenetic}" fill="none" stroke="#10b981" stroke-width="2.5" />

      <!-- Legend -->
      <g transform="translate(${padding.left + 10}, 15)">
        <line x1="0" y1="5" x2="16" y2="5" stroke="#f59e0b" stroke-width="2.5" />
        <text x="22" y="9" font-size="10.5px" fill="var(--text-secondary)">O(N log N) Linearithmic</text>

        <line x1="160" y1="5" x2="176" y2="5" stroke="#ef4444" stroke-width="2.5" />
        <text x="182" y="9" font-size="10.5px" fill="var(--text-secondary)">O(N³) Cubic Growth</text>

        <line x1="300" y1="5" x2="316" y2="5" stroke="#10b981" stroke-width="2.5" />
        <text x="322" y="9" font-size="10.5px" fill="var(--text-secondary)">O(G · P · N log N)</text>
      </g>

      <text x="${width - padding.right}" y="${height - 12}" text-anchor="end" font-size="10.5px" fill="var(--text-muted)">Input Cohort Size (N) →</text>
      <text x="${padding.left + 5}" y="${padding.top + 10}" font-size="10.5px" fill="var(--text-muted)">Operations Cost T(N) ↑</text>
    </svg>
  `;
}

/**
 * 6. Generates a Circular Score Gauge
 */
export function renderScoreGauge(score = 85, size = 76, strokeWidth = 6, label = "Score") {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score));
  const offset = circumference - (progress / 100) * circumference;

  let strokeColor = "#10b981";
  if (score < 75) strokeColor = "#f59e0b";
  if (score < 60) strokeColor = "#ef4444";

  return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: ${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--border-color)" stroke-width="${strokeWidth}" opacity="0.3" />
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size/2} ${size/2})" style="transition: stroke-dashoffset 0.4s ease;" />
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(size * 0.26)}px" font-weight="800" fill="var(--text-primary)">
          ${progress}%
        </text>
      </svg>
      <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-top: 2px;">
        ${label}
      </span>
    </div>
  `;
}

