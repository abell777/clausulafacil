// api/crear-pago.js
// Función de servidor para Vercel. Crea una sesión de pago de Stripe
// para desbloquear el informe completo (1 contrato = 2€, pack de 3 = 4€).
//
// La clave secreta de Stripe (STRIPE_SECRET_KEY) se configura como
// variable de entorno en Vercel, igual que hicimos con la de Anthropic.
// Nunca va en el código ni en el frontend.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Los dos productos que vende ClausulaFácil. Los precios están fijados
// aquí, en el servidor, para que nadie pueda manipular el importe desde
// el navegador.
const PRODUCTOS = {
  contrato_suelto: {
    nombre: 'Informe completo — 1 contrato',
    precio_centimos: 200, // 2,00 €
  },
  pack_3: {
    nombre: 'Informe completo — Pack de 3 contratos',
    precio_centimos: 400, // 4,00 €
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { producto } = req.body;
    const item = PRODUCTOS[producto];

    if (!item) {
      return res.status(400).json({ error: 'Producto no reconocido.' });
    }

    // Construimos la URL de vuelta a partir del origen de la propia petición,
    // para que funcione igual en local, en vercel.app y en el dominio final.
    const origen = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: item.nombre },
            unit_amount: item.precio_centimos,
          },
          quantity: 1,
        },
      ],
      success_url: `${origen}/analizar.html?pago=exito&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origen}/analizar.html?pago=cancelado`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Error creando la sesión de pago:', err);
    return res.status(500).json({ error: 'No se ha podido iniciar el pago. Inténtalo de nuevo.' });
  }
}
