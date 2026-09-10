const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  bn: "Bengali",
  gu: "Gujarati",
  mr: "Marathi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  pa: "Punjabi",
  ur: "Urdu",
  ar: "Arabic",
  fa: "Persian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const auth = req.headers.get("Authorization");

    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();

    const text = String(body?.text ?? "").trim();
    const sourceCode = String(body?.sourceLanguage ?? "").toLowerCase();
    const targetCode = String(body?.targetLanguage ?? "").toLowerCase();

    const sourceLanguage = LANGUAGE_NAMES[sourceCode];
    const targetLanguage = LANGUAGE_NAMES[targetCode];

    if (!text) {
      return json({ error: "Text is required." }, 400);
    }

    if (text.length > 3000) {
      return json({ error: "Message is too long." }, 400);
    }

    if (!sourceLanguage || !targetLanguage) {
      return json({
        error: `Unsupported language. source=${sourceCode}, target=${targetCode}`,
      }, 400);
    }

    if (sourceCode === targetCode) {
      return json({ translation: text });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing");
      return json({ error: "GEMINI_API_KEY is missing." }, 500);
    }

    console.log(
      `Translating ${sourceLanguage} -> ${targetLanguage}, keyPresent=${Boolean(apiKey)}, keyLength=${apiKey.length}`
    );

    const prompt =
      `Translate the following message from ${sourceLanguage} to ${targetLanguage}. ` +
      `Preserve meaning, tone, punctuation, emojis, names, URLs, numbers, and line breaks. ` +
      `Return only the translation. Do not explain anything.\n\n` +
      `MESSAGE:\n${text}`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    const result = await geminiResponse.json();

    console.log("Gemini status:", geminiResponse.status);

    if (!geminiResponse.ok) {
      console.error(
        "Gemini API error:",
        JSON.stringify(result)
      );

      return json(
        {
          error: "Gemini API request failed.",
          status: geminiResponse.status,
          details: result?.error?.message ?? result,
        },
        502
      );
    }

    const translation = result?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim();

    if (!translation) {
      console.error(
        "Gemini returned no translation:",
        JSON.stringify(result)
      );

      return json(
        {
          error: "Gemini returned an empty response.",
        },
        502
      );
    }

    return json({ translation });
  } catch (error) {
    console.error("Function error:", error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Translation failed.",
      },
      500
    );
  }
});