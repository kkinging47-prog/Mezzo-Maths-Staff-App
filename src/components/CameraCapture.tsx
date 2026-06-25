import { useRef, useState } from 'react';
import { compressImage } from '../lib/images';

export function CameraCapture({ onCapture }: { onCapture: (file: File, previewUrl: string) => void }) {
  const [preview, setPreview] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressImage(file, 900, 0.76);
      const url = URL.createObjectURL(compressed);
      setPreview(url);
      onCapture(compressed, url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="camera-box">
      <input ref={inputRef} type="file" accept="image/*" capture="user" onChange={(event) => handleFile(event.target.files?.[0])} />
      {busy && <p className="hint">Optimising image...</p>}
      {preview && <img className="selfie-preview" src={preview} alt="Captured selfie preview" />}
      <p className="hint">Use your phone or laptop camera. The app reduces the image size before upload while keeping good quality.</p>
    </div>
  );
}
