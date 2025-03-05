import React, { useState, useRef, useCallback } from "react";
import { Upload, X, Check, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { uploadImage } from "../lib/storage";
import { generateUUID } from "../utils/uuid";

interface FileUploadProps {
  orderId: string;
  onUploadSuccess: (fileUrl: string) => void;
  onUploadError?: (error: Error) => void;
  acceptedFileTypes?: string;
  maxSizeMB?: number;
  buttonText?: string;
  className?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  orderId,
  onUploadSuccess,
  onUploadError,
  acceptedFileTypes = "image/*",
  maxSizeMB = 5,
  buttonText = "Upload File",
  className = "",
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const files = event.target.files;
        if (!files || files.length === 0) {
          return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        const file = files[0];
        const fileExt = file.name.split(".").pop();
        const fileName = `${orderId}_${generateUUID()}.${fileExt}`;
        const filePath = `account_files/${fileName}`;

        // Validate file type
        if (!file.type.match(acceptedFileTypes.replace("*", ""))) {
          const errorMsg = `Invalid file type. Please upload ${acceptedFileTypes} files.`;
          setError(errorMsg);
          toast.error(errorMsg);
          if (onUploadError) onUploadError(new Error(errorMsg));
          return;
        }

        // Validate file size
        if (file.size > maxSizeMB * 1024 * 1024) {
          const errorMsg = `File too large. Maximum size is ${maxSizeMB}MB.`;
          setError(errorMsg);
          toast.error(errorMsg);
          if (onUploadError) onUploadError(new Error(errorMsg));
          return;
        }

        // Show preview for images
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (e) => {
            setPreview(e.target?.result as string);
          };
          reader.readAsDataURL(file);
        }

        // Upload the file to Supabase Storage
        const { data, error } = await supabase.storage
          .from("account-files")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            onUploadProgress: (progress) => {
              const percent = Math.round(
                (progress.loaded / progress.total) * 100
              );
              setUploadProgress(percent);
            },
          });

        if (error) {
          throw error;
        }

        // Get the public URL of the uploaded file
        const { data: urlData } = supabase.storage
          .from("account-files")
          .getPublicUrl(filePath);

        const fileUrl = urlData.publicUrl;

        // Call the success callback with the file URL
        onUploadSuccess(fileUrl);

        toast.success("File uploaded successfully");
        setUploadProgress(100);
      } catch (error) {
        console.error("Error uploading file:", error);
        toast.error("Failed to upload file");
      } finally {
        setIsUploading(false);
      }
    },
    [orderId, onUploadSuccess, acceptedFileTypes, maxSizeMB]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // Create a new file input event
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(files[0]);

      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
        const event = new Event("change", { bubbles: true });
        fileInputRef.current.dispatchEvent(event);
      }
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center ${
          error
            ? "border-red-400 bg-red-50"
            : "border-gray-300 hover:border-gray-400"
        } transition-colors`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {preview ? (
          <div className="relative mb-4">
            <img
              src={preview}
              alt="Preview"
              className="max-h-40 mx-auto rounded"
            />
            <button
              onClick={() => setPreview(null)}
              className="absolute top-0 right-0 bg-black/50 rounded-full p-1 text-white"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
        )}

        <div className="mt-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept={acceptedFileTypes}
            className="hidden"
            disabled={isUploading}
          />

          <label
            htmlFor={`file-upload-${orderId}`}
            className="flex items-center justify-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded cursor-pointer transition-colors"
          >
            {isUploading ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Uploading ({uploadProgress}%)
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Upload Account File
              </>
            )}
          </label>

          {error && (
            <div className="mt-2 text-red-500 flex items-center justify-center">
              <AlertCircle size={16} className="mr-1" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {isUploading && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {uploadProgress}% uploaded
            </p>
          </div>
        )}

        {uploadProgress === 100 && (
          <div className="mt-2 text-green-500 flex items-center justify-center">
            <Check size={16} className="mr-1" />
            <span>Upload complete!</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
