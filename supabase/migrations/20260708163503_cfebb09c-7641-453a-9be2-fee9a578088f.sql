-- 1. Enum de papéis
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'user');

-- 2. Tabela de roles por usuário
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Função SECURITY DEFINER para checar role (evita recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 4. Usuários veem seus próprios roles
CREATE POLICY "Users can read own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 5. Substitui políticas permissivas de manual_sales por acesso próprio/admin
DROP POLICY IF EXISTS "Authenticated users can read all manual sales" ON public.manual_sales;
DROP POLICY IF EXISTS "Team can update any sale" ON public.manual_sales;
DROP POLICY IF EXISTS "Team can delete any sale" ON public.manual_sales;

CREATE POLICY "Users read own or admin reads all manual sales"
  ON public.manual_sales
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own or admin updates all manual sales"
  ON public.manual_sales
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own or admin deletes all manual sales"
  ON public.manual_sales
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
