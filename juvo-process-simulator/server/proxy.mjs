// Small server-side proxy for assisted quote extraction.
// The API key stays on the server: set ANTHROPIC_API_KEY (or log in with `ant auth login`).
//   npm run proxy   → listens on http://localhost:8787, Vite forwards /api to it.
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const PORT = Number(process.env.PORT ?? 8787);
const MODEL = process.env.QUOTE_MODEL ?? 'claude-opus-5-5';

const num = { type: ['number', 'null'] };
const field = (t) => ({
  type: 'object', additionalProperties: false, required: ['value', 'snippet', 'confidence'],
  properties: { value: t, snippet: { type: ['string', 'null'] }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } },
});
const schema = {
  type: 'object', additionalProperties: false,
  required: ['supplier', 'contact', 'ref', 'date', 'validUntil', 'currency', 'incoterm', 'paymentTerms', 'leadTime', 'warranty', 'freight', 'rateMin', 'rateMax', 'kW', 'L', 'W', 'lines'],
  properties: {
    supplier: field({ type: ['string', 'null'] }), contact: field({ type: ['string', 'null'] }), ref: field({ type: ['string', 'null'] }),
    date: field({ type: ['string', 'null'] }), validUntil: field({ type: ['string', 'null'] }),
    currency: field({ type: ['string', 'null'], enum: ['USD', 'AUD', null] }), incoterm: field({ type: ['string', 'null'] }),
    paymentTerms: field({ type: ['string', 'null'] }), leadTime: field({ type: ['string', 'null'] }), warranty: field({ type: ['string', 'null'] }),
    freight: field(num), rateMin: field(num), rateMax: field(num), kW: field(num), L: field(num), W: field(num),
    lines: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['description', 'price', 'optional', 'snippet', 'confidence'],
        properties: { description: { type: 'string' }, price: num, optional: { type: 'boolean' }, snippet: { type: ['string', 'null'] }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } },
      },
    },
  },
};

const SYSTEM = `You extract equipment supplier quotes for a food manufacturing cost model.
Return only what the document states. If a field is not stated, set value to null. Never estimate power, footprint, rate or yield.
For every value, copy the exact source text into snippet. Rates must be in cups per hour: convert "15-20 cups/min" to rateMin 900 and rateMax 1200.
Dates as YYYY-MM-DD. Footprint L and W in metres. Split multi-item quotes into separate lines; mark optional extras optional: true.`;

async function extract(body) {
  const content = [];
  if (body.file) {
    const { mediaType, data } = body.file;
    if (mediaType === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: mediaType, data } });
    else if (mediaType.startsWith('image/')) content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
    else content.push({ type: 'text', text: Buffer.from(data, 'base64').toString('utf8') });
  }
  content.push({ type: 'text', text: body.text ? `Quote text:\n${body.text}` : 'Extract the quote in the attached file.' });
  const res = await client.beta.messages.create({
    model: MODEL, max_tokens: 16000, system: SYSTEM,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  });
  if (res.stop_reason === 'refusal') throw new Error('The model declined to read this document.');
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('No result returned');
  return JSON.parse(text);
}

http.createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.startsWith('/api/extract')) { res.writeHead(404).end(); return; }
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 30e6) { res.writeHead(413).end(); return; } }
  try {
    const out = await extract(JSON.parse(raw));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
  } catch (e) {
    const status = e instanceof Anthropic.AuthenticationError ? 401 : e instanceof Anthropic.RateLimitError ? 429 : e instanceof Anthropic.APIError ? 502 : 400;
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message }));
  }
}).listen(PORT, () => console.log(`Quote extraction proxy on http://localhost:${PORT}`));
