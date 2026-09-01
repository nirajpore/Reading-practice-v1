import dns from 'dns/promises';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const debug = {
    dnsLookup: null,
    ipify: null,
    hfRequestStatus: null
  };

  try {
    const { theme } = req.body || {};
    const prompt = `Write a short, friendly children's story (3-6 short paragraphs) about the theme: "${theme || 'a friendly animal'}". Keep language simple and positive.`;

    const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
    if (!HF_TOKEN) return res.status(500).json({ error: 'Server missing HUGGINGFACE_TOKEN env var' , debug});

    // 1) DNS lookup for the Hugging Face host
    try {
      const lookupResult = await dns.lookup('api-inference.huggingface.co', { all: true });
      debug.dnsLookup = lookupResult;
      console.log('DNS lookup result:', lookupResult);
    } catch (dnsErr) {
      debug.dnsLookup = { error: dnsErr && dnsErr.message ? dnsErr.message : String(dnsErr) };
      console.error('DNS lookup failed:', dnsErr);
    }

    // 2) Outbound connectivity check (what is our egress IP)
    try {
      const ipResp = await fetch('https://api.ipify.org?format=json');
      debug.ipify = { ok: ipResp.ok, status: ipResp.status, body: await ipResp.text() };
      console.log('ipify result:', debug.ipify);
    } catch (ipErr) {
      debug.ipify = { error: ipErr && ipErr.message ? ipErr.message : String(ipErr) };
      console.error('ipify fetch failed:', ipErr);
    }

    // 3) Call Hugging Face
    const model = 'google/flan-t5-small';
    try {
      const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 250, temperature: 0.8 } })
      });

      debug.hfRequestStatus = { ok: r.ok, status: r.status };

      const text = await r.text();
      if (!r.ok) {
        // forward HF error (status & body) plus debug
        return res.status(r.status).json({ error: text, debug });
      }

      let data;
      try { data = JSON.parse(text); } catch (e) { data = text; }

      let generated = null;
      if (Array.isArray(data) && data.length > 0) generated = data[0].generated_text || data[0].text || data[0].generated_text;
      else if (data && (data.generated_text || data.text)) generated = data.generated_text || data.text;
      else generated = typeof data === 'string' ? data : JSON.stringify(data);

      return res.status(200).json({ story: (generated || '').trim(), debug });

    } catch (hfErr) {
      // Network-level error when calling HF
      console.error('Hugging Face fetch failed:', hfErr);
      debug.hfFetchError = hfErr && hfErr.message ? hfErr.message : String(hfErr);
      if (hfErr && hfErr.stack) debug.hfFetchStack = hfErr.stack;
      return res.status(500).json({ error: 'fetch failed', debug });
    }

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
}
