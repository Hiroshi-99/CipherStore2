import { supabase } from "./supabase";

export const uploadImage = async (
  file: File,
  fileName: string,
  authToken?: string
) => {
  try {
    // Convert file to base64
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
    const base64Content = base64Data.split(",")[1];

    // Set up headers with authentication
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    // Make the request to the upload endpoint
    const response = await fetch("/.netlify/functions/admin-upload-file", {
      method: "POST",
      body: JSON.stringify({
        fileName,
        fileData: base64Content,
        contentType: file.type,
      }),
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload file: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    console.error("Error uploading image:", error);
    return { data: null, error };
  }
};
