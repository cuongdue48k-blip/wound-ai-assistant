import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// 🎯 PROMPT hệ thống tối ưu cho tư vấn vết thương
const SYSTEM_PROMPT = `
Bạn là trợ lý AI chuyên tư vấn sơ cứu vết thương ngoài da.
Luôn trả lời bằng tiếng Việt.
Bạn sẽ nhận được:
- Văn bản người dùng mô tả vấn đề
- Nhãn dự đoán từ mô hình phân tích ảnh (6 loại):
  • Bỏng mức 1
  • Bỏng mức 2
  • Bỏng mức 3
  • Vết rách
  • Trầy xước
  • Da thường

Quy tắc:
- Luôn dựa vào nhãn dự đoán để tư vấn (rất quan trọng).
- Nếu “Da thường”: nói da bình thường, không cần sơ cứu.
- Nếu là bỏng: hướng dẫn theo mức độ 1–3.
- Nếu trầy xước: hướng dẫn rửa sạch, sát trùng, băng lại.
- Nếu vết rách: hướng dẫn cầm máu, vệ sinh, và cảnh báo đi viện nếu sâu.
- Trả lời rõ ràng, súc tích, từng bước.
- Không bao giờ nói “không hiểu yêu cầu”.
`;

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history, woundLabel, woundProb } = req.body;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      {
        role: "user",
        content: `
Người dùng hỏi: "${message}"

Thông tin từ mô hình ảnh:
- Loại vết thương: ${woundLabel || "Không có dữ liệu"}
- Độ tin cậy: ${(woundProb * 100).toFixed(1)}%

Hãy tư vấn dựa vào loại vết thương này.
`
      }
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "localhost",
        "X-Title": "Wound-AI-Assistant"
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages
      })
    });

    const data = await response.json();

    if (!data.choices) {
      return res.status(500).json({
        error: "Gemini 2.0 API Error",
        details: data
      });
    }

    const reply = data.choices[0].message.content;
    res.json({ reply });

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend Gemini 2.0 Flash chạy tại http://localhost:${PORT}`);
});
