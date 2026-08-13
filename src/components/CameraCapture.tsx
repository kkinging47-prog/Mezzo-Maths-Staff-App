import { useEffect, useRef, useState } from 'react';

export function CameraCapture({ onCapture }: { onCapture: (file: File, previewUrl: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState('');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  }

  async function openCamera() {
    setBusy(true);
    setMessage('');
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
    } catch {
      setMessage('Could not open the camera. Please allow camera access and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function takePhoto() {
    if (!videoRef.current || !ready) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 900;
      canvas.height = videoRef.current.videoHeight || 900;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No canvas context');
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
      if (!blob) throw new Error('No image blob');
      const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(file);
      setPreview(url);
      onCapture(file, url);
      stopStream();
      setMessage('Photo captured.');
    } catch {
      setMessage('Could not take photo. Try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => () => stopStream(), []);

  return (
    <div className="camera-box">
      <div className="button-row">
        <button type="button" className="primary small-button" onClick={openCamera} disabled={busy}>{ready ? 'Restart Camera' : 'Open Camera'}</button>
        <button type="button" className="small-button" onClick={takePhoto} disabled={!ready || busy}>Take Photo</button>
      </div>
      {message && <p className="hint">{message}</p>}
      {ready && <video ref={videoRef} className="selfie-preview" playsInline muted autoPlay />}
      {preview && <img className="selfie-preview" src={preview} alt="Captured preview" />}
      <p className="hint">Use the camera button to take the photo now.</p>
    </div>
  );
}
