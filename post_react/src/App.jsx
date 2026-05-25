import { useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://localhost:8080/api";

const quickServices = [
  "간편사전접수",
  "우편번호 검색",
  "국내우편 배송조회",
  "주소라벨 인쇄",
];

const serviceTabs = ["우편", "국내소포", "EMS·국제우편", "조회 서비스", "고객센터"];

const initialForm = {
  recipient: "",
  phone: "",
  postalCode: "",
  address: "",
  detailAddress: "",
  memo: "",
};

const readApiResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const message = await response.text();
  return { success: false, message };
};

const isVirtualCamera = (label) => /droidcam|virtual|obs|snap camera/i.test(label);

const pickPreferredCamera = (devices) => {
  const videoDevices = devices.filter((device) => device.kind === "videoinput");
  return (
    videoDevices.find((device) => !isVirtualCamera(device.label)) ||
    videoDevices[0] ||
    null
  );
};

function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [activeCameraLabel, setActiveCameraLabel] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [form, setForm] = useState(initialForm);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const statusText = useMemo(() => {
    if (loading) return "인식 중";
    if (result?.success) return "주소 확인 필요";
    if (result) return "재촬영 필요";
    return "대기 중";
  }, [loading, result]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    setActiveCameraLabel("");
  };

  const refreshCameras = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    setCameras(videoDevices);
    return videoDevices;
  };

  const openCameraStream = async (deviceId) => {
    const constraints = deviceId
      ? { video: { deviceId: { exact: deviceId } } }
      : { video: true };
    return navigator.mediaDevices.getUserMedia(constraints);
  };

  const attachStream = (stream, deviceId, label = "") => {
    videoRef.current.srcObject = stream;
    streamRef.current = stream;
    setCameraReady(true);
    setSelectedCameraId(deviceId || "");
    setActiveCameraLabel(label);
    setResult(null);
  };

  const startCamera = async (requestedDeviceId = selectedCameraId) => {
    try {
      stopCamera();

      let stream = await openCameraStream(requestedDeviceId);
      const videoDevices = await refreshCameras();
      const track = stream.getVideoTracks()[0];
      const activeSettings = track?.getSettings?.() || {};
      const activeDevice = videoDevices.find((device) => device.deviceId === activeSettings.deviceId);
      const preferredDevice = requestedDeviceId
        ? videoDevices.find((device) => device.deviceId === requestedDeviceId)
        : pickPreferredCamera(videoDevices);

      if (
        preferredDevice?.deviceId &&
        activeDevice?.deviceId &&
        preferredDevice.deviceId !== activeDevice.deviceId &&
        isVirtualCamera(activeDevice.label)
      ) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        stream = await openCameraStream(preferredDevice.deviceId);
      }

      const finalTrack = stream.getVideoTracks()[0];
      const finalSettings = finalTrack?.getSettings?.() || {};
      const finalDevice = videoDevices.find((device) => device.deviceId === finalSettings.deviceId) || preferredDevice;
      attachStream(stream, finalDevice?.deviceId || "", finalDevice?.label || finalTrack?.label || "카메라");
    } catch (error) {
      setResult({
        success: false,
        message: "카메라 권한 또는 장치 설정을 확인해 주세요.",
        error: error.message,
      });
    }
  };

  const handleCameraChange = async (event) => {
    const nextDeviceId = event.target.value;
    setSelectedCameraId(nextDeviceId);
    if (cameraReady) {
      await startCamera(nextDeviceId);
    }
  };

  const applyAddress = (address, postalCode = "") => {
    setForm((current) => ({
      ...current,
      address,
      postalCode: postalCode || current.postalCode,
    }));
  };

  const readResultAddress = (data) => {
    if (!data) return "";
    if (typeof data.address === "string") return data.address;
    if (Array.isArray(data.addresses) && data.addresses.length > 0) {
      return data.addresses[0].roadAddress || data.addresses[0].address || "";
    }
    return "";
  };

  const captureAndOcr = async () => {
    if (!videoRef.current || !cameraReady) {
      setResult({ success: false, message: "먼저 카메라를 시작해 주세요." });
      return;
    }

    setLoading(true);
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);

    canvas.toBlob(async (blob) => {
      try {
        const formData = new FormData();
        formData.append("file", blob, "capture.png");

        const response = await fetch(`${API_BASE_URL}/ocr`, {
          method: "POST",
          body: formData,
        });
        const data = await readApiResponse(response);
        setResult(data);

        const address = readResultAddress(data);
        if (address) applyAddress(address, data.postalCode);
      } catch (error) {
        setResult({
          success: false,
          message: "OCR 서버와 연결하지 못했습니다.",
          error: error.message,
        });
      } finally {
        setLoading(false);
      }
    }, "image/png");
  };

  const searchAddress = async () => {
    if (!searchKeyword.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/search?keyword=${encodeURIComponent(searchKeyword.trim())}`,
      );
      const data = await readApiResponse(response);
      setResult(data);

      const address = readResultAddress(data);
      if (address) applyAddress(address, data.postalCode);
    } catch (error) {
      setResult({
        success: false,
        message: "주소 검색 서버와 연결하지 못했습니다.",
        error: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const resultAddresses = Array.isArray(result?.addresses) ? result.addresses : [];

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="utility-row">
          <span>인터넷우체국 업무 보조</span>
          <nav aria-label="보조 메뉴">
            <a href="#main">본문 바로가기</a>
            <a href="#support">고객센터</a>
            <a href="#login">로그인</a>
          </nav>
        </div>

        <div className="brand-row">
          <div className="brand-mark" aria-label="우체국 주소 인식">
            <span className="brand-symbol">우</span>
            <div>
              <strong>우체국 주소 인식</strong>
              <small>창구 접수 OCR 시스템</small>
            </div>
          </div>

          <div className="global-search" role="search">
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") searchAddress();
              }}
              placeholder="주소, 우편번호, 건물명을 입력하세요"
            />
            <button onClick={searchAddress} disabled={loading}>
              검색
            </button>
          </div>
        </div>

        <nav className="primary-nav" aria-label="주요 서비스">
          {serviceTabs.map((tab) => (
            <a href="#main" key={tab}>
              {tab}
            </a>
          ))}
        </nav>
      </header>

      <main id="main" className="workspace">
        <section className="hero-band" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">종이 주소 자동 입력</p>
            <h1 id="page-title">카메라로 주소를 읽고 접수 정보를 완성하세요</h1>
            <p className="hero-copy">
              고객이 작성한 주소지를 촬영하면 OCR 결과를 주소 입력란에 반영합니다. 창구 직원은
              인식 결과를 확인하고 상세주소만 보완하면 됩니다.
            </p>
          </div>
          <div className="status-panel" aria-live="polite">
            <span>현재 상태</span>
            <strong>{statusText}</strong>
          </div>
        </section>

        <section className="quick-services" aria-label="빠른 서비스">
          {quickServices.map((service) => (
            <button key={service}>{service}</button>
          ))}
        </section>

        <section className="work-grid">
          <div className="camera-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">STEP 1</p>
                <h2>주소지 촬영</h2>
              </div>
              <span className={cameraReady ? "pill ready" : "pill"}>{cameraReady ? "카메라 연결" : "대기"}</span>
            </div>

            <div className="camera-toolbar">
              <label>
                사용할 카메라
                <select value={selectedCameraId} onChange={handleCameraChange}>
                  <option value="">노트북 웹캠 자동 선택</option>
                  {cameras.map((camera, index) => (
                    <option key={camera.deviceId || index} value={camera.deviceId}>
                      {camera.label || `카메라 ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              {activeCameraLabel && <span>현재: {activeCameraLabel}</span>}
            </div>

            <div className="camera-frame">
              <video ref={videoRef} autoPlay playsInline muted />
              {!cameraReady && <div className="camera-placeholder">카메라 시작 후 주소지를 화면 안에 맞춰 주세요</div>}
              <div className="scan-guide" aria-hidden="true" />
            </div>

            <div className="button-row">
              <button className="secondary-button" onClick={() => startCamera()}>
                카메라 시작
              </button>
              <button className="secondary-button" onClick={stopCamera} disabled={!cameraReady}>
                중지
              </button>
              <button className="primary-button" onClick={captureAndOcr} disabled={loading}>
                {loading ? "인식 중..." : "촬영 및 인식"}
              </button>
            </div>
          </div>

          <div className="result-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">STEP 2</p>
                <h2>인식 결과 확인</h2>
              </div>
              {result && <span className={result.success ? "pill ready" : "pill warning"}>{result.success ? "성공" : "확인 필요"}</span>}
            </div>

            {!result && (
              <div className="empty-state">
                <strong>아직 인식 결과가 없습니다</strong>
                <span>카메라 촬영 또는 상단 검색으로 주소 후보를 불러오세요.</span>
              </div>
            )}

            {result && (
              <div className="result-box">
                {result.message && <p className="message">{result.message}</p>}
                {result.ocr_text && (
                  <label>
                    OCR 원문
                    <textarea value={result.ocr_text} readOnly />
                  </label>
                )}
                {result.keyword && (
                  <p>
                    <b>검색어</b>
                    <span>{result.keyword}</span>
                  </p>
                )}
                {result.address && (
                  <button className="address-choice" onClick={() => applyAddress(result.address, result.postalCode)}>
                    {result.postalCode && <small>{result.postalCode}</small>}
                    <span>{result.address}</span>
                  </button>
                )}
                {resultAddresses.map((item, index) => {
                  const address = item.roadAddress || item.address || item.jibunAddress;
                  return (
                    <button
                      className="address-choice"
                      key={`${address}-${index}`}
                      onClick={() => applyAddress(address, item.postalCode || item.zipNo)}
                    >
                      {(item.postalCode || item.zipNo) && <small>{item.postalCode || item.zipNo}</small>}
                      <span>{address}</span>
                    </button>
                  );
                })}
                {result.error && <p className="error-text">{result.error}</p>}
              </div>
            )}
          </div>

          <form className="receipt-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">STEP 3</p>
                <h2>접수 정보 입력</h2>
              </div>
              <button type="button" className="text-button" onClick={() => setForm(initialForm)}>
                초기화
              </button>
            </div>

            <div className="form-grid">
              <label>
                받는 분
                <input value={form.recipient} onChange={updateForm("recipient")} placeholder="홍길동" />
              </label>
              <label>
                연락처
                <input value={form.phone} onChange={updateForm("phone")} placeholder="010-0000-0000" />
              </label>
              <label className="postal-field">
                우편번호
                <input value={form.postalCode} onChange={updateForm("postalCode")} placeholder="00000" />
              </label>
              <label className="wide-field">
                주소
                <input value={form.address} onChange={updateForm("address")} placeholder="도로명 주소" />
              </label>
              <label className="wide-field">
                상세주소
                <input value={form.detailAddress} onChange={updateForm("detailAddress")} placeholder="동, 호수, 층 등" />
              </label>
              <label className="wide-field">
                접수 메모
                <textarea value={form.memo} onChange={updateForm("memo")} placeholder="창구 확인 사항" />
              </label>
            </div>

            <div className="receipt-actions">
              <button type="button" className="secondary-button">
                임시 저장
              </button>
              <button type="button" className="primary-button">
                접수 정보 확정
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
