'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * WŁAŚCICIEL: Bartosz — rama panelu.
 *
 * Layout jest Server Component i nie zna trasy, a dashboard potrzebuje dwóch
 * rzeczy innych niż reszta panelu: zablokowanego przewijania i banera
 * certyfikatu przeniesionego do prawej szyny. Zamiast przepisywać layout na
 * klienta, wystawiamy jedną klasę na `<html>`, a resztę robi CSS.
 */
export function DashboardRouteFlags() {
  const pathname = usePathname();

  useEffect(() => {
    const naDashboardzie = pathname === '/dashboard';
    document.documentElement.classList.toggle(
      'ff-route-dashboard',
      naDashboardzie,
    );
    return () => {
      document.documentElement.classList.remove('ff-route-dashboard');
    };
  }, [pathname]);

  return null;
}
