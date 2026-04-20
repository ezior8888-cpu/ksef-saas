import { config } from 'dotenv';
import { resolve } from 'node:path';

// Ładujemy .env.local dla testów (Supabase creds)
config({ path: resolve(process.cwd(), '.env.local') });
