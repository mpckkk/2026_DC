// Global State
let rawTeamBox = [];
let rawGames = [];
let filteredTeamBox = [];
let processedTeams = [];
let currentSort = { col: 'winPct', dir: 'desc' };
let currentSearch = "";
let charts = { 
  ppg: null, scatter: null, radar: null, threePt: null,
  shotDist: null, ballSecurity: null, rebounding: null, efficiencyMatrix: null, marginTrend: null,
  shotAttempts: null, blowouts: null, streaks: null, homeAway: null
};
let currentPage = 1;
let rowsPerPage = 15;

const TEAM_COLORS = ["#e63946", "#f5a623", "#2dd4a7", "#5b8cff", "#c1121f", "#18453b", "#4e2a84", "#ceb888", "#990000", "#041e42", "#154733", "#4b2e83", "#ffcd00", "#7a0019", "#d00000", "#cc0033", "#6c757d", "#0dcaf0"];

// Updated Google Sheet Link for team_box
const DRIVE_TEAM_BOX_LINK = 'https://docs.google.com/spreadsheets/d/1tpwA92enAc-xojEo74GhRZjd50i9ZNXI7PUypjJ01eg/edit?gid=507312218#gid=507312218';

function hidePageLoader() {
  const loader = document.getElementById('pageLoader');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.visibility = 'hidden';
    setTimeout(() => {
      if (loader.parentNode) loader.remove();
    }, 400);
  }
}

// Safety fallback: hide loader after 25 seconds if network is extremely slow
setTimeout(hidePageLoader, 2500000);

function extractDriveId(shareUrl) {
  const match = shareUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// THEME TOGGLE LOGIC
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const themeText = document.getElementById('themeText');
  
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
    updateThemeIcon('light');
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-mode');
      const newTheme = isLight ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      updateThemeIcon(newTheme);
      updateChartThemeColors();
    });
  }

  function updateThemeIcon(theme) {
    if (!themeIcon || !themeText) return;
    if (theme === 'light') {
      themeIcon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
      themeText.innerText = 'Light';
    } else {
      themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
      themeText.innerText = 'Dark';
    }
  }
});

function updateChartThemeColors() {
  const isLight = document.body.classList.contains('light-mode');
  Chart.defaults.color = isLight ? '#64748b' : '#8b98b0';
  Chart.defaults.borderColor = isLight ? 'rgba(226, 232, 240, 0.8)' : 'rgba(35, 45, 66, 0.5)';

  if (charts.radar && charts.radar.options?.scales?.r) {
    charts.radar.options.scales.r.pointLabels.color = isLight ? '#1e293b' : '#e8edf5';
    charts.radar.options.scales.r.grid.color = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
    charts.radar.options.scales.r.angleLines.color = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
  }

  if (charts.shotAttempts && charts.shotAttempts.options?.scales?.r) {
    charts.shotAttempts.options.scales.r.grid.color = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
  }

  Object.values(charts).forEach(chart => {
    if (chart) chart.update();
  });
}

// Build gamesData directly from teamBoxData so we don't wait on a second CSV
function deriveGamesFromTeamBox(teamBoxData) {
  const seenGames = new Map();
  teamBoxData.forEach(row => {
    if (row.game_id && !seenGames.has(row.game_id)) {
      seenGames.set(row.game_id, {
        game_id: row.game_id,
        game_date: row.game_date || row.game_date_time || '2026-01-01',
        game_date_time: row.game_date_time || row.game_date || '2026-01-01'
      });
    }
  });
  return Array.from(seenGames.values());
}

window.addEventListener('load', async () => {
  console.log("1. Window Loaded. Starting app...");
  
  if (typeof Papa === 'undefined' || typeof Chart === 'undefined') {
    hidePageLoader();
    alert("Error: Chart.js or PapaParse failed to load. Check your internet connection.");
    return;
  }

  try {
    console.log("2. Fetching team_box data...");
    const teamBoxData = await fetchCSV('./data/team_box.csv', DRIVE_TEAM_BOX_LINK);
    const gamesData = deriveGamesFromTeamBox(teamBoxData);
    
    initializeAppWithData(teamBoxData, gamesData);

  } catch (error) {
    console.error("CRITICAL ERROR:", error);
    renderFallbackUploader(error.message);
  }
});

function initializeAppWithData(teamBoxData, gamesData) {
  hidePageLoader();

  console.log("3. Data loaded! Team Box Rows:", teamBoxData.length, "Games Rows:", gamesData.length);
  
  rawTeamBox = teamBoxData;
  rawGames = gamesData && gamesData.length > 0 ? gamesData : deriveGamesFromTeamBox(teamBoxData);

  let minDate = '2025-11-01';
  let maxDate = '2026-03-01';
  try {
    const rawDates = [
      ...rawGames.map(g => new Date(g.game_date_time || g.game_date)),
      ...rawTeamBox.map(b => new Date(b.game_date_time || b.game_date))
    ].filter(d => !isNaN(d.getTime()));

    if (rawDates.length > 0) {
      minDate = new Date(Math.min(...rawDates)).toISOString().split('T')[0];
      maxDate = new Date(Math.max(...rawDates)).toISOString().split('T')[0];
    }
  } catch(e) { console.warn("Date parsing failed, using fallback dates"); }

  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  if (startDateInput) startDateInput.value = minDate;
  if (endDateInput) endDateInput.value = maxDate;

  const teamMap = new Map();
  rawTeamBox.forEach(t => {
    if (t.team_id && !teamMap.has(t.team_id)) {
      teamMap.set(t.team_id, t.team_display_name || t.team_name || `Team ${t.team_id}`);
    }
  });
  
  const teamOptions = Array.from(teamMap.entries()).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  
  const teamFilter = document.getElementById('teamFilter');
  if (teamFilter) teamFilter.innerHTML = `<option value="all">All Teams</option>` + teamOptions;
  
  const radar1 = document.getElementById('radarTeam1');
  const radar2 = document.getElementById('radarTeam2');
  if (radar1) radar1.innerHTML = teamOptions;
  if (radar2) radar2.innerHTML = teamOptions;
  
  if (teamMap.size > 1) {
    const firstTwo = Array.from(teamMap.keys()).slice(0, 2);
    if (radar1) radar1.value = firstTwo[0];
    if (radar2) radar2.value = firstTwo[1];
  }

  updateDashboard();

  // Bind Listeners once
  if (!window.__listenersBound) {
    window.__listenersBound = true;
    if (startDateInput) startDateInput.addEventListener('change', () => { currentPage = 1; updateDashboard(); });
    if (endDateInput) endDateInput.addEventListener('change', () => { currentPage = 1; updateDashboard(); });
    if (teamFilter) teamFilter.addEventListener('change', () => { currentPage = 1; updateDashboard(); });
    if (radar1) radar1.addEventListener('change', renderRadarChart);
    if (radar2) radar2.addEventListener('change', renderRadarChart);
    
    const resetBtn = document.getElementById('resetFilters');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (startDateInput) startDateInput.value = minDate;
        if (endDateInput) endDateInput.value = maxDate;
        if (teamFilter) teamFilter.value = 'all';
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        currentSearch = "";
        currentPage = 1;
        currentSort = { col: 'winPct', dir: 'desc' };
        document.querySelectorAll('th').forEach(el => el.classList.remove('sort-asc', 'sort-desc'));
        const winPctTh = document.querySelector('th[data-sort="winPct"]');
        if (winPctTh) winPctTh.classList.add('sort-desc');
        updateDashboard();
      });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase();
        currentPage = 1;
        renderTable();
      });
    }

    const rowsPerPageSelect = document.getElementById('rowsPerPage');
    if (rowsPerPageSelect) {
      rowsPerPageSelect.addEventListener('change', (e) => {
        rowsPerPage = parseInt(e.target.value);
        currentPage = 1;
        renderTable();
      });
    }

    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (currentSort.col === col) {
          currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.col = col;
          currentSort.dir = 'desc';
        }
        document.querySelectorAll('th').forEach(el => el.classList.remove('sort-asc', 'sort-desc'));
        th.classList.add(`sort-${currentSort.dir}`);
        currentPage = 1;
        renderTable();
      });
    });

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportToCSV);
  }

  updateChartThemeColors();
}

function parseCSVText(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, { 
      header: true, 
      skipEmptyLines: true, 
      dynamicTyping: true,
      transformHeader: h => h.trim(),
      complete: (results) => {
        const validRows = results.data.filter(row => row && typeof row === 'object' && Object.keys(row).length > 1);
        if (validRows.length === 0) {
          reject(new Error("Parsed CSV contained 0 valid rows."));
        } else {
          resolve(validRows);
        }
      }, 
      error: reject 
    });
  });
}

// 25-second timeout so large Google Sheets CSV exports have plenty of time to finish downloading
async function fetchWithTimeout(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchCSV(localPath, remoteLink) {
  const isSpreadsheet = remoteLink.includes('docs.google.com/spreadsheets');
  const driveId = extractDriveId(remoteLink);
  const gidMatch = remoteLink.match(/gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  const candidateUrls = [];

  if (isSpreadsheet && driveId) {
    // 1. Google Visualization CSV endpoint (Fastest & native CORS support)
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${driveId}/gviz/tq?tqx=out:csv&gid=${gid}`;
    // 2. Standard Google Sheets CSV Export endpoint
    const exportUrl = `https://docs.google.com/spreadsheets/d/${driveId}/export?format=csv&gid=${gid}`;

    candidateUrls.push(gvizUrl, exportUrl);

    // 3. Local file if hosted on http/https
    if (window.location.protocol.startsWith('http')) {
      candidateUrls.push(localPath);
    }

    // 4. Proxy fallbacks
    candidateUrls.push(
      `https://corsproxy.io/?url=${encodeURIComponent(exportUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(exportUrl)}`
    );
  } else {
    if (window.location.protocol.startsWith('http')) {
      candidateUrls.push(localPath);
    }
    candidateUrls.push(remoteLink);
  }

  let lastError = null;

  for (const url of candidateUrls) {
    try {
      console.log(`Trying: ${url}`);
      const response = await fetchWithTimeout(url, 25000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const text = await response.text();
      const trimmed = text.trim();

      if (trimmed.startsWith('version https://git-lfs.github.com/spec')) {
        throw new Error('Git LFS pointer detected');
      }
      if (trimmed.toLowerCase().startsWith('<!doctype html') || trimmed.toLowerCase().startsWith('<html')) {
        throw new Error('Google Sheet is private (Set Share -> Anyone with the link)');
      }

      return await parseCSVText(text);
    } catch (err) {
      console.warn(`Failed (${url}):`, err.message);
      lastError = err;
    }
  }

  throw new Error(lastError ? lastError.message : 'Load failed');
}

function renderFallbackUploader(errorMsg) {
  hidePageLoader();

  const tbody = document.getElementById("tableBody");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="13" style="text-align:center; padding: 28px; line-height: 1.6;">
        <div style="color: #e63946; font-weight: bold; font-size: 1.05rem; margin-bottom: 8px;">
          Automatic CSV Fetch Blocked (${errorMsg})
        </div>
        <div style="color: var(--text-muted, #8b98b0); font-size: 0.9rem; margin-bottom: 16px;">
          Make sure your Google Sheet is set to <strong>"Anyone with the link"</strong>, or select <code>team_box.csv</code> directly from your computer below:
        </div>
        <div style="display: inline-flex; gap: 16px; align-items: center; flex-wrap: wrap; justify-content: center; background: rgba(255,255,255,0.04); padding: 14px 20px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
          <label style="font-size: 0.85rem; text-align: left;">
            <strong>1. team_box.csv (Required):</strong><br>
            <input type="file" id="manualTeamBox" accept=".csv" style="margin-top: 4px;">
          </label>
          <button id="manualLoadBtn" style="padding: 8px 16px; background: #5b8cff; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
            Load Dashboard
          </button>
        </div>
      </td>
    </tr>`;

  const loadBtn = document.getElementById('manualLoadBtn');
  if (loadBtn) {
    loadBtn.addEventListener('click', async () => {
      const boxFile = document.getElementById('manualTeamBox')?.files[0];
      if (!boxFile) {
        alert("Please select team_box.csv first.");
        return;
      }
      try {
        const boxText = await boxFile.text();
        const boxData = await parseCSVText(boxText);
        const gamesData = deriveGamesFromTeamBox(boxData);
        initializeAppWithData(boxData, gamesData);
      } catch (e) {
        alert("Error parsing selected CSV file: " + e.message);
      }
    });
  }
}

function updateDashboard() {
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  if (!startDateInput || !endDateInput) return;

  // Include the entire end day up to 23:59:59.999
  const startDate = new Date(startDateInput.value).getTime();
  const endDate = new Date(endDateInput.value).getTime() + 86399999;
  const teamFilter = document.getElementById('teamFilter') ? document.getElementById('teamFilter').value : 'all';

  const filteredGames = rawGames.filter(g => {
    const d = new Date(g.game_date_time || g.game_date);
    if (isNaN(d.getTime())) return true;
    return d.getTime() >= startDate && d.getTime() <= endDate;
  });
  const validGameIds = new Set(filteredGames.map(g => g.game_id));

  let filteredBox = rawTeamBox.filter(b => {
    if (validGameIds.size > 0 && b.game_id) {
      return validGameIds.has(b.game_id);
    }
    const d = new Date(b.game_date_time || b.game_date);
    return isNaN(d.getTime()) || (d.getTime() >= startDate && d.getTime() <= endDate);
  });

  if (teamFilter !== 'all') {
    filteredBox = filteredBox.filter(b => String(b.team_id) === String(teamFilter) || String(b.opponent_team_id) === String(teamFilter));
  }

  filteredTeamBox = filteredBox;
  processedTeams = aggregateStats(filteredBox);

  const uniqueGameCount = new Set(filteredBox.map(b => b.game_id)).size || filteredGames.length;
  renderKPIs(processedTeams, uniqueGameCount);
  renderTable();
  
  if (processedTeams.length > 0) {
    renderPpgChart();
    renderScatterChart();
    renderThreePtChart();
    renderRadarChart();
    
    renderShotDistChart();
    renderBallSecurityChart();
    renderReboundingChart();
    renderEfficiencyMatrix();
    renderMarginTrendChart();

    renderShotAttemptsChart();
    renderBlowoutsChart();
    renderStreaksChart();
    renderHomeAwayChart();
  } else {
    Object.keys(charts).forEach(key => {
      if (charts[key]) {
        charts[key].destroy();
        charts[key] = null;
      }
    });
  }
}

function aggregateStats(data) {
  const teams = {};

  data.forEach(row => {
    const teamId = row.team_id;
    if (!teamId) return;

    if (!teams[teamId]) {
      const rawColor = String(row.team_color || "").replace('#', '');
      const color = rawColor ? `#${rawColor}` : TEAM_COLORS[Object.keys(teams).length % TEAM_COLORS.length];
      
      teams[teamId] = {
        id: teamId,
        name: String(row.team_display_name || row.team_name || `Team ${teamId}`).trim(),
        color: color,
        games: 0, wins: 0, points: 0, oppPoints: 0,
        fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
        reb: 0, ast: 0, to: 0
      };
    }

    const t = teams[teamId];
    t.games++;
    t.points += Number(row.team_score) || 0;
    t.oppPoints += Number(row.opponent_team_score) || 0;
    t.fgm += Number(row.field_goals_made) || 0;
    t.fga += Number(row.field_goals_attempted) || 0;
    t.tpm += Number(row.three_point_field_goals_made) || 0;
    t.tpa += Number(row.three_point_field_goals_attempted) || 0;
    t.ftm += Number(row.free_throws_made) || 0;
    t.fta += Number(row.free_throws_attempted) || 0;
    t.reb += Number(row.total_rebounds) || 0;
    t.ast += Number(row.assists) || 0;
    t.to += Number(row.turnovers) || 0;

    const isWin = row.team_winner === true || String(row.team_winner).toLowerCase() === 'true' || row.team_winner === 1 || row.team_winner === "1";
    if (isWin) t.wins++;
  });

  return Object.values(teams).map(t => {
    const ppg = t.games > 0 ? t.points / t.games : 0;
    const oppPpg = t.games > 0 ? t.oppPoints / t.games : 0;
    return {
      ...t,
      ppg,
      oppPpg,
      losses: t.games - t.wins,
      winPct: t.games > 0 ? t.wins / t.games : 0,
      fgPct: t.fga > 0 ? (t.fgm / t.fga) * 100 : 0,
      tpPct: t.tpa > 0 ? (t.tpm / t.tpa) * 100 : 0,
      rebPerGame: t.games > 0 ? t.reb / t.games : 0,
      astPerGame: t.games > 0 ? t.ast / t.games : 0,
      toPerGame: t.games > 0 ? t.to / t.games : 0,
      netRating: ppg - oppPpg
    };
  });
}

function renderKPIs(teams, gameCount) {
  const avgPpg = teams.length > 0 ? teams.reduce((s, t) => s + t.ppg, 0) / teams.length : 0;
  const topTeam = teams.length > 0 ? [...teams].sort((a, b) => b.ppg - a.ppg)[0] : { name: "N/A", ppg: 0 };

  const kpiTeams = document.getElementById("kpiTeams");
  const kpiGames = document.getElementById("kpiGames");
  const kpiAvgPpg = document.getElementById("kpiAvgPpg");
  const kpiTopTeam = document.getElementById("kpiTopTeam");

  if (kpiTeams) kpiTeams.innerText = `${teams.length} Teams`;
  if (kpiGames) kpiGames.innerText = `${gameCount} Games`;
  if (kpiAvgPpg) kpiAvgPpg.innerText = `${avgPpg.toFixed(1)} PPG`;
  if (kpiTopTeam) kpiTopTeam.innerText = teams.length > 0 ? `${topTeam.name.split(' ')[0]} (${topTeam.ppg.toFixed(1)})` : "N/A";
}

function renderTable() {
  let filtered = [...processedTeams];
  
  if (currentSearch) {
    filtered = filtered.filter(t => t.name.toLowerCase().includes(currentSearch));
  }

  filtered.sort((a, b) => {
    if (currentSort.col === 'rank') {
       return currentSort.dir === 'asc' ? a.winPct - b.winPct : b.winPct - a.winPct;
    }
    let valA = a[currentSort.col];
    let valB = b[currentSort.col];
    if (typeof valA === 'string' && typeof valB === 'string') {
      return currentSort.dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return currentSort.dir === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
  });

  const totalPages = Math.ceil(filtered.length / rowsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedData = filtered.slice(startIndex, endIndex);

  const tbody = document.getElementById("tableBody");
  if (!tbody) return;

  if (paginatedData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding: 24px; color: var(--text-muted);">No matching teams or games found for the selected filters.</td></tr>`;
    renderPaginationControls(1);
    return;
  }

  tbody.innerHTML = paginatedData.map((t, i) => {
    const netClass = t.netRating >= 0 ? "net-pos" : "net-neg";
    const netSign = t.netRating > 0 ? "+" : "";
    const shortName = t.name.replace("Women's ", "");
    const globalRank = startIndex + i + 1;

    return `
      <tr>
        <td style="color: var(--text-muted);">#${globalRank}</td>
        <td><div class="team-cell"><span class="team-dot" style="background:${t.color}"></span>${shortName}</div></td>
        <td>${t.wins}</td>
        <td>${t.losses}</td>
        <td>${(t.winPct * 100).toFixed(1)}%</td>
        <td style="font-weight:700;">${t.ppg.toFixed(1)}</td>
        <td>${t.oppPpg.toFixed(1)}</td>
        <td>${t.fgPct.toFixed(1)}%</td>
        <td>${t.tpPct.toFixed(1)}%</td>
        <td>${t.rebPerGame.toFixed(1)}</td>
        <td>${t.astPerGame.toFixed(1)}</td>
        <td>${t.toPerGame.toFixed(1)}</td>
        <td class="${netClass}">${netSign}${t.netRating.toFixed(1)}</td>
      </tr>
    `;
  }).join("");

  renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
  const controls = document.getElementById('paginationControls');
  if (!controls) return;

  let html = `<button class="btn-page" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">Previous</button>`;

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="btn-page ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }
  html += `<button class="btn-page" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Next</button>`;

  controls.innerHTML = html;
}

window.changePage = function(page) {
  currentPage = page;
  renderTable();
};

function renderPpgChart() {
  if (charts.ppg) charts.ppg.destroy();
  const top8 = [...processedTeams].sort((a, b) => b.winPct - a.winPct).slice(0, 8);
  const canvas = document.getElementById('ppgChart');
  if (!canvas) return;

  charts.ppg = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top8.map(t => t.name.split(' ')[0]),
      datasets: [
        { label: 'Offense (PPG)', data: top8.map(t => t.ppg), backgroundColor: '#e63946', borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.5 },
        { label: 'Defense (OPP PPG)', data: top8.map(t => t.oppPpg), backgroundColor: '#334155', borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.5 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'rect' } } }, scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } } }
  });
}

function renderScatterChart() {
  if (charts.scatter) charts.scatter.destroy();
  const canvas = document.getElementById('scatterChart');
  if (!canvas) return;

  charts.scatter = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Teams',
        data: processedTeams.map(t => ({ x: t.ppg, y: t.oppPpg, name: t.name })),
        backgroundColor: processedTeams.map(t => t.color),
        borderColor: '#fff',
        borderWidth: 1,
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.raw.name}: ${c.raw.x.toFixed(1)} PPG | ${c.raw.y.toFixed(1)} OPP` } }
      },
      scales: {
        x: { title: { display: true, text: 'Offensive PPG (Higher is Better)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { title: { display: true, text: 'Defensive OPP PPG (Lower is Better)' }, reverse: true, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function renderThreePtChart() {
  if (charts.threePt) charts.threePt.destroy();
  const validTeams = processedTeams.filter(t => t.tpa > 0).sort((a, b) => b.tpPct - a.tpPct).slice(0, 10);
  const canvas = document.getElementById('threePtChart');
  if (!canvas) return;

  charts.threePt = new Chart(canvas, {
    type: 'line',
    data: {
      labels: validTeams.map(t => t.name.split(' ')[0]),
      datasets: [{
        label: '3PT Field Goal %',
        data: validTeams.map(t => t.tpPct),
        borderColor: '#f5a623',
        backgroundColor: 'rgba(245, 166, 35, 0.1)',
        borderWidth: 2, pointBackgroundColor: '#f5a623', pointBorderColor: '#121826', pointBorderWidth: 2, pointRadius: 4, fill: true, tension: 0.3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'rect' } } },
      scales: { 
        y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }, 
        x: { grid: { display: false } } 
      }
    }
  });
}

function renderRadarChart() {
  if (charts.radar) charts.radar.destroy();
  const team1Id = document.getElementById('radarTeam1') ? document.getElementById('radarTeam1').value : null;
  const team2Id = document.getElementById('radarTeam2') ? document.getElementById('radarTeam2').value : null;
  
  const t1 = processedTeams.find(t => String(t.id) === String(team1Id)) || processedTeams[0];
  const t2 = processedTeams.find(t => String(t.id) === String(team2Id)) || processedTeams[1] || processedTeams[0];
  if (!t1 || !t2) return;

  const maxPpg = Math.max(...processedTeams.map(t => t.ppg)) || 1;
  const maxOppPpg = Math.max(...processedTeams.map(t => t.oppPpg)) || 1;
  const maxFg = 60, maxTp = 45, maxReb = 45, maxAst = 25;

  const getMetrics = (t) => [
    (t.ppg / maxPpg) * 100,
    100 - ((t.oppPpg / maxOppPpg) * 100),
    (t.fgPct / maxFg) * 100,
    (t.tpPct / maxTp) * 100,
    (t.rebPerGame / maxReb) * 100,
    (t.astPerGame / maxAst) * 100
  ];

  const canvas = document.getElementById('radarChart');
  if (!canvas) return;

  const isLight = document.body.classList.contains('light-mode');

  charts.radar = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['Scoring', 'Defense', 'FG%', '3P%', 'Rebounding', 'Playmaking'],
      datasets: [
        { label: t1.name, data: getMetrics(t1), backgroundColor: 'rgba(230, 57, 70, 0.2)', borderColor: '#e63946', pointBackgroundColor: '#e63946', borderWidth: 2 },
        { label: t2.name, data: getMetrics(t2), backgroundColor: 'rgba(91, 140, 255, 0.2)', borderColor: '#5b8cff', pointBackgroundColor: '#5b8cff', borderWidth: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } } },
      scales: { 
        r: { 
          angleLines: { color: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }, 
          grid: { color: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }, 
          pointLabels: { color: isLight ? '#1e293b' : '#e8edf5', font: { size: 11 } }, 
          ticks: { display: false }, 
          min: 0, 
          max: 100 
        } 
      }
    }
  });
}

function renderShotDistChart() {
  if (charts.shotDist) charts.shotDist.destroy();
  let total2Pts = 0, total3Pts = 0, totalFTPts = 0;
  processedTeams.forEach(t => {
    total3Pts += t.tpm * 3;
    totalFTPts += t.ftm;
    const twoPtMade = Math.max(0, t.fgm - t.tpm);
    total2Pts += twoPtMade * 2;
  });

  const canvas = document.getElementById('shotDistChart');
  if (!canvas) return;

  charts.shotDist = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['2-Pointers', '3-Pointers', 'Free Throws'],
      datasets: [{
        data: [total2Pts, total3Pts, totalFTPts],
        backgroundColor: ['#5b8cff', '#f5a623', '#2dd4a7'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, padding: 20 } },
        tooltip: {
          callbacks: {
            label: (c) => {
              const total = c.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((c.raw / total) * 100).toFixed(1) : 0;
              return ` ${c.label}: ${c.raw.toLocaleString()} pts (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderBallSecurityChart() {
  if (charts.ballSecurity) charts.ballSecurity.destroy();
  const canvas = document.getElementById('ballSecurityChart');
  if (!canvas) return;

  charts.ballSecurity = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Teams',
        data: processedTeams.map(t => ({ x: t.astPerGame, y: t.toPerGame, name: t.name })),
        backgroundColor: processedTeams.map(t => t.color),
        borderColor: '#fff',
        borderWidth: 1,
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.raw.name}: ${c.raw.x.toFixed(1)} AST | ${c.raw.y.toFixed(1)} TO` } }
      },
      scales: {
        x: { title: { display: true, text: 'Assists Per Game (Higher is Better)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { title: { display: true, text: 'Turnovers Per Game (Lower is Better)' }, reverse: true, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function renderReboundingChart() {
  if (charts.rebounding) charts.rebounding.destroy();
  const sorted = [...processedTeams].sort((a, b) => b.rebPerGame - a.rebPerGame).slice(0, 10);
  const canvas = document.getElementById('reboundingChart');
  if (!canvas) return;

  charts.rebounding = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(t => t.name.split(' ')[0]),
      datasets: [{
        label: 'Rebounds Per Game',
        data: sorted.map(t => t.rebPerGame),
        backgroundColor: sorted.map(t => t.color),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }, y: { grid: { display: false } } }
    }
  });
}

function renderEfficiencyMatrix() {
  if (charts.efficiencyMatrix) charts.efficiencyMatrix.destroy();
  const sorted = [...processedTeams].sort((a, b) => b.winPct - a.winPct).slice(0, 10);
  const canvas = document.getElementById('efficiencyMatrixChart');
  if (!canvas) return;

  const maxPpg = Math.max(...processedTeams.map(t => t.ppg)) || 1;
  const maxOppPpg = Math.max(...processedTeams.map(t => t.oppPpg)) || 1;
  const maxFg = 60, maxReb = 45;

  charts.efficiencyMatrix = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(t => t.name.split(' ')[0]),
      datasets: [
        { label: 'Offense', data: sorted.map(t => (t.ppg / maxPpg) * 100), backgroundColor: 'rgba(230, 57, 70, 0.8)', borderRadius: 2 },
        { label: 'Defense', data: sorted.map(t => (1 - (t.oppPpg / maxOppPpg)) * 100), backgroundColor: 'rgba(45, 212, 167, 0.8)', borderRadius: 2 },
        { label: 'Shooting', data: sorted.map(t => (t.fgPct / maxFg) * 100), backgroundColor: 'rgba(91, 140, 255, 0.8)', borderRadius: 2 },
        { label: 'Rebounding', data: sorted.map(t => (t.rebPerGame / maxReb) * 100), backgroundColor: 'rgba(245, 166, 35, 0.8)', borderRadius: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'rect' } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw.toFixed(1)} rating` } }
      },
      scales: { x: { stacked: false, grid: { display: false } }, y: { max: 100, grid: { color: 'rgba(255,255,255,0.05)' } } }
    }
  });
}

function renderMarginTrendChart() {
  if (charts.marginTrend) charts.marginTrend.destroy();
  const canvas = document.getElementById('marginTrendChart');
  if (!canvas) return;

  const teamFilterEl = document.getElementById('teamFilter');
  const targetTeamId = (teamFilterEl && teamFilterEl.value !== 'all') 
    ? teamFilterEl.value 
    : (processedTeams.length > 0 ? [...processedTeams].sort((a, b) => b.winPct - a.winPct)[0].id : null);

  if (!targetTeamId) return;

  const targetTeamName = processedTeams.find(t => String(t.id) === String(targetTeamId))?.name || 'Team';

  const teamGames = filteredTeamBox
    .filter(b => String(b.team_id) === String(targetTeamId))
    .map(b => ({
      date: b.game_date || b.game_date_time,
      margin: (Number(b.team_score) || 0) - (Number(b.opponent_team_score) || 0),
      isWin: b.team_winner === true || String(b.team_winner).toLowerCase() === 'true' || b.team_winner === 1 || b.team_winner === "1"
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  charts.marginTrend = new Chart(canvas, {
    type: 'line',
    data: {
      labels: teamGames.map((g, i) => `G${i + 1}`),
      datasets: [{
        label: `${targetTeamName} Point Margin`,
        data: teamGames.map(g => g.margin),
        borderColor: '#5b8cff',
        backgroundColor: 'rgba(91, 140, 255, 0.1)',
        borderWidth: 2,
        pointBackgroundColor: teamGames.map(g => g.isWin ? '#2dd4a7' : '#e63946'),
        pointBorderColor: '#121826',
        pointBorderWidth: 2,
        pointRadius: 4,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } },
        tooltip: { callbacks: { label: (c) => `Margin: ${c.raw > 0 ? '+' : ''}${c.raw} pts` } }
      },
      scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Point Differential' } } }
    }
  });
}

function renderShotAttemptsChart() {
  if (charts.shotAttempts) charts.shotAttempts.destroy();
  let total2PA = 0, total3PA = 0, totalFTA = 0;
  processedTeams.forEach(t => {
    total3PA += (Number(t.tpa) || 0);
    totalFTA += (Number(t.fta) || 0);
    total2PA += Math.max(0, (Number(t.fga) || 0) - (Number(t.tpa) || 0));
  });

  const canvas = document.getElementById('shotAttemptsChart');
  if (!canvas) return;

  const isLight = document.body.classList.contains('light-mode');

  charts.shotAttempts = new Chart(canvas, {
    type: 'polarArea',
    data: {
      labels: ['2-Point Attempts', '3-Point Attempts', 'Free Throw Attempts'],
      datasets: [{
        data: [total2PA, total3PA, totalFTA],
        backgroundColor: ['rgba(91, 140, 255, 0.7)', 'rgba(245, 166, 35, 0.7)', 'rgba(45, 212, 167, 0.7)'],
        borderColor: ['#5b8cff', '#f5a623', '#2dd4a7'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: (c) => {
              const total = c.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((c.raw / total) * 100).toFixed(1) : 0;
              return ` ${c.label}: ${c.raw.toLocaleString()} (${pct}%)`;
            }
          }
        }
      },
      scales: { r: { ticks: { display: false }, grid: { color: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' } } }
    }
  });
}

function renderBlowoutsChart() {
  if (charts.blowouts) charts.blowouts.destroy();
  const canvas = document.getElementById('blowoutsChart');
  if (!canvas) return;

  const blowouts = filteredTeamBox
    .map(b => {
      const score = Number(b.team_score) || 0;
      const oppScore = Number(b.opponent_team_score) || 0;
      return {
        team: b.team_display_name || b.team_name || 'Unknown',
        opp: b.opponent_team_display_name || b.opponent_team_name || 'Unknown',
        score: score,
        oppScore: oppScore,
        margin: score - oppScore,
        color: b.team_color ? `#${String(b.team_color).replace('#','')}` : '#5b8cff'
      };
    })
    .filter(g => g.margin > 0)
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10);

  if (blowouts.length === 0) return;

  charts.blowouts = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: blowouts.map(g => `${g.team.split(' ')[0]} vs ${g.opp.split(' ')[0]}`),
      datasets: [
        { label: 'Winner Score', data: blowouts.map(g => g.score), backgroundColor: blowouts.map(g => g.color), borderRadius: 4, stack: 'stack0' },
        { label: 'Loser Score', data: blowouts.map(g => g.oppScore), backgroundColor: 'rgba(51, 65, 85, 0.8)', borderRadius: 4, stack: 'stack0' }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const game = blowouts[c.dataIndex];
              return c.datasetIndex === 0 ? `Winner: ${game.score}` : `Loser: ${game.oppScore} (Margin: +${game.margin})`;
            }
          }
        }
      },
      scales: { x: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { stacked: true, grid: { display: false } } }
    }
  });
}

function renderStreaksChart() {
  if (charts.streaks) charts.streaks.destroy();
  const canvas = document.getElementById('streaksChart');
  if (!canvas) return;

  const teamStreaks = processedTeams.map(team => {
    const games = filteredTeamBox
      .filter(b => String(b.team_id) === String(team.id))
      .sort((a, b) => new Date(a.game_date || a.game_date_time) - new Date(b.game_date || b.game_date_time));
    
    let maxStreak = 0, currentStreak = 0;
    games.forEach(g => {
      const isWin = g.team_winner === true || String(g.team_winner).toLowerCase() === 'true' || g.team_winner === 1 || g.team_winner === "1";
      if (isWin) {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    });
    return { name: team.name.split(' ')[0], streak: maxStreak, color: team.color };
  })
  .sort((a, b) => b.streak - a.streak)
  .slice(0, 10);

  if (teamStreaks.length === 0 || teamStreaks[0].streak === 0) return;

  charts.streaks = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: teamStreaks.map(t => t.name),
      datasets: [{
        label: 'Longest Win Streak',
        data: teamStreaks.map(t => t.streak),
        backgroundColor: teamStreaks.map(t => t.color),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true, ticks: { stepSize: 2 } }, y: { grid: { display: false } } }
    }
  });
}

function renderHomeAwayChart() {
  if (charts.homeAway) charts.homeAway.destroy();
  const canvas = document.getElementById('homeAwayChart');
  if (!canvas) return;

  const topTeams = [...processedTeams].sort((a, b) => b.winPct - a.winPct).slice(0, 3);

  const getTeamHomeAwayStats = (teamId) => {
    let homePts = 0, homeGames = 0, awayPts = 0, awayGames = 0;
    filteredTeamBox.filter(b => String(b.team_id) === String(teamId)).forEach(g => {
      const location = String(g.team_home_away || g.home_away || '').toLowerCase().trim();
      const pts = Number(g.team_score) || 0;
      if (location === 'home') { homePts += pts; homeGames++; }
      else if (location === 'away') { awayPts += pts; awayGames++; }
    });
    return {
      homePPG: homeGames > 0 ? homePts / homeGames : 0,
      awayPPG: awayGames > 0 ? awayPts / awayGames : 0
    };
  };

  const statsList = topTeams.map(t => ({
    name: t.name.split(' ')[0],
    ...getTeamHomeAwayStats(t.id)
  }));

  charts.homeAway = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: statsList.map(s => s.name),
      datasets: [
        { label: 'Home PPG', data: statsList.map(s => s.homePPG), backgroundColor: '#2dd4a7', borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.5 },
        { label: 'Away PPG', data: statsList.map(s => s.awayPPG), backgroundColor: '#5b8cff', borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'rect' } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw.toFixed(1)} PPG` } }
      },
      scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } }
    }
  });
}

function exportToCSV() {
  let filtered = [...processedTeams];
  if (currentSearch) filtered = filtered.filter(t => t.name.toLowerCase().includes(currentSearch));
  
  filtered.sort((a, b) => {
    if (currentSort.col === 'rank') return currentSort.dir === 'asc' ? a.winPct - b.winPct : b.winPct - a.winPct;
    let valA = a[currentSort.col];
    let valB = b[currentSort.col];
    if (typeof valA === 'string' && typeof valB === 'string') return currentSort.dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    return currentSort.dir === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
  });

  const headers = ["Rank", "Team", "W", "L", "Win %", "PPG", "OPP PPG", "FG%", "3P%", "REB", "AST", "TO", "Net Rating"];
  const csvRows = filtered.map((t, i) => [
    i + 1, `"${t.name}"`, t.wins, t.losses, (t.winPct * 100).toFixed(1) + "%", 
    t.ppg.toFixed(1), t.oppPpg.toFixed(1), t.fgPct.toFixed(1) + "%", t.tpPct.toFixed(1) + "%",
    t.rebPerGame.toFixed(1), t.astPerGame.toFixed(1), t.toPerGame.toFixed(1), t.netRating.toFixed(1)
  ]);

  const csvContent = [headers, ...csvRows].map(e => e.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "big_ten_wbb_filtered.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
