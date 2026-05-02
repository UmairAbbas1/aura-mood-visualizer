import "dotenv/config";
import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.post("/api/analyze", async (req: Request, res: Response): Promise<void> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        /* Fallback mock data if there is no API key configured */
        setTimeout(() => {
          res.json({
            emotion: 'calm',
            intensity: 5,
            affirmation: "You are doing your best, and that is more than enough. Breathe.",
            color: "#6ec6c0"
          });
        }, 1500);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const { text } = req.body;

      if (!text) {
        res.status(400).json({ error: "Text is required" });
        return;
      }

      const prompt = `System context in the prompt: 
"You are an empathetic AI that analyzes emotions. Always respond ONLY with a valid JSON object, no markdown, no extra text."

User message:
"Analyze the emotional state in this text and respond with ONLY a JSON object with these exact keys:
- emotion: must be exactly one of these strings: joy, calm, anxiety, sadness, energy, focus
- intensity: a number from 1 to 10 representing emotional intensity
- affirmation: a single poetic sentence (max 20 words) responding to the person's feeling with warmth
- color: a hex color string that represents this emotion visually

Text to analyze: ${text}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          temperature: 0.7,
        }
      });

      let textContent = response.text || "";
      if (!textContent) {
        throw new Error("No text in response");
      }

      // Strip accidental markdown
      textContent = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const parsedAura = JSON.parse(textContent);
      
      const validEmotions = ['joy', 'calm', 'anxiety', 'sadness', 'energy', 'focus'];
      if (parsedAura && !validEmotions.includes(parsedAura.emotion)) {
          parsedAura.emotion = 'calm'; // fallback
      }

      res.json(parsedAura);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to analyze aura" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
