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

  const validateFile = useCallback((file: File): UploadError | null => {
    if (file.size > MAX_FILE_SIZE) {
      return {
        message: `File ${file.name} is too large (max ${(
          MAX_FILE_SIZE /
          (1024 * 1024)
        ).toFixed(0)}MB)`,
        file,
      };
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        message: `File type ${
          file.type
        } is not supported. Allowed types: ${ALLOWED_TYPES.map(
          (type) => type.split("/")[1]
        ).join(", ")}`,
        file,
      };
    }

    return null;
  }, []);

  const uploadFile = useCallback(
    async (file: File): Promise<FileAttachment | null> => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        throw new Error(validationError.message);
      }

      try {
        setUploading(true);
        setProgress(0);
        setError(null);

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
          const error = {
            message: `Failed to upload ${file.name}: ${uploadError.message}`,
            file,
          };
          setError(error);
          throw new Error(error.message);
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
        const error = {
          message: `Failed to upload ${file.name}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
          file,
        };
        setError(error);
        throw err;
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [validateFile]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    uploadFile,
    uploading,
    progress,
    error,
    clearError,
  };
}
