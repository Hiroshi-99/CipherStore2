import React, { useEffect, useState, useRef } from "react";
import { XCircle, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

interface ImageModalProps {
  imageUrl: string;
  alt: string;
  onClose: () => void;
}

function ImageModal({ imageUrl, alt, onClose }: ImageModalProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=")
        setScale((s) => Math.min(s + 0.25, 3));
      if (e.key === "-") setScale((s) => Math.max(s - 0.25, 0.5));
      if (e.key === "r") setRotation((r) => (r + 90) % 360);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const focusableElements = document.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[
      focusableElements.length - 1
    ] as HTMLElement;

    if (firstElement) firstElement.focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener("keydown", handleTabKey);
    return () => window.removeEventListener("keydown", handleTabKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-modal-title"
    >
      <div
        className="relative max-w-5xl w-full mx-4 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex justify-between items-center mb-4"
          id="image-modal-title"
        >
          <h2 className="text-white font-medium truncate">{alt}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}
              aria-label="Zoom out"
            >
              <ZoomOut size={20} />
            </button>
            <button
              type="button"
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              onClick={() => setScale((s) => Math.min(s + 0.25, 3))}
              aria-label="Zoom in"
            >
              <ZoomIn size={20} />
            </button>
            <button
              type="button"
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Rotate image"
            >
              <RotateCw size={20} />
            </button>
            <button
              type="button"
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              onClick={onClose}
              aria-label="Close"
            >
              <XCircle size={20} />
            </button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-lg bg-black/50 flex items-center justify-center h-[70vh]">
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            </div>
          )}

          {error ? (
            <div className="text-center p-8">
              <p className="text-red-400 mb-4">Failed to load image</p>
              <button
                onClick={() => {
                  setError(false);
                  setLoading(true);
                  if (imgRef.current) {
                    imgRef.current.src = imageUrl;
                  }
                }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded text-white"
              >
                Retry
              </button>
            </div>
          ) : (
            <img
              ref={imgRef}
              src={imageUrl}
              alt={alt}
              className="max-w-full max-h-full object-contain transition-all"
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                opacity: loading ? 0 : 1,
              }}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default ImageModal;
