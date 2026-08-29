# Runbook: incydent agenta FLO

**Kiedy sięgasz po ten dokument:** agent zrobił coś, czego nie powinien,
u jednego klienta albo u wielu. Wysłał niewłaściwą treść, wystawił dokument
na złą kwotę, zaczął zalewać wątek, albo zaczyna kosztować więcej, niż
powinien.

**Kolejność jest obowiązkowa i nie jest przypadkowa.** Najpierw zatrzymanie,
potem zasięg, potem odwrócenie, na końcu rozmowa z ludźmi. Odwrotna kolejność
kończy się tak, że w trakcie ustalania zasięgu agent produkuje kolejne
przypadki.

---

## 1. ZATRZYMANIE (cel: 30 sekund)

Nie diagnozuj. Najpierw cisza.

### Wariant A — cały agent

```sql
UPDATE public.global_feature_flags
SET enabled = true, updated_at = now(), updated_by = 'incident'
WHERE flag = 'killFloAgent';
```

Od tej chwili żadna nowa propozycja nie powstaje — dla nikogo. Odczyt jest
cache'owany na 60 sekund, więc **pełny skutek widać najpóźniej po minucie**.
Nie panikuj, jeśli w tym oknie powstanie jeszcze jedna karta.

Czego ten wyłącznik NIE robi: nie cofa tego, co już się wydarzyło, i nie
zatrzymuje zadań, które są w połowie wykonania. Do tego jest punkt 3.

### Wariant B — jedna funkcja u jednego klienta

```sql
INSERT INTO public.flo_kind_flags (tenant_id, kind, enabled, reason)
VALUES ('<tenant-uuid>', '<kind>', false, 'incydent <data>: <jedno zdanie>')
ON CONFLICT (tenant_id, kind) DO UPDATE
SET enabled = false, reason = EXCLUDED.reason, updated_at = now();
```

### Wariant C — jedna funkcja u wszystkich

Wpis w `lib/flo/flags.ts` + wdrożenie. **To trwa kilkanaście minut**, więc
przy trwającym incydencie użyj wariantu A, a wpis do kodu zrób spokojnie
potem. Wariant C jest sposobem na trwałe wyłączenie, nie na gaszenie pożaru.

> Sanity check po zatrzymaniu:
> ```sql
> SELECT count(*) FROM public.flo_proposals WHERE created_at > now() - interval '5 minutes';
> ```
> Liczba ma przestać rosnąć.

---

## 2. ZASIĘG (cel: 10 minut)

Pytanie brzmi „ilu ludzi i co dokładnie”, nie „dlaczego”. Przyczyna później.

> **Jak rozpoznać wpisy agenta.** `audit_logs` NIE MA kolumny `actor`.
> Wyróżnikiem jest prefiks w `action`: `flo.proposal.executed`,
> `flo.proposal.failed`, `flo.proposal.undone`. To nie jest konwencja
> w komentarzu — te trzy wartości należą do unii `AuditAction`
> w `lib/audit/log.ts`, więc literówka nie skompiluje się.
> (`metadata->>'actor'` bywa ustawione, ale nie wszędzie — nie opieraj się
> na nim przy ustalaniu zasięgu.)

### Co agent robił w ostatniej dobie

```sql
SELECT action, count(*) AS ile, min(created_at), max(created_at)
FROM public.audit_logs
WHERE action LIKE 'flo.%'
  AND created_at > now() - interval '24 hours'
GROUP BY action
ORDER BY ile DESC;
```

### Które konta są dotknięte

```sql
SELECT tenant_id,
       metadata->>'kind' AS rodzaj,
       count(*) AS ile
FROM public.audit_logs
WHERE action LIKE 'flo.%'
  AND created_at > now() - interval '24 hours'
  AND metadata->>'kind' = '<podejrzany kind>'
GROUP BY tenant_id, metadata->>'kind'
ORDER BY ile DESC;
```

### Co wyszło NA ZEWNĄTRZ (to jest najważniejsza lista)

Czynności nieodwracalne: dokument w KSeF, wiadomość u kontrahenta, paczka
u księgowej. Ta lista decyduje o tym, do kogo trzeba zadzwonić.

```sql
SELECT p.tenant_id, p.kind, p.topic_key, a.created_at AS zatwierdzono
FROM public.flo_approvals a
JOIN public.flo_proposals p ON p.id = a.proposal_id
WHERE a.created_at > now() - interval '24 hours'
  AND p.kind IN ('payment.chase', 'invoice.batch', 'invoice.draft',
                 'invoice.raise', 'accountant.package', 'ksef.status')
ORDER BY a.created_at DESC;
```

**Zapisz wynik do pliku, zanim przejdziesz dalej.** Po odwróceniu czynności
ta lista będzie trudniejsza do odtworzenia.

---

## 3. ODWRÓCENIE (cel: 30 minut)

### Co da się cofnąć, a czego nie

| Kategoria | Przykłady | Da się cofnąć? |
|---|---|---|
| 1 — wewnątrz konta | kategoria kosztu, oznaczenie zapłaty, szkic | **Tak, hurtowo** |
| 2 — dokument u nas | szkic faktury bez numeru | Tak, usunięciem szkicu |
| 3 — poszło do KSeF | faktura z numerem KSeF | **Nie.** Tylko korekta |
| 4 — poszło do człowieka | mail, ponaglenie, paczka | **Nie.** Tylko rozmowa |

### Hurtowe cofnięcie kategorii 1

Najpierw **zawsze** policz, ile wierszy ruszysz:

```sql
SELECT count(*) FROM public.flo_proposals
WHERE kind = '<kind>'
  AND status IN ('done', 'approved')
  AND created_at > '<znacznik czasu początku incydentu>';
```

Dopiero potem cofaj, przez `undoAction` na każdej pozycji (zachowuje ślad
w `audit_logs`) — **nie przez ręczny UPDATE w bazie**. Ręczna zmiana zostawia
dane bez śladu, kto i dlaczego je zmienił, a to jest dokładnie ta informacja,
której będziesz potrzebować za tydzień przy reklamacji.

### Czego NIE robić

- Nie kasuj wierszy z `flo_proposals`. Wygasła i błędna propozycja jest
  materiałem dowodowym; `status = 'expired'` wystarczy.
- Nie cofaj niczego, co ma numer KSeF. Dokument w rejestrze państwowym
  odwraca się korektą, nie `DELETE`.

---

## 4. POWIEDZENIE (cel: tego samego dnia)

Dotknięci klienci dowiadują się od nas, nie od swojego kontrahenta.

### Szablon — wysłana treść, która nie powinna wyjść

> Temat: Wiadomość wysłana z Twojego konta — wyjaśnienie
>
> Dzień dobry,
>
> [data, godzina] z Twojego konta w FaktFlow poszła wiadomość do
> [kontrahent]. Nie powinna była — to był nasz błąd, nie Twoja decyzja.
>
> Co dokładnie poszło: [jedno zdanie, konkret].
> Co już zrobiliśmy: [zatrzymanie, cofnięcie].
> Co robimy dalej: [jedno zdanie].
>
> Jeśli kontrahent się z Tobą skontaktuje, możesz spokojnie powiedzieć, że
> wiadomość poszła omyłkowo z programu. Jeżeli chcesz, żebyśmy odezwali się
> do niego sami — napisz, zrobimy to.
>
> Przepraszam.

### Szablon — zły dokument w KSeF

> Temat: Faktura [numer] wymaga korekty — wyjaśnienie
>
> Dzień dobry,
>
> faktura [numer] została wysłana do KSeF z [opis błędu]. To był błąd po
> naszej stronie.
>
> Dokumentu w KSeF nie da się wycofać — trzeba wystawić korektę.
> Przygotowaliśmy ją: [link]. Wystarczy, że ją zatwierdzisz.
>
> Przepraszam za kłopot.

**Trzy zasady tych wiadomości:** piszemy pierwsi, mówimy wprost, że to nasz
błąd, i nie tłumaczymy się technicznie. Klienta nie interesuje, że zawiodła
re-walidacja.

---

## 5. ALARMY, KTÓRE MAJĄ NAS TU PRZYPROWADZIĆ

Trzy sygnały, które w praktyce wyprzedzają reklamację.

### Koszt modelu powyżej dwukrotności średniej

```sql
WITH dzienne AS (
  SELECT day, sum(cost_usd) AS koszt
  FROM public.flo_usage
  WHERE day > current_date - 14
  GROUP BY day
)
SELECT day, koszt,
       round(koszt / nullif(avg(koszt) OVER (), 0), 2) AS razy_srednia
FROM dzienne
ORDER BY day DESC;
```

Skok kosztu prawie nigdy nie znaczy „więcej klientów”. Zwykle znaczy pętlę
albo prompt, który urósł.

### Wzrost odsetka cofnięć

Cofnięcie to człowiek mówiący „nie o to mi chodziło”, zanim zdąży napisać
zgłoszenie. Liczby daje `buildPanelRows` z `lib/flo/metrics.ts`
(`rates.undonePct`, liczony od przyjętych). **Próg: podwojenie tygodnia do
tygodnia przy co najmniej 20 przyjętych propozycjach.**

### Wzrost blokad re-walidacji

`countBlockedByRevalidation` z `lib/flo/metrics.ts`.

Uwaga na interpretację: ta liczba mierzy **awarie, do których NIE doszło**,
więc przy rosnącym ruchu ma prawo rosnąć. Alarmem jest skok
NIEPROPORCJONALNY do liczby propozycji — wtedy zwykle znaczy, że jakieś
źródło danych zaczęło się zmieniać między pokazaniem karty a kliknięciem.

---

## 6. PO WSZYSTKIM

1. Wpis w `docs/flo/DZIENNIK-BARTOSZ.md`: co się stało, ile kont, co
   zadziałało, co nie.
2. Jeżeli zawiódł mechanizm obrony — test odtwarzający, PRZED poprawką.
3. Odwrócenie zatrzymania: `killFloAgent` z powrotem na `false`, wpisy
   z `flo_kind_flags` usunięte pojedynczo, każdy świadomie.
4. Jeżeli funkcja wraca po poprawce — **wraca przez tryb cichy**
   (`lib/flo/shadow.ts`), nie prosto na klientów.

> **Wyłącznik zostawiony włączony „na wszelki wypadek” jest awarią samą
> w sobie.** Punkt 3 ma termin: koniec dnia, w którym incydent został
> zamknięty.
