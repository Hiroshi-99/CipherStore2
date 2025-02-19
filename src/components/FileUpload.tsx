import React, { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { Upload, AlertCircle } from "lucide-react";

interface FileUploadProps {
  orderId: string;
  onUploadSuccess: (fileUrl: string) => void;
  maxSizeMB?: number;
  allowedTypes?: string[];
}

function FileUpload({
  orderId,
  onUploadSuccess,
  maxSizeMB = 10,
  allowedTypes = ["image/jpeg", "image/png", "image/gif"],
}: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const validateFile = useCallback(
    (file: File) => {
      if (!allowedTypes.includes(file.type)) {
        throw new Error("Invalid file type. Please upload an image file.");
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        throw new Error(`File size must be less than ${maxSizeMB}MB`);
      }
    },
    [maxSizeMB, allowedTypes]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      try {
        validateFile(selectedFile);
        setFile(selectedFile);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid file");
        setFile(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      const fileName = `${orderId}-${Date.now()}-${file.name}`;
      const filePath = `${orderId}/${fileName}`;

      const { data, error: uploadError } = await supabase.storage
        .from(import.meta.env.VITE_SUPABASE_ACCOUNT_FILES_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          onUploadProgress: (progress) => {
            setProgress((progress.loaded / progress.total) * 100);
          },
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage
        .from(import.meta.env.VITE_SUPABASE_ACCOUNT_FILES_BUCKET)
        .getPublicUrl(filePath);

      onUploadSuccess(publicUrl);
    } catch (error) {
      console.error("Upload error:", error);
      setError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="file"
          onChange={handleFileChange}
          accept={allowedTypes.join(",")}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="w-full flex items-center justify-center px-4 py-2 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-emerald-400/50 transition-colors"
        >
          <div className="text-center">
            <Upload className="mx-auto h-12 w-12 text-white/50" />
            <span className="mt-2 block text-sm font-medium text-white">
              {file ? file.name : "Choose a file"}
            </span>
          </div>
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {isUploading && (
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className="bg-emerald-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || isUploading}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isUploading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white" />
            <span>{Math.round(progress)}% Uploaded</span>
          </>
        ) : (
          <span>Upload File</span>
        )}
      </button>
    </div>
  );
}

export default FileUpload;
