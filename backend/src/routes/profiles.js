// // backend/src/routes/profiles.js
// import express from 'express';
// import axios from 'axios';
// import Profile from '../models/Profile.js';
// import auth from '../middleware/auth.js';

// const router = express.Router();

// // Utility: parse profile url to determine platform and handle
// function parseProfileUrl(input) {
//   if (!input) return null;
//   const t = input.trim();
//   // If user passed only the handle
//   if (!t.startsWith('http')) {
//     // guess platform by content (numbers => CF?, or 'leetcode' in input)
//     if (t.includes('codeforces') || t.includes('@') || t.includes('CF')) {
//       return { platform: 'codeforces', handle: t.replace(/^@/, '') };
//     }
//     return { platform: 'leetcode', handle: t.replace(/^@/, '') };
//   }
//   try {
//     const u = new URL(t);
//     const hostname = u.hostname.replace('www.', '');
//     // Codeforces e.g. codeforces.com/profile/<handle> or /submissions/<handle>
//     if (hostname.includes('codeforces.com')) {
//       const parts = u.pathname.split('/').filter(Boolean);
//       // profile/<handle> or people/<handle> or simply /<handle>
//       const idx = parts.indexOf('profile');
//       const handle = idx >= 0 ? parts[idx + 1] : (parts[0] || '');
//       return { platform: 'codeforces', handle };
//     }
//     // LeetCode e.g. leetcode.com/<handle> or leetcode.com/u/<handle> or /profile/<handle>
//     if (hostname.includes('leetcode.com')) {
//       const parts = u.pathname.split('/').filter(Boolean);
//       // often: /<handle> or /u/<handle> or /profile/<handle>
//       let handle = parts[0] || '';
//       if (parts[0] === 'u' || parts[0] === 'profile') handle = parts[1] || '';
//       return { platform: 'leetcode', handle };
//     }
//     return null;
//   } catch (err) {
//     return null;
//   }
// }

// // =====================
// // Codeforces fetcher
// // =====================
// async function fetchCodeforces(handle) {
//   // user.info & user.status are public endpoints
//   try {
//     const base = 'https://codeforces.com/api';
//     const infoR = await axios.get(`${base}/user.info`, { params: { handles: handle } });
//     const user = (infoR.data.result && infoR.data.result[0]) || null;

//     // fetch many submissions (CF API allows count; we'll fetch up to 10000)
//     const statusR = await axios.get(`${base}/user.status`, { params: { handle, from: 1, count: 10000 } });
//     const submissions = statusR.data.result || [];

//     // Process submissions: unique solved problems, days active, tags/topics
//     const solvedSet = new Set();
//     const topicCounts = {};
//     const perProblemLatest = {}; // key: contestId-name to store verdicts

//     const daySet = new Set();
//     for (const s of submissions) {
//       // problem id
//       const probKey = `${s.problem.contestId || 'NA'}-${s.problem.index || s.problem.name}`;
//       if (s.verdict === 'OK') {
//         solvedSet.add(probKey);
//       }
//       // tags
//       if (Array.isArray(s.problem.tags)) {
//         for (const tag of s.problem.tags) {
//           topicCounts[tag] = (topicCounts[tag] || 0) + 1;
//         }
//       }
//       // days active (convert epochSeconds to date)
//       const d = new Date((s.creationTimeSeconds || s.creationTimeSeconds || 0) * 1000);
//       const dayKey = d.toISOString().slice(0, 10);
//       daySet.add(dayKey);
//     }

//     // build difficulty breakdown from submissions with 'OK' verdict using problem.rating if available
//     const difficultyCounts = { easy: 0, medium: 0, hard: 0, unknown: 0 };
//     const ratingBuckets = {}; // e.g. 800, 900 etc
//     for (const s of submissions) {
//       if (s.verdict === 'OK') {
//         const rating = s.problem.rating;
//         if (rating) {
//           ratingBuckets[rating] = (ratingBuckets[rating] || 0) + 1;
//         } else {
//           difficultyCounts.unknown++;
//         }
//       }
//     }

//     const res = {
//       handle,
//       displayName: user ? user.firstName ? `${user.firstName} ${user.lastName || ''}` : user.handle : handle,
//       rating: user?.rating ?? null,
//       maxRating: user?.maxRating ?? null,
//       solvedCount: solvedSet.size,
//       submissionsCount: submissions.length,
//       daysActive: daySet.size,
//       topics: topicCounts, // counts (not unique solved problem topics but tag occurrence count)
//       ratingBuckets,
//       fetchedAt: new Date().toISOString()
//     };
//     return res;
//   } catch (err) {
//     console.error('fetchCodeforces error for', handle, err?.response?.data || err.message);
//     throw new Error('Failed to fetch Codeforces profile');
//   }
// }

// // =====================
// // LeetCode fetcher (GraphQL)
// // =====================
// // We'll call /graphql matchedUser and recentAcSubmissionList and question topicTags for recent solved problems.
// // To avoid too many requests, limit to last N (e.g., 50).
// async function fetchLeetCode(username, options = { recentLimit: 50 }) {
//   try {
//     const base = 'https://leetcode.com/graphql';
//     const axiosCfg = {
//       headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com' },
//       timeout: 30000
//     };

//     // 1) basic profile with submitStats
//     const profileQuery = `query getUserProfile($username: String!) {
//       matchedUser(username: $username) {
//         username
//         submitStats {
//           acSubmissionNum {
//             difficulty
//             count
//             submissions
//           }
//         }
//         profile {
//           realName
//           userAvatar
//           ranking
//         }
//       }
//     }`;

//     const profR = await axios.post(base, { query: profileQuery, variables: { username } }, axiosCfg);
//     const matched = profR.data?.data?.matchedUser;
//     if (!matched) {
//       // possible that the account is private or doesn't exist
//       console.warn('LeetCode matchedUser not found for', username, profR.data);
//       throw new Error('LeetCode user not found or GraphQL shape changed');
//     }

//     // 2) recent AC submissions (titleSlug & timestamp)
//     const recentQuery = `query recentAcSubmissionList($username: String!, $limit: Int!) {
//       recentAcSubmissionList(username: $username, limit: $limit) {
//         title
//         titleSlug
//         timestamp
//       }
//     }`;

//     const limit = options.recentLimit || 50;
//     const recentR = await axios.post(base, { query: recentQuery, variables: { username, limit } }, axiosCfg);
//     const recent = recentR.data?.data?.recentAcSubmissionList || [];

//     // We'll fetch topic tags per unique titleSlug (limit concurrency)
//     const uniqueSlugs = [...new Set(recent.map(r => r.titleSlug).filter(Boolean))].slice(0, 50);

//     // helper to limit concurrency
//     async function mapWithConcurrency(arr, fn, concurrency = 5) {
//       const results = [];
//       let idx = 0;
//       async function worker() {
//         while (idx < arr.length) {
//           const i = idx++;
//           try { results[i] = await fn(arr[i], i); } catch (e) { results[i] = { error: String(e) }; }
//         }
//       }
//       const workers = Array.from({ length: Math.min(concurrency, arr.length) }, () => worker());
//       await Promise.all(workers);
//       return results;
//     }

//     const qQuery = `query questionData($titleSlug: String!) {
//       question(titleSlug: $titleSlug) {
//         topicTags { name }
//         difficulty
//         stats
//       }
//     }`;

//     const topicCounts = {};
//     const questionDetails = await mapWithConcurrency(uniqueSlugs, async (slug) => {
//       const qR = await axios.post(base, { query: qQuery, variables: { titleSlug: slug } }, axiosCfg);
//       const q = qR.data?.data?.question;
//       if (q && Array.isArray(q.topicTags)) {
//         for (const t of q.topicTags) { topicCounts[t.name] = (topicCounts[t.name] || 0) + 1; }
//         return { slug, tags: q.topicTags.map(t => t.name), difficulty: q.difficulty };
//       }
//       return { slug, tags: [], difficulty: q?.difficulty || null };
//     }, 5);

//     // days active estimation: unique dates from recent submissions
//     const daySet = new Set();
//     for (const r of recent) {
//       const d = new Date(Number(r.timestamp) * 1000);
//       daySet.add(d.toISOString().slice(0, 10));
//     }

//     const solvedCount = matched.submitStats?.acSubmissionNum?.reduce((acc, cur) => acc + (cur.count || 0), 0) || 0;

//     const res = {
//       handle: username,
//       displayName: matched.username,
//       ranking: matched.profile?.ranking ?? null,
//       solvedCount,
//       recentSolved: recent.map(r => ({ title: r.title, slug: r.titleSlug, ts: r.timestamp })),
//       daysActive: daySet.size,
//       topics: topicCounts,
//       fetchedAt: new Date().toISOString()
//     };
//     return res;
//   } catch (err) {
//     console.error('fetchLeetCode error for', username, err?.response?.data || err.message);
//     throw new Error('Failed to fetch LeetCode profile');
//   }
// }

// // =====================
// // Routes
// // =====================

// // Add a profile for the logged in user
// router.post('/', auth, async (req, res) => {
//   try {
//     const { urlOrHandle } = req.body;
//     if (!urlOrHandle) return res.status(400).json({ message: 'urlOrHandle required' });

//     const parsed = parseProfileUrl(urlOrHandle);
//     if (!parsed || !parsed.handle) return res.status(400).json({ message: 'Could not parse profile link/handle' });

//     const { platform, handle } = parsed;
//     let url = urlOrHandle;
//     if (!url.startsWith('http')) {
//       // build canonical url
//       if (platform === 'codeforces') url = `https://codeforces.com/profile/${handle}`;
//       else url = `https://leetcode.com/${handle}/`;
//     }

//     // check duplicates for this user+platform+handle
//     const existing = await Profile.findOne({ user: req.userId, platform, handle });
//     if (existing) return res.status(400).json({ message: 'Profile already added' });

//     // create record with placeholder data (we'll fetch immediately)
//     const profile = new Profile({ user: req.userId, platform, handle, url });
//     await profile.save();

//     // fetch data
//     let data;
//     if (platform === 'codeforces') data = await fetchCodeforces(handle);
//     else data = await fetchLeetCode(handle);

//     profile.data = data;
//     profile.lastFetchedAt = new Date();
//     await profile.save();

//     res.status(201).json(profile);
//   } catch (err) {
//     console.error('/api/profiles POST error', err);
//     res.status(500).json({ message: 'Failed to add profile', error: String(err.message || err) });
//   }
// });

// // List profiles for current user
// router.get('/', auth, async (req, res) => {
//   try {
//     const profiles = await Profile.find({ user: req.userId }).sort({ createdAt: -1 }).lean();
//     res.json(profiles);
//   } catch (err) {
//     console.error('/api/profiles GET error', err);
//     res.status(500).json({ message: 'Failed to list profiles' });
//   }
// });

// // Refresh a profile by id (re-fetch data)
// router.post('/:id/refresh', auth, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const profile = await Profile.findById(id);
//     if (!profile || String(profile.user) !== String(req.userId)) return res.status(404).json({ message: 'Profile not found' });

//     let data;
//     if (profile.platform === 'codeforces') data = await fetchCodeforces(profile.handle);
//     else data = await fetchLeetCode(profile.handle);

//     profile.data = data;
//     profile.lastFetchedAt = new Date();
//     await profile.save();
//     res.json(profile);
//   } catch (err) {
//     console.error('/api/profiles/:id/refresh error', err);
//     res.status(500).json({ message: 'Failed to refresh profile', error: String(err.message || err) });
//   }
// });

// // Delete profile
// router.delete('/:id', auth, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const profile = await Profile.findById(id);
//     if (!profile || String(profile.user) !== String(req.userId)) return res.status(404).json({ message: 'Profile not found' });
//     await profile.remove();
//     res.json({ success: true });
//   } catch (err) {
//     console.error('/api/profiles DELETE error', err);
//     res.status(500).json({ message: 'Failed to delete profile' });
//   }
// });

// export default router;

// backend/src/routes/profiles.js
import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import Profile from '../models/Profile.js';
import auth from '../middleware/auth.js';

const router = express.Router();

/**
 * Parse input link/handle to platform and handle
 */
function parseProfileUrl(input) {
  if (!input) return null;
  const t = input.trim();
  if (!t.startsWith('http')) {
    // simple heuristics
    if (t.toLowerCase().includes('codeforces') || /^[0-9A-Za-z_]+$/.test(t) && t.length <= 20 && /[A-Za-z]/.test(t)) {
      // ambiguous, try to leave platform detection for request time
      return { platform: null, handle: t.replace(/^@/, '') };
    }
    return { platform: null, handle: t.replace(/^@/, '') };
  }
  try {
    const u = new URL(t);
    const host = u.hostname.replace('www.', '');
    const parts = u.pathname.split('/').filter(Boolean);

    if (host.includes('codeforces.com')) {
      // path like /profile/<handle> or /<handle>
      const idx = parts.indexOf('profile');
      const handle = idx >= 0 ? parts[idx + 1] : (parts[0] || '');
      return { platform: 'codeforces', handle };
    }
    if (host.includes('leetcode.com')) {
      let handle = parts[0] || '';
      if (parts[0] === 'u' || parts[0] === 'profile') handle = parts[1] || '';
      return { platform: 'leetcode', handle };
    }
    if (host.includes('hackerrank.com')) {
      // user profiles often at /<handle>
      const handle = parts[0] || '';
      return { platform: 'hackerrank', handle };
    }
    if (host.includes('geeksforgeeks.org')) {
      // some GfG profile patterns: /profile/<handle> or /user/<handle>
      const idx = parts.indexOf('profile') >= 0 ? parts.indexOf('profile') : parts.indexOf('user');
      const handle = idx >= 0 ? parts[idx + 1] : (parts[0] || '');
      return { platform: 'gfg', handle };
    }
    return { platform: null, handle: parts[0] || '' };
  } catch (err) {
    return null;
  }
}

/**
 * Helper: convert recentSolved array (with timestamps) to a date->count series
 */
function buildTimeSeriesFromRecent(recentSolved = []) {
  const series = {};
  for (const r of recentSolved) {
    const ts = Number(r.ts) * 1000;
    if (!ts || Number.isNaN(ts)) continue;
    const d = new Date(ts).toISOString().slice(0, 10);
    series[d] = (series[d] || 0) + 1;
  }
  return series;
}

/* ============ Codeforces fetcher (stable API) ============ */
async function fetchCodeforces(handle) {
  try {
    const base = 'https://codeforces.com/api';
    const infoR = await axios.get(`${base}/user.info`, { params: { handles: handle } });
    const user = (infoR.data.result && infoR.data.result[0]) || null;

    const statusR = await axios.get(`${base}/user.status`, { params: { handle, from: 1, count: 10000 } });
    const submissions = statusR.data.result || [];

    const solvedSet = new Set();
    const topicCounts = {};
    const daySet = new Set();
    for (const s of submissions) {
      const probKey = `${s.problem.contestId || 'NA'}-${s.problem.index || s.problem.name}`;
      if (s.verdict === 'OK') solvedSet.add(probKey);
      if (Array.isArray(s.problem.tags)) {
        for (const tag of s.problem.tags) topicCounts[tag] = (topicCounts[tag] || 0) + 1;
      }
      const d = new Date((s.creationTimeSeconds || 0) * 1000);
      daySet.add(d.toISOString().slice(0, 10));
    }

    const recentSolved = [];
    // collect last 100 OK problems with timestamps
    for (let i = submissions.length - 1; i >= 0 && recentSolved.length < 100; i--) {
      const s = submissions[i];
      if (s.verdict === 'OK') {
        recentSolved.push({
          title: s.problem.name,
          slug: `${s.problem.contestId}-${s.problem.index}`,
          ts: s.creationTimeSeconds
        });
      }
    }

    const res = {
      handle,
      displayName: user ? user.handle : handle,
      rating: user?.rating ?? null,
      maxRating: user?.maxRating ?? null,
      solvedCount: solvedSet.size,
      submissionsCount: submissions.length,
      daysActive: daySet.size,
      topics: topicCounts,
      recentSolved,
      timeSeries: buildTimeSeriesFromRecent(recentSolved),
      fetchedAt: new Date().toISOString()
    };
    return res;
  } catch (err) {
    console.error('fetchCodeforces error', err?.response?.data || err.message);
    throw new Error('Failed to fetch Codeforces profile');
  }
}


// replacement fetchLeetCode function (GRAPHQL)
async function fetchLeetCode(username, options = { recentLimit: 50 }) {
  try {
    const base = 'https://leetcode.com/graphql';
    const axiosCfg = { headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' }, timeout: 30000 };

    // 1) profile + submitStats
    const profileQuery = `query getUserProfile($username: String!) {
      matchedUser(username: $username) {
        username
        submitStats {
          acSubmissionNum {
            difficulty
            count
            submissions
          }
        }
        profile {
          realName
          userAvatar
          ranking
        }
      }
    }`;
    const profR = await axios.post(base, { query: profileQuery, variables: { username } }, axiosCfg);
    const matched = profR.data?.data?.matchedUser;
    if (!matched) throw new Error('LeetCode user not found');

    // Helpful debug: uncomment if you want to inspect shape
    // console.debug('LeetCode submitStats', JSON.stringify(matched.submitStats, null, 2));

    // Safely extract authoritative solved count: prefer the "All" bucket
    let solvedCount = 0;
    const acBuckets = matched.submitStats?.acSubmissionNum;
    if (Array.isArray(acBuckets) && acBuckets.length > 0) {
      const allEntry = acBuckets.find(e => String(e.difficulty).toLowerCase() === 'all' || String(e.difficulty).toLowerCase() === 'total');
      if (allEntry && typeof allEntry.count === 'number') {
        solvedCount = allEntry.count;
      } else {
        // fallback: try to sum unique difficulties (but avoid double counting if 'All' present)
        // Use the maximum of buckets as a safe fallback (less likely to overcount)
        const counts = acBuckets.map(e => Number(e.count || 0)).filter(n => !Number.isNaN(n));
        solvedCount = Math.max(...counts, 0);
      }
    }

    // 2) recent accepted submissions (limited)
    const recentQuery = `query recentAcSubmissionList($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        title
        titleSlug
        timestamp
      }
    }`;
    const limit = options.recentLimit || 50;
    const recentR = await axios.post(base, { query: recentQuery, variables: { username, limit } }, axiosCfg);
    const recent = Array.isArray(recentR.data?.data?.recentAcSubmissionList) ? recentR.data.data.recentAcSubmissionList : [];

    // Deduplicate recent solves by titleSlug (some users may have multiple accepted submissions for same problem)
    const seenSlugs = new Set();
    const dedupedRecent = [];
    for (const item of recent) {
      const slug = item.titleSlug || item.title || null;
      if (!slug) continue;
      if (!seenSlugs.has(slug)) {
        seenSlugs.add(slug);
        dedupedRecent.push({ title: item.title, slug: item.titleSlug, ts: item.timestamp });
      }
    }

    // For topics: fetch question detail for each unique slug (limit to 30)
    const uniqueSlugs = [...seenSlugs].slice(0, 30);
    const qQuery = `query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        topicTags { name }
        difficulty
      }
    }`;

    const topicCounts = {};
    // serial requests kept small; you can parallelize with concurrency control if needed
    for (const slug of uniqueSlugs) {
      try {
        const qR = await axios.post(base, { query: qQuery, variables: { titleSlug: slug } }, axiosCfg);
        const q = qR.data?.data?.question;
        if (q && Array.isArray(q.topicTags)) {
          for (const t of q.topicTags) topicCounts[t.name] = (topicCounts[t.name] || 0) + 1;
        }
      } catch (e) {
        // ignore per-question errors
      }
    }

    // days active (based on deduped recent timestamps)
    const daySet = new Set();
    for (const r of dedupedRecent) {
      if (!r.ts) continue;
      const d = new Date(Number(r.ts) * 1000);
      if (!Number.isNaN(d.getTime())) daySet.add(d.toISOString().slice(0, 10));
    }

    // Build timeSeries from deduped recent solves
    const timeSeries = {};
    for (const r of dedupedRecent) {
      if (!r.ts) continue;
      const d = new Date(Number(r.ts) * 1000).toISOString().slice(0, 10);
      timeSeries[d] = (timeSeries[d] || 0) + 1;
    }

    const res = {
      handle: username,
      displayName: matched.username,
      ranking: matched.profile?.ranking ?? null,
      solvedCount,
      recentSolved: dedupedRecent,
      daysActive: daySet.size,
      topics: topicCounts,
      timeSeries,
      fetchedAt: new Date().toISOString()
    };
    return res;
  } catch (err) {
    console.error('fetchLeetCode error', err?.response?.data || err.message);
    throw new Error('Failed to fetch LeetCode profile');
  }
}


/* ============ HackerRank fetcher (scraping, best-effort) ============ */
async function fetchHackerRank(handle) {
  try {
    if (!handle) throw new Error('No handle');
    const url = `https://www.hackerrank.com/${handle}`;
    const r = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
    const $ = load(r.data);

    // Attempt to parse problem/solved counts and recent activity
    let solvedCount = null;
    // Try selectors that often appear on HackerRank profile
    const profileStatsText = $('body').text();
    const solvedMatch = profileStatsText.match(/(\d+)\s+Problems\s+Solved/i) || profileStatsText.match(/(\d+)\s+solved/i);
    if (solvedMatch) solvedCount = Number(solvedMatch[1]);

    // Recent activity scraping fallback: look for timestamps of recent submissions; best-effort
    const recentSolved = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('/challenges/')) {
        const title = $(el).text().trim();
        if (title && recentSolved.length < 30) {
          recentSolved.push({ title, slug: href, ts: null });
        }
      }
    });

    const res = {
      handle,
      displayName: handle,
      solvedCount,
      recentSolved,
      daysActive: null,
      topics: {},
      timeSeries: {},
      fetchedAt: new Date().toISOString()
    };
    return res;
  } catch (err) {
    console.error('fetchHackerRank error', err?.response?.status || err.message);
    throw new Error('Failed to fetch HackerRank profile');
  }
}

/* ============ GeeksforGeeks fetcher (scraping, best-effort) ============ */
async function fetchGFG(handle) {
  try {
    if (!handle) throw new Error('No handle');
    // some GfG profile url patterns
    const profileUrls = [
      `https://auth.geeksforgeeks.org/user/${handle}`,
      `https://auth.geeksforgeeks.org/profile/${handle}`,
      `https://www.geeksforgeeks.org/${handle}`
    ];
    let html = null;
    for (const u of profileUrls) {
      try {
        const r = await axios.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
        html = r.data;
        break;
      } catch (e) {
        // try next
      }
    }
    if (!html) throw new Error('Profile not reachable');

    const $ = load(html);
    // GfG usually shows practice data on a user page; we attempt to extract counts
    let solvedCount = null;
    // look for numbers in badges or stats
    const text = $('body').text();
    const solvedMatch = text.match(/Solved\s*Problems\s*:\s*(\d+)/i) || text.match(/(\d+)\s*Problems\s*Solved/i);
    if (solvedMatch) solvedCount = Number(solvedMatch[1]);

    // Topics: GfG doesn't expose tags easily — leave empty
    const recentSolved = []; // best-effort: try to parse links to problems
    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('/practice-problems') || href.includes('/practice/') || href.includes('/problems/')) {
        const title = $(el).text().trim();
        if (title && recentSolved.length < 30) recentSolved.push({ title, slug: href, ts: null });
      }
    });

    const res = {
      handle,
      displayName: handle,
      solvedCount,
      recentSolved,
      daysActive: null,
      topics: {},
      timeSeries: {},
      fetchedAt: new Date().toISOString()
    };
    return res;
  } catch (err) {
    console.error('fetchGFG error', err?.response?.status || err.message);
    throw new Error('Failed to fetch GeeksforGeeks profile');
  }
}

/* ============ Routes ============ */

// create/add a profile and immediately fetch its data
router.post('/', auth, async (req, res) => {
  try {
    const { urlOrHandle } = req.body;
    if (!urlOrHandle) return res.status(400).json({ message: 'urlOrHandle required' });

    const parsed = parseProfileUrl(urlOrHandle);
    if (!parsed || !parsed.handle) return res.status(400).json({ message: 'Could not parse profile link/handle' });

    let { platform, handle } = parsed;
    handle = handle.replace(/^@/, '');
    // if platform unknown, try to guess by input content
    if (!platform) {
      const lc = urlOrHandle.toLowerCase();
      if (lc.includes('codeforces')) platform = 'codeforces';
      else if (lc.includes('leetcode')) platform = 'leetcode';
      else if (lc.includes('hackerrank')) platform = 'hackerrank';
      else if (lc.includes('geeksforgeeks') || lc.includes('gfg')) platform = 'gfg';
      else {
        // fallback: if handle contains digits and lowercase letters -> likely codeforces or hackerrank; prefer codeforces first
        platform = 'codeforces';
      }
    }

    // canonical URL
    let url = urlOrHandle;
    if (!url.startsWith('http')) {
      if (platform === 'codeforces') url = `https://codeforces.com/profile/${handle}`;
      else if (platform === 'leetcode') url = `https://leetcode.com/${handle}/`;
      else if (platform === 'hackerrank') url = `https://www.hackerrank.com/${handle}`;
      else if (platform === 'gfg') url = `https://auth.geeksforgeeks.org/user/${handle}`;
    }

    // check dup
    const existing = await Profile.findOne({ user: req.userId, platform, handle });
    if (existing) return res.status(400).json({ message: 'Profile already added' });

    const profile = new Profile({ user: req.userId, platform, handle, url });
    await profile.save();

    // fetch based on platform
    let data;
    if (platform === 'codeforces') data = await fetchCodeforces(handle);
    else if (platform === 'leetcode') data = await fetchLeetCode(handle);
    else if (platform === 'hackerrank') data = await fetchHackerRank(handle);
    else data = await fetchGFG(handle);

    profile.data = data;
    profile.lastFetchedAt = new Date();
    await profile.save();
    return res.status(201).json(profile);
  } catch (err) {
    console.error('/api/profiles POST error', err);
    return res.status(500).json({ message: 'Failed to add profile', error: String(err.message || err) });
  }
});

// list profiles for user
router.get('/', auth, async (req, res) => {
  try {
    const profiles = await Profile.find({ user: req.userId }).sort({ createdAt: -1 }).lean();
    return res.json(profiles);
  } catch (err) {
    console.error('/api/profiles GET error', err);
    return res.status(500).json({ message: 'Failed to list profiles' });
  }
});

// refresh profile by id
router.post('/:id/refresh', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await Profile.findById(id);
    if (!profile || String(profile.user) !== String(req.userId)) return res.status(404).json({ message: 'Profile not found' });

    let data;
    if (profile.platform === 'codeforces') data = await fetchCodeforces(profile.handle);
    else if (profile.platform === 'leetcode') data = await fetchLeetCode(profile.handle);
    else if (profile.platform === 'hackerrank') data = await fetchHackerRank(profile.handle);
    else data = await fetchGFG(profile.handle);

    profile.data = data;
    profile.lastFetchedAt = new Date();
    await profile.save();
    return res.json(profile);
  } catch (err) {
    console.error('/api/profiles/:id/refresh error', err);
    return res.status(500).json({ message: 'Failed to refresh profile', error: String(err.message || err) });
  }
});

// delete
// router.delete('/:id', auth, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const profile = await Profile.findById(id);
//     if (!profile || String(profile.user) !== String(req.userId)) return res.status(404).json({ message: 'Profile not found' });
//     await profile.remove();
//     return res.json({ success: true });
//   } catch (err) {
//     console.error('/api/profiles DELETE error', err);
//     return res.status(500).json({ message: 'Failed to delete profile' });
//   }
// });

router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await Profile.findById(id);
    if (!profile || String(profile.user) !== String(req.userId)) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    await profile.deleteOne(); // ✅ fixed: use deleteOne instead of remove
    return res.json({ success: true });
  } catch (err) {
    console.error('/api/profiles DELETE error', err);
    return res.status(500).json({ message: 'Failed to delete profile' });
  }
});

export default router;
