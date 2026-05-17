import express from 'express';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions';
const DEFAULT_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-Text-01';

app.use(express.json({ limit: '1mb' }));

app.get('/api/minimax/health', (_req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(process.env.MINIMAX_API_KEY),
    model: DEFAULT_MODEL,
  });
});

app.post('/api/minimax', async (req, res) => {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'MINIMAX_API_KEY is not set on the server.' });
  }

  const payload = {
    model: DEFAULT_MODEL,
    ...req.body,
  };

  try {
    const response = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    res
      .status(response.status)
      .type(response.headers.get('content-type') || 'application/json')
      .send(text);
  } catch (error) {
    res.status(502).json({
      error: 'Failed to reach MiniMax API.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Minimax proxy listening on http://127.0.0.1:${PORT}`);
});
