import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Initialize storage bucket
async function initializeStorage() {
  try {
    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(
      (bucket) => bucket.name === "payment-proofs"
    );

    if (!bucketExists) {
      // Create the bucket if it doesn't exist
      const { error } = await supabase.storage.createBucket("payment-proofs", {
        public: true,
        fileSizeLimit: 5242880, // 5MB in bytes
        allowedMimeTypes: ["image/jpeg", "image/png", "image/gif"],
      });

      if (error) {
        console.error("Error creating bucket:", error);
        return;
      }

      // Set up bucket policies
      const { error: policyError } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl("test.txt", 60, {
          transform: {
            width: 100,
            height: 100,
          },
        });

      if (policyError) {
        console.error("Error setting up bucket policies:", policyError);
      }
    }
  } catch (error) {
    console.error("Error initializing storage:", error);
  }
}

// Initialize storage when the app starts
initializeStorage();

export { supabase };
