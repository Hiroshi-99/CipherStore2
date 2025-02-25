import React from "react";

interface LoadingSpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  light?: boolean;
  color?: "emerald" | "blue" | "purple" | "white";
  thickness?: "thin" | "normal" | "thick";
  message?: string;
}

function LoadingSpinner({
  size = "md",
  light = false,
  color = "emerald",
  thickness = "normal",
  message,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  const thicknessClasses = {
    thin: "border",
    normal: "border-2",
    thick: "border-4",
  };

  const colorClasses = {
    emerald: light
      ? "border-white/20 border-t-emerald-400"
      : "border-emerald-200/20 border-t-emerald-500",
    blue: light
      ? "border-white/20 border-t-blue-400"
      : "border-blue-200/20 border-t-blue-500",
    purple: light
      ? "border-white/20 border-t-purple-400"
      : "border-purple-200/20 border-t-purple-500",
    white: "border-white/20 border-t-white",
  };

  return (
    <div className="flex flex-col items-center justify-center" role="status">
      <div
        className={`${sizeClasses[size]} ${thicknessClasses[thickness]} rounded-full animate-spin ${colorClasses[color]}`}
        aria-hidden="true"
      />
      {message && (
        <p
          className={`mt-2 text-sm ${
            light ? "text-white/70" : "text-gray-400"
          }`}
        >
          {message}
        </p>
      )}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export default LoadingSpinner;
