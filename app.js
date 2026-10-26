(() => {
  const $ = (id) => document.getElementById(id),
    cfg = window.BOOK_TRACKER_CONFIG || {};
  const cloud = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const sb = cloud
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;
  const userKey = "bt2users",
    statuses = {
      planned: "Želim pročitati",
      reading: "Trenutno čitam",
      read: "Pročitana",
    };
  let mode = "login",
    user = null,
    books = [],
    filter = "all",
    dashboardView = true,
    toastTimer,
    recOffset = 0,
    pendingFavorite = false;
  const localUsers = () => {
    try {
      return JSON.parse(localStorage.getItem(userKey) || "{}");
    } catch {
      return {};
    }
  };
  const saveUsers = (x) => localStorage.setItem(userKey, JSON.stringify(x));
  const localLoad = () => {
    try {
      return JSON.parse(localStorage.getItem("bt2books_" + user.id) || "[]");
    } catch {
      return [];
    }
  };
  const localSave = () =>
    localStorage.setItem("bt2books_" + user.id, JSON.stringify(books));
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  const pct = (b) =>
    Math.round((Math.min(b.pages_read, b.total_pages) / b.total_pages) * 100);
  const status = (b) =>
    b.pages_read >= b.total_pages
      ? "read"
      : b.pages_read > 0
      ? "reading"
      : "planned";
  const normalize = (b) => ({
    ...b,
    total_pages: Number(b.total_pages) || 1,
    pages_read: Math.max(0, Number(b.pages_read) || 0),
    is_favorite: !!b.is_favorite,
    subjects: Array.isArray(b.subjects) ? b.subjects : [],
  });
  function toast(msg, error = false) {
    $("toast").textContent = msg;
    $("toast").className = "toast" + (error ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 3000);
  }
  function coverUrl(b) {
    return b.cover_id
      ? "https://covers.openlibrary.org/b/id/" + b.cover_id + "-M.jpg"
      : "";
  }
  function cover(b) {
    const u = coverUrl(b);
    return u
      ? `<img src="${u}" alt="Korice: ${esc(
          b.title
        )}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden')"><div class="fakecover hidden"><span>✳</span><strong>${esc(
          b.title
        )}</strong><small>${esc(b.author)}</small></div>`
      : `<div class="fakecover"><span>✳</span><strong>${esc(
          b.title
        )}</strong><small>${esc(b.author)}</small></div>`;
  }
  function tile(b, recommend = false) {
    const p = b.total_pages
      ? Math.round(((b.pages_read || 0) / b.total_pages) * 100)
      : 0;
    const extra = `data-title="${esc(b.title)}" data-author="${esc(
      b.author || ""
    )}" data-cover="${b.cover_id || ""}" data-pages="${
      b.total_pages || ""
    }" data-key="${esc(b.open_library_key || "")}" data-subjects="${esc(
      encodeURIComponent((b.subjects || []).join("|"))
    )}"`;
    return `<article class="book"><div class="cover">${cover(b)}${
      !recommend ? `<span class="badge">${statuses[status(b)]}</span>` : ""
    }<button class="heart" data-act="fav" data-id="${esc(
      b.id || ""
    )}" ${extra} title="${
      b.is_favorite ? "Ukloni iz omiljenih" : "Dodaj u omiljene"
    }" aria-label="${
      b.is_favorite ? "Ukloni iz omiljenih" : "Dodaj u omiljene"
    }">${b.is_favorite ? "♥" : "♡"}</button></div><h3>${esc(
      b.title
    )}</h3><div class="author">${esc(b.author || "Nepoznat autor")}</div>${
      !recommend
        ? `<div class="pbar"><div class="track"><span style="width:${p}%"></span></div><small>${p}%</small></div><div class="bookactions"><button data-act="edit" data-id="${esc(
            b.id
          )}">Uredi</button><button class="delete" data-act="delete" data-id="${esc(
            b.id
          )}">Obriši</button></div>`
        : `<div class="bookactions"><button data-act="add" ${extra}>＋ Dodaj u moju zbirku</button></div>`
    }</article>`;
  }
  function open(id) {
    $(id).classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  function close(id) {
    $(id).classList.add("hidden");
    if (document.querySelectorAll(".backdrop:not(.hidden)").length === 0)
      document.body.style.overflow = "";
  }
  document
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => close(b.dataset.close)));
  document.querySelectorAll(".backdrop").forEach((b) =>
    b.addEventListener("click", (e) => {
      if (e.target === b) close(b.id);
    })
  );
  function setMode(m) {
    mode = m;
    $("loginTab").classList.toggle("active", m === "login");
    $("signupTab").classList.toggle("active", m === "signup");
    $("authSubmit").textContent =
      m === "login" ? "Prijavi se →" : "Kreiraj račun →";
    $("authNote").textContent = cloud
      ? "Online račun i sinhronizacija preko Supabasea."
      : "Lokalni demo: podaci ostaju samo u ovom pregledniku.";
  }
  $("loginTab").onclick = () => setMode("login");
  $("signupTab").onclick = () => setMode("signup");
  async function loadCloud() {
    const { data, error } = await sb
      .from("books")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    books = (data || []).map(normalize);
  }
  async function auth(e) {
    e.preventDefault();
    $("authMsg").textContent = "";
    let email = $("email").value.trim(),
      password = $("password").value;
    try {
      if (cloud) {
        if (mode === "signup") {
          let { data, error } = await sb.auth.signUp({ email, password });
          if (error) throw error;
          if (!data.session) {
            $("authMsg").textContent =
              "Račun je kreiran. Potvrdi e-mail ako je potvrda uključena, pa se prijavi.";
            return;
          }
          user = {
            id: data.user.id,
            email: data.user.email,
            display: data.user.email.split("@")[0],
          };
        } else {
          let { data, error } = await sb.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          user = {
            id: data.user.id,
            email: data.user.email,
            display: data.user.email.split("@")[0],
          };
        }
        await loadCloud();
      } else {
        let all = localUsers(),
          k = email.toLowerCase();
        if (mode === "signup") {
          if (all[k]) throw Error("Korisnik već postoji u ovom pregledniku.");
          all[k] = {
            password,
            display: email.includes("@") ? email.split("@")[0] : email,
          };
          saveUsers(all);
          user = { id: k, email, display: all[k].display };
          books = [];
          localSave();
        } else {
          if (!all[k] || all[k].password !== password)
            throw Error(
              "Podaci nisu ispravni. Ako nemaš račun, izaberi Novi račun."
            );
          user = { id: k, email, display: all[k].display };
          books = localLoad();
        }
      }
      showApp();
    } catch (err) {
      $("authMsg").textContent = err.message || "Prijava nije uspjela.";
    }
  }
  $("authForm").onsubmit = auth;
  function showApp() {
    $("auth").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("userName").textContent = user.display || user.email;
    $("date").textContent = new Date()
      .toLocaleDateString("bs-BA", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
      .toUpperCase();
    render();
    suggest();
  }
  function showAuth() {
    user = null;
    books = [];
    $("app").classList.add("hidden");
    $("auth").classList.remove("hidden");
    document.body.style.overflow = "";
    setMode("login");
  }
  async function init() {
    if (cloud) {
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (session) {
          user = {
            id: session.user.id,
            email: session.user.email,
            display: session.user.email.split("@")[0],
          };
          await loadCloud();
          showApp();
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
    showAuth();
  }
  $("logout").onclick = async () => {
    if (cloud) await sb.auth.signOut();
    showAuth();
  };
  async function saveBook(b) {
    if (cloud) {
      const payload = {
        user_id: user.id,
        title: b.title,
        author: b.author,
        total_pages: b.total_pages,
        pages_read: b.pages_read,
        status: status(b),
        is_favorite: !!b.is_favorite,
        notes: b.notes || "",
        cover_id: b.cover_id || null,
        open_library_key: b.open_library_key || null,
        subjects: Array.isArray(b.subjects) ? b.subjects : [],
        updated_at: new Date().toISOString(),
      };
      let q = b.id
        ? sb.from("books").update(payload).eq("id", b.id)
        : sb.from("books").insert(payload);
      let { error } = await q;
      if (error) throw error;
      await loadCloud();
    } else {
      let i = books.findIndex((x) => String(x.id) === String(b.id));
      if (i >= 0) books[i] = b;
      else
        books.unshift({
          ...b,
          id: Date.now() + Math.random(),
          created_at: new Date().toISOString(),
        });
      localSave();
    }
  }
  async function delBook(id) {
    if (cloud) {
      let { error } = await sb.from("books").delete().eq("id", id);
      if (error) throw error;
      await loadCloud();
    } else {
      books = books.filter((b) => String(b.id) !== String(id));
      localSave();
    }
  }
  function render() {
    let reading = books.filter((b) => status(b) === "reading"),
      q = $("filterText").value.toLowerCase(),
      list = books.filter(
        (b) =>
          (filter === "all" ||
            (filter === "fav" ? b.is_favorite : status(b) === filter)) &&
          (b.title + " " + b.author).toLowerCase().includes(q)
      );
    let sort = $("sort").value;
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "progress") list.sort((a, b) => pct(b) - pct(a));
    if (sort === "new")
      list.sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
    $("total").textContent = books.length;
    $("read").textContent = books.filter((b) => status(b) === "read").length;
    $("favs").textContent = books.filter((b) => b.is_favorite).length;
    $("countAll").textContent = books.length;
    $("countReading").textContent = reading.length;
    $("countRead").textContent = books.filter(
      (b) => status(b) === "read"
    ).length;
    $("countPlanned").textContent = books.filter(
      (b) => status(b) === "planned"
    ).length;
    document
      .querySelectorAll("[data-filter]")
      .forEach((n) =>
        n.classList.toggle(
          "active",
          !dashboardView && n.dataset.filter === filter
        )
      );
    document
      .querySelector("[data-home]")
      .classList.toggle("active", dashboardView);
    const titles = {
      all: "Sve knjige",
      reading: "Trenutno čitam",
      read: "Pročitane knjige",
      planned: "Želim pročitati",
      fav: "Omiljene knjige",
    };
    $("heading").textContent = dashboardView
      ? "Moja biblioteka"
      : titles[filter];
    $("librarySection").classList.toggle("hidden", dashboardView);
    document
      .querySelectorAll(".dashboard-only")
      .forEach((el) => el.classList.toggle("hidden", !dashboardView));
    $("listTitle").textContent = titles[filter];
    $("listSub").textContent =
      filter === "all"
        ? "Sve knjige iz tvoje zbirke, bez obzira na status."
        : filter === "fav"
        ? "Knjige koje si označio/la srcem."
        : "Knjige koje odgovaraju odabranom statusu.";
    $("continueSection").classList.toggle(
      "hidden",
      !dashboardView || !reading.length
    );
    $("continue").innerHTML = reading
      .slice(0, 4)
      .map((b) => tile(b))
      .join("");
    $("library").innerHTML = list.map((b) => tile(b)).join("");
    $("empty").classList.toggle("hidden", list.length > 0);
    $("library").classList.toggle("hidden", !list.length);
  }
  document.querySelectorAll("[data-filter]").forEach(
    (n) =>
      (n.onclick = () => {
        filter = n.dataset.filter;
        dashboardView = false;
        render();
      })
  );
  document.querySelector("[data-home]").onclick = () => {
    dashboardView = true;
    filter = "all";
    render();
  };
  $("filterText").oninput = render;
  $("sort").onchange = render;
  function resetForm() {
    pendingFavorite = false;
    $("bookForm").reset();
    $("bookId").value = "";
    $("coverId").value = "";
    $("openLibraryKey").value = "";
    $("bookSubjects").value = "";
    $("done").value = 0;
    $("modalTitle").textContent = "Dodaj knjigu";
    $("bookMsg").textContent = "";
    $("preview").innerHTML = "▤<small>Korice knjige</small>";
    updatePreview();
  }
  function updatePreview() {
    let t = Number($("pages").value) || 0,
      d = Number($("done").value) || 0;
    if (t > 0 && d > t) {
      d = t;
      $("done").value = t;
    }
    let p = t ? Math.round((Math.min(d, t) / t) * 100) : 0;
    $("percent").textContent = p + "%";
    $("bar").style.width = p + "%";
    $("statusPreview").textContent =
      t && d >= t ? "Pročitana" : d > 0 ? "Trenutno čitam" : "Želim pročitati";
  }
  $("pages").oninput = updatePreview;
  $("done").oninput = updatePreview;
  $("add").onclick = () => {
    resetForm();
    open("bookModal");
  };
  async function edit(id) {
    let b = books.find((x) => String(x.id) === String(id));
    if (!b) return;
    resetForm();
    $("bookId").value = b.id;
    $("title").value = b.title;
    $("author").value = b.author;
    $("pages").value = b.total_pages;
    $("done").value = b.pages_read;
    $("notes").value = b.notes || "";
    $("coverId").value = b.cover_id || "";
    $("openLibraryKey").value = b.open_library_key || "";
    $("bookSubjects").value = (b.subjects || []).join("|");
    $("modalTitle").textContent = "Uredi knjigu";
    if (b.cover_id)
      $(
        "preview"
      ).innerHTML = `<img src="https://covers.openlibrary.org/b/id/${b.cover_id}-M.jpg" alt="Korice">`;
    updatePreview();
    open("bookModal");
  }
  $("bookForm").onsubmit = async (e) => {
    e.preventDefault();
    let total = Number($("pages").value),
      done = Number($("done").value);
    if (!total || total < 1 || done < 0 || done > total) {
      $("bookMsg").textContent =
        "Pročitane stranice moraju biti između 0 i ukupnog broja stranica.";
      return;
    }
    let id = $("bookId").value,
      old = books.find((b) => String(b.id) === String(id));
    let b = {
      id: id || undefined,
      title: $("title").value.trim(),
      author: $("author").value.trim(),
      total_pages: total,
      pages_read: done,
      is_favorite: old?.is_favorite || pendingFavorite,
      notes: $("notes").value.trim(),
      cover_id: Number($("coverId").value) || old?.cover_id || null,
      open_library_key:
        $("openLibraryKey").value || old?.open_library_key || null,
      subjects: $("bookSubjects").value
        ? $("bookSubjects").value.split("|")
        : old?.subjects || [],
      created_at: old?.created_at || new Date().toISOString(),
    };
    try {
      await saveBook(b);
      pendingFavorite = false;
      render();
      close("bookModal");
      toast(
        id
          ? "Izmjene su sačuvane."
          : b.is_favorite
          ? "Knjiga je dodana u omiljene."
          : "Knjiga je dodana u zbirku."
      );
      suggest();
    } catch (err) {
      $("bookMsg").textContent = "Greška pri čuvanju: " + err.message;
    }
  };
  function catalogFromButton(button) {
    let subjects = [];
    try {
      subjects = decodeURIComponent(button.dataset.subjects || "")
        .split("|")
        .filter(Boolean);
    } catch {}
    return {
      title: button.dataset.title || "",
      author: button.dataset.author || "Nepoznat autor",
      cover_id: Number(button.dataset.cover) || null,
      total_pages: Number(button.dataset.pages) || "",
      open_library_key: button.dataset.key || "",
      subjects,
    };
  }
  function prefillCatalogBook(book, favorite = false) {
    resetForm();
    $("title").value = book.title || "";
    $("author").value = book.author || "";
    $("pages").value = book.total_pages || "";
    $("done").value = 0;
    $("coverId").value = book.cover_id || "";
    $("openLibraryKey").value = book.open_library_key || "";
    $("bookSubjects").value = (book.subjects || []).join("|");
    pendingFavorite = favorite;
    if (book.cover_id)
      $(
        "preview"
      ).innerHTML = `<img src="https://covers.openlibrary.org/b/id/${book.cover_id}-M.jpg" alt="Korice">`;
    updatePreview();
    if (!book.total_pages)
      $("bookMsg").textContent =
        "Open Library nije naveo broj stranica. Unesi broj stranica za izdanje koje imaš.";
    open("bookModal");
  }
  function findSavedBook(book) {
    return books.find(
      (x) =>
        (book.open_library_key &&
          x.open_library_key === book.open_library_key) ||
        ((x.title || "").trim().toLowerCase() ===
          (book.title || "").trim().toLowerCase() &&
          (x.author || "").trim().toLowerCase() ===
            (book.author || "").trim().toLowerCase())
    );
  }
  document.addEventListener("click", async (e) => {
    let button = e.target.closest("[data-act]");
    if (!button) return;
    let action = button.dataset.act,
      id = button.dataset.id;
    if (action === "fav") {
      let bookInCollection = books.find((x) => String(x.id) === String(id));
      if (bookInCollection) {
        bookInCollection.is_favorite = !bookInCollection.is_favorite;
        try {
          await saveBook(bookInCollection);
          render();
          suggest();
        } catch (err) {
          toast(err.message, true);
        }
      } else {
        let external = catalogFromButton(button),
          existing = findSavedBook(external);
        if (existing) {
          existing.is_favorite = !existing.is_favorite;
          try {
            await saveBook(existing);
            render();
            suggest();
            toast(
              existing.is_favorite
                ? "Dodano u omiljene."
                : "Uklonjeno iz omiljenih."
            );
          } catch (err) {
            toast(err.message, true);
          }
        } else {
          prefillCatalogBook(external, true);
          toast("Popuni broj stranica i sačuvaj knjigu u omiljene.");
        }
      }
    }
    if (action === "edit") edit(id);
    if (action === "delete") {
      let book = books.find((x) => String(x.id) === String(id));
      if (book && confirm("Obrisati „" + book.title + "“?"))
        try {
          await delBook(id);
          render();
          suggest();
          toast("Knjiga je obrisana.");
        } catch (err) {
          toast(err.message, true);
        }
    }
    if (action === "add") {
      let external = catalogFromButton(button),
        existing = findSavedBook(external);
      if (existing) {
        toast("Ova knjiga je već u tvojoj zbirci.");
        return;
      }
      prefillCatalogBook(external, false);
      close("searchModal");
    }
  });
  async function searchCatalog(q, limit = 24) {
    let r = await fetch(
      "https://openlibrary.org/search.json?q=" +
        encodeURIComponent(q) +
        "&limit=" +
        limit +
        "&fields=key,title,author_name,author_key,cover_i,number_of_pages_median,first_publish_year,subject"
    );
    if (!r.ok) throw Error("Online katalog trenutno nije dostupan.");
    let d = await r.json();
    return (d.docs || [])
      .filter((x) => x.title)
      .map((x) => ({
        title: x.title,
        author: (x.author_name || ["Nepoznat autor"]).slice(0, 2).join(", "),
        cover_id: x.cover_i || null,
        total_pages: x.number_of_pages_median || "",
        open_library_key: x.key,
        author_key: x.author_key || [],
        subjects: (x.subject || []).slice(0, 12),
      }));
  }
  async function suggest() {
    const panel = $("suggestions");
    panel.innerHTML = '<p class="muted">Tražim preporuke…</p>';
    let items = [];
    try {
      if (!books.length) {
        const queries = [
          "popular fiction books",
          "classic literature",
          "bestselling novels",
        ];
        items = await searchCatalog(queries[recOffset % queries.length], 24);
        $("suggestSub").textContent =
          "Dodaj i ocijeni knjige da bi prijedlozi postali ličniji.";
      } else {
        const seeds = [...books]
          .sort(
            (a, b) =>
              (b.is_favorite ? 3 : 0) +
              (status(b) === "read" ? 2 : 0) +
              (status(b) === "reading" ? 1 : 0) -
              ((a.is_favorite ? 3 : 0) +
                (status(a) === "read" ? 2 : 0) +
                (status(a) === "reading" ? 1 : 0))
          )
          .slice(0, 3);
        let subjectPool = seeds.flatMap((b) => b.subjects || []);
        if (subjectPool.length < 2) {
          for (const seed of seeds.slice(0, 2)) {
            try {
              const metadata = await searchCatalog(
                seed.title + " " + seed.author,
                5
              );
              const match =
                metadata.find(
                  (x) => x.title.toLowerCase() === seed.title.toLowerCase()
                ) || metadata[0];
              if (match?.subjects?.length) {
                subjectPool.push(...match.subjects);
                seed.subjects = [
                  ...new Set([...(seed.subjects || []), ...match.subjects]),
                ].slice(0, 12);
              }
            } catch {}
          }
        }
        const counts = {};
        subjectPool.forEach((s) => {
          const key = String(s).trim();
          if (key.length > 2 && key.length < 45)
            counts[key] = (counts[key] || 0) + 1;
        });
        const popularSubjects = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map((x) => x[0])
          .filter(
            (s) =>
              ![
                "accessible book",
                "protected daisy",
                "large type books",
                "fiction",
                "juvenile fiction",
                "in library",
              ].includes(s.toLowerCase())
          )
          .slice(0, 3);
        const authors = [
          ...new Set(
            seeds
              .map((b) => (b.author || "").split(",")[0].trim())
              .filter((a) => a && a !== "Nepoznat autor")
          ),
        ];
        let q = [];
        if (authors[0]) q.push('author:"' + authors[0].replace(/"/g, "") + '"');
        popularSubjects
          .slice(0, 2)
          .forEach((s) => q.push('subject:"' + s.replace(/"/g, "") + '"'));
        items = q.length
          ? await searchCatalog(q.join(" OR "), 40)
          : await searchCatalog(seeds[0].title + " similar books", 30);
        $("suggestSub").textContent = popularSubjects.length
          ? "Na osnovu tvojih knjiga: slični žanrovi, autori i teme."
          : "Prijedlozi prema autorima iz tvoje zbirke.";
        const savedTitles = new Set(
          books.map((b) => (b.title || "").trim().toLowerCase())
        );
        const savedKeys = new Set(
          books.map((b) => b.open_library_key).filter(Boolean)
        );
        items = items.filter(
          (b) =>
            !savedTitles.has(b.title.trim().toLowerCase()) &&
            !savedKeys.has(b.open_library_key)
        );
        items.sort((a, b) => {
          const score = (x) => {
            let n = 0;
            if (
              authors.some((author) =>
                x.author.toLowerCase().includes(author.toLowerCase())
              )
            )
              n += 4;
            const s = new Set((x.subjects || []).map((v) => v.toLowerCase()));
            n +=
              popularSubjects.filter((v) => s.has(v.toLowerCase())).length * 3;
            return n;
          };
          return score(b) - score(a);
        });
      }
    } catch (e) {
      $("suggestSub").textContent =
        "Ne mogu trenutno dohvatiti preporuke. Provjeri internet vezu.";
    }
    if (!items.length && !books.length)
      items = [
        {
          title: "The Little Prince",
          author: "Antoine de Saint-Exupéry",
          cover_id: null,
          total_pages: 96,
        },
        {
          title: "1984",
          author: "George Orwell",
          cover_id: null,
          total_pages: 328,
        },
        {
          title: "Pride and Prejudice",
          author: "Jane Austen",
          cover_id: null,
          total_pages: 432,
        },
        {
          title: "The Hobbit",
          author: "J. R. R. Tolkien",
          cover_id: null,
          total_pages: 310,
        },
      ];
    panel.innerHTML =
      items
        .slice(0, 8)
        .map((b) => tile(b, true))
        .join("") ||
      '<p class="muted">Nema novih prijedloga. Pritisni Osvježi ili dodaj još knjiga u zbirku.</p>';
  }
  function openSearch() {
    open("searchModal");
    $("query").focus();
  }
  $("openSearch").onclick =
    $("discover").onclick =
    $("emptySearch").onclick =
      openSearch;
  $("refresh").onclick = () => {
    recOffset++;
    suggest();
  };
  $("searchForm").onsubmit = async (e) => {
    e.preventDefault();
    $("searchMsg").textContent = "Pretražujem Open Library…";
    $("results").innerHTML = "";
    try {
      let items = await searchCatalog($("query").value);
      $("searchMsg").textContent = items.length
        ? "Pronađeno: " +
          items.length +
          " knjiga. Pritisni „Dodaj u moju zbirku“ ili srce za omiljene."
        : "Nema rezultata. Pokušaj drugi pojam.";
      const saved = new Set(
        books.map((b) => (b.title || "").trim().toLowerCase())
      );
      $("results").innerHTML = items
        .map((b) => {
          const already = saved.has(b.title.trim().toLowerCase());
          return tile({ ...b, is_favorite: !!findSavedBook(b) }, true).replace(
            "＋ Dodaj u moju zbirku",
            already ? "✓ Već u zbirci" : "＋ Dodaj u moju zbirku"
          );
        })
        .join("");
    } catch (err) {
      $("searchMsg").textContent = err.message + " Provjeri internet vezu.";
    }
  };
  init();
})();
