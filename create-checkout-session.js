// netlify/functions/create-checkout-session.js
//
// Creates a Stripe Checkout session for the "AI Summary" one-time unlock.
// Called by the frontend when the user clicks "Unlock AI Summaries".

const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const siteUrl = process.env.SITE_URL || 'http://localhost:8888';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // one-time purchase. Change to 'subscription' + a recurring price if you'd rather charge monthly.
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID, // created in Stripe Dashboard, see DEPLOYMENT_GUIDE.md
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/?session_id={CHECKOUT_SESSION_ID}#unlocked`,
      cancel_url: `${siteUrl}/`,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not start checkout. Please try again.' }),
    };
  }
};
