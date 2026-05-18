import { useState, useRef } from "react";

function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // 웹캠 시작
  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current.srcObject = stream;
    streamRef.current = stream;
  };

  // 캡처 및 OCR
  const captureAndOcr = async () => {
    setLoading(true);
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);

    canvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append("file", blob, "capture.png");

      const res = await fetch("http://localhost:8080/api/ocr", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResult(data);
      setLoading(false);
    }, "image/png");
  };

  // 주소 검색
  const searchAddress = async () => {
    setLoading(true);
    const res = await fetch(
      `http://localhost:8080/api/search?keyword=${encodeURIComponent(searchKeyword)}`
    );
    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20, fontFamily: "sans-serif" }}>
      <h1 style={{ textAlign: "center", color: "#c0392b" }}>
        🏣 우체국 손글씨 주소 인식 시스템
      </h1>

      {/* 웹캠 영역 */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <video ref={videoRef} autoPlay style={{ width: "100%", maxWidth: 600, border: "2px solid #ddd", borderRadius: 8 }} />
        <div style={{ marginTop: 10 }}>
          <button onClick={startCamera} style={btnStyle("#3498db")}>📷 카메라 시작</button>
          <button onClick={captureAndOcr} style={btnStyle("#27ae60")} disabled={loading}>
            {loading ? "인식 중..." : "📸 캡처 & OCR 인식"}
          </button>
        </div>
      </div>

      {/* 음성/텍스트 검색 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          placeholder="주소 직접 입력 (예: 서울 강남구 테헤란로)"
          style={{ flex: 1, padding: "10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 16 }}
        />
        <button onClick={searchAddress} style={btnStyle("#e67e22")} disabled={loading}>
          🔍 검색
        </button>
      </div>

      {/* 결과 영역 */}
      {result && (
        <div style={{ background: result.success ? "#eafaf1" : "#fdecea", padding: 20, borderRadius: 8, border: `1px solid ${result.success ? "#27ae60" : "#e74c3c"}` }}>
          <h3 style={{ color: result.success ? "#27ae60" : "#e74c3c" }}>
            {result.success ? "✅ 인식 성공" : "❌ 인식 실패"}
          </h3>
          {result.ocr_text && <p><b>OCR 결과:</b> {result.ocr_text}</p>}
          {result.stt_text && <p><b>음성 인식:</b> {result.stt_text}</p>}
          {result.keyword && <p><b>검색어:</b> {result.keyword}</p>}
          {result.address && (
            <p style={{ fontSize: 20, fontWeight: "bold", color: "#2c3e50" }}>
              📍 최종 주소: {result.address}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle = (color) => ({
  background: color,
  color: "white",
  border: "none",
  padding: "10px 20px",
  borderRadius: 6,
  fontSize: 16,
  cursor: "pointer",
  margin: "0 5px",
});

export default App;