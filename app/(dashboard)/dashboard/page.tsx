import {
  RiComputerLine,
  RiGamepadLine,
  RiHeadphoneLine,
  RiMacbookLine,
  RiMoneyDollarCircleLine,
  RiShoppingCartLine,
  RiSmartphoneLine,
  RiTabletLine,
  RiTimer2Line,
} from '@remixicon/react';

import { Card } from '@/components/ui/card';
import FinanceCard from '@/components/dashboard/finora/chart-finance';
import StatisticsCard, { type StatisticsCardProps } from '@/components/dashboard/finora/statistics-card-03';
import StatisticsImpressionCard from '@/components/dashboard/finora/statistics-impression-card';
import StatisticsTotalRevenueCard from '@/components/dashboard/finora/statistics-total-revenue-card';
import TotalVisitorsCard from '@/components/dashboard/finora/chart-total-visitors';
import TopProductsCard from '@/components/dashboard/finora/widget-top-products';
import UserDatatable, { type Item } from '@/components/dashboard/finora/datatable-user';

/**
 * WŁAŚCICIEL: Bartosz (tor silnika) — kompozycja ekranu.
 *
 * Pulpit = strona Finance szablonu Finora 1:1 (decyzja Bartosza 19.10.2026,
 * wieczorem): ta sama siatka, karty, wykresy i animacje, teksty po polsku,
 * DANE PRZYKŁADOWE. FLO zniknął z Pulpitu całkowicie — jego miejsce przyjdzie
 * z projektu Claude Design (D4). Karty na prawdziwych danych z E4
 * (`components/dashboard/pulpit/*`, `lib/dashboard/*`) zostają w kodzie
 * do podpięcia w miejsce danych przykładowych.
 *
 * Pełna mapa: `docs/flo/UKLAD-DASHBOARDU.md`.
 */

// Kafle statystyk
const StatisticsCardData: StatisticsCardProps[] = [
  {
    icon: <RiShoppingCartLine />,
    title: 'Zamówienia',
    value: '155 tys.',
    trend: 'up',
    changePercentage: '+22%',
    badgeContent: 'Ostatnie 4 miesiące',
    iconClassName: 'bg-chart-3/20 text-chart-3',
  },
  {
    icon: <RiMoneyDollarCircleLine />,
    title: 'Zysk łącznie',
    value: '89,34 tys. zł',
    trend: 'down',
    changePercentage: '−16%',
    badgeContent: 'Ostatni rok',
    iconClassName: 'bg-chart-3/20 text-chart-3',
  },
];

// Odwiedzający
const visitorData = [
  { product: 'Komputer', percentage: 17, amount: 23.8, trend: 'up', heightClass: 'h-[17%]', color: 'bg-chart-1' },
  { product: 'Tablet', percentage: 65, amount: 13.604, trend: 'down', heightClass: 'h-[65%]', color: 'bg-chart-1/20' },
  { product: 'Telefon', percentage: 18, amount: 47.146, trend: 'up', heightClass: 'h-[18%]', color: 'bg-chart-1/50' },
];

// Najlepiej sprzedające się
const productsBySalesData = [
  {
    icon: <RiSmartphoneLine />,
    productName: 'Samsung Galaxy S25',
    productBrand: 'Samsung',
    sales: '32 203 zł',
    iconClassName: 'bg-primary/10 text-primary dark:bg-primary/25',
  },
  {
    icon: <RiMacbookLine />,
    productName: 'Apple MacBook Pro',
    productBrand: 'Apple',
    sales: '1299 zł',
    iconClassName: 'bg-chart-2/10 text-chart-2',
  },
  {
    icon: <RiHeadphoneLine />,
    productName: 'Sony WH-1000XM4',
    productBrand: 'Sony',
    sales: '348 zł',
    iconClassName: 'bg-chart-5/10 text-chart-5',
  },
  { icon: <RiMacbookLine />, productName: 'Dell XPS 13', productBrand: 'Dell', sales: '999 zł' },
  {
    icon: <RiTimer2Line />,
    productName: 'Smart Band 4',
    productBrand: 'Xiaomi',
    sales: '749 zł',
    iconClassName: 'bg-chart-3/10 text-chart-3',
  },
];

// Najczęściej kupowane
const productsByVolumeData = [
  {
    icon: <RiMacbookLine />,
    productName: 'Dell XPS 13',
    productBrand: 'Dell',
    volume: '200 tys.',
    changePercentage: 5,
    iconClassName: 'bg-primary/10 text-primary dark:bg-primary/25',
  },
  {
    icon: <RiTabletLine />,
    productName: 'Apple iPad',
    productBrand: 'Apple',
    volume: '80 tys.',
    changePercentage: 10,
    iconClassName: 'bg-chart-2/10 text-chart-2',
  },
  {
    icon: <RiGamepadLine />,
    productName: 'Sony PlayStation 5',
    productBrand: 'Sony',
    volume: '30 tys.',
    changePercentage: -20,
    iconClassName: 'bg-chart-5/10 text-chart-5',
  },
  { icon: <RiComputerLine />, productName: 'iMac Pro', productBrand: 'Apple', volume: '15 tys.', changePercentage: 12 },
  {
    icon: <RiSmartphoneLine />,
    productName: 'Samsung Galaxy S25',
    productBrand: 'Samsung',
    volume: '12,4 tys.',
    changePercentage: -15,
    iconClassName: 'bg-chart-3/10 text-chart-3',
  },
];

// Tabela użytkowników (fikcyjne osoby, adresy w domenie example.pl)
const userData: Item[] = [
  { id: '1', avatar: '', fallback: 'JK', user: 'Jan Kowalski', email: 'jan.kowalski@example.pl', role: 'maintainer', plan: 'enterprise', billing: 'auto-debit', status: 'active' },
  { id: '2', avatar: '', fallback: 'AN', user: 'Anna Nowak', email: 'anna.nowak@example.pl', role: 'admin', plan: 'enterprise', billing: 'auto-debit', status: 'active' },
  { id: '3', avatar: '', fallback: 'PW', user: 'Piotr Wiśniewski', email: 'piotr.wisniewski@example.pl', role: 'editor', plan: 'team', billing: 'manual-paypal', status: 'pending' },
  { id: '4', avatar: '', fallback: 'KW', user: 'Katarzyna Wójcik', email: 'katarzyna.wojcik@example.pl', role: 'author', plan: 'basic', billing: 'manual-cash', status: 'inactive' },
  { id: '5', avatar: '', fallback: 'TK', user: 'Tomasz Kamiński', email: 'tomasz.kaminski@example.pl', role: 'subscriber', plan: 'company', billing: 'auto-debit', status: 'active' },
  { id: '6', avatar: '', fallback: 'ML', user: 'Magdalena Lewandowska', email: 'magdalena.lewandowska@example.pl', role: 'editor', plan: 'team', billing: 'manual-paypal', status: 'active' },
  { id: '7', avatar: '', fallback: 'MZ', user: 'Michał Zieliński', email: 'michal.zielinski@example.pl', role: 'maintainer', plan: 'enterprise', billing: 'auto-debit', status: 'pending' },
  { id: '8', avatar: '', fallback: 'AS', user: 'Agnieszka Szymańska', email: 'agnieszka.szymanska@example.pl', role: 'author', plan: 'basic', billing: 'manual-cash', status: 'active' },
  { id: '9', avatar: '', fallback: 'PW', user: 'Paweł Woźniak', email: 'pawel.wozniak@example.pl', role: 'admin', plan: 'company', billing: 'auto-debit', status: 'inactive' },
  { id: '10', avatar: '', fallback: 'JD', user: 'Joanna Dąbrowska', email: 'joanna.dabrowska@example.pl', role: 'subscriber', plan: 'basic', billing: 'manual-paypal', status: 'active' },
  { id: '11', avatar: '', fallback: 'KK', user: 'Krzysztof Kozłowski', email: 'krzysztof.kozlowski@example.pl', role: 'maintainer', plan: 'team', billing: 'auto-debit', status: 'pending' },
  { id: '12', avatar: '', fallback: 'EJ', user: 'Ewa Jankowska', email: 'ewa.jankowska@example.pl', role: 'editor', plan: 'company', billing: 'manual-cash', status: 'active' },
  { id: '13', avatar: '', fallback: 'MM', user: 'Marcin Mazur', email: 'marcin.mazur@example.pl', role: 'author', plan: 'enterprise', billing: 'auto-debit', status: 'inactive' },
  { id: '14', avatar: '', fallback: 'MK', user: 'Monika Kwiatkowska', email: 'monika.kwiatkowska@example.pl', role: 'subscriber', plan: 'team', billing: 'manual-paypal', status: 'active' },
  { id: '15', avatar: '', fallback: 'ŁK', user: 'Łukasz Krawczyk', email: 'lukasz.krawczyk@example.pl', role: 'admin', plan: 'enterprise', billing: 'auto-debit', status: 'pending' },
  { id: '16', avatar: '', fallback: 'AP', user: 'Aleksandra Piotrowska', email: 'aleksandra.piotrowska@example.pl', role: 'editor', plan: 'basic', billing: 'manual-cash', status: 'active' },
  { id: '17', avatar: '', fallback: 'GG', user: 'Grzegorz Grabowski', email: 'grzegorz.grabowski@example.pl', role: 'maintainer', plan: 'company', billing: 'auto-debit', status: 'inactive' },
  { id: '18', avatar: '', fallback: 'NP', user: 'Natalia Pawłowska', email: 'natalia.pawlowska@example.pl', role: 'author', plan: 'team', billing: 'manual-paypal', status: 'active' },
  { id: '19', avatar: '', fallback: 'RM', user: 'Rafał Michalski', email: 'rafal.michalski@example.pl', role: 'subscriber', plan: 'enterprise', billing: 'auto-debit', status: 'pending' },
  { id: '20', avatar: '', fallback: 'KZ', user: 'Karolina Zając', email: 'karolina.zajac@example.pl', role: 'admin', plan: 'basic', billing: 'manual-cash', status: 'active' },
  { id: '21', avatar: '', fallback: 'AK', user: 'Adam Król', email: 'adam.krol@example.pl', role: 'editor', plan: 'enterprise', billing: 'auto-debit', status: 'active' },
  { id: '22', avatar: '', fallback: 'ZW', user: 'Zofia Wieczorek', email: 'zofia.wieczorek@example.pl', role: 'author', plan: 'team', billing: 'manual-paypal', status: 'inactive' },
  { id: '23', avatar: '', fallback: 'JJ', user: 'Jakub Jabłoński', email: 'jakub.jablonski@example.pl', role: 'maintainer', plan: 'company', billing: 'manual-cash', status: 'pending' },
  { id: '24', avatar: '', fallback: 'MW', user: 'Marta Wróbel', email: 'marta.wrobel@example.pl', role: 'subscriber', plan: 'basic', billing: 'auto-debit', status: 'active' },
  { id: '25', avatar: '', fallback: 'WM', user: 'Wojciech Majewski', email: 'wojciech.majewski@example.pl', role: 'admin', plan: 'enterprise', billing: 'manual-paypal', status: 'pending' },
];

export default function DashboardHomePage() {
  return (
    <div className="grid grid-cols-6 gap-6 py-6">
      {/* Tytuł strony był w pasku górnym; pasek Finory go nie ma (21.10.2026). */}
      <h1 className="sr-only">Pulpit</h1>
      <FinanceCard className="col-span-full xl:col-span-4" />

      <div className="col-span-full grid grid-cols-2 gap-6 lg:col-span-3 xl:col-span-2">
        {StatisticsCardData.map((card, index) => (
          <StatisticsCard
            key={index}
            icon={card.icon}
            title={card.title}
            value={card.value}
            trend={card.trend}
            changePercentage={card.changePercentage}
            badgeContent={card.badgeContent}
            iconClassName={card.iconClassName}
          />
        ))}

        <StatisticsTotalRevenueCard />

        <StatisticsImpressionCard />
      </div>

      <TotalVisitorsCard
        title="Odwiedzający"
        totalVisitors="23,02 tys."
        percentage={-6}
        visitorData={visitorData}
        className="col-span-full lg:col-span-3 xl:col-span-2"
      />

      <TopProductsCard
        salesTitle="Najlepiej sprzedające się"
        volumeTitle="Najczęściej kupowane"
        productsBySalesData={productsBySalesData}
        productsByVolumeData={productsByVolumeData}
        className="col-span-full xl:col-span-4"
      />

      <Card className="col-span-full py-0 shadow-none">
        <UserDatatable data={userData} />
      </Card>
    </div>
  );
}
