import React, { useState } from "react";
import { X } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";

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
  const [isLoading, setIsLoading] = useState(true);

  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Lock body scroll when modal is open
  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute -top-4 -right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors z-10"
          aria-label="Close preview"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner size="lg" light />
          </div>
        )}
        <img
          src={src}
          alt={alt}
          className={`max-w-full max-h-[90vh] object-contain rounded-lg transition-opacity duration-300 ${
            isLoading ? "opacity-0" : "opacity-100"
          }`}
          onClick={(e) => e.stopPropagation()}
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </div>
  );
});
