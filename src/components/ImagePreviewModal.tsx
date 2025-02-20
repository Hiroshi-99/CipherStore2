import React from "react";
import { X } from "lucide-react";

interface ImagePreviewModalProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export const ImagePreviewModal = React.memo(function ImagePreviewModal({
  src,
  alt,
  onClose,
}: ImagePreviewModalProps) {
  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
          aria-label="Close preview"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[90vh] object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
});
