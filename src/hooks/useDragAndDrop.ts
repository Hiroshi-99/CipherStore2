import { useState, useCallback, DragEvent } from "react";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "text/plain",
];

interface ValidationError {
  file: File;
  error: string;
}

export function useDragAndDrop(
  onFilesDrop: (files: File[]) => void,
  onError?: (errors: ValidationError[]) => void
) {
  const [isDragging, setIsDragging] = useState(false);

  const validateFiles = useCallback(
    (files: File[]): [File[], ValidationError[]] => {
      const validFiles: File[] = [];
      const errors: ValidationError[] = [];

      files.forEach((file) => {
        if (file.size > MAX_FILE_SIZE) {
          errors.push({
            file,
            error: `File ${file.name} is too large (max 10MB)`,
          });
        } else if (!ALLOWED_TYPES.includes(file.type)) {
          errors.push({
            file,
            error: `File type ${file.type} is not supported`,
          });
        } else {
          validFiles.push(file);
        }
      });

      return [validFiles, errors];
    },
    []
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        const [validFiles, errors] = validateFiles(files);
        if (validFiles.length > 0) {
          onFilesDrop(validFiles);
        }
        if (errors.length > 0 && onError) {
          onError(errors);
        }
      }
    },
    [onFilesDrop, onError, validateFiles]
  );

  return {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
