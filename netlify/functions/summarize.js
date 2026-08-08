// netlify/functions/summarize.js
//
// The paid-only AI summary endpoint. Verifies the unlock token the browser
// sends, then calls OpenRouter server-side (API key never touches the browser).

const crypto = require('crypto');

function verifyToken(token) {
  const secret = process.env.UNLOCK_TOKEN_SECRET;
  if (!token || !token.includes('.')) return false;
  const [body, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig !== expectedSig) return false;

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (Date.now() > payload.exp) return false;
  return true;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = event.headers['x-unlock-token'];
  if (!verifyToken(token)) {
    return {
      statusCode: 402,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'payment_required' }),
    };
  }

  let transcript;
  try {
    ({ transcript } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!transcript || !transcript.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No transcript provided' }) };
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('summarize error: OPENROUTER_API_KEY is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing its AI provider key' }) };
  }

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // "openrouter/free" auto-routes to whichever free model is currently
        // available, so this doesn't rot every time a provider retires or
        // renames a specific free experimental model (which is what broke
        // this — google/gemini-2.0-flash-exp:free no longer exists).
        model: 'openrouter/free',
        messages: [
          {
            role: 'user',
            content: `Summarize this meeting/recording transcript in 2-3 sentences, then list any clear action items as a short bulleted list (with an owner only if one is actually named in the transcript — don't invent owners). If the transcript is too short or unclear to summarize meaningfully, say so plainly instead of inventing content.\n\nTranscript:\n${transcript}`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('OpenRouter API error:', resp.status, errText);
      // Pass the real upstream status through (falling back to 502 only if
      // OpenRouter didn't give us a sensible one) instead of always saying
      // 502 — so the next failure is diagnosable from the client error alone.
      const statusCode = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
      return { statusCode, body: JSON.stringify({ error: 'AI provider error', detail: errText.slice(0, 300) }) };
    }

    const data = await resp.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text || 'No summary text returned.' }),
    };
  } catch (err) {
    console.error('summarize error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not generate summary' }) };
  }
};
