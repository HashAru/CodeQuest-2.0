// backend/src/routes/ai.js
import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import Conversation from '../models/Conversation.js';
import auth from '../middleware/auth.js';

dotenv.config();

const router = express.Router();

/* -------------------------
   Config (from .env)
   ------------------------- */
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'; // set to exact model name from models list
const GEMINI_BASES = [
  process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1'
  // 'https://generativelanguage.googleapis.com/v1beta2'
];

/* -------------------------
   SDK init (lazy/dynamic)
   ------------------------- */
let sdkClient = null;
let sdkInitTried = false;

async function initSdkIfAvailable() {
  if (sdkInitTried) return sdkClient;
  sdkInitTried = true;

  try {
    let mod = null;
    try {
      // prefer official package name
      mod = await import('@google/generative-ai');
    } catch (e1) {
      try {
        // alternative package name if present
        mod = await import('@google-ai/generative-ai');
      } catch (e2) {
        mod = null;
      }
    }

    if (!mod) {
      console.info('[Gemini SDK] not installed — REST fallback will be used.');
      sdkClient = null;
      return sdkClient;
    }

    // Attempt to discover an exported client class / factory
    const GoogleGen = mod.GoogleGenerativeAI || mod.GoogleGenerativeAIClient || mod.default || null;

    if (GoogleGen) {
      try {
        // Try to construct client; some SDK builds accept { apiKey }
        sdkClient = new GoogleGen({ apiKey: GEMINI_KEY || undefined });
        console.info('[Gemini SDK] Initialized SDK client.');
        return sdkClient;
      } catch (err1) {
        try {
          // fallback: try calling default export as factory
          sdkClient = await (mod.default ? mod.default({ apiKey: GEMINI_KEY || undefined }) : null);
          console.info('[Gemini SDK] Initialized SDK client (fallback).');
          return sdkClient;
        } catch (err2) {
          console.warn('[Gemini SDK] SDK present but failed to instantiate, falling back to REST.', err2?.message || err2);
          sdkClient = null;
          return sdkClient;
        }
      }
    }

    console.info('[Gemini SDK] Module loaded but no usable export found — using REST fallback.');
    sdkClient = null;
    return sdkClient;
  } catch (err) {
    console.info('[Gemini SDK] dynamic import error — using REST fallback.', err?.message || err);
    sdkClient = null;
    return sdkClient;
  }
}

/* -------------------------
   Prompt builder
   ------------------------- */
function messagesToPrompt(messages) {
  return messages.map(m => `${(m.role || 'user').toUpperCase()}: ${m.content}`).join('\n\n');
}

/* -------------------------
   Gemini via SDK (preferred)
   ------------------------- */
async function callGeminiSdk(messages) {
  await initSdkIfAvailable();
  if (!sdkClient) {
    const e = new Error('Gemini SDK not available');
    e.isSdkMissing = true;
    throw e;
  }

  const promptText = messagesToPrompt(messages);

  try {
    // Try a few common SDK shapes defensively
    if (typeof sdkClient.getGenerativeModel === 'function') {
      const model = sdkClient.getGenerativeModel({ model: GEMINI_MODEL });
      if (model && typeof model.generateContent === 'function') {
        const resp = await model.generateContent({ text: promptText, temperature: 0.2 });
        if (resp?.response?.text) return { raw: resp, text: resp.response.text() || String(resp.response.text) };
        if (resp?.response?.content) {
          if (typeof resp.response.content === 'string') return { raw: resp, text: resp.response.content };
          return { raw: resp, text: resp.response.content?.toString?.() || JSON.stringify(resp.response.content) };
        }
        return { raw: resp, text: String(JSON.stringify(resp)).slice(0, 2000) };
      }
    }

    if (typeof sdkClient.generateContent === 'function') {
      const resp = await sdkClient.generateContent({ model: GEMINI_MODEL, text: promptText, temperature: 0.2 });
      if (resp?.response?.text) return { raw: resp, text: resp.response.text() };
      if (resp?.candidates && resp.candidates[0]) {
        const cand = resp.candidates[0];
        if (cand?.content?.parts) return { raw: resp, text: cand.content.parts.map(p => p.text || '').join('') };
        if (cand?.output) return { raw: resp, text: cand.output };
      }
      return { raw: resp, text: String(JSON.stringify(resp)) };
    }

    if (typeof sdkClient.generateText === 'function') {
      const resp = await sdkClient.generateText({ model: GEMINI_MODEL, prompt: promptText, temperature: 0.2 });
      if (resp?.candidates && resp.candidates[0]) {
        const cand = resp.candidates[0];
        if (cand?.content?.parts) return { raw: resp, text: cand.content.parts.map(p => p.text || '').join('') };
        if (cand?.output) return { raw: resp, text: cand.output };
      }
      if (resp?.output) return { raw: resp, text: resp.output };
      return { raw: resp, text: String(JSON.stringify(resp)) };
    }

    const err = new Error('SDK present but no supported generate method found');
    err.isSdkUnsupported = true;
    throw err;
  } catch (err) {
    // Re-throw for caller to decide fallback
    throw err;
  }
}

/* -------------------------
   Gemini via REST fallback
   ------------------------- */
async function callGeminiRest(messages) {
  if (!GEMINI_KEY) {
    const e = new Error('GEMINI_API_KEY not configured on server');
    e.isConfig = true;
    throw e;
  }

  const promptText = messagesToPrompt(messages);
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: { temperature: 0.2 }
  };

  let lastError = null;

  for (const base of GEMINI_BASES) {
    // Keep model slashes intact — do NOT encode slashes in model path
    const rawUrl = `${base}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
    const url = encodeURI(rawUrl);

    console.info('[Gemini REST] Trying URL:', url);

    try {
      const resp = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 120000 });
      const data = resp.data;
      console.info('[Gemini REST] Success from', url, 'modelVersion=', data?.modelVersion || data?.model || 'unknown');

      // Parse likely response shapes
      let assistantText = '';

      if (Array.isArray(data?.candidates) && data.candidates.length > 0) {
        const cand = data.candidates[0];
        if (cand?.content?.parts && Array.isArray(cand.content.parts)) {
          assistantText = cand.content.parts.map(p => p.text || '').join('');
        } else if (Array.isArray(cand.content)) {
          assistantText = cand.content.map(c => c?.text || '').join('');
        } else if (typeof cand.output === 'string') {
          assistantText = cand.output;
        }
      }

      if (!assistantText && typeof data?.output === 'string') assistantText = data.output;
      if (!assistantText && data?.generated_text) assistantText = data.generated_text;
      if (!assistantText && Array.isArray(data?.candidates) && data.candidates[0]?.content) {
        const c = data.candidates[0].content;
        if (typeof c === 'string') assistantText = c;
        else if (Array.isArray(c)) assistantText = c.map(x => x.text || '').join('');
      }

      assistantText = String(assistantText || '').trim();
      return { raw: data, text: assistantText };
    } catch (err) {
      const info = {
        message: err.message,
        isAxios: !!err.isAxiosError,
        status: err.response?.status,
        statusText: err.response?.statusText,
        headers: err.response?.headers,
        data: err.response?.data
      };
      console.error('[Gemini REST] attempt failed for URL:', url, '\n', JSON.stringify(info, null, 2));
      lastError = info;
      // try next base
    }
  }

  const wrapper = new Error('All Gemini REST endpoints failed');
  wrapper.info = lastError;
  throw wrapper;
}

/* -------------------------
   POST /api/ai/chat
   - Body: { conversationId?: string, message: string, title?: string }
   - Auth required (auth middleware should set req.userId)
   ------------------------- */
router.post('/chat', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { conversationId, message, title } = req.body || {};

    if (!message || typeof message !== 'string') return res.status(400).json({ message: 'message required' });

    // load or create conversation
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
      if (String(conversation.user) !== String(userId)) return res.status(403).json({ message: 'Not your conversation' });
    } else {
      conversation = new Conversation({ user: userId, title: title || 'Study Plan', messages: [] });
    }

    const systemPrompt = `You are StudyBuddy — a friendly, enthusiastic, technically grounded study planner assistant.
Focus on academic study topics (programming, algorithms, data structures, interview prep, machine learning, math). Provide structured study plans, step-by-step guidance, estimated time, and practice recommendations.`;

    const messagesForModel = [
      { role: 'system', content: systemPrompt },
      ...conversation.messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];

    // persist user message
    conversation.messages.push({ role: 'user', content: message });
    await conversation.save();

    // call model (SDK preferred, fallback to REST)
    let modelResp;
    try {
      try {
        modelResp = await callGeminiSdk(messagesForModel);
      } catch (sdkErr) {
        if (sdkErr?.isSdkMissing || sdkErr?.isSdkUnsupported || !sdkClient) {
          console.info('[AI] SDK unavailable/unsupported, falling back to REST:', sdkErr?.message || sdkErr);
          modelResp = await callGeminiRest(messagesForModel);
        } else {
          throw sdkErr;
        }
      }
    } catch (err) {
      console.error('[AI] Gemini call error:', err?.info || err?.message || err);
      if (err?.isConfig) return res.status(500).json({ message: err.message });
      return res.status(502).json({ message: 'Gemini API request failed', details: err?.info || err?.message || 'See server logs' });
    }

    const assistantText = modelResp?.text || 'Sorry, I could not produce a response.';
    conversation.messages.push({ role: 'assistant', content: assistantText });
    await conversation.save();

    return res.json({ conversationId: conversation._id, assistant: assistantText, conversation });
  } catch (err) {
    console.error('[AI] POST /api/ai/chat error:', err?.message || err);
    return res.status(500).json({ message: 'AI chat failed', details: err?.message || String(err) });
  }
});

/* -------------------------
   Conversation management routes
   ------------------------- */
router.get('/conversations', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({ user: req.userId }).sort({ updatedAt: -1 }).lean();
    return res.json(conversations);
  } catch (err) {
    console.error('[AI] GET /conversations error:', err);
    return res.status(500).json({ message: 'Failed to list conversations' });
  }
});

router.get('/conversations/:id', auth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id).lean();
    if (!conv || String(conv.user) !== String(req.userId)) return res.status(404).json({ message: 'Not found' });
    return res.json(conv);
  } catch (err) {
    console.error('[AI] GET /conversations/:id error:', err);
    return res.status(500).json({ message: 'Failed to load conversation' });
  }
});

router.post('/conversations/:id/title', auth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv || String(conv.user) !== String(req.userId)) return res.status(404).json({ message: 'Not found' });
    conv.title = req.body.title || conv.title;
    await conv.save();
    return res.json(conv);
  } catch (err) {
    console.error('[AI] POST /conversations/:id/title error:', err);
    return res.status(500).json({ message: 'Failed to rename' });
  }
});

// router.delete('/conversations/:id', auth, async (req, res) => {
//   try {
//     const conv = await Conversation.findById(req.params.id);
//     if (!conv || String(conv.user) !== String(req.userId)) return res.status(404).json({ message: 'Not found' });
//     await conv.remove();
//     return res.json({ success: true });
//   } catch (err) {
//     console.error('[AI] DELETE /conversations/:id error:', err);
//     return res.status(500).json({ message: 'Failed to delete' });
//   }
// });

router.delete('/conversations/:id', auth, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      console.warn('[AI][DELETE] auth produced no userId for request', { headers: req.headers });
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'id required' });

    const conv = await Conversation.findById(id);
    if (!conv) {
      console.warn('[AI][DELETE] conversation not found', { id, userId });
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (String(conv.user) !== String(userId)) {
      console.warn('[AI][DELETE] user mismatch, cannot delete', { id, convUser: conv.user, reqUser: userId });
      return res.status(403).json({ message: 'Not authorized to delete this conversation' });
    }

    // delete (use deleteOne to be explicit)
    await Conversation.deleteOne({ _id: id });
    console.info('[AI][DELETE] conversation deleted', { id, userId });

    // return deleted id so frontend can remove it cleanly
    return res.json({ success: true, id });
  } catch (err) {
    console.error('[AI] DELETE /conversations/:id error', err?.message || err);
    return res.status(500).json({ message: 'Failed to delete conversation', error: String(err?.message || err) });
  }
});

export default router;
