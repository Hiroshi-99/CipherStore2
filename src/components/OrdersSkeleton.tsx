import React from "react";

const OrdersSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white/5 animate-pulse rounded-lg p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1">
              <div className="h-6 bg-white/10 rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-white/10 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-white/10 rounded w-1/5 mb-4"></div>
              <div className="flex gap-2">
                <div className="h-6 bg-white/10 rounded w-16"></div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-10 bg-white/10 rounded-full"></div>
              <div className="h-10 w-10 bg-white/10 rounded-full"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default OrdersSkeleton;
