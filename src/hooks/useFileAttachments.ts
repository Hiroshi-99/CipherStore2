import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { compressImage } from "../utils/imageCompression";

interface FileAttachment {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "text/plain",
];

export function useFileAttachments() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = useCallback(
    async (file: File): Promise<FileAttachment | null> => {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("File size too large (max 10MB)");
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error("File type not supported");
      }

      try {
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

        if (uploadError) throw uploadError;

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
      } catch (error) {
        console.error("Upload error:", error);
        throw error;
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    []
  );

  return {
    uploadFile,
    uploading,
    progress,
  };
}
