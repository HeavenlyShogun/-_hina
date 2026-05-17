async function testMinimax() {
  const key = process.env.MINIMAX_API_KEY || process.env.VITE_MINIMAX_API_KEY;
  if (!key) {
    throw new Error('MINIMAX_API_KEY not found. Run with `node --env-file=.env.local scripts/test-minimax.mjs`.');
  }

  const payload = {
    model: process.env.MINIMAX_MODEL || 'MiniMax-Text-01',
    messages: [
      { role: 'system', name: 'MiniMax AI', content: 'You are a concise assistant.' },
      { role: 'user', name: 'User', content: 'Reply with: minimax ok' },
    ],
  };

  console.log('Testing MiniMax API...');

  const res = await fetch('https://api.minimax.io/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);

  if (!res.ok) {
    process.exitCode = 1;
  }
}

testMinimax().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
