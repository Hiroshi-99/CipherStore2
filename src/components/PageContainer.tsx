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
          backgroundImage:
            'url("https://cdn.discordapp.com/attachments/1335202613913849857/1341847795807813815/wallpaperflare.com_wallpaper.jpg?ex=67b77ca4&is=67b62b24&hm=17f869720e0d7d178e5a1d6140243b37f248c32e837142aded205cd3c4453de1&")',
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
