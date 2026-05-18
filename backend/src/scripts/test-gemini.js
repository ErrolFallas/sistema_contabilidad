#!/usr/bin/env node
/**
 * Smoke test del cliente Gemini.
 * Verifica que GEMINI_API_KEY funcione y que el modelo configurado responda.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config/env');

async function main() {
  if (!config.gemini.apiKey) {
    console.error('FAIL: GEMINI_API_KEY no esta configurada en .env');
    process.exit(1);
  }

  const client = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = client.getGenerativeModel({ model: config.gemini.model });

  const prompt = 'Responde unicamente con el JSON {"ok":true,"model":"<nombre del modelo que eres>"} sin explicaciones, sin codeblocks, sin texto adicional.';
  const t0 = Date.now();
  const result = await model.generateContent(prompt);
  const ms = Date.now() - t0;
  const text = result.response.text();

  console.log('Modelo configurado:', config.gemini.model);
  console.log('Latencia:', ms, 'ms');
  console.log('Respuesta cruda:');
  console.log(text);

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    console.log('\nJSON parseado OK:', parsed);
    console.log('\n=== GEMINI OK ===');
  } catch (e) {
    console.warn('\nAdvertencia: respuesta no fue JSON limpio (no es bloqueante en este test).');
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
