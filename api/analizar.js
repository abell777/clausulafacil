    // api/analizar.js
// Función de servidor para Vercel. Recibe un PDF de contrato de alquiler,
// se lo pasa a la IA de Anthropic con instrucciones de análisis basadas en
// la Ley de Arrendamientos Urbanos (LAU), y devuelve un informe estructurado.
//
// La clave de API (ANTHROPIC_API_KEY) NUNCA va en este archivo ni en el
// frontend: se configura como variable de entorno en Vercel, y solo vive
// en el servidor. Así el usuario que visita la web nunca puede verla.

export const config = {
  api: {
    bodyParser: false, // gestionamos nosotros el archivo subido
  },
};

const PROMPT_MAESTRO = `Eres el motor de análisis de ClausulaFácil, una herramienta que ayuda a
inquilinos en España a entender contratos de alquiler de VIVIENDA HABITUAL antes de firmarlos.

Tu tarea: leer el contrato adjunto y devolver ÚNICAMENTE un JSON (sin texto antes ni después,
sin markdown, sin \`\`\`) con esta forma exacta:

{
  "tipo_detectado": "vivienda_habitual" | "otro",
  "aviso_tipo_otro": "string o null — si tipo_detectado es 'otro', explica brevemente por qué (ej: es un contrato de local comercial, de temporada, etc.) y que el análisis puede no ser preciso",
  "clausulas": [
    {
      "numero": "número o nombre de la cláusula tal como aparece en el contrato",
      "categoria": "una etiqueta corta, ej: 'Duración', 'Fianza', 'Renta y actualización', 'Desistimiento', 'Reparaciones', 'Identificación de las partes', etc.",
      "titulo": "resumen de una línea de lo que dice la cláusula, en lenguaje llano",
      "explicacion": "2-3 frases en español, tono cercano pero profesional, explicando qué implica para el inquilino y por qué se marca así. Nunca uses jerga jurídica sin explicarla.",
      "riesgo": "verde" | "ambar" | "rojo",
      "razon_riesgo": "breve referencia normativa u observación objetiva (ej: 'La LAU fija un máximo de una mensualidad como fianza legal'). No inventes artículos si no estás seguro; en ese caso di 'esto se aparta de lo habitual en contratos similares' en vez de citar un artículo concreto."
    }
  ],
  "resumen": {
    "verdes": number,
    "ambar": number,
    "rojos": number
  }
}

Criterios para asignar riesgo:
- "verde": la cláusula es estándar, se ajusta a lo habitual y a la LAU.
- "ambar": la cláusula es legal pero se aparta de lo habitual, es ambigua, o conviene que el inquilino la entienda bien antes de firmar (ej: fianzas o garantías adicionales elevadas, cláusulas de repercusión de gastos poco claras).
- "rojo": la cláusula es potencialmente abusiva, contraria a normas imperativas de la LAU, o claramente desequilibrada en perjuicio del inquilino.

Reglas importantes:
- NO des asesoramiento legal ni afirmes con certeza absoluta que una cláusula es "nula" o "ilegal". Usa fórmulas como "esto podría no ajustarse a..." o "conviene revisar esto con un profesional".
- Sé objetivo y evita alarmismo: si el contrato es en general correcto, la mayoría de cláusulas deben salir en verde.
- Analiza el contrato COMPLETO, cláusula por cláusula, en el orden en que aparecen.
- Si el PDF no es legible o no es un contrato de alquiler, devuelve "clausulas": [] y explica el problema en "aviso_tipo_otro".
- Responde siempre en español de España.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // 1. Leer el PDF subido como base64
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const base64Pdf = buffer.toString('base64');

    if (!base64Pdf) {
      return res.status(400).json({ error: 'No se ha recibido ningún archivo.' });
    }

    // 2. Llamar a la API de Anthropic con el PDF adjunto como documento
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: PROMPT_MAESTRO,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf,
                },
              },
              {
                type: 'text',
                text: 'Analiza este contrato de alquiler y devuelve el JSON tal como se te ha indicado.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Error de la API de Anthropic:', errText);
      return res.status(502).json({ error: 'No hemos podido analizar el contrato. Inténtalo de nuevo en unos minutos.' });
    }

    const data = await response.json();
    const textoRespuesta = data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // 3. Parsear el JSON que ha devuelto la IA (limpiando posibles ```json envolventes)
    const limpio = textoRespuesta.replace(/```json|```/g, '').trim();
    let informe;
    try {
      informe = JSON.parse(limpio);
    } catch (e) {
      console.error('No se pudo parsear la respuesta de la IA:', textoRespuesta);
      return res.status(502).json({ error: 'El informe no se ha podido generar correctamente. Inténtalo de nuevo.' });
    }

    return res.status(200).json(informe);
  } catch (err) {
    console.error('Error inesperado en /api/analizar:', err);
    return res.status(500).json({ error: 'Ha ocurrido un error inesperado.' });
  }
}
    
