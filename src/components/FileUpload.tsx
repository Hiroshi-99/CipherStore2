import React, { useState, useRef } from "react";
import { Upload, X, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { uploadImage } from "../lib/storage";

interface FileUploadProps {
  onUploadSuccess?: (url: string) => void;
  onUploadError?: (error: Error) => void;
  acceptedFileTypes?: string;
  maxSizeMB?: number;
  buttonText?: string;
  className?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

    // Clear previous errors
    setError(null);

    // Show preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }

    // Start upload
    setIsUploading(true);
    setUploadProgress(10); // Initial progress

    try {
      // Get authentication token
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("You must be logged in to upload files");
      }

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 300);

      // Generate a unique filename
      const fileName = `${Date.now()}-${file.name.replace(
        /[^a-zA-Z0-9.]/g,
        "_"
      )}`;

      // Upload the file
      const { data, error } = await uploadImage(
        file,
        fileName,
        sessionData.session.access_token
      );

      clearInterval(progressInterval);

      if (error) {
        throw error;
      }

      // Complete progress
      setUploadProgress(100);

      // Get the URL
      const fileUrl =
        data.url ||
        `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${
          data.path
        }`;

      // Success
      toast.success("File uploaded successfully!");
      if (onUploadSuccess) onUploadSuccess(fileUrl);

      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Reset progress after a delay
      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
      }, 1000);
    } catch (err) {
      console.error("Upload error:", err);
      const errorMsg =
        err instanceof Error ? err.message : "Failed to upload file";
      setError(errorMsg);
      toast.error(errorMsg);
      if (onUploadError)
        onUploadError(err instanceof Error ? err : new Error(errorMsg));
      setUploadProgress(0);
      setIsUploading(false);
    }
  };

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
            onChange={handleFileChange}
            accept={acceptedFileTypes}
            className="hidden"
            disabled={isUploading}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`px-4 py-2 rounded-md ${
              isUploading
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            } transition-colors`}
          >
            {isUploading ? "Uploading..." : buttonText}
          </button>

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
