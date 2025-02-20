import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

interface UploadOptions {
  bucket: string;
  path?: string;
  acceptedTypes?: string[];
  maxSize?: number; // in bytes
}

export function useFileUpload(options: UploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (options.acceptedTypes && !options.acceptedTypes.includes(file.type)) {
        setError("File type not supported");
        return null;
      }

      if (options.maxSize && file.size > options.maxSize) {
        setError("File size too large");
        return null;
      }

      try {
        setUploading(true);
        setError(null);

        const filePath = `${options.path || ""}${crypto.randomUUID()}-${
          file.name
        }`;

        const { error: uploadError, data } = await supabase.storage
          .from(options.bucket)
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            onUploadProgress: (progress) => {
              setProgress((progress.loaded / progress.total) * 100);
            },
          });

        if (uploadError) throw uploadError;

        const { data: publicUrl } = supabase.storage
          .from(options.bucket)
          .getPublicUrl(filePath);

        return publicUrl.publicUrl;
      } catch (err) {
        console.error("Upload error:", err);
        setError("Failed to upload file");
        return null;
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [options]
  );

  return {
    upload,
    uploading,
    progress,
    error,
  };
}
