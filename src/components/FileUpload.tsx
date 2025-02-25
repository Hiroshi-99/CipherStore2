import React, { useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Upload, FileX, RefreshCw, File } from "lucide-react";

interface FileUploadProps {
  orderId: string;
  onUploadSuccess: (fileUrl: string) => void;
  acceptedTypes?: string[];
  maxSizeMB?: number;
}

function FileUpload({
  orderId,
  onUploadSuccess,
  acceptedTypes = ["image/jpeg", "image/png", "image/gif", "application/pdf"],
  maxSizeMB = 10,
}: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);

    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];

      // Validate file type
      if (!acceptedTypes.includes(selectedFile.type)) {
        setError(
          `Invalid file type. Accepted types: ${acceptedTypes
            .map((t) => t.replace("image/", "."))
            .join(", ")}`
        );
        return;
      }

      // Validate file size
      if (selectedFile.size > maxSizeBytes) {
        setError(`File too large. Maximum size: ${maxSizeMB}MB`);
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${orderId}-account-file-${Date.now()}.${fileExt}`;
      const bucketName = import.meta.env.VITE_SUPABASE_ACCOUNT_FILES_BUCKET;
      const filePath = `${orderId}/${fileName}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          const increment = Math.random() * 10;
          return Math.min(prev + increment, 95);
        });
      }, 300);

      const { data, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      if (!data?.path) {
        throw new Error("Upload successful but no path returned");
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucketName).getPublicUrl(data.path);

      if (!publicUrl) {
        throw new Error("Failed to get public URL for uploaded file");
      }

      onUploadSuccess(publicUrl);

      // Clear the form
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      setError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-white/20 rounded-lg p-4 text-center hover:border-white/40 transition-colors">
        <input
          ref={inputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          accept={acceptedTypes.join(",")}
          aria-label="Select file to upload"
          id="file-upload"
        />

        <label
          htmlFor="file-upload"
          className="cursor-pointer flex flex-col items-center justify-center gap-2"
        >
          {file ? (
            <>
              <File className="w-8 h-8 text-emerald-400" />
              <p className="text-white font-medium truncate max-w-full">
                {file.name}
              </p>
              <p className="text-white/50 text-sm">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-white/50" />
              <p className="text-white">Drag files here or click to browse</p>
              <p className="text-white/50 text-sm">
                Max file size: {maxSizeMB}MB
              </p>
            </>
          )}
        </label>
      </div>

      {file && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="p-2 bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30 transition-colors"
            type="button"
            aria-label="Remove selected file"
          >
            <FileX size={20} />
          </button>

          <button
            onClick={handleUpload}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 px-4 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isUploading || !file}
            type="button"
          >
            {isUploading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>
                  {uploadProgress < 100 ? "Uploading..." : "Processing..."}
                </span>
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span>Upload File</span>
              </>
            )}
          </button>
        </div>
      )}

      {isUploading && (
        <div className="w-full bg-white/10 rounded-full h-2.5 mt-2">
          <div
            className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          ></div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-md text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

export default FileUpload;
