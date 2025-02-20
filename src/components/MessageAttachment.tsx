import React from "react";
import { FileText, Image, Download } from "lucide-react";
import { ImagePreviewModal } from "./ImagePreviewModal";

interface FileAttachment {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MessageAttachment = React.memo(function MessageAttachment({
  attachment,
}: {
  attachment: FileAttachment;
}) {
  const [showPreview, setShowPreview] = React.useState(false);
  const isImage = attachment.type.startsWith("image/");

  if (isImage) {
    return (
      <>
        <button
          onClick={() => setShowPreview(true)}
          className="block max-w-xs hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg"
        >
          <img
            src={attachment.url}
            alt={attachment.name}
            className="rounded-lg max-h-48 object-cover"
            loading="lazy"
          />
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
      className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
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
      <Download className="w-5 h-5 text-white/50" />
    </a>
  );
});
