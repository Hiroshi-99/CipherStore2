import React, { useState } from "react";
import { FileText, Image, Download, AlertCircle } from "lucide-react";
import { ImagePreviewModal } from "./ImagePreviewModal";

interface FileAttachment {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string;
}

const formatFileSize = React.memo(function formatFileSize(
  bytes: number
): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});

export const MessageAttachment = React.memo(function MessageAttachment({
  attachment,
}: {
  attachment: FileAttachment;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isImage = attachment.type.startsWith("image/");

  const handleImageLoad = React.useCallback(() => {
    setIsLoading(false);
    setImageError(false);
  }, []);

  const handleImageError = React.useCallback(() => {
    setIsLoading(false);
    setImageError(true);
  }, []);

  if (isImage) {
    return (
      <>
        <button
          onClick={() => !imageError && setShowPreview(true)}
          className={`block max-w-xs transition-opacity focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg ${
            imageError ? "cursor-not-allowed opacity-50" : "hover:opacity-90"
          }`}
          disabled={imageError}
        >
          {isLoading && (
            <div className="w-48 h-32 bg-white/5 rounded-lg animate-pulse" />
          )}
          <img
            src={attachment.url}
            alt={attachment.name}
            className={`rounded-lg max-h-48 object-cover transition-opacity duration-300 ${
              isLoading ? "opacity-0 h-0" : "opacity-100"
            }`}
            loading="lazy"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
          {imageError && (
            <div className="flex items-center justify-center gap-2 text-red-400 p-4">
              <AlertCircle className="w-5 h-5" />
              <span>Failed to load image</span>
            </div>
          )}
        </button>
        {showPreview && (
          <ImagePreviewModal
            src={attachment.url}
            alt={attachment.name}
            onClose={() => setShowPreview(false)}
          />
        )}
      </>
    );
  }

  return (
    <a
      href={attachment.url}
      download={attachment.name}
      className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors group"
    >
      {attachment.type === "application/pdf" ? (
        <FileText className="w-8 h-8 text-red-400" />
      ) : (
        <Image className="w-8 h-8 text-blue-400" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white/90 truncate">
          {attachment.name}
        </div>
        <div className="text-xs text-white/50">
          {formatFileSize(attachment.size)}
        </div>
      </div>
      <Download className="w-5 h-5 text-white/50 group-hover:text-white/70 transition-colors" />
    </a>
  );
});
