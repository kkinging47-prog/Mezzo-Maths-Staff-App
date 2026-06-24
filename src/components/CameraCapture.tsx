import { useRef, useState } from 'react';

export function CameraCapture({ onCapture }: { onCapture: (file: File, previewUrl: string) => void }) {
  const [preview, setPreview] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    onCapture(file, url);
  }

  return (
    <div className="camera-box">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      {preview && <img className="selfie-preview" src={preview} alt="Captured selfie preview" />}
      <p className="hint">Use your phone or laptop camera. Staff must take a fresh photo when checking in.</p>
    </div>
  );
}
