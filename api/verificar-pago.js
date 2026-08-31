// api/verificar-pago.js
// Comprueba contra Stripe (no contra lo que diga el navegador) si una
// sesión de pago se ha completado de verdad. Esto es lo que impide que
// alguien desbloquee el informe solo con manipular la URL.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: 'Falta session_id' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    return res.status(200).json({ pagado: session.payment_status === 'paid' });
  } catch (err) {
    console.error('Error verificando el pago:', err);
    return res.status(500).json({ error: 'No se ha podido verificar el pago.' });
  }
}
