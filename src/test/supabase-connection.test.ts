import { describe, it, expect } from 'vitest';
import { 
  isSupabaseConfigured, 
  getSupabaseConfig, 
  verifySupabaseConnection 
} from '@/services/supabaseClient';

describe('Supabase Environment & Reachability Verification', () => {
  it('reads Supabase environment credentials from .env.local', () => {
    expect(isSupabaseConfigured()).toBe(true);

    const config = getSupabaseConfig();
    expect(config.url).toBe('https://qvijaswdtchcqhovixix.supabase.co');
    expect(config.publishableKey).toBe('sb_publishable_JSQovaSsADiLIWXp4Oc9bQ_6YXVMFH-');
  });

  it('successfully reaches the remote Supabase project endpoint', async () => {
    const result = await verifySupabaseConnection();
    expect(result.reachable).toBe(true);
    expect(result.status).toBe(200);
    expect(result.url).toBe('https://qvijaswdtchcqhovixix.supabase.co');
  }, 15000);
});
