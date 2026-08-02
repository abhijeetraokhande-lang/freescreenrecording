// netlify/functions/summarize.js
//
// The paid-only AI summary endpoint. Verifies the unlock token the browser
// sends, then calls Anthropic server-side (API key never touches the browser).

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

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
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
      console.error('Anthropic API error:', resp.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'AI provider error' }) };
    }

    const data = await resp.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

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
