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
    order_id UUID NOT NULL REFERENCES orders(id),
    channel_id VARCHAR(255) NOT NULL,
    thread_id VARCHAR(255),
    webhook_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id),
    UNIQUE(channel_id),
    UNIQUE(thread_id)
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inbox messages table
CREATE TABLE inbox_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    type VARCHAR(50) NOT NULL, -- payment_status, system, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admin users table
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
CREATE INDEX idx_discord_channels_order_channel 
ON discord_channels(order_id, channel_id, thread_id);

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

-- Enable RLS on tables that need policies
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_channels ENABLE ROW LEVEL SECURITY;

-- Owner check function
CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    auth.jwt() ->> 'sub' = current_setting('app.owner_id', TRUE)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin access policies
CREATE POLICY "Allow owner and admins to view all orders"
ON orders FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM admin_users
        WHERE user_id = auth.uid()
    )
    OR is_owner()
);

CREATE POLICY "Allow owner and admins to update orders"
ON orders FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM admin_users
        WHERE user_id = auth.uid()
    )
    OR is_owner()
);

-- Payment proofs policies
CREATE POLICY "Allow owner and admins to view all payment proofs"
ON payment_proofs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM admin_users
        WHERE user_id = auth.uid()
    )
    OR is_owner()
);

CREATE POLICY "Allow owner and admins to update payment proofs"
ON payment_proofs FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM admin_users
        WHERE user_id = auth.uid()
    )
    OR is_owner()
);

-- Admin management policies
CREATE POLICY "Only owner can manage admins"
ON admin_users
FOR ALL
TO authenticated
USING (is_owner())
WITH CHECK (is_owner());

-- Discord channels policies
CREATE POLICY "Allow owner and admins to manage discord channels"
ON discord_channels FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM admin_users
        WHERE user_id = auth.uid()
    )
    OR is_owner()
);

CREATE POLICY "Users can view their own discord channels"
ON discord_channels FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_id
        AND orders.user_id = auth.uid()
    )
);

------------------------------------------
-- Row Level Security Policies
------------------------------------------

-- Orders policies
CREATE POLICY "Users can create their own orders"
ON orders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own orders"
ON orders FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

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

CREATE POLICY "Users can view payment proofs for their orders"
ON payment_proofs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_id
        AND orders.user_id = auth.uid()
    )
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

-- Enable RLS on remaining tables
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Admin policies for inbox messages
CREATE POLICY "Allow owner and admins to manage inbox messages"
ON inbox_messages FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM admin_users
        WHERE user_id = auth.uid()
    )
    OR is_owner()
);

-- Admin policies for messages
CREATE POLICY "Allow owner and admins to manage messages"
ON messages FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM admin_users
        WHERE user_id = auth.uid()
    )
    OR is_owner()
);

-- Messages policies for users
CREATE POLICY "Users can view messages for their orders"
ON messages FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_id
        AND orders.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create messages for their orders"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_id
        AND orders.user_id = auth.uid()
    )
);

------------------------------------------
-- Permissions
------------------------------------------

-- Storage permissions
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO public;
GRANT ALL ON storage.buckets TO authenticated;
GRANT SELECT ON storage.buckets TO public; 