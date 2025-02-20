import { useEffect } from "react";
import { setPageTitle } from "../utils/title";

export function usePageTitle(title: string) {
  useEffect(() => {
    setPageTitle(title);
  }, [title]);
}
