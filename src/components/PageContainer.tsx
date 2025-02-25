import React from "react";
import Header from "./Header";
import type { User } from "@supabase/supabase-js";

interface PageContainerProps {
  title: string;
  showBack?: boolean;
  user: User | null;
  children: React.ReactNode;
}

function PageContainer({
  title,
  showBack,
  user,
  children,
}: PageContainerProps) {
  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url("https://i.imgur.com/crS3FrR.jpeg")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.7)",
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        <Header title={title} showBack={showBack} user={user} />
        {children}
      </div>
    </div>
  );
}

export default PageContainer;
