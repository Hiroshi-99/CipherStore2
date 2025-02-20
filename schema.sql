-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

------------------------------------------
-- Core Tables
------------------------------------------

-- Orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    account_file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment proofs table
CREATE TABLE payment_proofs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    image_url TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Discord integration tables
CREATE TABLE discord_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    webhook_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    user_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    user_avatar TEXT,
    user_name VARCHAR(255),
    discord_message_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    order_user_id UUID
);

-- Inbox messages table
CREATE TABLE inbox_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    type VARCHAR(50) NOT NULL, -- payment_status, system, etc.
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admin users table
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_owner BOOLEAN DEFAULT FALSE
);

------------------------------------------
-- Indexes
------------------------------------------

-- Orders indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Payment proofs indexes
CREATE INDEX idx_payment_proofs_order_id ON payment_proofs(order_id);
CREATE INDEX idx_payment_proofs_status ON payment_proofs(status);

-- Discord channels indexes
CREATE INDEX idx_discord_channels_order_id ON discord_channels(order_id);

-- Messages indexes
CREATE INDEX idx_messages_order_id ON messages(order_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Inbox messages indexes
CREATE INDEX idx_inbox_messages_user_id ON inbox_messages(user_id);
CREATE INDEX idx_inbox_messages_is_read ON inbox_messages(is_read);

-- Admin users indexes
CREATE INDEX idx_admin_users_user_id ON admin_users(user_id);

------------------------------------------
-- Triggers
------------------------------------------

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to tables
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_proofs_updated_at
    BEFORE UPDATE ON payment_proofs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add trigger to automatically set order_user_id
CREATE OR REPLACE FUNCTION set_order_user_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT user_id INTO NEW.order_user_id
  FROM orders WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_user_id_trigger
BEFORE INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION set_order_user_id();

------------------------------------------
-- Storage Configuration
------------------------------------------

-- Create storage bucket for payment proofs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM storage.buckets
        WHERE id = 'payment-proofs'
    ) THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('payment-proofs', 'payment-proofs', true);
    END IF;
END $$;

-- Storage policies
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;

CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = 'payment-proofs'
);

CREATE POLICY "Allow public reads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'payment-proofs');

CREATE POLICY "Give users access to own folder"
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id = 'payment-proofs'
    AND auth.uid()::text = (storage.foldername(name))[2]
)
WITH CHECK (
    bucket_id = 'payment-proofs'
    AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

------------------------------------------
-- Admin Access Control
------------------------------------------

-- Enable RLS on tables
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and functions
DROP POLICY IF EXISTS "Admin users owner access" ON admin_users;
DROP POLICY IF EXISTS "Admin users view access" ON admin_users;
DROP FUNCTION IF EXISTS is_admin();

-- Create owner check function
CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.jwt() ->> 'sub' = current_setting('app.owner_id', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin users table policies
CREATE POLICY "Allow authenticated users to view admin_users"
ON admin_users FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert into admin_users"
ON admin_users FOR INSERT
TO authenticated
WITH CHECK (true);

-- Orders policies
CREATE POLICY "Users can create their own orders"
ON orders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own orders"
ON orders FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_owner() OR auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "Allow admins to update orders"
ON orders FOR UPDATE
TO authenticated
USING (is_owner() OR auth.uid() IN (SELECT user_id FROM admin_users));

-- Payment proofs policies
CREATE POLICY "Users can create payment proofs for their orders"
ON payment_proofs FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_id
        AND orders.user_id = auth.uid()
    )
);

CREATE POLICY "Users can view payment proofs"
ON payment_proofs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_id
        AND (orders.user_id = auth.uid() OR is_owner())
    )
);

CREATE POLICY "Allow admins to update payment proofs"
ON payment_proofs FOR UPDATE
TO authenticated
USING (is_owner() OR auth.uid() IN (SELECT user_id FROM admin_users));

-- Discord channels policies
CREATE POLICY "Users can view their own discord channels"
ON discord_channels FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_id
        AND (orders.user_id = auth.uid() OR is_owner())
    )
);

CREATE POLICY "Allow admins to manage discord channels"
ON discord_channels FOR ALL
TO authenticated
USING (is_owner() OR auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "Allow users to create discord channels for their orders"
ON discord_channels FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_id
        AND orders.user_id = auth.uid()
    )
);

-- Messages policies
CREATE POLICY "Allow users to view their own messages"
ON messages FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()::text
    OR auth.uid() IN (SELECT user_id FROM admin_users)
    OR is_owner()
);

CREATE POLICY "Allow users to send messages"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()::text
    OR auth.uid() IN (SELECT user_id FROM admin_users)
    OR is_owner()
);

-- Inbox messages policies
CREATE POLICY "Users can view their own inbox messages"
ON inbox_messages FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own inbox messages"
ON inbox_messages FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Allow admins to manage inbox messages"
ON inbox_messages FOR ALL
TO authenticated
USING (is_owner());

CREATE POLICY "Allow system to create inbox messages"
ON inbox_messages FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
    OR is_owner()
    OR auth.uid() IN (SELECT user_id FROM admin_users)
    OR EXISTS (
        SELECT 1 FROM orders
        WHERE orders.user_id = user_id
        AND orders.user_id = auth.uid()
    )
);

-- Remove the duplicate policy section
DROP POLICY IF EXISTS "Allow users to view their own auth data" ON auth.users;

CREATE POLICY "Allow users to view their own auth data"
ON auth.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Grant permissions
GRANT ALL ON admin_users TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

------------------------------------------
-- Permissions
------------------------------------------

-- Storage permissions
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO public;
GRANT ALL ON storage.buckets TO authenticated;
GRANT SELECT ON storage.buckets TO public;

-- Auth permissions
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON auth.users TO authenticated;

-- Add a function to check if user has permission for an order
CREATE OR REPLACE FUNCTION has_order_permission(order_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_id
    AND (orders.user_id = auth.uid() OR is_owner() OR auth.uid() IN (SELECT user_id FROM admin_users))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add account_file_url column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'orders' 
        AND column_name = 'account_file_url'
    ) THEN
        ALTER TABLE orders ADD COLUMN account_file_url TEXT;
    END IF;
END $$;

-- Add file_url column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'inbox_messages' 
        AND column_name = 'file_url'
    ) THEN
        ALTER TABLE inbox_messages ADD COLUMN file_url TEXT;
    END IF;
END $$;

-- Add policies for payment_proofs table
DROP POLICY IF EXISTS "Allow admins to manage payment proofs" ON payment_proofs;
CREATE POLICY "Allow admins to manage payment proofs"
ON payment_proofs FOR ALL
TO authenticated
USING (
  auth.uid() IN (SELECT user_id FROM admin_users)
  OR is_owner()
);

-- Add policies for orders table
DROP POLICY IF EXISTS "Allow admins to manage orders" ON orders;
CREATE POLICY "Allow admins to manage orders"
ON orders FOR ALL
TO authenticated
USING (
  auth.uid() IN (SELECT user_id FROM admin_users)
  OR is_owner()
  OR auth.uid() = user_id
);

-- Add policies for discord_channels table
DROP POLICY IF EXISTS "Allow admins to manage discord channels" ON discord_channels;
CREATE POLICY "Allow admins to manage discord channels"
ON discord_channels FOR ALL
TO authenticated
USING (
  auth.uid() IN (SELECT user_id FROM admin_users)
  OR is_owner()
  OR EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = discord_channels.order_id
    AND orders.user_id = auth.uid()
  )
);

-- Update the is_admin function to include both admins and owner
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE user_id = auth.uid()
    )
    OR is_owner()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add is_owner column to admin_users if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'admin_users' 
        AND column_name = 'is_owner'
    ) THEN
        ALTER TABLE admin_users ADD COLUMN is_owner BOOLEAN DEFAULT FALSE;
    END IF;
END $$;