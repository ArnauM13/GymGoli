import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabase.url,
    environment.supabase.anonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Default lock uses the Navigator LockManager API to coordinate
        // token refresh across tabs, which logs a noisy (harmless) warning
        // whenever a lock attempt doesn't succeed immediately. This app
        // doesn't rely on cross-tab refresh coordination, so just run the
        // callback directly instead.
        lock: async (_name, _acquireTimeout, fn) => fn(),
      },
    }
  );
}
