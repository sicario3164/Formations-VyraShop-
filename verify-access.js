// Vérifie auprès de Stripe qu'une session de paiement (?session_id=...) est réelle,
// payée, et correspond au bon produit, avant d'autoriser l'accès à la formation.
// Ne nécessite aucune dépendance npm (fetch est natif sur le runtime Node de Netlify).

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json" };
  const sessionId = event.queryStringParameters && event.queryStringParameters.session_id;

  // Un vrai Checkout Session Stripe commence toujours par "cs_"
  if (!sessionId || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, reason: "missing_or_invalid_session_id" }) };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ valid: false, reason: "server_misconfigured" }) };
  }

  try {
    const resp = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    const session = await resp.json();

    if (!resp.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, reason: "session_not_found" }) };
    }

    if (session.payment_status !== "paid") {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, reason: "not_paid" }) };
    }

    // Vérification optionnelle : s'assurer que c'est bien la Formation qui a été achetée,
    // et pas un autre produit du site. Ne s'active que si la variable est définie.
    const allowedPriceId = process.env.STRIPE_FORMATION_PRICE_ID;
    if (allowedPriceId) {
      const items = (session.line_items && session.line_items.data) || [];
      const matches = items.some((item) => item.price && item.price.id === allowedPriceId);
      if (!matches) {
        return { statusCode: 200, headers, body: JSON.stringify({ valid: false, reason: "wrong_product" }) };
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ valid: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ valid: false, reason: "server_error" }) };
  }
};
