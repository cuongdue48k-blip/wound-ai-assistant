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
- Trả lời rõ ràng, từng bước, dễ hiểu.
- Không bao giờ nói “không hiểu yêu cầu”.
`;

// ---------------------------------------------------------
// 🚀 PHẦN LOCAL Q&A – KỊCH BẢN TỰ TRAIN (KHÔNG GỌI AI)
// ---------------------------------------------------------

// Hàm bỏ dấu tiếng Việt → giúp match từ khoá dễ dàng
function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9 ]/g, " ");
}

// Danh sách câu trả lời local (LUÔN ở trong 1 mảng [])
const LOCAL_QA = [
  {
    id: "trayxuoc_basic",
    keywords: ["tray xuoc", "trầy xước", "xay da", "tia vet tray"],
    answer: `Nếu bạn bị trầy xước nhẹ, có thể làm như sau:
1. Rửa tay sạch với xà phòng.
2. Rửa vết thương dưới vòi nước mát để loại bỏ bụi bẩn.
3. Dùng khăn sạch/gạc lau khô nhẹ.
4. Sát khuẩn nhẹ bằng povidone-iodine hoặc chlorhexidine.
5. Băng lại nếu vùng da dễ bị cọ xát.

Nếu sưng, đỏ, đau nhiều, chảy mủ hoặc sốt → đi khám bác sĩ sớm nhé.`
  },
  {
    id: "bong_muc1",
    keywords: ["bong muc 1", "bỏng mức 1", "bong nhe"],
    answer: `Bỏng mức 1 thường chỉ đỏ da và rát nhẹ. Cách xử lý:
1. Làm mát vùng bỏng bằng nước mát chạy liên tục 10–20 phút.
2. Không dùng kem đánh răng, nước mắm, dầu gió... bôi lên vết bỏng.
3. Giữ vùng da sạch và khô.
4. Cơn đau có thể giảm với paracetamol (đúng liều).

Nếu bỏng diện rộng hoặc ở mặt, hãy đi khám để được đánh giá chi tiết.`
  },
  {
    id: "bong_muc2",
    keywords: ["bong muc 2", "bỏng mức 2", "phong rop", "phong nuoc"],
    answer: `Bỏng mức 2 thường gây phồng rộp và đau rát nhiều. Cách xử lý:
1. Làm mát vết bỏng dưới vòi nước mát 15–20 phút.
2. Không chọc vỡ bóng nước (dễ nhiễm trùng).
3. Không bôi kem đánh răng, dầu gió, nước mắm...
4. Che phủ bằng gạc sạch, không dính.
5. Có thể dùng paracetamol nếu đau nhiều (đúng liều).

Nếu bỏng ở mặt, bộ phận sinh dục hoặc diện rộng → nên đi bệnh viện sớm.`
  },
  {
    id: "bong_muc3",
    keywords: ["bong muc 3", "bỏng mức 3", "bong sau", "da trang bech", "chay den"],
    answer: `Bỏng mức 3 là bỏng sâu rất nghiêm trọng:
- Da có thể trắng bệch, cháy đen hoặc mất cảm giác đau.

Sơ cứu:
1. Ngừng tác động nhiệt ngay.
2. Che phủ nhẹ bằng gạc sạch (không dính).
3. Không ngâm nước quá lâu.
4. Gọi cấp cứu hoặc đến bệnh viện ngay lập tức.

Bỏng mức 3 luôn cần điều trị chuyên khoa, không tự xử lý tại nhà.`
  },
  {
    id: "bong_hoa_chat",
    keywords: ["bong hoa chat", "axit", "kiem", "naoh", "hcl", "hoa chat"],
    answer: `Bỏng hóa chất cần xử lý ngay:
1. Rửa vùng da dưới vòi nước chảy liên tục ít nhất 15–20 phút.
2. Tháo bỏ quần áo, đồ trang sức bị dính hóa chất.
3. Không tự ý dùng hóa chất ngược lại để trung hòa.
4. Che phủ bằng gạc sạch.

Nếu bỏng rộng, đau nhiều, hoặc hóa chất bắn vào mặt/mắt → đi cấp cứu ngay.`
  },
  {
    id: "bong_dien",
    keywords: ["bong dien", "điện giật", "ho giat", "bong do dien"],
    answer: `Bỏng điện rất nguy hiểm do tổn thương sâu và có thể ảnh hưởng tim mạch:
1. Ngắt nguồn điện hoặc tách nạn nhân khỏi nguồn bằng vật cách điện.
2. Kiểm tra nhịp thở, ý thức và gọi cấp cứu nếu cần.
3. Che phủ vết bỏng bằng gạc sạch, khô.
4. Không chườm nước lên vùng bỏng điện.

Luôn đến bệnh viện để được kiểm tra thêm, ngay cả khi vết bỏng bên ngoài nhỏ.`
  },
  {
    id: "vet_rach_sau",
    keywords: ["vet rach sau", "rach da sau", "rach nhieu", "rach dai"],
    answer: `Vết rách sâu cần được đánh giá khâu:
1. Rửa nhẹ bằng nước sạch hoặc nước muối sinh lý.
2. Dùng gạc ấn nhẹ để cầm máu trong 10–15 phút.
3. Không đổ oxy già vào sâu trong mô (dễ làm tổn thương mô hạt).
4. Che phủ và đến cơ sở y tế để khâu, nhất là khi mép vết thương hở rộng hoặc nhìn thấy mô mỡ.`
  },
  {
    id: "nghi_nhiem_trung",
    keywords: ["nhiem trung", "mu", "sung do", "nong do", "mui hoi"],
    answer: `Dấu hiệu nhiễm trùng vết thương:
- Sưng đỏ tăng dần
- Nóng quanh vết thương
- Đau tăng, chảy dịch đục hoặc mủ
- Có thể kèm sốt, mệt mỏi

Xử lý:
1. Vệ sinh nhẹ nhàng, sát khuẩn vùng xung quanh.
2. Không tự nặn mủ.
3. Đi khám để bác sĩ cân nhắc kháng sinh và xử trí vết thương.`
  },
  {
    id: "uon_van",
    keywords: ["uon van", "tiem ngua", "nhac lai", "tiem uon van", "chan thuong ban"],
    answer: `Bạn nên tiêm nhắc lại uốn ván nếu:
- Bị vết thương do đinh sắt, kim loại bẩn, tai nạn giao thông.
- Vết thương dơ, có đất, cát, phân, rỉ sét.
- Đã hơn 5–10 năm chưa tiêm uốn ván.

Nếu không nhớ rõ lịch tiêm → nên đi cơ sở y tế để được tư vấn và tiêm sớm.`
  },
  {
    id: "chai_mau_khong_cam",
    keywords: ["khong cam mau", "chay mau mai", "khong dung mau"],
    answer: `Nếu chảy máu không cầm:
1. Dùng gạc hoặc vải sạch ép trực tiếp lên vết thương trong 10–15 phút.
2. Không gỡ gạc ra quá sớm để "xem thử" vì làm vỡ cục máu đông.
3. Nếu vẫn không cầm hoặc máu phun mạnh → đi cấp cứu ngay.`
  },
  {
    id: "dong_vat_can",
    keywords: ["cho can", "meo can", "dong vat can"],
    answer: `Khi bị chó/mèo hoặc động vật cắn:
1. Rửa kỹ bằng xà phòng dưới vòi nước ít nhất 15 phút.
2. Sát khuẩn bằng povidone-iodine.
3. Không băng kín hoàn toàn.
4. Theo dõi con vật 10–14 ngày (nếu có thể).
5. Nếu nghi ngờ dại hoặc không rõ nguồn gốc con vật → đi bệnh viện để tiêm phòng dại càng sớm càng tốt.`
  },
  {
    id: "di_ung_thuoc",
    keywords: ["di ung", "noi me do", "di ung thuoc", "mui do", "ngua nhieu"],
    answer: `Dị ứng thuốc có thể biểu hiện:
- Nổi mề đay, ngứa
- Mẩn đỏ, phù nhẹ

Xử lý:
1. Ngưng ngay thuốc nghi ngờ.
2. Có thể dùng kháng histamin (cetirizine, loratadine...) nếu không chống chỉ định.
3. Nếu khó thở, sưng môi, sưng lưỡi, choáng → đi cấp cứu ngay (nguy cơ phản vệ).`
  },
  {
    id: "meo_dan_gian",
    keywords: ["kem danh rang", "nuoc mam", "boi thuoc la", "boi nghe", "meo dan gian"],
    answer: `Các mẹo dân gian như:
- Bôi kem đánh răng
- Bôi nước mắm, nước tương
- Bôi dầu gió, xăng, rượu
- Bôi thuốc lào, nghệ tươi trực tiếp

❌ Không nên dùng trên vết bỏng hoặc vết thương hở.
Chúng có thể làm bỏng nặng hơn, gây nhiễm trùng và che mất tổn thương thật.

Hãy dùng:
- Nước sạch
- Gạc vô khuẩn
- Dung dịch sát khuẩn được khuyến cáo trong y khoa.`
  },
  {
    id: "khi_nao_di_benh_vien",
    keywords: ["khi nao di benh vien", "luc nao can di benh vien", "co can di vien khong"],
    answer: `Bạn nên đi bệnh viện ngay trong các trường hợp sau:
- Bỏng mức 3, bỏng sâu, da trắng bệch hoặc cháy đen.
- Vết rách sâu, chảy máu không cầm sau 10–15 phút.
- Vết thương ở mặt, mắt, bộ phận sinh dục, khớp, bàn tay, bàn chân.
- Có dấu hiệu nhiễm trùng: sưng nhiều, nóng, đỏ, đau tăng, chảy mủ, sốt.

Trong các trường hợp này, thông tin từ trợ lý chỉ là tham khảo, không thay thế bác sĩ.`
  }
];

// Tìm xem câu hỏi có khớp Q&A local không
function findLocalAnswer(userMessage) {
  const normMsg = normalize(userMessage);

  for (const item of LOCAL_QA) {
    const matched = item.keywords.some(kw =>
      normMsg.includes(normalize(kw))
    );
    if (matched) return item;
  }
  return null;
}

// ---------------------------------------------------------
// 🚀 PHẦN CHÍNH: API CHAT
// ---------------------------------------------------------

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history, woundLabel, woundProb } = req.body;

    // 1️⃣ Trả lời bằng Local Q&A trước (không tốn API)
    const local = findLocalAnswer(message || "");
    if (local) {
      return res.json({
        reply: local.answer,
        source: "local"
      });
    }

    // 2️⃣ Không có Q&A local → gọi Gemini qua OpenRouter
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(history || []),
      {
        role: "user",
        content: `
Người dùng hỏi: "${message}"

Thông tin từ mô hình ảnh:
- Loại vết thương: ${woundLabel || "Không có dữ liệu"}
- Độ tin cậy: ${woundProb ? (woundProb * 100).toFixed(1) + "%" : "Không rõ"}

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

    // ❗ Nếu API bị quá tải (429)
    if (data?.error?.code === 429) {
      return res.json({
        reply:
          "Hiện tại máy chủ Gemini miễn phí đang quá tải, bạn hãy thử lại sau vài phút nhé.",
        source: "rate_limit"
      });
    }

    if (!data.choices || !data.choices[0]?.message?.content) {
      return res.status(500).json({
        error: "Gemini 2.0 API Error",
        details: data
      });
    }

    const reply = data.choices[0].message.content;
    res.json({ reply, source: "gemini" });

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

// ---------------------------------------------------------

app.listen(PORT, () => {
  console.log(`🚀 Backend Gemini 2.0 Flash chạy tại http://localhost:${PORT}`);
});
