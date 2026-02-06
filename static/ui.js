// UI for rendering views, forms, lists, and stats
(function () {

  // All views
  const views = {
    listView: document.getElementById("listView"),
    formView: document.getElementById("formView"),
    statsView: document.getElementById("statsView"),
  };

  // Workout table and empty state
  const tbody = document.getElementById("workoutsTbody");
  const emptyState = document.getElementById("emptyState");

  // NEW: pager elements
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageIndicator = document.getElementById("pageIndicator");

  // Form elements
  const workoutId = document.getElementById("workoutId");
  const dateEl = document.getElementById("date");
  const exerciseEl = document.getElementById("exercise");
  const typeEl = document.getElementById("workoutType");
  const durationEl = document.getElementById("duration");
  const setsEl = document.getElementById("sets");
  const repsEl = document.getElementById("reps");
  const weightEl = document.getElementById("weight");
  const formTitle = document.getElementById("formTitle");
  const formError = document.getElementById("formError");

  // Stats elements
  const statTotal = document.getElementById("statTotal");
  const statMostFreq = document.getElementById("statMostFreq");
  const statTotalTime = document.getElementById("statTotalTime");
  const statTotalWeight = document.getElementById("statTotalWeight");

  function showView(viewId) {
    Object.entries(views).forEach(([id, el]) => {
      el.classList.toggle("hidden", id !== viewId);
    });
  }

  function clearForm() {
    workoutId.value = "";
    dateEl.value = new Date().toISOString().slice(0, 10);
    exerciseEl.value = "";
    typeEl.value = "";
    durationEl.value = "";
    setsEl.value = "";
    repsEl.value = "";
    weightEl.value = "";
    setFormError("");
    formTitle.textContent = "Add Workout";
  }

  function fillForm(workout) {
    workoutId.value = workout.id;
    dateEl.value = workout.date;
    exerciseEl.value = workout.exercise;
    typeEl.value = workout.type;
    durationEl.value = workout.duration;
    setsEl.value = workout.sets;
    repsEl.value = workout.reps;
    weightEl.value = workout.weight;
    setFormError("");
    formTitle.textContent = "Edit Workout";
  }

  function getFormData() {
    return {
      id: workoutId.value,
      date: dateEl.value,
      exercise: exerciseEl.value.trim(),
      type: typeEl.value,
      duration: Number(durationEl.value),
      sets: Number(setsEl.value),
      reps: Number(repsEl.value),
      weight: Number(weightEl.value),
    };
  }

  function setFormError(message) {
    if (!message) {
      formError.textContent = "";
      formError.classList.add("hidden");
    } else {
      formError.textContent = message;
      formError.classList.remove("hidden");
    }
  }

  // Builds/renders the workout table (server already sorted & paged)
  function renderList(workouts) {
    tbody.innerHTML = "";

    if (!workouts || workouts.length === 0) {
      emptyState.classList.remove("hidden");
      return;
    }
    emptyState.classList.add("hidden");

    for (const w of workouts) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${w.date}</td>
        <td>${w.exercise}</td>
        <td>${w.type}</td>
        <td>${w.sets}</td>
        <td>${w.reps}</td>
        <td>${w.weight}</td>
        <td>${w.duration}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-primary" data-edit="${w.id}">Edit</button>
            <button class="btn" data-delete="${w.id}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  function setPager(page, totalPages) {
    pageIndicator.textContent = `Page ${page} of ${totalPages}`;
    prevPageBtn.disabled = page <= 1;
    nextPageBtn.disabled = page >= totalPages;
  }

  function renderStats(workouts) {
    statTotal.textContent = workouts.length;

    const typeCounts = {};
    let totalTime = 0;
    let totalWeight = 0;

    for (const w of workouts) {
      typeCounts[w.type] = (typeCounts[w.type] || 0) + 1;
      totalTime += Number(w.duration) || 0;
      if (w.type === "Strength") totalWeight += Number(w.weight) || 0;
    }

    const mostFreq =
      Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

    statMostFreq.textContent = mostFreq;
    statTotalTime.textContent = totalTime;
    statTotalWeight.textContent = totalWeight;
  }

  window.UI = {
    showView,
    clearForm,
    fillForm,
    getFormData,
    setFormError,
    renderList,
    renderStats,
    setPager,
    // expose pager elements so app.js can wire them
    pager: { prevPageBtn, nextPageBtn }
  };

})();