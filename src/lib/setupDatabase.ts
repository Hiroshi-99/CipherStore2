import { supabase } from "./supabase";
import { toast } from "sonner";

export const setupDatabase = async () => {
  try {
    toast.info("Setting up database...");

    // Create tables in the correct order
    const tables = [
      {
        name: "users",
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            email TEXT,
            full_name TEXT,
            is_admin BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_sign_in TIMESTAMP WITH TIME ZONE
          );
        `,
      },
      {
        name: "admin_users",
        sql: `
          CREATE TABLE IF NOT EXISTS admin_users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            granted_by UUID REFERENCES users(id),
            UNIQUE(user_id)
          );
        `,
      },
      {
        name: "orders",
        sql: `
          CREATE TABLE IF NOT EXISTS orders (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES users(id),
            full_name TEXT NOT NULL,
            email TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            account_id TEXT,
            account_password TEXT,
            account_file_url TEXT,
            delivery_date TIMESTAMP WITH TIME ZONE
          );
        `,
      },
      {
        name: "payment_proofs",
        sql: `
          CREATE TABLE IF NOT EXISTS payment_proofs (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
            image_url TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `,
      },
      {
        name: "messages",
        sql: `
          CREATE TABLE IF NOT EXISTS messages (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id),
            content TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            is_system BOOLEAN DEFAULT FALSE
          );
        `,
      },
    ];

    // Execute each table creation
    for (const table of tables) {
      console.log(`Creating ${table.name} table if it doesn't exist...`);

      const { error } = await supabase.rpc("execute_sql", { sql: table.sql });

      if (error) {
        console.error(`Error creating ${table.name} table:`, error);
        toast.error(`Failed to create ${table.name} table`);
      }
    }

    // Add RLS policies for security
    const policies = [
      // Users table policies
      `
        BEGIN;
        ALTER TABLE users ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY IF NOT EXISTS "Users can view their own data" 
          ON users FOR SELECT 
          USING (auth.uid() = id);
          
        CREATE POLICY IF NOT EXISTS "Admins can view all users" 
          ON users FOR SELECT 
          USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
          
        CREATE POLICY IF NOT EXISTS "Admins can update users" 
          ON users FOR UPDATE 
          USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
        COMMIT;
      `,

      // Orders table policies
      `
        BEGIN;
        ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY IF NOT EXISTS "Users can view their own orders" 
          ON orders FOR SELECT 
          USING (user_id = auth.uid());
          
        CREATE POLICY IF NOT EXISTS "Admins can view all orders" 
          ON orders FOR SELECT 
          USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
          
        CREATE POLICY IF NOT EXISTS "Admins can update orders" 
          ON orders FOR UPDATE 
          USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
        COMMIT;
      `,
    ];

    // Apply policies
    for (const policy of policies) {
      const { error } = await supabase.rpc("execute_sql", { sql: policy });

      if (error) {
        console.error("Error applying policies:", error);
      }
    }

    toast.success("Database setup completed successfully");

    return { success: true };
  } catch (err) {
    console.error("Error in setupDatabase:", err);
    toast.error("Database setup failed");
    return { success: false, error: err };
  }
};
