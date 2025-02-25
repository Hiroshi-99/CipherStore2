import { supabase } from "./supabase";

export const uploadImage = async (
  file: File,
  fileName: string,
  authToken?: string
) => {
  try {
    // Create form data for the file upload
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileName", fileName);

    // Set up headers with authentication
    const headers: HeadersInit = {};
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    // Make the request to the upload endpoint
    const response = await fetch("/.netlify/functions/admin-upload-file", {
      method: "POST",
      body: formData,
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
