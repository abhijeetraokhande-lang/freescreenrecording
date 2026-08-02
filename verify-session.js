// netlify/functions/verify-session.js
//
// Called by the frontend right after Stripe redirects back with ?session_id=...
// Confirms the payment actually happened, then issues a signed token the
// browser stores and sends along with future /summarize requests.
//
// This is a deliberately simple v1: a signed, expiring token — no database.
// Good enough to ship; see DEPLOYMENT_GUIDE.md "Hardening this later" for
// what to add if the product grows (per-user accounts, subscriptions, etc).

const Stripe = require('stripe');
const crypto = require('crypto');

function signToken(payload) {
  const secret = process.env.UNLOCK_TOKEN_SECRET;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

exports.handler = async (event) => {
  const sessionId = event.queryStringParameters && event.queryStringParameters.session_id;
  if (!sessionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing session_id' }) };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return { statusCode: 402, body: JSON.stringify({ error: 'Payment not completed' }) };
    }

    // Token is valid for 1 year from purchase. Adjust as you like.
    const expires = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const token = signToken({ sid: session.id, exp: expires });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, expires }),
    };
  } catch (err) {
    console.error('verify-session error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not verify payment' }) };
  }
};
