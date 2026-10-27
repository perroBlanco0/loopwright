// Thin OpenAI-compatible client for Nebius Token Factory + Nemotron model tier routing.
// Docs: https://docs.tokenfactory.nebius.com (base URL + bearer auth confirmed there,
// 2026-10). Model IDs below were confirmed live against GET /v1/models on 2026-10-27.

const BASE_URL = process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1';
const API_KEY = process.env.NEBIUS_API_KEY;

export const MODELS = {
  nano: process.env.NEBIUS_MODEL_NANO || 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  super: process.env.NEBIUS_MODEL_SUPER || 'nvidia/nemotron-3-super-120b-a12b',
  ultra: process.env.NEBIUS_MODEL_ULTRA || 'nvidia/Nemotron-3-Ultra-550b-a55b',
};

if (!API_KEY) {
  throw new Error('NEBIUS_API_KEY is not set — required to call Token Factory');
}

async function chatCompletion({ model, messages, tools, toolChoice = 'auto', temperature = 0.2 }) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: tools ? toolChoice : undefined,
      temperature,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token Factory request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const usage = data.usage || {};
  return {
    message: data.choices?.[0]?.message,
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    },
  };
}

/**
 * Escalation policy: Ultra for the one-off planning step, Nano for the bulk of the
 * iterate loop (cheap, fast), and promote to Super then Ultra only when the same
 * error has repeated `consecutiveFailures` times in a row — most iterations never
 * need more than Nano, which is what keeps the $25 budget from Fase 0 comfortable.
 */
export function pickModelForIteration(consecutiveFailures) {
  if (consecutiveFailures >= 4) return { tier: 'ultra', model: MODELS.ultra };
  if (consecutiveFailures >= 2) return { tier: 'super', model: MODELS.super };
  return { tier: 'nano', model: MODELS.nano };
}

export async function plan({ missionBrief }) {
  const { message, usage } = await chatCompletion({
    model: MODELS.ultra,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'You are a senior engineering lead. Given a coding mission, produce a short, ordered ' +
          'JSON checklist of concrete steps (3-8 items) an autonomous coding agent should take to ' +
          'complete it. Respond with ONLY a JSON array of strings, no prose.',
      },
      { role: 'user', content: missionBrief },
    ],
  });

  let todos;
  try {
    todos = JSON.parse(message.content);
  } catch {
    todos = [message.content];
  }
  return { todos, usage };
}

export async function nextStep({ tier, model, systemPrompt, history, tools }) {
  const { message, usage } = await chatCompletion({
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...history],
    tools,
  });
  return { message, usage, tier };
}
