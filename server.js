
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const Tesseract = require("tesseract.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

// HOME
app.get("/", (req, res) => {
  res.json({
    system: "NATH-CODE",
    version: "2.1",
    status: "ONLINE",
    message: "Football Analysis Server Running"
  });
});

// SERVER STATUS
app.get("/api/health", (req, res) => {
  res.json({
    status: "ACTIVE",
    server: "NATH-CODE",
    time: new Date().toISOString()
  });
});

// ODDS ANALYSIS
app.post("/api/analyze", (req, res) => {
  try {
    const { homeTeam, awayTeam, odds } = req.body;

    if (!homeTeam || !awayTeam || !odds) {
      return res.status(400).json({
        error: "Enter both teams and odds"
      });
    }

    const home = Number(odds.home);
    const draw = Number(odds.draw);
    const away = Number(odds.away);

    if (![home, draw, away].every(
      n => Number.isFinite(n) && n > 1
    )) {
      return res.status(400).json({
        error: "Odds must be valid decimal numbers above 1"
      });
    }

    const raw = {
      home: 1 / home,
      draw: 1 / draw,
      away: 1 / away
    };

    const total = raw.home + raw.draw + raw.away;

    const probabilities = {
      home: +(raw.home / total * 100).toFixed(2),
      draw: +(raw.draw / total * 100).toFixed(2),
      away: +(raw.away / total * 100).toFixed(2)
    };

    const result = Object.entries(probabilities)
      .sort((a, b) => b[1] - a[1])[0];

    res.json({
      system: "NATH-CODE",
      match: `${homeTeam} vs ${awayTeam}`,
      odds: { home, draw, away },
      bookmakerMargin: +((total - 1) * 100).toFixed(2),
      probabilities,
      highestMarketProbability: {
        outcome: result[0],
        percentage: result[1]
      },
      note: "Market-implied probabilities, not guaranteed predictions."
    });

  } catch (error) {
    res.status(500).json({
      error: "Analysis failed"
    });
  }
});

// SCREENSHOT OCR
app.post("/api/ocr", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a screenshot"
      });
    }

    const result = await Tesseract.recognize(
      req.file.buffer,
      "eng"
    );

    const extractedText = result.data.text;

    const odds = extractedText.match(
      /\b\d+\.\d{1,3}\b/g
    ) || [];

    res.json({
      system: "NATH-CODE OCR",
      extractedText,
      detectedOdds: odds.map(Number),
      message: "Please verify extracted odds before analysis."
    });

  } catch (error) {
    res.status(500).json({
      error: "Image reading failed"
    });
  }
});

// ERROR HANDLER
app.use((err, req, res, next) => {
  res.status(500).json({
    error: "Server error"
  });
});

// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log(`NATH-CODE SERVER running on port ${PORT}`);
});
