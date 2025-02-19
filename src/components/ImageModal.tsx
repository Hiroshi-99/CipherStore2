import React from "react";

interface ImageModalProps {
  imageUrl: string;
  alt: string;
  onClose: () => void;
}

function ImageModal({ imageUrl, alt, onClose }: ImageModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative max-w-2xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={imageUrl} alt={alt} className="w-full rounded-lg" />
        <button
          type="button"
          className="absolute -top-4 -right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 text-white transition-colors"
          onClick={onClose}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default ImageModal;
