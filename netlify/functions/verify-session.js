// netlify/functions/verify-session.js
//
// Called by the frontend right after Razorpay's checkout popup reports a
// successful payment. Verifies the payment signature server-side (this is
// what actually proves the payment is genuine — a page could otherwise lie
// about a payment having succeeded), then issues a signed token the browser
// stores and sends along with future /summarize requests.
//
// This is a deliberately simple v1: a signed, expiring token — no database.
// Good enough to ship; see DEPLOYMENT_GUIDE.md "Hardening this later" for
// what to add if the product grows (per-user accounts, subscriptions, etc).

const crypto = require('crypto');

function signToken(payload) {
  const secret = process.env.UNLOCK_TOKEN_SECRET;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing payment details' }) };
  }

  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    // Razorpay's documented signature check: HMAC-SHA256 of "order_id|payment_id"
    // using your key secret, must match what they sent back.
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return { statusCode: 402, body: JSON.stringify({ error: 'Payment verification failed' }) };
    }

    // Token is valid for 1 year from purchase. Adjust as you like.
    const expires = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const token = signToken({ pid: razorpay_payment_id, exp: expires });

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
