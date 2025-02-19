export const setPageTitle = (pageTitle: string) => {
  if (typeof document !== "undefined") {
    document.title = pageTitle ? `Cipher - ${pageTitle}` : "Cipher";
  }
};
