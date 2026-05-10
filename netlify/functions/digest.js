exports.handler = async (event) => {
  // Handle CORS preflight
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY not set' }) };
  }

  let prompt;
  try {
    const body = JSON.parse(event.body);
    prompt = body.prompt;
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!prompt) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No prompt provided' }) };
  }

  try {
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
      }
    );

    const rawText = await geminiResp.text();

    if (!geminiResp.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Gemini API error: ' + rawText.substring(0, 200) })
      };
    }

    const data = JSON.parse(rawText);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Empty response from Gemini', raw: rawText.substring(0, 200) })
      };
    }

    // Clean and extract just the JSON object
    let cleaned = text.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      cleaned = cleaned.substring(start, end + 1);
    }

    // Validate it parses before returning
    try {
      JSON.parse(cleaned);
    } catch(e) {
      // Try to fix common issues - trailing commas, unescaped chars
      cleaned = cleaned
        .replace(/,(\s*[}\]])/g, '$1')  // remove trailing commas
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' '); // remove control chars
    }

    return { statusCode: 200, headers, body: JSON.stringify({ text: cleaned }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
