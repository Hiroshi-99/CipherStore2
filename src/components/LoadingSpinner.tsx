import React from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  light?: boolean;
}

export default function LoadingSpinner({
  size = "md",
  light = false,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return (
    <div
      className={`animate-spin rounded-full border-2 border-current border-t-transparent ${
        sizeClasses[size]
      } ${light ? "text-white/30" : "text-gray-200"}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}
