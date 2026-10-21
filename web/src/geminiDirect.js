// Server-side Gemini call. The browser never imports this file.
// GEMINI_API_KEY stays in the Netlify and GitHub environments.

const MODEL = 'gemini-3.1-flash-lite';
const INPUT_USD = 0.25 / 1e6;
const OUTPUT_USD = 1.50 / 1e6;

function usageCost(usage) {
  const input = Number(usage?.promptTokenCount) || 0;
  const thoughts = Number(usage?.thoughtsTokenCount) || 0;
  let output = (Number(usage?.candidatesTokenCount) || 0) + thoughts;
  if (!input && !output) output = Number(usage?.totalTokenCount) || 0;
  return {
    usd: input * INPUT_USD + output * OUTPUT_USD,
    input,
    output,
    thoughts,
  };
}

function requestBody(prompt, schema, maxOutputTokens) {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };
}

export function parseGeminiResponse(body, ok, status) {
  const cost = usageCost(body?.usageMetadata);
  if (!ok) {
    const message = body?.error?.message || `gemini ${status}`;
    const error = new Error(String(message).slice(0, 180));
    error.status = status;
    throw error;
  }
  const parts = body.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((part) => !part.thought).map((part) => part.text || '').join('');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    const finish = body.candidates?.[0]?.finishReason || '';
    const error = new Error(`empty model response ${finish} in=${cost.input} out=${cost.output} thoughts=${cost.thoughts} text=${JSON.stringify(text).slice(0, 120)}`);
    error.cost = cost;
    throw error;
  }
  try {
    return { json: JSON.parse(text.slice(start, end + 1)), cost };
  } catch (error) {
    error.cost = cost;
    throw error;
  }
}

export async function geminiComplete(prompt, schema, maxOutputTokens) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('Missing GEMINI_API_KEY');
    error.status = 500;
    throw error;
  }
  if (prompt.length > 4000) throw new Error('prompt too long');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(requestBody(prompt, schema, maxOutputTokens)),
  });
  const body = await response.json();
  return parseGeminiResponse(body, response.ok, response.status);
}
