import { supabase } from "./supabase";
import { v4 as uuidv4 } from "uuid";

export async function uploadImage(file: File) {
  const fileExt = file.name.split(".").pop();
  const fileName = `${uuidv4()}.${fileExt}`;
  const filePath = `chat-images/${fileName}`;

  const { data, error } = await supabase.storage
    .from("images")
    .upload(filePath, file);

  if (error) {
    throw error;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("images").getPublicUrl(filePath);

  return publicUrl;
}
