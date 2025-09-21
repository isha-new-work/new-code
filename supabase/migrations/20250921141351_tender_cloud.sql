/*
  # Complete Tender Management Workflow

  1. New Tables
    - Enhanced `tenders` table with workflow stages
    - Enhanced `bids` table with contractor details
    - `work_progress` table for tracking contractor work
    - `tender_documents` table for file attachments
    - `issue_assignments` table for tracking assignments
    - Enhanced workflow stages and notifications

  2. Security
    - Enable RLS on all new tables
    - Add policies for different user types
    - Add workflow-specific permissions

  3. Workflow Stages
    - Issue Assignment → Tender Creation → Bidding → Award → Work Execution → Completion
*/

-- Create areas table for location management
CREATE TABLE IF NOT EXISTS areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  district_id uuid,
  state_id uuid,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  category text NOT NULL,
  description text,
  contact_email text,
  contact_phone text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Update profiles table to support admin roles and assignments
DO $$
BEGIN
  -- Add new user types
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'profiles_user_type_check'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;
    ALTER TABLE profiles ADD CONSTRAINT profiles_user_type_check 
    CHECK (user_type IN ('user', 'admin', 'area_super_admin', 'department_admin', 'tender'));
  END IF;

  -- Add assignment fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'assigned_area_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN assigned_area_id uuid REFERENCES areas(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'assigned_department_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN assigned_department_id uuid REFERENCES departments(id);
  END IF;
END $$;

-- Create issue assignments table
CREATE TABLE IF NOT EXISTS issue_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES issues(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  assigned_area_id uuid REFERENCES areas(id) ON DELETE SET NULL,
  assignment_type text NOT NULL CHECK (assignment_type IN ('admin_to_area', 'area_to_department', 'department_to_contractor')),
  assignment_notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'reassigned', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Update issues table with workflow stages
DO $$
BEGIN
  -- Add workflow stage column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issues' AND column_name = 'workflow_stage'
  ) THEN
    ALTER TABLE issues ADD COLUMN workflow_stage text DEFAULT 'reported' 
    CHECK (workflow_stage IN ('reported', 'area_review', 'department_assigned', 'contractor_assigned', 'in_progress', 'department_review', 'resolved'));
  END IF;

  -- Add assignment fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issues' AND column_name = 'assigned_area_id'
  ) THEN
    ALTER TABLE issues ADD COLUMN assigned_area_id uuid REFERENCES areas(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issues' AND column_name = 'assigned_department_id'
  ) THEN
    ALTER TABLE issues ADD COLUMN assigned_department_id uuid REFERENCES departments(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issues' AND column_name = 'current_assignee_id'
  ) THEN
    ALTER TABLE issues ADD COLUMN current_assignee_id uuid REFERENCES profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issues' AND column_name = 'final_resolution_notes'
  ) THEN
    ALTER TABLE issues ADD COLUMN final_resolution_notes text;
  END IF;
END $$;

-- Update tenders table with enhanced workflow
DO $$
BEGIN
  -- Add department reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenders' AND column_name = 'department_id'
  ) THEN
    ALTER TABLE tenders ADD COLUMN department_id uuid REFERENCES departments(id);
  END IF;

  -- Add source issue reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenders' AND column_name = 'source_issue_id'
  ) THEN
    ALTER TABLE tenders ADD COLUMN source_issue_id uuid REFERENCES issues(id);
  END IF;

  -- Add workflow fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenders' AND column_name = 'workflow_stage'
  ) THEN
    ALTER TABLE tenders ADD COLUMN workflow_stage text DEFAULT 'created' 
    CHECK (workflow_stage IN ('created', 'bidding_open', 'bidding_closed', 'under_review', 'awarded', 'work_in_progress', 'work_completed', 'verified', 'closed'));
  END IF;

  -- Add contractor assignment fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenders' AND column_name = 'awarded_contractor_id'
  ) THEN
    ALTER TABLE tenders ADD COLUMN awarded_contractor_id uuid REFERENCES profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenders' AND column_name = 'work_started_at'
  ) THEN
    ALTER TABLE tenders ADD COLUMN work_started_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenders' AND column_name = 'work_completed_at'
  ) THEN
    ALTER TABLE tenders ADD COLUMN work_completed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenders' AND column_name = 'verification_notes'
  ) THEN
    ALTER TABLE tenders ADD COLUMN verification_notes text;
  END IF;
END $$;

-- Create work progress table for contractor submissions
CREATE TABLE IF NOT EXISTS work_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id uuid REFERENCES tenders(id) ON DELETE CASCADE NOT NULL,
  contractor_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  progress_type text NOT NULL CHECK (progress_type IN ('update', 'milestone', 'completion', 'issue')),
  title text NOT NULL,
  description text NOT NULL,
  progress_percentage integer DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  images text[], -- Cloudinary URLs
  documents text[], -- Document URLs
  location_notes text,
  quality_notes text,
  materials_used text[],
  labor_details text,
  challenges_faced text,
  next_steps text,
  estimated_completion_date date,
  is_milestone boolean DEFAULT false,
  milestone_name text,
  requires_verification boolean DEFAULT false,
  verified_by uuid REFERENCES profiles(id),
  verified_at timestamptz,
  verification_notes text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'requires_changes')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create tender documents table
CREATE TABLE IF NOT EXISTS tender_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id uuid REFERENCES tenders(id) ON DELETE CASCADE NOT NULL,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('specification', 'drawing', 'contract', 'progress_report', 'completion_certificate', 'invoice', 'other')),
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  mime_type text,
  description text,
  is_public boolean DEFAULT false,
  version_number integer DEFAULT 1,
  replaces_document_id uuid REFERENCES tender_documents(id),
  created_at timestamptz DEFAULT now()
);

-- Create bid evaluations table
CREATE TABLE IF NOT EXISTS bid_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id uuid REFERENCES bids(id) ON DELETE CASCADE NOT NULL,
  evaluated_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  technical_score decimal(5, 2),
  financial_score decimal(5, 2),
  experience_score decimal(5, 2),
  total_score decimal(5, 2),
  evaluation_notes text,
  recommendation text CHECK (recommendation IN ('accept', 'reject', 'request_clarification')),
  created_at timestamptz DEFAULT now()
);

-- Insert sample areas
INSERT INTO areas (name, code, description) VALUES
('Downtown Core', 'DTC', 'Central business district and government offices'),
('Residential North', 'RN', 'Northern residential neighborhoods'),
('Industrial Zone', 'IZ', 'Industrial and manufacturing area'),
('Suburban East', 'SE', 'Eastern suburban communities'),
('Waterfront District', 'WD', 'Coastal and waterfront areas')
ON CONFLICT (code) DO NOTHING;

-- Insert sample departments
INSERT INTO departments (name, code, category, description, contact_email, contact_phone) VALUES
('Public Works Department', 'PWD', 'infrastructure', 'Roads, utilities, and public infrastructure', 'publicworks@city.gov', '+1-555-0201'),
('Parks and Recreation', 'PRD', 'recreation', 'Parks, sports facilities, and community programs', 'parks@city.gov', '+1-555-0202'),
('Environmental Services', 'ENV', 'environment', 'Waste management, environmental protection', 'environment@city.gov', '+1-555-0203'),
('Public Safety Department', 'PSD', 'safety', 'Emergency services and public safety', 'safety@city.gov', '+1-555-0204'),
('Urban Planning', 'UPD', 'planning', 'City planning and development', 'planning@city.gov', '+1-555-0205')
ON CONFLICT (code) DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_evaluations ENABLE ROW LEVEL SECURITY;

-- Areas policies
CREATE POLICY "Anyone can read active areas"
  ON areas FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage areas"
  ON areas FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin')
    )
  );

-- Departments policies
CREATE POLICY "Anyone can read active departments"
  ON departments FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage departments"
  ON departments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'department_admin')
    )
  );

-- Issue assignments policies
CREATE POLICY "Users can read relevant assignments"
  ON issue_assignments FOR SELECT TO authenticated
  USING (
    auth.uid() = assigned_by OR
    auth.uid() = assigned_to OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin', 'department_admin')
    )
  );

CREATE POLICY "Admins can create assignments"
  ON issue_assignments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = assigned_by AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin', 'department_admin')
    )
  );

-- Work progress policies
CREATE POLICY "Contractors can manage own work progress"
  ON work_progress FOR ALL TO authenticated
  USING (
    auth.uid() = contractor_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'department_admin')
    )
  );

-- Tender documents policies
CREATE POLICY "Users can read public tender documents"
  ON tender_documents FOR SELECT TO authenticated
  USING (
    is_public = true OR
    auth.uid() = uploaded_by OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'department_admin')
    )
  );

CREATE POLICY "Authorized users can upload documents"
  ON tender_documents FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'department_admin', 'tender')
    )
  );

-- Bid evaluations policies
CREATE POLICY "Department admins can manage evaluations"
  ON bid_evaluations FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'department_admin')
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_areas_is_active ON areas(is_active);
CREATE INDEX IF NOT EXISTS idx_departments_is_active ON departments(is_active);
CREATE INDEX IF NOT EXISTS idx_issue_assignments_issue_id ON issue_assignments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_assignments_assigned_to ON issue_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_progress_tender_id ON work_progress(tender_id);
CREATE INDEX IF NOT EXISTS idx_work_progress_contractor_id ON work_progress(contractor_id);
CREATE INDEX IF NOT EXISTS idx_tender_documents_tender_id ON tender_documents(tender_id);

-- Create function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (
    id,
    email,
    user_type,
    full_name,
    first_name,
    last_name,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'user'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Create function to update tender workflow when bid is accepted
CREATE OR REPLACE FUNCTION handle_bid_acceptance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    -- Update tender status
    UPDATE tenders 
    SET 
      status = 'awarded',
      workflow_stage = 'awarded',
      awarded_contractor_id = NEW.user_id,
      awarded_amount = NEW.amount,
      awarded_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.tender_id;

    -- Update related issue workflow
    UPDATE issues 
    SET 
      workflow_stage = 'in_progress',
      status = 'in_progress',
      current_assignee_id = NEW.user_id,
      updated_at = NOW()
    WHERE id = (
      SELECT source_issue_id FROM tenders WHERE id = NEW.tender_id
    );

    -- Create notification for contractor
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      related_id,
      related_type
    ) VALUES (
      NEW.user_id,
      'Bid Accepted!',
      'Congratulations! Your bid has been accepted. You can now start work on this project.',
      'tender_update',
      NEW.tender_id,
      'tender'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for bid acceptance
DROP TRIGGER IF EXISTS on_bid_status_change ON bids;
CREATE TRIGGER on_bid_status_change
  AFTER UPDATE ON bids
  FOR EACH ROW EXECUTE FUNCTION handle_bid_acceptance();

-- Create function to handle work completion
CREATE OR REPLACE FUNCTION handle_work_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.progress_type = 'completion' AND NEW.status = 'submitted' THEN
    -- Update tender workflow
    UPDATE tenders 
    SET 
      workflow_stage = 'work_completed',
      work_completed_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.tender_id;

    -- Notify department admin
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      related_id,
      related_type
    ) 
    SELECT 
      p.id,
      'Work Completion Submitted',
      'A contractor has submitted work completion for review.',
      'tender_update',
      NEW.tender_id,
      'tender'
    FROM profiles p
    JOIN tenders t ON t.department_id = p.assigned_department_id
    WHERE t.id = NEW.tender_id AND p.user_type = 'department_admin';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for work completion
DROP TRIGGER IF EXISTS on_work_progress_update ON work_progress;
CREATE TRIGGER on_work_progress_update
  AFTER INSERT ON work_progress
  FOR EACH ROW EXECUTE FUNCTION handle_work_completion();