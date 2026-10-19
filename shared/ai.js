// Panggilan AI bersama (Edukasi Studio, Market Recap): Claude kalau secret ANTHROPIC_API_KEY ada, selain itu Workers AI
// (binding AI di wrangler.jsonc). Mengembalikan { text, model }; kegagalan yang pantas ditampilkan ke pengguna = AiError.
//
//   import { ai, AiError } from "../../shared/ai.js";
//   const { text } = await ai(env, system, user, maxTokens, "claude-opus-5-5");
export class AiError extends Error {}

function pickText(r) {
  if (typeof r === 'string') return r;
  if (!r) return '';
  if (typeof r.response === 'string') return r.response;
  if (r.choices && r.choices[0]) return (r.choices[0].message && r.choices[0].message.content) || r.choices[0].text || '';
  if (Array.isArray(r.output)) return r.output.filter(o => o.type === 'message').flatMap(o => o.content || []).map(c => c.text || '').join('');
  if (r.result) return pickText(r.result);
  return '';
}
const cleanAi = s => String(s || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*?assistantfinal/, '').trim();

export async function ai(env, system, user, maxTokens, model = env.CLAUDE_MODEL || 'claude-sonnet-5-5') {
  if (env.ANTHROPIC_API_KEY) {
    // fallbacks "default": kalau model menolak (refusal), API mengulang di model cadangan dalam panggilan yang sama
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, fallbacks: 'default', system, messages: [{ role: 'user', content: user }] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new AiError('Claude API: ' + ((j.error && j.error.message) || 'HTTP ' + r.status));
    if (j.stop_reason === 'refusal') throw new AiError('Claude menolak permintaan ini.');
    return { text: (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim(), model: j.model || model };
  }
  if (!env.AI) throw new AiError('Binding Workers AI (nama: AI) belum dipasang di worker ini.');
  const models = [env.AI_MODEL || '@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
  let last = '';
  for (const m of [...new Set(models)]) {
    try {
      // model "reasoning" (gpt-oss) memakai sebagian token untuk berpikir, jadi diberi ruang lebih
      const r = await env.AI.run(m, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: /gpt-oss/.test(m) ? maxTokens + 3000 : maxTokens });
      const text = cleanAi(pickText(r));
      if (text.length > 40) return { text, model: m.replace('@cf/', '') };
      last = 'jawaban kosong dari ' + m;
    } catch (e) {
      last = e && e.message || String(e);
      if (/4006|neuron|allocation|quota/i.test(last)) throw new AiError('Kuota AI gratis hari ini sudah habis. Kuota terisi lagi pukul 07.00 WIB.');
    }
  }
  throw new AiError('AI gagal menjawab: ' + last);
}
