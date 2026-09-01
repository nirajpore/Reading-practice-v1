export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { theme } = req.body || {};
    const prompt = `Write a short, friendly children's story (3-6 short paragraphs) about the theme: "${theme || 'a friendly animal'}". Keep language simple and positive.`;

    const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
    if (!HF_TOKEN) return res.status(500).json({ error: 'Server missing HUGGINGFACE_TOKEN env var' });

    const model = 'google/flan-t5-small';
    const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 250, temperature: 0.8 } })
    });

    const text = await r.text();
    if (!r.ok) {
      // Forward HF error body & status
      return res.status(r.status).send(text);
    }

    let data;
    try { data = JSON.parse(text); } catch (e) { data = text; }

    let generated = null;
    if (Array.isArray(data) && data.length > 0) generated = data[0].generated_text || data[0].text || data[0].generated_text;
    else if (data && (data.generated_text || data.text)) generated = data.generated_text || data.text;
    else generated = typeof data === 'string' ? data : JSON.stringify(data);

    return res.status(200).json({ story: (generated || '').trim() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
