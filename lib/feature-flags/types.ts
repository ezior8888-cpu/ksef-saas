export type PerTenantFlag =
  | 'co_pilot_enabled'
  | 'magic_import_enabled'
  | 'exports_enabled';

export type GlobalFlag =
  | 'killAllKsefSubmissions'
  | 'maintenanceMode'
  | 'disableSignups'
  /** Zatrzymuje CAŁEGO agenta FLO — pierwszy krok runbooku incydentowego. */
  | 'killFloAgent';
