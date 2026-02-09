(function () {
  // Netlify-hosted frontend -> local Flask API
  // Your terminal shows: http://127.0.0.1:5000
  const API_BASE_PRIMARY = "http://127.0.0.1:5000";
  const API_BASE_FALLBACK = "http://localhost:5000";

  const PAGE_SIZE = 10; // fixed requirement
  let currentPage = 1;
  let totalPages = 1;

  // For stats view (needs all workouts, not just current page)
  let allWorkoutsCache = [];

  function safeNumber(n) {
    return Number.isFinite(n) ? n : 0;
  }

  // Tries primary base, falls back to localhost if needed.
  async function apiFetch(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };

    async function tryOnce(baseUrl) {
      const res = await fetch(`${baseUrl}${path}`, {
        headers,
        ...options,
      });

      // Try to parse JSON either way
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }

      if (!res.ok) {
        const msg =
          data?.errors?.join(" ") ||
          data?.error ||
          `Request failed (${res.status})`;
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }

      return data;
    }

    try {
      return await tryOnce(API_BASE_PRIMARY);
    } catch (err) {
      // If the server isn't reachable on 127.0.0.1, try localhost.
      // Note: If you get a CORS error, this fallback won't help; you'll need CORS enabled in Flask.
      if (
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("NetworkError") ||
        err?.name === "TypeError"
      ) {
        return await tryOnce(API_BASE_FALLBACK);
      }
      throw err;
    }
  }

  // ----------------------------
  // Paging + rendering
  // ----------------------------
  async function loadPage(page) {
    const data = await apiFetch(`/api/workouts?page=${page}`);
    currentPage = data.page;
    totalPages = data.totalPages;

    UI.renderList(data.items);
    UI.setPager(currentPage, totalPages);

    // If user is on stats view, refresh stats too (optional)
    const statsVisible = !document.getElementById("statsView").classList.contains("hidden");
    if (statsVisible) {
      await loadAllForStats();
      UI.renderStats(allWorkoutsCache);
    }
  }

  async function loadAllForStats() {
    // Pull all records by paging until done (simple & reliable for this project)
    const items = [];
    let page = 1;

    while (true) {
      const data = await apiFetch(`/api/workouts?page=${page}`);
      items.push(...data.items);
      if (page >= data.totalPages) break;
      page++;
    }

    allWorkoutsCache = items;
  }

  // ----------------------------
  // CRUD
  // ----------------------------
  async function createWorkout(w) {
    return await apiFetch(`/api/workouts`, {
      method: "POST",
      body: JSON.stringify(w),
    });
  }

  async function updateWorkout(id, w) {
    return await apiFetch(`/api/workouts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(w),
    });
  }

  async function deleteWorkout(id) {
    return await apiFetch(`/api/workouts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async function getWorkout(id) {
    return await apiFetch(`/api/workouts/${encodeURIComponent(id)}`);
  }

  // Client-side validation (keep same UX), but server enforces truth
  function validateWorkout(w) {
    const errors = [];

    if (!w.date) errors.push("Date is required.");
    if (!w.exercise) errors.push("Exercise is required.");
    if (!w.type) errors.push("Type is required.");

    if (w.duration < 0 || w.sets < 0 || w.reps < 0 || w.weight < 0) {
      errors.push("Numeric values must be 0 or higher.");
    }

    const hasStrength = w.sets > 0 || w.reps > 0 || w.weight > 0;
    const hasDuration = w.duration > 0;

    if (!hasStrength && !hasDuration) {
      errors.push("Enter duration or sets/reps/weight.");
    }

    return errors;
  }

  // ----------------------------
  // Event handlers
  // ----------------------------
  function onAddWorkout() {
    UI.clearForm();
    UI.showView("formView");
  }

  async function onSaveWorkout() {
    const w = UI.getFormData();

    w.duration = safeNumber(w.duration);
    w.sets = safeNumber(w.sets);
    w.reps = safeNumber(w.reps);
    w.weight = safeNumber(w.weight);

    const errors = validateWorkout(w);
    if (errors.length) {
      UI.setFormError(errors.join(" "));
      return;
    }

    UI.setFormError("");

    try {
      if (w.id) {
        await updateWorkout(w.id, w);
      } else {
        await createWorkout(w);
      }

      // After save: reload current page (server-sorted)
      await loadPage(currentPage);

      UI.showView("listView");
    } catch (err) {
      UI.setFormError(err.message);
    }
  }

  async function onTableClick(e) {
    const editId = e.target.dataset.edit;
    const deleteId = e.target.dataset.delete;

    if (editId) {
      try {
        const full = await getWorkout(editId);
        UI.fillForm(full);
        UI.showView("formView");
      } catch (err) {
        alert(err.message);
      }
    }

    if (deleteId) {
      try {
        const w = await getWorkout(deleteId);
        if (confirm(`Delete workout on ${w.date} (${w.exercise})?`)) {
          await deleteWorkout(deleteId);

          await loadPage(currentPage);

          // If table is empty but there are pages behind us, go back one
          const tbody = document.getElementById("workoutsTbody");
          if (tbody.children.length === 0 && currentPage > 1) {
            await loadPage(currentPage - 1);
          }
        }
      } catch (err) {
        alert(err.message);
      }
    }
  }

  async function onPrevPage() {
    if (currentPage > 1) await loadPage(currentPage - 1);
  }

  async function onNextPage() {
    if (currentPage < totalPages) await loadPage(currentPage + 1);
  }

  // ----------------------------
  // Init
  // ----------------------------
  async function init() {
    await loadPage(1);

    document.getElementById("addNewBtn").addEventListener("click", onAddWorkout);
    document.getElementById("workoutForm").addEventListener("submit", (e) => {
      e.preventDefault();
      onSaveWorkout();
    });
    document.getElementById("cancelBtn").addEventListener("click", () => {
      UI.showView("listView");
    });

    document.getElementById("workoutsTbody").addEventListener("click", onTableClick);

    // Pager controls
    UI.pager.prevPageBtn.addEventListener("click", onPrevPage);
    UI.pager.nextPageBtn.addEventListener("click", onNextPage);

    // Tabs
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", async () => {
        const view = tab.dataset.view;

        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");

        UI.showView(view);

        if (view === "statsView") {
          await loadAllForStats();
          UI.renderStats(allWorkoutsCache);
        }
      });
    });
  }

  init().catch((err) => {
    console.error(err);
    alert("App failed to start: " + err.message);
  });
})();
