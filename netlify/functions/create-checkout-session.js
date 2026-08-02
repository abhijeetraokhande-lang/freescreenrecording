// netlify/functions/create-checkout-session.js
//
// Creates a Razorpay Order for the "AI Summary" one-time unlock.
// Called by the frontend when the user clicks "Unlock AI Summaries".
// Razorpay's checkout is a JS popup on your own site (not a hosted redirect
// page like Stripe's), so this just hands the frontend an order to open the
// popup with — no separate product/price needs to be pre-created in the
// Razorpay dashboard the way Stripe required.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const amountInRupees = parseInt(process.env.UNLOCK_PRICE_INR || '399', 10);
  const amountInPaise = amountInRupees * 100; // Razorpay amounts are always in the smallest currency unit

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const resp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: 'unlock_' + Date.now(),
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Razorpay order creation error:', resp.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not start checkout' }) };
    }

    const order = await resp.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: keyId,
      }),
    };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not start checkout. Please try again.' }),
    };
  }
};
