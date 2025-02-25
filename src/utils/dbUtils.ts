import { supabase } from "../lib/supabase";

// Function to check and create necessary database objects
export const ensureDatabaseSchema = async () => {
  try {
    // Check if the get_table_info function exists
    const { data: functionExists, error: functionCheckError } =
      await supabase.rpc("function_exists", {
        function_name: "get_table_info",
      });

    if (functionCheckError) {
      console.error("Error checking function existence:", functionCheckError);
      // Function to check if a function exists doesn't exist, so we need to create it
      await createFunctionExistsFunction();
    }

    if (!functionExists) {
      // Create the get_table_info function
      await createGetTableInfoFunction();
    }

    // Check if users table exists
    const { data: usersTableExists, error: tableCheckError } =
      await supabase.rpc("table_exists", { table_name: "users" });

    if (tableCheckError) {
      console.error("Error checking table existence:", tableCheckError);
      // Function to check if a table exists doesn't exist, so we need to create it
      await createTableExistsFunction();
    }

    if (!usersTableExists) {
      // Create the users table
      await createUsersTable();
    }

    return true;
  } catch (err) {
    console.error("Error ensuring database schema:", err);
    return false;
  }
};

// Function to create the function_exists function
const createFunctionExistsFunction = async () => {
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      CREATE OR REPLACE FUNCTION public.function_exists(function_name text)
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        exists_check boolean;
      BEGIN
        SELECT EXISTS (
          SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public'
          AND p.proname = function_name
        ) INTO exists_check;
        
        RETURN exists_check;
      END;
      $$;
      
      GRANT EXECUTE ON FUNCTION public.function_exists(text) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.function_exists(text) TO anon;
      GRANT EXECUTE ON FUNCTION public.function_exists(text) TO service_role;
    `,
  });

  if (error) {
    console.error("Error creating function_exists function:", error);
    throw error;
  }
};

// Function to create the table_exists function
const createTableExistsFunction = async () => {
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      CREATE OR REPLACE FUNCTION public.table_exists(table_name text)
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        exists_check boolean;
      BEGIN
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        ) INTO exists_check;
        
        RETURN exists_check;
      END;
      $$;
      
      GRANT EXECUTE ON FUNCTION public.table_exists(text) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.table_exists(text) TO anon;
      GRANT EXECUTE ON FUNCTION public.table_exists(text) TO service_role;
    `,
  });

  if (error) {
    console.error("Error creating table_exists function:", error);
    throw error;
  }
};

// Function to create the get_table_info function
const createGetTableInfoFunction = async () => {
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      CREATE OR REPLACE FUNCTION public.get_table_info(table_name text)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        result jsonb;
      BEGIN
        SELECT jsonb_agg(
          jsonb_build_object(
            'column_name', column_name,
            'data_type', data_type,
            'is_nullable', is_nullable
          )
        ) INTO result
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = $1;
        
        RETURN result;
      END;
      $$;
      
      GRANT EXECUTE ON FUNCTION public.get_table_info(text) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.get_table_info(text) TO anon;
      GRANT EXECUTE ON FUNCTION public.get_table_info(text) TO service_role;
    `,
  });

  if (error) {
    console.error("Error creating get_table_info function:", error);
    throw error;
  }
};

// Function to create the users table
const createUsersTable = async () => {
  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS public.users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        auth_id UUID REFERENCES auth.users(id),
        email TEXT NOT NULL,
        full_name TEXT,
        avatar_url TEXT,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
      CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin);
      
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
      
      CREATE POLICY "Users can view their own data" 
        ON public.users FOR SELECT 
        USING (auth.uid() = auth_id);
      
      CREATE POLICY "Admins can view all users" 
        ON public.users FOR SELECT 
        USING (
          EXISTS (
            SELECT 1 FROM public.users
            WHERE auth_id = auth.uid() AND is_admin = TRUE
          )
        );
      
      CREATE POLICY "Admins can insert users" 
        ON public.users FOR INSERT 
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.users
            WHERE auth_id = auth.uid() AND is_admin = TRUE
          )
        );
      
      CREATE POLICY "Admins can update users" 
        ON public.users FOR UPDATE 
        USING (
          EXISTS (
            SELECT 1 FROM public.users
            WHERE auth_id = auth.uid() AND is_admin = TRUE
          )
        );
    `,
  });

  if (error) {
    console.error("Error creating users table:", error);
    throw error;
  }
};
