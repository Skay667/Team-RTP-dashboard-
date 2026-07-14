/* ==========================================================================
   TEAM RTP — DASHBOARD GT7
   Script principal : gestion des chronos, vote, recherche, filtres,
   génération des secteurs et horloge en direct.
   Aucune dépendance externe — JavaScript natif uniquement.
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. DONNÉES INITIALES
   ========================================================================== */

const CIRCUIT_NAME = 'Grande Vallée - Long - Sens Classique';

// Chaque tour possède : voiture, temps (chaîne "m:ss.mmm"), catégorie
let laps = [
  { car: 'Porsche 911 Turbo S',        time: '1:48.254', category: 'BAC' },
  { car: 'BMW M4',                     time: '1:52.159', category: 'BAC' },
  { car: 'Dodge Charger SRT Hellcat',  time: '1:53.827', category: 'BAC' },
  { car: 'Toyota Crown Athlete G',     time: '1:55.464', category: 'BAC' },
  { car: 'Nissan GT-R (non préparée)', time: '1:57.519', category: 'BAC' },
  { car: 'Renault Mégane RS',          time: '1:58.500', category: 'BAC' },
];

// Secteurs fixes fournis pour la BMW M4 (référence de cohérence)
const FIXED_SECTORS = {
  'BMW M4': { s1: 36.452, s2: 39.281, s3: 36.426 },
};

// Membres pour le système de vote des modérateurs
const voteState = {
  'lacoste-jordan': 0,
  'Tom_Gamer035': 0,
  'yasumi-juju-17': 0,
  'Zefrox_38': 0,
  'skahlard29': 0,
};

let currentFilter = 'Toutes';
let currentSearch = '';
let previousBestTime = null; // pour détecter un nouveau record

/* ==========================================================================
   2. UTILITAIRES TEMPS
   ========================================================================== */

// Convertit "1:48.254" -> millisecondes
function timeToMs(str) {
  const match = /^(\d{1,2}):(\d{2})\.(\d{3})$/.exec(str.trim());
  if (!match) return Infinity;
  const [, min, sec, ms] = match;
  return (parseInt(min, 10) * 60 + parseInt(sec, 10)) * 1000 + parseInt(ms, 10);
}

// Convertit des millisecondes -> "1:48.254"
function msToTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.round(ms % 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

// Formate un nombre de secondes (float) en "36.452"
function secToStr(sec) {
  return sec.toFixed(3);
}

/* ==========================================================================
   3. GÉNÉRATION DES SECTEURS (déterministe par voiture)
   ========================================================================== */

// Petit générateur pseudo-aléatoire seedé (déterministe selon le nom de la voiture)
function seededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
  }
  return function () {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

// Génère 3 secteurs cohérents dont la somme = temps total (en secondes)
function generateSectors(car, totalMs) {
  if (FIXED_SECTORS[car]) return FIXED_SECTORS[car];

  const totalSec = totalMs / 1000;
  const rng = seededRandom(car);

  // Répartition réaliste : secteur 2 souvent le plus long (ligne droite / techniques)
  const r1 = 0.30 + rng() * 0.05; // ~30-35%
  const r2 = 0.35 + rng() * 0.05; // ~35-40%
  const r3 = 1 - r1 - r2;

  return {
    s1: totalSec * r1,
    s2: totalSec * r2,
    s3: totalSec * r3,
  };
}

// Génère un "dernier tour" légèrement plus lent que le meilleur tour (déterministe)
function generateLastLapMs(car, bestMs) {
  const rng = seededRandom(car + '-last');
  const extraMs = 180 + rng() * 1400; // entre +0.18s et +1.58s
  return bestMs + extraMs;
}

/* ==========================================================================
   4. TRI ET CLASSEMENT
   ========================================================================== */

function sortLaps() {
  laps.sort((a, b) => timeToMs(a.time) - timeToMs(b.time));
}

function getFilteredLaps() {
  return laps.filter((lap) => {
    const matchesFilter = currentFilter === 'Toutes' || lap.category === currentFilter;
    const matchesSearch = lap.car.toLowerCase().includes(currentSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });
}

/* ==========================================================================
   5. RENDU — TABLEAU DE CLASSEMENT PRINCIPAL
   ========================================================================== */

const medals = ['🥇', '🥈', '🥉'];

function renderRankingTable(highlightCar) {
  sortLaps();
  const tbody = document.getElementById('ranking-body');
  tbody.innerHTML = '';

  const visible = getFilteredLaps();

  if (visible.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:1.5rem;">Aucun véhicule ne correspond à la recherche.</td></tr>`;
    return;
  }

  visible.forEach((lap) => {
    // La position réelle est calculée sur le tableau complet trié, pas sur la vue filtrée
    const realPos = laps.findIndex((l) => l === lap) + 1;
    const tr = document.createElement('tr');
    tr.className = `rank-${realPos <= 3 ? realPos : ''}`;
    if (lap.car === highlightCar) tr.classList.add('row-new');

    const medal = realPos <= 3 ? `<span class="rank-medal">${medals[realPos - 1]}</span>` : '';

    tr.innerHTML = `
      <td>${medal}</td>
      <td class="pos-cell">${realPos}</td>
      <td>${lap.car}<span class="tag-cat">${lap.category}</span></td>
      <td>${CIRCUIT_NAME}</td>
      <td class="time-cell">${lap.time}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   6. RENDU — TABLEAU STYLE GT7
   ========================================================================== */

function renderGT7Table() {
  sortLaps();
  const tbody = document.getElementById('gt7-body');
  tbody.innerHTML = '';

  const bestOverallMs = timeToMs(laps[0].time);
  let bestSectorValue = Infinity;
  let bestSectorLabel = '';

  laps.forEach((lap, index) => {
    const bestMs = timeToMs(lap.time);
    const sectors = generateSectors(lap.car, bestMs);
    const lastLapMs = generateLastLapMs(lap.car, bestMs);
    const deltaMs = bestMs - bestOverallMs;

    // Suivi du meilleur secteur toutes voitures confondues
    [['S1', sectors.s1], ['S2', sectors.s2], ['S3', sectors.s3]].forEach(([label, val]) => {
      if (val < bestSectorValue) {
        bestSectorValue = val;
        bestSectorLabel = `${label} ${secToStr(val)} — ${lap.car}`;
      }
    });

    const deltaLabel = deltaMs === 0
      ? '0.000'
      : `+${(deltaMs / 1000).toFixed(3)}`;
    const deltaClass = deltaMs === 0 ? 'delta-zero' : 'delta-positive';

    const tr = document.createElement('tr');
    if (index === 0) tr.classList.add('leader-row');

    tr.innerHTML = `
      <td class="pos-cell">${index + 1}</td>
      <td>${lap.car}</td>
      <td class="time-cell">${lap.time}</td>
      <td class="time-cell">${msToTime(lastLapMs)}</td>
      <td class="sector-cell">${secToStr(sectors.s1)}</td>
      <td class="sector-cell">${secToStr(sectors.s2)}</td>
      <td class="sector-cell">${secToStr(sectors.s3)}</td>
      <td class="delta-cell ${deltaClass}">${deltaLabel}</td>
    `;
    tbody.appendChild(tr);
  });

  // Met à jour le widget "meilleur secteur"
  const statBestSector = document.getElementById('stat-best-sector');
  if (statBestSector) statBestSector.textContent = bestSectorLabel || '—';
}

/* ==========================================================================
   7. RENDU — STATISTIQUES
   ========================================================================== */

function flashElement(el) {
  el.classList.remove('stat-flash');
  void el.offsetWidth; // force reflow pour rejouer l'animation
  el.classList.add('stat-flash');
}

function renderStats() {
  sortLaps();
  const best = laps[0];

  document.getElementById('stat-vehicles').textContent = laps.length;
  document.getElementById('stat-laps').textContent = laps.length;

  const bestTimeEl = document.getElementById('stat-best-time');
  const bestCarEl = document.getElementById('stat-best-car');

  bestTimeEl.textContent = best.time;
  bestCarEl.textContent = best.car;

  // Détection d'un nouveau record du circuit
  const bestMs = timeToMs(best.time);
  if (previousBestTime !== null && bestMs < previousBestTime) {
    flashElement(bestTimeEl);
    flashElement(bestCarEl);
    showRecordBadge();
  }
  previousBestTime = bestMs;
}

function showRecordBadge() {
  const badge = document.getElementById('record-badge');
  badge.hidden = false;
  clearTimeout(showRecordBadge._timer);
  showRecordBadge._timer = setTimeout(() => { badge.hidden = true; }, 4000);
}

/* ==========================================================================
   8. RENDU GLOBAL
   ========================================================================== */

function renderAll(highlightCar) {
  renderRankingTable(highlightCar);
  renderGT7Table();
  renderStats();
}

/* ==========================================================================
   9. FORMULAIRE D'AJOUT DE CHRONO
   ========================================================================== */

const lapForm = document.getElementById('lap-form');

lapForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const carInput = document.getElementById('input-car');
  const timeInput = document.getElementById('input-time');
  const categoryInput = document.getElementById('input-category');

  const carName = carInput.value.trim();
  const timeValue = timeInput.value.trim();
  const category = categoryInput.value;

  // Validation du format m:ss.mmm
  if (!/^\d{1,2}:\d{2}\.\d{3}$/.test(timeValue)) {
    timeInput.focus();
    timeInput.reportValidity();
    return;
  }

  laps.push({ car: carName, time: timeValue, category });
  renderAll(carName);

  lapForm.reset();
  carInput.focus();
});

/* ==========================================================================
   10. RECHERCHE ET FILTRES
   ========================================================================== */

const searchInput = document.getElementById('search-input');
searchInput.addEventListener('input', (event) => {
  currentSearch = event.target.value;
  renderRankingTable();
});

const filterButtons = document.querySelectorAll('.filter-btn');
filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterButtons.forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    currentFilter = btn.dataset.filter;
    renderRankingTable();
  });
});

/* ==========================================================================
   11. SYSTÈME DE VOTE — POLICE RP
   ========================================================================== */

function renderVoteList() {
  const container = document.getElementById('vote-list');
  container.innerHTML = '';

  const totalVotes = Object.values(voteState).reduce((sum, v) => sum + v, 0);

  Object.keys(voteState).forEach((member) => {
    const votes = voteState[member];
    const percent = totalVotes === 0 ? 0 : Math.round((votes / totalVotes) * 100);

    const row = document.createElement('div');
    row.className = 'vote-row';
    row.innerHTML = `
      <span class="vote-name">${member}</span>
      <div class="vote-bar-track">
        <div class="vote-bar-fill" style="width:${percent}%"></div>
      </div>
      <span class="vote-count">${votes}</span>
      <button class="btn btn--vote" data-member="${member}">Voter</button>
    `;
    container.appendChild(row);
  });

  // Attache les écouteurs sur les boutons Voter fraîchement créés
  container.querySelectorAll('.btn--vote').forEach((btn) => {
    btn.addEventListener('click', () => {
      const member = btn.dataset.member;
      voteState[member] += 1;
      renderVoteList();
    });
  });
}

document.getElementById('reset-votes-btn').addEventListener('click', () => {
  Object.keys(voteState).forEach((member) => { voteState[member] = 0; });
  renderVoteList();
});

/* ==========================================================================
   12. HORLOGE EN DIRECT
   ========================================================================== */

function updateClock() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  document.getElementById('live-date').textContent = dateStr;
  document.getElementById('live-time').textContent = timeStr;
}

/* ==========================================================================
   13. INITIALISATION
   ========================================================================== */

function init() {
  previousBestTime = timeToMs([...laps].sort((a, b) => timeToMs(a.time) - timeToMs(b.time))[0].time);
  renderAll();
  renderVoteList();
  updateClock();
  setInterval(updateClock, 1000);
}

document.addEventListener('DOMContentLoaded', init);
