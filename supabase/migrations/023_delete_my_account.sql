-- 023: delete_my_account RPC — called from Configuració > Eliminar compte.
-- The client (AuthService.deleteAccount) has always called this function,
-- but it was never captured in a migration. SECURITY DEFINER so it can
-- remove the auth.users row; every per-user table references auth.users
-- with ON DELETE CASCADE (see 014 and each table's own definition), so
-- deleting the auth user removes all of the user's data in one statement.

CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
