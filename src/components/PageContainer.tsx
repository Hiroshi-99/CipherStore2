import React from "react";
import Header from "./Header";
import { User } from "@supabase/supabase-js";

interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
  user?: User | null;
  showBack?: boolean;
}

const PageContainer: React.FC<PageContainerProps> = ({
  children,
  title = "App",
  user = null,
  showBack = false,
}) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header title={title} user={user} showBack={showBack} />
      <main className="flex-1">{children}</main>
    </div>
  );
};

export default PageContainer;
