// Kopia 1:1 z finora-src/src/app/(pages)/dashboard/cash-flow/page.tsx (Przepływy, decyzja Bartosza 21.10.2026): zmienione tylko teksty, kwoty, daty i importy.
// Dane PRZYKŁADOWE jak w Finorze. Karty na prawdziwych danych (components/przeplywy/przeplywy-grid.tsx,
// components/przeplywy/finora/*) zostają w kodzie do ponownego podpięcia („wrócimy do tego”, jak Pulpit).
// Importy zewnętrzne
import {
  RiBillLine,
  RiBriefcaseLine,
  RiFilmLine,
  RiFlashlightLine,
  RiHomeGearLine,
  RiMoneyDollarCircleLine,
  RiReceiptLine,
  RiShoppingBag3Line,
  RiWifiLine
} from '@remixicon/react'

// Importy komponentów
import { Card } from '@/components/ui/card'
import CashFlowCard from '@/components/przeplywy/finora-1do1/chart-cash-flow'
import TransactionDatatable, { type Item } from '@/components/przeplywy/finora-1do1/datatable-transaction'
import StatisticsAreaStatCard from '@/components/przeplywy/finora-1do1/statistics-area-stat-card'
import StatisticsSavingsGoalCard from '@/components/przeplywy/finora-1do1/statistics-savings-goal-card'
import RecentActivityCard from '@/components/przeplywy/finora-1do1/widget-recent-activity'
import TopCashFlowSourcesCard from '@/components/przeplywy/finora-1do1/widget-top-cash-flow-sources'
import UpcomingBillsCard from '@/components/przeplywy/finora-1do1/widget-upcoming-bills'

// Dane kart przychodów i wydatków
const incomeChartData = [
  { date: '2026-07-24', value: 3100 },
  { date: '2026-07-25', value: 3400 },
  { date: '2026-07-26', value: 3050 },
  { date: '2026-07-27', value: 3800 },
  { date: '2026-07-28', value: 4200 },
  { date: '2026-07-29', value: 3950 },
  { date: '2026-07-30', value: 4600 },
  { date: '2026-07-31', value: 4400 }
]

const expenseChartData = [
  { date: '2026-07-24', value: 3600 },
  { date: '2026-07-25', value: 3300 },
  { date: '2026-07-26', value: 3900 },
  { date: '2026-07-27', value: 3200 },
  { date: '2026-07-28', value: 2950 },
  { date: '2026-07-29', value: 3400 },
  { date: '2026-07-30', value: 2700 },
  { date: '2026-07-31', value: 2600 }
]

// Największe źródła przepływów (przychody i wydatki razem, share = % sumy danej strony)
const cashFlowSourcesData = [
  {
    icon: <RiReceiptLine />,
    sourceName: 'Faktury od klientów',
    sourceType: 'Sprzedaż',
    amount: '18 204 zł',
    share: 100,
    direction: 'in' as const,
    iconClassName: 'bg-primary/10 text-primary dark:bg-primary/20'
  },
  {
    icon: <RiBillLine />,
    sourceName: 'Wynagrodzenia',
    sourceType: 'Koszt stały',
    amount: '6 400 zł',
    share: 100,
    direction: 'out' as const,
    iconClassName: 'bg-chart-2/10 text-chart-2'
  },
  {
    icon: <RiBriefcaseLine />,
    sourceName: 'Projekty zlecone',
    sourceType: 'Usługi',
    amount: '7 340 zł',
    share: 68,
    direction: 'in' as const,
    iconClassName: 'bg-chart-3/10 text-chart-3'
  },
  {
    icon: <RiHomeGearLine />,
    sourceName: 'Czynsz za biuro',
    sourceType: 'Koszt stały',
    amount: '1 850 zł',
    share: 46,
    direction: 'out' as const,
    iconClassName: 'bg-chart-4/10 text-chart-4'
  },
  {
    icon: <RiShoppingBag3Line />,
    sourceName: 'Zakupy u dostawców',
    sourceType: 'Koszt zmienny',
    amount: '3 120 zł',
    share: 33,
    direction: 'out' as const,
    iconClassName: 'bg-chart-5/10 text-chart-5'
  }
]

// Ostatnia aktywność
const recentActivityData = [
  {
    icon: <RiReceiptLine />,
    label: 'Faktura FV/10/2026/099',
    subLabel: 'Rachunek firmowy',
    amount: '3 200,00 zł',
    direction: 'in' as const,
    iconClassName: 'bg-primary/10 text-primary dark:bg-primary/20'
  },
  {
    icon: <RiHomeGearLine />,
    label: 'Czynsz za biuro',
    subLabel: 'Rachunek firmowy',
    amount: '1 850,00 zł',
    direction: 'out' as const,
    iconClassName: 'bg-chart-4/10 text-chart-4'
  },
  {
    icon: <RiMoneyDollarCircleLine />,
    label: 'Wpłata za zlecenie',
    subLabel: 'Rachunek oszczędnościowy',
    amount: '1 450,00 zł',
    direction: 'in' as const,
    iconClassName: 'bg-chart-2/10 text-chart-2'
  },
  {
    icon: <RiWifiLine />,
    label: 'Internet i media',
    subLabel: 'Rachunek firmowy',
    amount: '210,00 zł',
    direction: 'out' as const,
    iconClassName: 'bg-chart-3/10 text-chart-3'
  },
  {
    icon: <RiShoppingBag3Line />,
    label: 'Zakupy u dostawców',
    subLabel: 'Rachunek firmowy',
    amount: '320,00 zł',
    direction: 'out' as const,
    iconClassName: 'bg-chart-5/10 text-chart-5'
  }
]

// Nadchodzące rachunki
const upcomingBillsData = [
  {
    icon: <RiHomeGearLine />,
    title: 'Czynsz za biuro',
    dueDate: 'Termin za 3 dni',
    amount: '1 850,00 zł',
    iconClassName: 'bg-primary/10 text-primary dark:bg-primary/20'
  },
  {
    icon: <RiWifiLine />,
    title: 'Internet i media',
    dueDate: 'Termin za 6 dni',
    amount: '210,00 zł',
    iconClassName: 'bg-chart-2/10 text-chart-2'
  },
  {
    icon: <RiFlashlightLine />,
    title: 'Rachunek za prąd',
    dueDate: 'Termin za 4 dni',
    amount: '164,00 zł',
    iconClassName: 'bg-chart-4/10 text-chart-4'
  },
  {
    icon: <RiFilmLine />,
    title: 'Subskrypcje',
    dueDate: 'Termin za 9 dni',
    amount: '68,00 zł',
    iconClassName: 'bg-chart-3/10 text-chart-3'
  },
  {
    icon: <RiBillLine />,
    title: 'Wynagrodzenia',
    dueDate: 'Termin za 12 dni',
    amount: '6 400,00 zł',
    iconClassName: 'bg-chart-5/10 text-chart-5'
  }
]

// Transakcje do tabeli
const transactionsData: Item[] = [
  {
    id: '1',
    avatar: '/images/avatars/avatar-1.webp',
    avatarFallback: 'JA',
    counterparty: 'Jakub Adamski',
    email: 'jakub.adamski@przyklad.pl',
    category: 'income',
    direction: 'in',
    amount: 3200,
    status: 'completed'
  },
  {
    id: '2',
    avatar: '/images/avatars/avatar-9.webp',
    avatarFallback: 'RO',
    counterparty: 'Rachunek oszczędnościowy',
    email: 'przelewy@przyklad.example',
    category: 'transfer',
    direction: 'out',
    amount: 1500,
    status: 'pending'
  },
  {
    id: '3',
    avatar: '/images/avatars/avatar-14.webp',
    avatarFallback: 'CB',
    counterparty: 'Czynsz za biuro',
    email: 'rozliczenia@nieruchomosci.example',
    category: 'bills',
    direction: 'out',
    amount: 1850,
    status: 'completed'
  },
  {
    id: '4',
    avatar: '/images/avatars/avatar-2.webp',
    avatarFallback: 'MG',
    counterparty: 'Maria Gonciarz',
    email: 'maria.gonciarz@agencja.example',
    category: 'income',
    direction: 'in',
    amount: 1450,
    status: 'completed'
  },
  {
    id: '5',
    avatar: '/images/avatars/avatar-6.webp',
    avatarFallback: 'AL',
    counterparty: 'Allegro',
    email: 'zamowienia@allegro.example',
    category: 'shopping',
    direction: 'out',
    amount: 320,
    status: 'completed'
  },
  {
    id: '6',
    avatar: '/images/avatars/avatar-7.webp',
    avatarFallback: 'NF',
    counterparty: 'Netflix',
    email: 'platnosci@netflix.example',
    category: 'subscription',
    direction: 'out',
    amount: 19.99,
    status: 'completed'
  },
  {
    id: '7',
    avatar: '/images/avatars/avatar-3.webp',
    avatarFallback: 'RC',
    counterparty: 'Robert Czerwiński',
    email: 'robert.czerwinski@startup.example',
    category: 'income',
    direction: 'in',
    amount: 2780,
    status: 'pending'
  },
  {
    id: '8',
    avatar: '/images/avatars/avatar-4.webp',
    avatarFallback: 'EW',
    counterparty: 'Energia i Woda Sp. z o.o.',
    email: 'rozliczenia@media.example',
    category: 'bills',
    direction: 'out',
    amount: 210,
    status: 'failed'
  }
]

const CashFlowDashboard = () => {
  return (
    <>
      {/* Odstępstwo od Finory (WCAG 1.3.1): niewidoczny nagłówek strony dla czytników. */}
      <h1 className='sr-only'>Przepływy pieniężne</h1>
    <div className='grid grid-cols-6 gap-6'>
      <CashFlowCard className='col-span-full xl:col-span-4' />

      <StatisticsSavingsGoalCard className='col-span-full xl:col-span-2' />

      <StatisticsAreaStatCard
        chartKey='income'
        title='Przychody w tym miesiącu'
        amount='34 600 zł'
        changePercentage='+12,2%'
        color='var(--chart-4)'
        badgeClassName='bg-chart-4/10 text-chart-4'
        chartData={incomeChartData}
        className='col-span-full sm:col-span-3'
      />

      <StatisticsAreaStatCard
        chartKey='expense'
        title='Wydatki w tym miesiącu'
        amount='26 180 zł'
        changePercentage='-8,4%'
        color='var(--chart-4)'
        badgeClassName='bg-chart-4/10 text-chart-4'
        chartData={expenseChartData}
        className='col-span-full sm:col-span-3'
      />

      <TopCashFlowSourcesCard
        title='Największe źródła przepływów'
        sources={cashFlowSourcesData}
        className='col-span-full lg:col-span-2'
      />

      <UpcomingBillsCard
        title='Nadchodzące rachunki'
        subTitle='Następne 30 dni'
        bills={upcomingBillsData}
        className='col-span-full lg:col-span-2'
      />

      <RecentActivityCard
        title='Ostatnia aktywność'
        activity={recentActivityData}
        className='col-span-full lg:col-span-2'
      />

      <Card className='col-span-full py-0 shadow-none'>
        <TransactionDatatable data={transactionsData} />
      </Card>
    </div>
    </>
  )
}

export default CashFlowDashboard
