interface DiscordProfile {
  full_name?: string;
  avatar_url?: string;
  // Add other Discord profile fields as needed
}

interface User extends SupabaseUser {
  user_metadata: {
    full_name?: string;
    avatar_url?: string;
    // Add other metadata fields as needed
  };
}
