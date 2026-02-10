-- Create waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert into waitlist
CREATE POLICY "Enable insert for everyone" ON waitlist
    FOR INSERT 
    WITH CHECK (true);

-- Optional: Allow auth users to view waitlist (for admin dashboard later)
CREATE POLICY "Enable read for authenticated users only" ON waitlist
    FOR SELECT
    TO authenticated
    USING (true);
