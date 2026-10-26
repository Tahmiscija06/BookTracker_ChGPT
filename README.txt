BOOK TRACKER V4 — UPUTSTVO

POPRAVKE:
- Početna stranica prikazuje „Nastavi čitati“ bez duplog odjeljka „Moja kolekcija“. Lijevi meni otvara sve knjige ili filtere po statusu; „Početna“ vraća na početni pregled.
- Rezultati online pretrage imaju vidljivo dugme za dodavanje u zbirku; srce otvara dodavanje knjige u omiljene.
- Preporuke se prilagođavaju autorima i temama/žanrovima knjiga u tvojoj zbirci.
- Unosi se ukupan broj stranica i broj pročitanih stranica; procenat računa aplikacija.
- 0 pročitanih stranica = Želim pročitati.
- Od 1 do ukupnog broja stranica minus 1 = Trenutno čitam.
- Sve stranice pročitane = Pročitana (100%).
- Online katalog Open Library pretražuje naslove/autore, a korice prikazuje kad postoje.
- HTML, CSS i JavaScript su razdvojeni u datoteke.
- Uključena je priprema za Vercel + Supabase.

POKRETANJE LOKALNO:
1. Raspakuj ZIP u mapu.
2. Dvaput klikni na index.html.
3. Izaberi Novi račun i koristi probne podatke. Nemoj koristiti svoju pravu lozinku u lokalnom demo načinu.
4. Za knjigu unesi naslov, autora, ukupne stranice i pročitane stranice.
5. Ako online pretraga ne radi kada otvoriš file://, pokreni lokalni server:
   - Najlakše: VS Code + ekstenzija Live Server, desni klik index.html > Open with Live Server.
   - Ili ako je Python već instaliran, terminal u folderu projekta: python -m http.server 8000
     Zatim otvori http://localhost:8000
   Ne moraš uraditi oba načina.

DATOTEKE:
- index.html = struktura i sadržaj stranice
- styles.css = izgled i prilagođavanje mobitelu
- app.js = funkcije aplikacije
- config.js = podešavanje Supabase veze
- supabase.sql = baza i sigurnosna pravila
- vercel.json = konfiguracija za Vercel

OBJAVA NA VERCELU ZA PRAVE KORISNIKE:
Samo Vercel nije dovoljan za račune i sinhronizaciju. Za javnu aplikaciju treba Supabase:
1. Napravi projekat na https://supabase.com.
2. U projektu otvori SQL Editor > New query, kopiraj cijeli supabase.sql i klikni Run.
3. U Supabase postavkama kopiraj Project URL i anon/publishable key.
4. U config.js upiši ih između navodnika:
   window.BOOK_TRACKER_CONFIG = {
     supabaseUrl: "TVOJ_PROJECT_URL",
     supabaseAnonKey: "TVOJ_ANON_ILI_PUBLISHABLE_KEY"
   };
   Ne stavljaj service_role/secret key u frontend.
5. Učitaj sve projektne datoteke u GitHub repository.
6. Na https://vercel.com izaberi Add New > Project, uvezi repository, Framework Preset ostavi Other i klikni Deploy.
7. U Supabase Authentication > URL Configuration postavi Site URL na Vercel adresu. Ako je uključena potvrda e-maila, korisnik mora potvrditi e-mail.
8. Testiraj registraciju, prijavu i rad s knjigama.

OGRANIČENJA:
- Bez Supabase podešavanja, računi/podaci se čuvaju lokalno u tom pregledniku. Lozinke lokalnog demo načina nisu sigurno zaštićene; koristi samo probne podatke.
- Sa Supabase konfiguracijom, podaci se čuvaju online i Row Level Security pravila ograničavaju pristup svakog korisnika njegovim knjigama.
- Open Library je vanjski servis; rezultati, broj stranica i slike korica nisu dostupni za svako izdanje. Provjeri/ispravi broj stranica za konkretno izdanje.
- Preporuke koriste autore i teme/žanrove iz Open Libraryja te tvoje knjige, omiljene i pročitane naslove. Starije knjige bez metapodataka pokušavaju se obogatiti iz kataloga.
- Ako si već podesio Supabase iz starije verzije, pokreni ovu migraciju u SQL Editoru: alter table public.books add column if not exists subjects text[] not null default '{}'; Bez toga čuvanje novih knjiga može prijaviti grešku.
- Open Library je vanjski servis; preporuke zavise od dostupnih metapodataka i interneta.
