import React, { useState } from "react";
import { supabase } from "../lib/supabase";

interface FileUploadProps {
  orderId: string;
  onUploadSuccess: (fileUrl: string) => void;
}

function FileUpload({ orderId, onUploadSuccess }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const fileName = `${orderId}-account-file.${file.name.split(".").pop()}`;
      const filePath = `account-files/${orderId}/${fileName}`;

      const { data, error: uploadError } = await supabase.storage
        .from("account-files")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      if (!data?.path) {
        throw new Error("Upload successful but no path returned");
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("account-files").getPublicUrl(data.path);

      if (!publicUrl) {
        throw new Error("Failed to get public URL for uploaded file");
      }

      onUploadSuccess(publicUrl);
    } catch (error) {
      console.error("Error uploading file:", error);
      setError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        onChange={handleFileChange}
        className="w-full px-4 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
      />
      <button
        onClick={handleUpload}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isUploading || !file}
      >
        {isUploading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
            <span>Uploading...</span>
          </>
        ) : (
          <span>Upload File</span>
        )}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}

export default FileUpload;
