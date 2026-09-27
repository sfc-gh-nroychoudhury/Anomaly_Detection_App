import { readFileSync } from 'fs';

export const dynamic = 'force-dynamic';

// Streams a Cortex COMPLETE narrative token-by-token via the Cortex REST
// inference API, using the same OAuth token + host convention as lib/snowflake.ts
// (see the note there re: SPCS-in-Native-App token injection -- unverified
// against a real deployment, same caveat applies here).
const TOKEN_PATH = '/snowflake/session/token';
const INFERENCE_PATH = '/api/v2/cortex/inference:complete';

export async function POST(req: Request, { params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);
  const { signalSummary, querySummary } = await req.json().catch(() => ({ signalSummary: '', querySummary: '' }));

  const host = process.env.SNOWFLAKE_HOST;
  if (!host) {
    return new Response('SNOWFLAKE_HOST is not set; this only works inside the SPCS service container.', { status: 500 });
  }

  let token: string;
  try {
    token = readFileSync(TOKEN_PATH, 'utf-8').trim();
  } catch (err) {
    return new Response(`Could not read OAuth token: ${(err as Error).message}`, { status: 500 });
  }

  const prompt =
    `You are a security analyst. Based on the following ML anomaly detection signals for user "${userName}", ` +
    `write a 3-4 sentence security finding narrative. Be specific about what happened and the risk.\n\n` +
    `Anomaly signals: ${signalSummary || 'none'}\nRecent query types: ${querySummary || 'unknown'}\n\nNarrative:`;

  const upstream = await fetch(`https://${host}${INFERENCE_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Snowflake-Authorization-Token-Type': 'OAUTH',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: 'mistral-large2',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const body = await upstream.text().catch(() => '');
    return new Response(`Cortex inference request failed (${upstream.status}): ${body}`, { status: 502 });
  }

  // Re-emit the upstream SSE stream, extracting just the delta text tokens so
  // the client doesn't need to know the Cortex inference wire format.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content ?? '';
              if (delta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
            } catch {
              // Ignore malformed/partial SSE chunks.
            }
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
