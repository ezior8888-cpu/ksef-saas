import { getRlsTestEnvironment } from './helpers/rls-environment';

// Vitest wykonuje setup przed importem testów i utworzeniem klientów Supabase.
// Brak któregokolwiek jawnego parametru kończy przebieg przed dostępem do bazy.
getRlsTestEnvironment();
