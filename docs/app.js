// URL model Teachable Machine của bạn
const TM_URL = "https://teachablemachine.withgoogle.com/models/vFRvY6BSX/";

let model;
let webcam;
let labelContainer;
let maxPredictions;
let bestLabel = null;
let bestProb = 0;

// Lịch sử hội thoại cho backend
const chatHistory = [];

// Đổi nếu backend deploy ở nơi khác
const BACKEND_URL = "https://wound-ai-assistant.onrender.com/api/chat";


async function loadModel() {
  const modelURL = TM_URL + "model.json";
  const metadataURL = TM_URL + "metadata.json";

  model = await tmImage.load(modelURL, metadataURL);
  maxPredictions = model.getTotalClasses();

  labelContainer = document.getElementById("label-container");
  labelContainer.innerHTML = "";

  for (let i = 0; i < maxPredictions; i++) {
    labelContainer.appendChild(document.createElement("div"));
  }

  setBestLabelText(
    "Mô hình hình ảnh đã sẵn sàng. Hãy dùng webcam hoặc chọn một ảnh vết thương."
  );
}

function setBestLabelText(text) {
  const bestLabelDiv = document.getElementById("best-label");
  bestLabelDiv.textContent = text;
}

async function setupWebcam() {
  if (!model) await loadModel();

  const flip = true;
  webcam = new tmImage.Webcam(220, 220, flip);
  await webcam.setup();
  await webcam.play();

  const webcamContainer = document.getElementById("webcam-container");
  webcamContainer.innerHTML = "";
  webcamContainer.appendChild(webcam.canvas);

  window.requestAnimationFrame(loopWebcam);
}

function stopWebcam() {
  if (webcam) {
    webcam.stop();
    webcam = null;
  }
  const webcamContainer = document.getElementById("webcam-container");
  webcamContainer.innerHTML = "";
}

async function loopWebcam() {
  if (!webcam) return;
  webcam.update();
  await predict(webcam.canvas);
  window.requestAnimationFrame(loopWebcam);
}

// Chạy dự đoán cho một phần tử HTML (canvas hoặc img)
async function predict(inputEl) {
  if (!model) await loadModel();

  const prediction = await model.predict(inputEl);

  bestLabel = null;
  bestProb = 0;

  for (let i = 0; i < maxPredictions; i++) {
    const p = prediction[i];
    const classPrediction = `${p.className}: ${p.probability.toFixed(2)}`;
    labelContainer.childNodes[i].textContent = classPrediction;

    if (p.probability > bestProb) {
      bestProb = p.probability;
      bestLabel = p.className;
    }
  }

  if (bestLabel) {
    setBestLabelText(
      `Mô hình dự đoán: ${bestLabel} (độ tin cậy: ${(bestProb * 100).toFixed(1)}%)`
    );
  } else {
    setBestLabelText("Chưa có dự đoán từ mô hình.");
  }
}

// Upload ảnh từ máy
function setupImageUpload() {
  const input = document.getElementById("image-upload");
  const img = document.getElementById("uploaded-image");

  input.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      img.style.display = "block";

      img.onload = async () => {
        await predict(img);
      };
    };
    reader.readAsDataURL(file);
  });
}

// CHAT UI
function addMessage(role, text, { typing = false } = {}) {
  const messagesDiv = document.getElementById("messages");
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (typing) {
    bubble.classList.add("typing");
    for (let i = 0; i < 3; i++) {
      const d = document.createElement("div");
      d.className = "dot";
      bubble.appendChild(d);
    }
  } else {
    bubble.textContent = text;
  }

  wrapper.appendChild(bubble);
  messagesDiv.appendChild(wrapper);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  return wrapper;
}

function removeElement(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

async function sendMessage() {
  const input = document.getElementById("user-input");
  const text = input.value.trim();
  if (!text) return;

  addMessage("user", text);
  chatHistory.push({ role: "user", content: text });
  input.value = "";

  const typingBubble = addMessage("assistant", "", { typing: true });

  try {
    const payload = {
      message: text,
      history: chatHistory,
      woundLabel: bestLabel,
      woundProb: bestProb,
    };

    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    removeElement(typingBubble);

    if (!res.ok) {
      const errText = await res.text();
      addMessage(
        "assistant",
        "Có lỗi khi kết nối tới server. Chi tiết: " + errText
      );
      return;
    }

    const data = await res.json();
    const reply =
      data.reply ||
      "Hiện mình không nhận được phản hồi từ mô hình. Hãy thử lại sau một lúc nhé.";

    addMessage("assistant", reply);
    chatHistory.push({ role: "assistant", content: reply });
  } catch (err) {
    console.error(err);
    removeElement(typingBubble);
    addMessage(
      "assistant",
      "Không kết nối được tới server. Hãy kiểm tra lại backend DeepSeek."
    );
  }
}

// INIT
window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadModel();
  } catch (err) {
    console.error(err);
    setBestLabelText(
      "Không tải được mô hình hình ảnh. Hãy kiểm tra lại URL Teachable Machine."
    );
  }

  setupImageUpload();

  document.getElementById("btn-webcam").addEventListener("click", setupWebcam);
  document.getElementById("btn-stop-webcam").addEventListener("click", stopWebcam);
  document.getElementById("send-btn").addEventListener("click", sendMessage);

  document.getElementById("user-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage();
    }
  });

  const hello =
    "Xin chào, mình là trợ lý AI hỗ trợ thông tin sơ cứu bỏng/vết thương ngoài da. Bạn có thể chụp hoặc tải ảnh vết thương, sau đó mô tả tình trạng để mình gợi ý sơ cứu cơ bản. (Lưu ý: mình không thay thế bác sĩ nhé!)";
  addMessage("assistant", hello);
});
