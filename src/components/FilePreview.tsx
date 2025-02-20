import React from "react";
import { FileText, Image, X } from "lucide-react";

interface FilePreviewProps {
  file: File;
  onRemove: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FilePreview = React.memo(function FilePreview({
  file,
  onRemove,
}: FilePreviewProps) {
  const [preview, setPreview] = React.useState<string | null>(null);
  const isImage = file.type.startsWith("image/");

  React.useEffect(() => {
    if (!isImage) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    return () => {
      reader.abort();
    };
  }, [file, isImage]);

  return (
    <div className="relative group">
      <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
        {isImage && preview ? (
          <img
            src={preview}
            alt={file.name}
            className="w-12 h-12 object-cover rounded"
          />
        ) : (
          <div className="w-12 h-12 flex items-center justify-center rounded bg-white/5">
            {file.type === "application/pdf" ? (
              <FileText className="w-6 h-6 text-red-400" />
            ) : (
              <Image className="w-6 h-6 text-blue-400" />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white/90 truncate">
            {file.name}
          </div>
          <div className="text-xs text-white/50">
            {formatFileSize(file.size)}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="p-1 hover:bg-white/10 rounded transition-colors"
          aria-label="Remove file"
        >
          <X className="w-4 h-4 text-white/70" />
        </button>
      </div>
    </div>
  );
});
