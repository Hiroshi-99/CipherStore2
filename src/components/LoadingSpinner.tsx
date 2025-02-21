import React from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  light?: boolean;
}

function LoadingSpinner({ size = "md", light = false }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div
      className={`${sizeClasses[size]} border-2 rounded-full animate-spin ${
        light
          ? "border-white/20 border-t-white"
          : "border-emerald-200/20 border-t-emerald-500"
      }`}
    />
  );
}

export default LoadingSpinner;
