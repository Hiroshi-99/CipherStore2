import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { compressImage } from "../utils/imageCompression";
import { ALLOWED_TYPES, MAX_FILE_SIZE } from "../constants/files";

interface FileAttachment {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string;
}

interface UploadError {
  message: string;
  file: File;
}

export function useFileAttachments() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<UploadError | null>(null);

  const validateFile = useCallback((file: File): void => {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File ${file.name} is too large (max 10MB)`);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(
        `File type ${
          file.type
        } is not supported. Allowed types: ${ALLOWED_TYPES.join(", ")}`
      );
    }
  }, []);

  const uploadFile = useCallback(
    async (file: File): Promise<FileAttachment | null> => {
      try {
        setError(null);
        validateFile(file);
        setUploading(true);
        setProgress(0);

        // Compress image if it's an image file
        const processedFile = file.type.startsWith("image/")
          ? await compressImage(file, {
              maxWidth: 1920,
              maxHeight: 1080,
              quality: 0.8,
              maxSizeMB: 1,
            })
          : file;

        const fileName = `${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError, data } = await supabase.storage
          .from("chat-attachments")
          .upload(fileName, processedFile, {
            cacheControl: "3600",
            upsert: false,
            onUploadProgress: (progress) => {
              setProgress((progress.loaded / progress.total) * 100);
            },
          });

        if (uploadError) {
          throw new Error(
            uploadError.message || "An error occurred while uploading the file"
          );
        }

        const { data: publicUrl } = supabase.storage
          .from("chat-attachments")
          .getPublicUrl(fileName);

        return {
          id: crypto.randomUUID(),
          url: publicUrl.publicUrl,
          name: file.name,
          size: file.size,
          type: file.type,
        };
      } catch (err) {
        const error = err as Error;
        setError({ message: error.message, file });
        throw error;
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [validateFile]
  );

  return {
    uploadFile,
    uploading,
    progress,
    error,
    setError,
  };
}
