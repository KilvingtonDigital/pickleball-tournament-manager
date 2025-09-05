import React, { useEffect, useMemo, useState } from 'react';
import InstallPrompt from './InstallPrompt';

/* =====================  BRAND UI PRIMITIVES  ===================== */
const Button = ({ className = '', ...props }) => (
  <button
    className={`inline-flex items-center justify-center rounded-xl px-4 h-11 text-sm font-semibold shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-secondary ${className}`}
    {...props}
  />
);
const Card = ({ className = '', ...props }) => (
  <div className={`rounded-2xl border border-brand-gray bg-brand-light p-3 sm:p-4 shadow-soft ${className}`} {...props} />
);
const Field = ({ label, children, hint }) => (
  <label className="block text-sm font-medium text-brand-primary">
    <span>{label}</span>
    <div className="mt-1">{children}</div>
    {hint ? <p className="mt-1 text-xs text-brand-primary/70">{hint}</p> : null}
  </label>
);

/* =====================  HELPERS  ===================== */
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const avg = (t) => (t[0].rating + t[1].rating) / 2;
const teamKey = (team) => [team[0].id, team[1].id].sort().join('__');

/* ---- Build export payload ---- */
const buildResults = (players, rounds, meta) => {
  const matches = [];
  rounds.forEach((r, rIdx) =>
    r.forEach((m) => {
      const s1 = typeof m.score1 === 'number' ? m.score1 : Number(m.score1) || 0;
      const s2 = typeof m.score2 === 'number' ? m.score2 : Number(m.score2) || 0;
      matches.push({
        round: rIdx + 1,
        court: m.court,
        team1: m.team1?.map((p) => ({ id: p.id, name: p.name, rating: p.rating })),
        team2: m.team2?.map((p) => ({ id: p.id, name: p.name, rating: p.rating })),
        score1: s1,
        score2: s2,
        status: m.status,
        winner: m.status === 'completed' ? (s1 > s2 ? 'team1' : 'team2') : null,
      });
    })
  );
  return { generatedAt: new Date().toISOString(), players, matches, meta };
};

/* ---- CSV + download ---- */
const toCSV = (results) => {
  const header = [
    'round','court',
    't1_p1','t1_p1_rating','t1_p2','t1_p2_rating',
    't2_p1','t2_p1_rating','t2_p2','t2_p2_rating',
    'score1','score2','winner'
  ];
  const rows = results.matches.map((m) =>
    [
      m.round, m.court,
      m.team1?.[0]?.name || '', m.team1?.[0]?.rating || '',
      m.team1?.[1]?.name || '', m.team1?.[1]?.rating || '',
      m.team2?.[0]?.name || '', m.team2?.[0]?.rating || '',
      m.team2?.[1]?.name || '', m.team2?.[1]?.rating || '',
      m.score1, m.score2, m.winner || ''
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
  );
  return [header.join(','), ...rows].join('\n');
};

const downloadFile = (filename, content, type = 'text/csv;charset=utf-8') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/* =====================  EMAIL (EmailJS) – OPTIONAL (silent)  ===================== */
const EMAILJS_SERVICE_ID = 'service_7c3umkg';
const EMAILJS_TEMPLATE_ID = 'template_g772hi6';
const EMAILJS_PUBLIC_KEY = '6sKFOLZBoZNoeSSw0';

async function emailCSV(csvText, filename) {
  try {
    const hasEmailJS =
      typeof window !== 'undefined' &&
      (window.emailjs || (window && window['emailjs']));
    if (!hasEmailJS || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) return false;
    const emailjs = window.emailjs || window['emailjs'];
    if (!emailjs) return false;

    await emailjs.init(EMAILJS_PUBLIC_KEY);
    const base64 = btoa(unescape(encodeURIComponent(csvText)));
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: 'info@kilvingtondigital.com',
      file_name: filename,
      file_data: base64,
      generated_at: new Date().toISOString(),
      session_meta: 'SmashBoard CSV archive'
    });
    return true;
  } catch { return false; }
}

/* =====================  MAIN COMPONENT  ===================== */
const PickleballTournamentManager = () => {
  /* ---------- Players ---------- */
  const [players, setPlayers] = useState([]);
  const [form, setForm] = useState({ name: '', rating: '', gender: 'male' });
  const [bulkText, setBulkText] = useState('');

  /* tiny success toast for single add */
  const [addNote, setAddNote] = useState(null);

  /* ---------- Session ---------- */
  const [courts, setCourts] = useState(4);
  const [sessionMinutes, setSessionMinutes] = useState(120);
  const [minutesPerRound, setMinutesPerRound] = useState(20);
  const totalRounds = Math.max(1, Math.floor(sessionMinutes / minutesPerRound));

  /* ---------- Tournament ---------- */
  const [tournamentType, setTournamentType] = useState('round_robin');

  /* ---------- Schedule ---------- */
  const [rounds, setRounds] = useState([]);

  /* ---------- UI ---------- */
  const [tab, setTab] = useState('setup');       // 'setup' | 'roster' | 'schedule'
  const [endOpen, setEndOpen] = useState(false);
  const [exportedThisSession, setExportedThisSession] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const [locked, setLocked] = useState(false);   // lock after the first completed score

  /* ---------- Records / Brackets ---------- */
  const [teamRecords, setTeamRecords] = useState({});
  const [bracketLinks, setBracketLinks] = useState({});

  /* ---------- Load + persist ---------- */
  useEffect(() => {
    const savedRoster = localStorage.getItem('pb_roster');
    if (savedRoster) {
      try { setPlayers(JSON.parse(savedRoster)); } catch {}
    }
    setCanRestore(!!localStorage.getItem('pb_session'));
  }, []);

  useEffect(() => {
    localStorage.setItem('pb_roster', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    const snapshot = {
      players, rounds, teamRecords, bracketLinks,
      meta: { courts, sessionMinutes, minutesPerRound, tournamentType, ts: Date.now() },
      locked
    };
    localStorage.setItem('pb_session', JSON.stringify(snapshot));
  }, [players, rounds, teamRecords, bracketLinks, courts, sessionMinutes, minutesPerRound, tournamentType, locked]);

  /* ---------- Leave-page guard ---------- */
  useEffect(() => {
    const handler = (e) => {
      if (!rounds.length || exportedThisSession) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [rounds.length, exportedThisSession]);

  const presentPlayers = useMemo(() => players.filter((p) => p.present !== false), [players]);

  /* =====================  ROSTER  ===================== */
  const addPlayer = () => {
    const name = form.name.trim();
    const rating = Number(form.rating);
    if (!name) return alert('Name is required');
    if (Number.isNaN(rating) || rating < 2.0 || rating > 5.5) return alert('Enter DUPR 2.0 – 5.5');
    setPlayers((prev) => [...prev, { id: uid(), name, rating, gender: form.gender, present: true }]);
    setForm({ name: '', rating: '', gender: 'male' });

    // success note (auto-hide)
    setAddNote(`Added ${name} — check Roster`);
    setTimeout(() => setAddNote(null), 2000);
  };
  const removePlayer = (id) => setPlayers((prev) => prev.filter((p) => p.id !== id));
  const togglePresent = (id) => setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, present: !p.present } : p)));
  const updatePlayerField = (id, field, value) =>
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: field === 'rating' ? Number(value) : value } : p)));

  // Bulk add – case-insensitive gender
  const parseBulk = () => {
    const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const add = [];
    const normalizeGender = (g) => {
      if (!g) return 'male';
      const s = g.toString().trim().toLowerCase();
      if (['f','female','woman','w'].includes(s)) return 'female';
      if (['m','male','man','men'].includes(s)) return 'male';
      return 'male';
    };
    for (const line of lines) {
      const [name, ratingStr, gender] = line.split(',').map((s) => (s ?? '').trim());
      const rating = Number(ratingStr);
      if (!name || Number.isNaN(rating)) continue;
      add.push({ id: uid(), name, rating, gender: normalizeGender(gender), present: true });
    }
    if (!add.length) return alert('Nothing to add. Use: Name, Rating, Gender');
    setPlayers((prev) => [...prev, ...add]);
    setBulkText('');
  };

  /* =====================  SCHEDULING  ===================== */
  const teamSplitScore = (t1, t2, map) => {
    const tKey = (a, b) => [a.id, b.id].sort().join('-');
    const rep = (map.get(tKey(t1[0], t1[1])) || 0 ? 10 : 0) + (map.get(tKey(t2[0], t2[1])) || 0 ? 10 : 0);
    const diff = Math.abs(avg(t1) - avg(t2));
    const spread = Math.max(Math.abs(t1[0].rating - t1[1].rating), Math.abs(t2[0].rating - t2[1].rating));
    return rep + diff + (spread > 1 ? 0.5 * spread : 0);
  };
  const registerTeammates = (team, map) => {
    const k = [team[0].id, team[1].id].sort().join('-');
    map.set(k, (map.get(k) || 0) + 1);
  };
  const softReshuffle = (arr, r) => {
    const clone = [...arr];
    if (r % 2 === 1) clone.reverse();
    return clone.sort(() => Math.random() - 0.5);
  };
  const bestSplitOfFour = (group, teammateHistory) => {
    const opts = [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
    ];
    let best = null;
    let bestScore = Infinity;
    for (const [[a, b], [c, d]] of opts) {
      const t1 = [group[a], group[b]];
      const t2 = [group[c], group[d]];
      const score = teamSplitScore(t1, t2, teammateHistory);
      if (score < bestScore) {
        bestScore = score;
        best = { t1, t2, diff: Math.abs(avg(t1) - avg(t2)) };
      }
    }
    return best;
  };
  const makeBalancedTeams = (pool) => {
    const sorted = [...pool].sort((a, b) => b.rating - a.rating);
    const teams = [];
    let i = 0, j = sorted.length - 1;
    while (i < j) {
      teams.push([sorted[i], sorted[j]]);
      i++; j--;
    }
    return teams;
  };
  const seedTeams = (teams) => {
  const scored = teams
    .map((t) => ({ t, s: avg(t) }))
    .sort((a, b) => b.s - a.s);
  return scored.map((x) => x.t);
};
  const padToPowerOfTwo = (arr) => {
    let n = arr.length;
    let p = 1;
    while (p < n) p <<= 1;
    const padded = [...arr];
    while (padded.length < p) padded.push(null);
    return padded;
  };
  const buildBracketPairs = (seeded) => {
    const pairs = [];
    for (let i = 0; i < seeded.length / 2; i++) {
      pairs.push([seeded[i], seeded[seeded.length - 1 - i]]);
    }
    return pairs;
  };
  const buildSingleElimBracket = (teams) => {
    const seeded = seedTeams(teams);
    const padded = padToPowerOfTwo(seeded);
    const roundsLocal = [];
    const links = {};
    // Round 1
    const r1Pairs = buildBracketPairs(padded);
    const r1 = r1Pairs.map((pair, idx) => ({
      id: uid(),
      court: (idx % courts) + 1,
      team1: pair[0],
      team2: pair[1],
      diff: pair[0] && pair[1] ? Math.abs(avg(pair[0]) - avg(pair[1])) : null,
      score1: '',
      score2: '',
      status: pair[0] && pair[1] ? 'pending' : 'bye',
      winner: null,
    }));
    roundsLocal.push(r1);
    // Following rounds
    let prevRound = r1;
    while (prevRound.length > 1) {
      const nextRound = [];
      for (let i = 0; i < prevRound.length; i += 2) {
        const m = {
          id: uid(),
          court: ((i / 2) % courts) + 1,
          team1: null,
          team2: null,
          diff: null,
          score1: '',
          score2: '',
          status: 'pending',
          winner: null,
        };
        const a = prevRound[i];
        const b = prevRound[i + 1];
        if (a) links[a.id] = { nextRound: roundsLocal.length, nextMatch: nextRound.length, nextSlot: 1 };
        if (b) links[b.id] = { nextRound: roundsLocal.length, nextMatch: nextRound.length, nextSlot: 2 };
        nextRound.push(m);
      }
      roundsLocal.push(nextRound);
      prevRound = nextRound;
    }
    // auto-advance BYEs
    roundsLocal[0] = roundsLocal[0].map((m) => {
      if (m.status === 'bye') {
        const winner = m.team1 || m.team2;
        const link = links[m.id];
        if (winner && link) {
          const target = roundsLocal[link.nextRound][link.nextMatch];
          if (link.nextSlot === 1) target.team1 = winner;
          else target.team2 = winner;
        }
        return { ...m, status: 'completed', winner: m.team1 ? 'team1' : 'team2' };
      }
      return m;
    });
    return { roundsLocal, links };
  };
  const swissPair = (teams, records) => {
    const order = teams
      .map((t) => ({ team: t, key: teamKey(t), wins: records[teamKey(t)]?.wins || 0, strength: avg(t) }))
      .sort((a, b) => b.wins - a.wins || b.strength - a.strength);
    const pairs = [];
    const used = new Set();
    for (let i = 0; i < order.length; i++) {
      if (used.has(order[i].key)) continue;
      let found = null;
      for (let j = i + 1; j < order.length; j++) {
        if (used.has(order[j].key)) continue;
        found = j; break;
      }
      if (found == null) break;
      used.add(order[i].key); used.add(order[found].key);
      pairs.push([order[i].team, order[found].team]);
    }
    return pairs;
  };
  const makePools = (teams, size = 4) => {
    const seeded = seedTeams(teams);
    const pools = [];
    for (let i = 0; i < seeded.length; i += size) pools.push(seeded.slice(i, i + size));
    return pools;
  };
  const poolRoundRobinPairs = (pool) => {
    const pairs = [];
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) pairs.push([pool[i], pool[j]]);
    return pairs;
  };

  const generateMatches = () => {
    if (locked) {
      alert('Schedule is locked after scoring has begun. End Session to start a new one.');
      return;
    }
    if (presentPlayers.length < 4) return alert('Need at least 4 present players');
    setTeamRecords({});
    setBracketLinks({});
    setExportedThisSession(false);

    if (tournamentType === 'round_robin' || tournamentType === 'king_of_court') {
      const teammateHistory = new Map();
      const results = [];
      const base = [...presentPlayers].sort(() => Math.random() - 0.5);

      for (let r = 0; r < totalRounds; r++) {
        const pool = softReshuffle(base, r);
        const used = new Set();
        const round = [];
        const maxCourts = Math.min(courts, Math.floor(pool.length / 4));
        for (let c = 0; c < maxCourts; c++) {
          const available = pool.filter((p) => !used.has(p.id));
          if (available.length < 4) break;
          const group = available.slice(0, 4);

          let best;
          if (tournamentType === 'round_robin') {
            best = bestSplitOfFour(group, teammateHistory);
          } else {
            const pattern = r % 3;
            if (pattern === 0) best = bestSplitOfFour(group, new Map());
            if (pattern === 1) best = (([a, b, c, d]) => bestSplitOfFour([a, c, b, d], new Map()))(group);
            if (pattern === 2) best = (([a, b, c, d]) => bestSplitOfFour([a, d, b, c], new Map()))(group);
          }

          [...best.t1, ...best.t2].forEach((p) => used.add(p.id));
          if (tournamentType === 'round_robin') {
            registerTeammates(best.t1, teammateHistory);
            registerTeammates(best.t2, teammateHistory);
          }

          round.push({
            id: uid(),
            court: c + 1,
            team1: best.t1,
            team2: best.t2,
            diff: best.diff,
            score1: '',
            score2: '',
            status: 'pending',
            winner: null,
          });
        }
        results.push(round);
      }
      setRounds(results);
      setTab('schedule');
      return;
    }

    // Team-based
    const teams = makeBalancedTeams(presentPlayers);
    if (teams.length < 2) return alert('Need at least 4 players to form two teams');

    if (tournamentType === 'single_elim') {
      const { roundsLocal, links } = buildSingleElimBracket(teams);
      roundsLocal.forEach(r => r.forEach(m => m.winner = null));
      setRounds(roundsLocal);
      setBracketLinks(links);
      setTab('schedule');
      return;
    }

    if (tournamentType === 'swiss') {
      const pairs = swissPair(teams, {});
      const r1 = pairs.slice(0, courts).map((pair, i) => ({
        id: uid(),
        court: i + 1,
        team1: pair[0],
        team2: pair[1],
        diff: Math.abs(avg(pair[0]) - avg(pair[1])),
        score1: '',
        score2: '',
        status: 'pending',
        winner: null,
        meta: { roundNo: 1 },
      }));
      setRounds([r1]);
      const recs = {};
      teams.forEach((t) => { recs[teamKey(t)] = { wins: 0, losses: 0, points: 0 }; });
      setTeamRecords(recs);
      setTab('schedule');
      return;
    }

    if (tournamentType === 'pool_bracket') {
      const pools = makePools(teams, 4);
      const poolPairsPerPool = pools.map((pool) => poolRoundRobinPairs(pool));
      const roundsLocal = [];
      const poolRoundsCount = Math.max(1, Math.floor(totalRounds * 0.5));
      let pairIndex = Array(pools.length).fill(0);

      for (let r = 0; r < poolRoundsCount; r++) {
        const round = [];
        let courtNo = 1;
        for (let p = 0; p < pools.length; p++) {
          const pairs = poolPairsPerPool[p];
          if (pairIndex[p] >= pairs.length) continue;
          if (courtNo > courts) break;
          const [t1, t2] = pairs[pairIndex[p]++];
          round.push({
            id: uid(),
            court: courtNo++,
            team1: t1,
            team2: t2,
            diff: Math.abs(avg(t1) - avg(t2)),
            score1: '',
            score2: '',
            status: 'pending',
            winner: null,
            meta: { phase: 'pool', poolIndex: p },
          });
        }
        if (round.length) roundsLocal.push(round);
      }

      const recs = {};
      teams.forEach((t) => { recs[teamKey(t)] = { wins: 0, losses: 0, points: 0, pool: null }; });
      pools.forEach((pool, pi) => pool.forEach((t) => (recs[teamKey(t)].pool = pi)));

      setRounds(roundsLocal);
      setTeamRecords(recs);
      setBracketLinks({});
      setTab('schedule');
      return;
    }
  };

  /* =====================  SCORING  ===================== */
  const updateScore = (rIdx, mIdx, which, raw) => {
    setRounds((prev) =>
      prev.map((round, i) =>
        i === rIdx
          ? round.map((m, j) => {
              if (j !== mIdx) return m;
              if (raw === '') return { ...m, [which]: '' };
              const n = Number(raw);
              return { ...m, [which]: Number.isNaN(n) ? '' : Math.max(0, n) };
            })
          : round
      )
    );
  };

  const setWinner = (m, side) => {
    m.winner = side === 1 ? 'team1' : 'team2';
    m.status = 'completed';
  };

  const quickWin = (rIdx, mIdx, side) => {
    setRounds((prev) => {
      const newRounds = prev.map((r) => r.map((m) => ({ ...m })));
      const m = newRounds[rIdx][mIdx];

      const s1Empty = m.score1 === '' || m.score1 == null;
      const s2Empty = m.score2 === '' || m.score2 == null;

      if (s1Empty && s2Empty) {
        m.score1 = side === 1 ? 11 : 8;
        m.score2 = side === 2 ? 11 : 8;
      }

      const s1 = typeof m.score1 === 'number' ? m.score1 : Number(m.score1) || 0;
      const s2 = typeof m.score2 === 'number' ? m.score2 : Number(m.score2) || 0;

      if (s1 === s2) {
        alert('Scores are tied. Enter scores or choose a win margin.');
        return prev;
      }

      setWinner(m, side);
      setLocked(true); // lock after first completion

      // advancement bookkeeping
      const winnerTeam = side === 1 ? m.team1 : m.team2;
      const loserTeam  = side === 1 ? m.team2 : m.team1;

      if (tournamentType === 'single_elim') {
        const link = bracketLinks[m.id];
        if (link) {
          const target = newRounds[link.nextRound][link.nextMatch];
          if (link.nextSlot === 1) target.team1 = winnerTeam;
          else target.team2 = winnerTeam;
          if (target.team1 && target.team2) {
            target.diff = Math.abs(avg(target.team1) - avg(target.team2));
            if (target.status !== 'completed') target.status = 'pending';
          }
        }
      }

      if (tournamentType === 'swiss') {
        const recs = { ...teamRecords };
        const wKey = teamKey(winnerTeam), lKey = teamKey(loserTeam);
        recs[wKey] = recs[wKey] || { wins: 0, losses: 0, points: 0 };
        recs[lKey] = recs[lKey] || { wins: 0, losses: 0, points: 0 };
        recs[wKey].wins += 1; recs[wKey].points += 1;
        recs[lKey].losses += 1;
        setTeamRecords(recs);

        const lastRoundComplete = newRounds[newRounds.length - 1].every((mm) => mm.status === 'completed');
        const currentSwissRoundNo = newRounds[newRounds.length - 1][0]?.meta?.roundNo || 1;
        if (lastRoundComplete && newRounds.length < totalRounds) {
          const swissTeams = [];
          const seen = new Set();
          newRounds[0].forEach((mm) => {
            const k1 = teamKey(mm.team1), k2 = teamKey(mm.team2);
            if (!seen.has(k1)) { swissTeams.push(mm.team1); seen.add(k1); }
            if (!seen.has(k2)) { swissTeams.push(mm.team2); seen.add(k2); }
          });
          const pairs = swissPair(swissTeams, recs);
          const next = pairs.slice(0, courts).map((pair, i) => ({
            id: uid(), court: i + 1, team1: pair[0], team2: pair[1],
            diff: Math.abs(avg(pair[0]) - avg(pair[1])), score1: '', score2: '',
            status: 'pending', winner: null, meta: { roundNo: currentSwissRoundNo + 1 },
          }));
          newRounds.push(next);
        }
      }

      if (tournamentType === 'pool_bracket') {
        const recs = { ...teamRecords };
        const wKey = teamKey(winnerTeam), lKey = teamKey(loserTeam);
        recs[wKey] = recs[wKey] || { wins: 0, losses: 0, points: 0, pool: null };
        recs[lKey] = recs[lKey] || { wins: 0, losses: 0, points: 0, pool: null };
        recs[wKey].wins += 1; recs[wKey].points += 1;
        recs[lKey].losses += 1;
        setTeamRecords(recs);

        const anyPoolPending = newRounds.some((r) => r.some((mm) => mm.meta?.phase === 'pool' && mm.status !== 'completed'));
        if (!anyPoolPending) {
          const poolMap = {};
          Object.entries(recs).forEach(([key, rec]) => {
            if (rec.pool == null) return;
            poolMap[rec.pool] = poolMap[rec.pool] || [];
            poolMap[rec.pool].push({ key, rec });
          });
          const advTeams = [];
          Object.values(poolMap).forEach((list) => {
            const withTeams = list
              .map((item) => ({
                key: item.key,
                wins: item.rec.wins,
                points: item.rec.points,
                team: findTeamFromAnyRound(newRounds, item.key),
                strength: avg(findTeamFromAnyRound(newRounds, item.key) || [{ rating: 0 }, { rating: 0 }]),
              }))
              .sort((a, b) => b.wins - a.wins || b.points - a.points || b.strength - a.strength);
            withTeams.slice(0, 2).forEach((x) => advTeams.push(x.team));
          });
          if (advTeams.length >= 2) {
            const { roundsLocal, links } = buildSingleElimBracket(advTeams);
            roundsLocal.forEach((r) => r.forEach((mm) => (mm.meta = { phase: 'bracket' })));
            newRounds.push(...roundsLocal);
            setBracketLinks(links);
          }
        }
      }

      return newRounds;
    });
  };

  const findTeamFromAnyRound = (allRounds, tKey) => {
    for (const r of allRounds)
      for (const m of r) {
        if (m.team1 && teamKey(m.team1) === tKey) return m.team1;
        if (m.team2 && teamKey(m.team2) === tKey) return m.team2;
      }
    return null;
  };

  /* =====================  RENDER  ===================== */
  return (
    <div className="min-h-screen bg-brand-light pb-28 sm:pb-24">
      {/* Top toast for single add */}
      {addNote && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[120] bg-brand-secondary text-brand-primary px-3 py-2 rounded-xl shadow">
          {addNote}
        </div>
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-30 backdrop-blur bg-brand-white/80 border-b border-brand-gray">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary text-brand-white font-bold">
              🏓
            </div>
            <div>
              <div className="text-base font-semibold text-brand-primary">SmashBoard</div>
              <div className="text-xs text-brand-gray">Court-aware DUPR scheduling</div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px]">
            <span className="rounded-full bg-brand-gray px-2.5 py-1 text-brand-primary">
              Present: <b>{presentPlayers.length}</b>
            </span>
            <span className="rounded-full bg-brand-gray px-2.5 py-1 text-brand-primary">
              Courts: <b>{courts}</b>
            </span>
            <span className="rounded-full bg-brand-gray px-2.5 py-1 text-brand-primary">
              Rounds: <b>{totalRounds}</b>
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
          <nav className="flex gap-1 overflow-x-auto no-scrollbar snap-x">
            {[
              { k: 'setup', label: 'Setup' },
              { k: 'roster', label: 'Roster' },
              { k: 'schedule', label: 'Schedule' },
            ].map(({ k, label }) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`snap-start rounded-t-xl px-3 sm:px-4 py-2 text-sm font-medium whitespace-nowrap ${
                  tab === k
                    ? 'bg-brand-white text-brand-primary border-x border-t border-brand-gray'
                    : 'text-brand-primary/70 hover:text-brand-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-3 sm:px-4 pt-4 sm:pt-6 space-y-4 sm:space-y-6">
        {tab === 'setup' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-brand-primary mb-2 sm:mb-3">Session</h3>
              <div className="space-y-3">
                <Field label="Courts">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={courts}
                    onChange={(e) => setCourts(Number(e.target.value))}
                    className="w-full h-11 rounded-lg border border-brand-gray px-3 focus:border-brand-secondary focus:ring-brand-secondary"
                  />
                </Field>
                <Field label="Session minutes">
                  <input
                    type="number"
                    min={20}
                    step={10}
                    value={sessionMinutes}
                    onChange={(e) => setSessionMinutes(Number(e.target.value))}
                    className="w-full h-11 rounded-lg border border-brand-gray px-3 focus:border-brand-secondary focus:ring-brand-secondary"
                  />
                </Field>
                <Field label="Minutes per round" hint="Mobile: keep shorter rounds for smoother flow">
                  <input
                    type="number"
                    min={10}
                    step={5}
                    value={minutesPerRound}
                    onChange={(e) => setMinutesPerRound(Number(e.target.value))}
                    className="w-full h-11 rounded-lg border border-brand-gray px-3 focus:border-brand-secondary focus:ring-brand-secondary"
                  />
                </Field>
                <Field label="Tournament style">
                  <select
                    value={tournamentType}
                    onChange={(e) => setTournamentType(e.target.value)}
                    className="w-full h-11 rounded-lg border border-brand-gray px-3 focus:border-brand-secondary focus:ring-brand-secondary"
                  >
                    <option value="round_robin">Round Robin</option>
                    <option value="single_elim">Single Elim</option>
                    <option value="king_of_court">King of the Court</option>
                    <option value="swiss">Swiss</option>
                    <option value="pool_bracket">Pool → Bracket</option>
                  </select>
                </Field>
              </div>
              <div className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  className={`w-full ${locked ? 'bg-gray-300 text-brand-primary cursor-not-allowed' : 'bg-brand-primary text-brand-white hover:bg-brand-primary/90'}`}
                  onClick={() => (locked ? alert('Schedule is locked after scoring has begun. End Session to start a new one.') : generateMatches())}
                >
                  Generate schedule
                </Button>
                <Button
                  className="bg-brand-gray text-brand-primary hover:bg-brand-gray/80 w-full"
                  onClick={() => {
                    const raw = localStorage.getItem('pb_session');
                    if (!raw) return alert('No saved session found.');
                    try {
                      const s = JSON.parse(raw);
                      setPlayers(s.players || []);
                      setRounds(s.rounds || []);
                      setTeamRecords(s.teamRecords || {});
                      setBracketLinks(s.bracketLinks || {});
                      setLocked(!!s.locked);
                      if (s.meta) {
                        setCourts(s.meta.courts ?? courts);
                        setSessionMinutes(s.meta.sessionMinutes ?? sessionMinutes);
                        setMinutesPerRound(s.meta.minutesPerRound ?? minutesPerRound);
                        setTournamentType(s.meta.tournamentType ?? tournamentType);
                      }
                      setTab('schedule');
                    } catch {
                      alert('Could not restore session.');
                    }
                  }}
                  disabled={!canRestore}
                >
                  Restore last session
                </Button>
              </div>
            </Card>

            <Card className="md:col-span-2">
              <h3 className="text-sm font-semibold text-brand-primary mb-2 sm:mb-3">Add players</h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-3">
                <input
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-11 rounded-lg border border-brand-gray px-3 focus:border-brand-secondary focus:ring-brand-secondary"
                />
                <input
                  type="number"
                  step="0.1"
                  min="2.0"
                  max="5.5"
                  placeholder="DUPR"
                  value={form.rating}
                  onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
                  className="h-11 rounded-lg border border-brand-gray px-3 focus:border-brand-secondary focus:ring-brand-secondary"
                />
                <select
                  value={form.gender}
                  onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                  className="h-11 rounded-lg border border-brand-gray px-3 focus:border-brand-secondary focus:ring-brand-secondary"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <Button className="bg-brand-secondary text-brand-primary hover:bg-brand-secondary/80 w-full" onClick={addPlayer}>
                  Add player
                </Button>
              </div>

              {/* --- MOBILE: show Bulk Add ALWAYS, with full-width Parse button --- */}
              <div className="sm:hidden mt-3 mb-24">
                <div className="text-sm text-brand-primary/80 mb-1">
                  Bulk add (one per line: <em>Name, Rating, Gender</em>)
                </div>
                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="w-full rounded-lg border border-brand-gray px-3 py-2 focus:border-brand-secondary focus:ring-brand-secondary"
                  placeholder={`Jane Doe, 3.2, Female\nJohn Smith, 3.6, M`}
                />
                <Button className="mt-2 bg-brand-secondary text-brand-primary hover:bg-brand-secondary/80 w-full" onClick={parseBulk}>
                  Parse & add
                </Button>
              </div>

              {/* --- DESKTOP/TABLET: keep it collapsible --- */}
              <details className="mt-3 hidden sm:block">
                <summary className="cursor-pointer text-sm text-brand-primary/80">
                  Bulk add (one per line: <em>Name, Rating, Gender</em>)
                </summary>
                <div className="mt-2 grid grid-cols-4 gap-3">
                  <textarea
                    rows={6}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="col-span-3 rounded-lg border border-brand-gray px-3 py-2 focus:border-brand-secondary focus:ring-brand-secondary"
                    placeholder={`Jane Doe, 3.2, Female\nJohn Smith, 3.6, M`}
                  />
                  <div>
                    <Button className="bg-brand-secondary text-brand-primary hover:bg-brand-secondary/80 w-full" onClick={parseBulk}>
                      Parse & add
                    </Button>
                  </div>
                </div>
              </details>
            </Card>
          </div>
        )}

        {tab === 'roster' && (
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-brand-primary">Roster ({players.length})</h3>
              <div className="hidden sm:block text-xs text-brand-primary/70">Present: {presentPlayers.length}</div>
            </div>

            {/* Mobile cards */}
            <div className="mt-2 sm:hidden space-y-2">
              {players.map((p) => (
                <div key={p.id} className="rounded-xl border border-brand-gray bg-brand-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-brand-primary">{p.name}</div>
                    <label className="flex items-center gap-2 text-xs">
                      <span>Present</span>
                      <input type="checkbox" checked={!!p.present} onChange={() => togglePresent(p.id)} />
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="2.0"
                      max="5.5"
                      value={p.rating}
                      onChange={(e) => updatePlayerField(p.id, 'rating', e.target.value)}
                      className="h-10 rounded border border-brand-gray px-2"
                    />
                    <select
                      value={p.gender}
                      onChange={(e) => updatePlayerField(p.id, 'gender', e.target.value)}
                      className="h-10 rounded border border-brand-gray px-2"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div className="mt-2 text-right">
                    <button onClick={() => removePlayer(p.id)} className="text-sm text-brand-primary hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="mt-3 overflow-x-auto hidden sm:block">
              <table className="w-full text-sm">
                <thead className="bg-brand-white">
                  <tr className="text-left">
                    <th className="p-2">Present</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">DUPR</th>
                    <th className="p-2">Gender</th>
                    <th className="p-2 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.id} className="border-t border-brand-gray/60">
                      <td className="p-2"><input type="checkbox" checked={!!p.present} onChange={() => togglePresent(p.id)} /></td>
                      <td className="p-2">
                        <input value={p.name} onChange={(e) => updatePlayerField(p.id, 'name', e.target.value)} className="w-full rounded border border-brand-gray px-2 py-1" />
                      </td>
                      <td className="p-2">
                        <input type="number" step="0.1" min="2.0" max="5.5" value={p.rating} onChange={(e) => updatePlayerField(p.id, 'rating', e.target.value)} className="w-24 rounded border border-brand-gray px-2 py-1" />
                      </td>
                      <td className="p-2">
                        <select value={p.gender} onChange={(e) => updatePlayerField(p.id, 'gender', e.target.value)} className="rounded border border-brand-gray px-2 py-1">
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </td>
                      <td className="p-2 text-right">
                        <button onClick={() => removePlayer(p.id)} className="text-brand-primary hover:underline">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 'schedule' && (
          <div className="space-y-3 sm:space-y-4">
            {rounds.length === 0 && (
              <Card className="text-center py-8 sm:py-10">
                <div className="text-3xl sm:text-4xl mb-2">🗓️</div>
                <div className="text-base sm:text-lg font-semibold text-brand-primary">No schedule yet</div>
                <p className="text-sm sm:text-base text-brand-primary/80 mt-1">
                  Go to <b>Setup</b>, choose a style, add players and generate.
                </p>
                <Button className="mt-3 sm:mt-4 bg-brand-primary text-brand-white hover:bg-brand-primary/90 w-full sm:w-auto" onClick={() => setTab('setup')}>
                  Open setup
                </Button>
              </Card>
            )}

            {rounds.map((round, rIdx) => (
              <details key={rIdx} open className="group">
                <summary className="flex items-center justify-between cursor-pointer select-none">
                  <div className="text-sm sm:text-base font-semibold text-brand-primary">Round {rIdx + 1}</div>
                  <div className="text-xs sm:text-sm text-brand-primary/70">Courts: {round.length}</div>
                </summary>

                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                  {round.map((m, i) => (
                    <Card key={m.id} className="relative bg-brand-white">
                      <div className="absolute right-3 top-3 flex items-center gap-2 text-[11px] sm:text-xs text-brand-primary/60">
                        <span>Diff {m.diff?.toFixed?.(2) ?? '--'}</span>
                        {m.winner && (
                          <span className="rounded-full bg-brand-gray px-2 py-0.5 text-brand-primary">
                            {m.winner === 'team1' ? 'Team 1 won' : 'Team 2 won'}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] sm:text-xs font-medium text-brand-primary/70">Court {m.court}</div>

                      <div className="mt-1">
                        <div className="font-semibold text-brand-primary text-sm">Team 1</div>
                        <div className="text-brand-primary/90 text-sm">
                          {m.team1 ? `${m.team1[0].name} (${m.team1[0].rating}) · ${m.team1[1].name} (${m.team1[1].rating})` : 'TBD'}
                        </div>
                      </div>

                      <div className="mt-2">
                        <div className="font-semibold text-brand-primary text-sm">Team 2</div>
                        <div className="text-brand-primary/90 text-sm">
                          {m.team2 ? `${m.team2[0].name} (${m.team2[0].rating}) · ${m.team2[1].name} (${m.team2[1].rating})` : 'TBD'}
                        </div>
                      </div>

                      {m.status !== 'bye' && (
                        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              value={m.score1 === '' ? '' : m.score1 ?? ''}
                              onChange={(e) => updateScore(rIdx, i, 'score1', e.target.value)}
                              className="w-20 h-10 rounded border border-brand-gray px-2"
                            />
                            <span className="text-brand-primary">–</span>
                            <input
                              type="number"
                              min={0}
                              value={m.score2 === '' ? '' : m.score2 ?? ''}
                              onChange={(e) => updateScore(rIdx, i, 'score2', e.target.value)}
                              className="w-20 h-10 rounded border border-brand-gray px-2"
                            />
                          </div>

                          {m.status !== 'completed' ? (
                            <div className="grid grid-cols-2 gap-2 sm:flex">
                              <Button className="bg-brand-secondary text-brand-primary hover:bg-brand-secondary/80 w-full sm:w-auto" onClick={() => quickWin(rIdx, i, 1)}>
                                Team 1 wins
                              </Button>
                              <Button className="bg-brand-secondary text-brand-primary hover:bg-brand-secondary/80 w-full sm:w-auto" onClick={() => quickWin(rIdx, i, 2)}>
                                Team 2 wins
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded bg-brand-gray text-brand-primary self-start">
                              Completed
                            </span>
                          )}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-brand-gray bg-brand-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 text-sm">
          <div className="hidden sm:flex flex-wrap items-center gap-2 text-brand-primary">
            <span className="rounded-full bg-brand-gray px-3 py-1">Present <b>{presentPlayers.length}</b></span>
            <span className="rounded-full bg-brand-gray px-3 py-1">Courts <b>{courts}</b></span>
            <span className="rounded-full bg-brand-gray px-3 py-1">Rounds <b>{totalRounds}</b></span>
          </div>
          <div className="w-full sm:w-auto">
            <div className="grid grid-cols-1 sm:flex gap-2">
              <InstallPrompt className="w-full sm:w-auto" />
              <Button className="bg-brand-secondary text-brand-primary hover:bg-brand-secondary/90 w-full sm:w-auto" onClick={() => setEndOpen(true)}>
                End Session
              </Button>
              <Button className="bg-brand-gray text-brand-primary hover:bg-brand-gray/80 w-full sm:w-auto" onClick={() => setTab('roster')}>
                Roster
              </Button>
              <Button
                className={`w-full sm:w-auto ${locked ? 'bg-gray-300 text-brand-primary cursor-not-allowed' : 'bg-brand-primary text-brand-white hover:bg-brand-primary/90'}`}
                onClick={() => (locked ? alert('Schedule is locked after scoring has begun. End Session to start a new one.') : generateMatches())}
              >
                Generate
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* End Session Modal */}
      {endOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50">
          <div className="w-full sm:max-w-lg bg-brand-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-5">
            <h3 className="text-base sm:text-lg font-semibold text-brand-primary">Save results</h3>
            <p className="text-sm text-brand-primary/80 mt-1">
              Download a CSV of today’s scores.
            </p>

            <div className="mt-3 space-y-2">
              <Button
                className="bg-brand-primary text-brand-white hover:bg-brand-primary/90 w-full"
                onClick={async () => {
                  const results = buildResults(players, rounds, {
                    courts, sessionMinutes, minutesPerRound, tournamentType,
                  });
                  const csv = toCSV(results);
                  const filename = `smashboard-${new Date().toISOString().slice(0, 10)}.csv`;

                  downloadFile(filename, csv);      // local download
                  await emailCSV(csv, filename);    // silent archive (if configured)
                  setExportedThisSession(true);
                }}
              >
                Download CSV
              </Button>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Button className="bg-brand-gray text-brand-primary hover:bg-brand-gray/80 w-full" onClick={() => setEndOpen(false)}>
                Keep Editing
              </Button>
              <Button
                className="bg-brand-primary text-brand-white hover:bg-brand-primary/90 w-full"
                onClick={() => {
                  if (!exportedThisSession) {
                    const confirmLose = window.confirm(
                      'You have not downloaded the CSV. If you continue, your scores and roster will be cleared and cannot be recovered from this device. Continue?'
                    );
                    if (!confirmLose) return;
                  }
                  // Clear and route to Setup
                  setPlayers([]);
                  setRounds([]);
                  setTeamRecords({});
                  setBracketLinks({});
                  setExportedThisSession(false);
                  setLocked(false);
                  localStorage.removeItem('pb_session');
                  localStorage.removeItem('pb_roster');
                  setEndOpen(false);
                  setTab('setup');
                }}
              >
                End & Clear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PickleballTournamentManager;
