/* Planora — Celebration & Event Planner Client Engine
 * Features: Largest-Remainder Budget Math, Live Expense Ledger, Adaptive Timeline,
 * LocalStorage Checklist Persistence, Valid RFC 5545 iCalendar (.ics) Export, Ink-Friendly Print.
 * Security: Zero innerHTML insertions of user or server data to prevent XSS.
 */
(function() {
  "use strict";

  const inrFmt = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  const dateFmt = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // DOM Elements
  const form = document.getElementById("plan-form");
  const submitBtn = document.getElementById("submit-btn");
  const submitLabel = document.getElementById("submit-label");
  const formStatus = document.getElementById("form-status");
  const errorSummary = document.getElementById("error-summary");
  const errorList = document.getElementById("error-list");
  const resultsSection = document.getElementById("results");
  const printBtn = document.getElementById("print-btn");
  const exportIcsBtn = document.getElementById("export-ics-btn");

  let activePlan = null;
  let actualSpendings = {};
  let scrollObserver = null;

  // Helpers
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.entries(props).forEach(([k, v]) => {
        if (k === "text") node.textContent = v;
        else if (k === "class") node.className = v;
        else node.setAttribute(k, v);
      });
    }
    if (children) {
      children.forEach(child => {
        if (child) node.appendChild(child);
      });
    }
    return node;
  }

  function clearNode(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function parseDateIso(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function countUp(node, target, formatter) {
    node.textContent = formatter(target);
    if (reduceMotion || target === 0) return;
    const duration = 600;
    const start = performance.now();
    node.textContent = formatter(0);

    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      node.textContent = formatter(Math.round(target * ease));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
    setTimeout(() => { node.textContent = formatter(target); }, duration + 50);
  }

  /* ----------------- Theme Switcher ----------------- */
  const themeBtn = document.getElementById("theme-btn");
  const themeIcon = document.getElementById("theme-icon");

  function syncThemeDisplay() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.setAttribute("aria-pressed", String(isDark));
    themeIcon.textContent = isDark ? "\u2600" : "\u263E";
  }

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("planora_theme", next);
      } catch (e) {}
      syncThemeDisplay();
    });
    syncThemeDisplay();
  }

  /* ----------------- Celebration Presets ----------------- */
  function getFutureIso(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const PRESETS = {
    wedding: {
      type: "wedding",
      title: "Diya & Aarav's Grand Wedding Ceremony",
      guest_count: 350,
      budget: 1500000,
      date: getFutureIso(120),
      city: "Bengaluru",
      preferences: "Pure vegetarian banquet with regional Jain delicacies, outdoor floral mandap, step-free access for senior grandparents.",
      style_priorities: "Heritage South Indian temple aesthetic; top priorities are guest dining and candid cinematography.",
      planning_notes: "Morning muhurtham ceremony followed by twilight reception banquet.",
    },
    birthday: {
      type: "birthday",
      title: "Rohan's 10th Safari Birthday Adventure",
      guest_count: 45,
      budget: 35000,
      date: getFutureIso(18),
      city: "Bengaluru",
      preferences: "Eggless chocolate-truffle custom tiered cake, nut-free snacks, colorful fruit skewers for children.",
      style_priorities: "Jungle Safari theme, interactive treasure hunt and animal magic coordinator.",
      planning_notes: "Host from 4:00 PM to 6:30 PM with customized animal-themed return gift kits.",
    },
    community: {
      type: "community",
      title: "Grand Navratri Community Utsav 2026",
      guest_count: 600,
      budget: 450000,
      date: getFutureIso(45),
      city: "Bengaluru",
      preferences: "Community prasadam, continuous drinking water stations, eco-friendly compostable plates and waste bins.",
      style_priorities: "Traditional Dandiya and Garba cultural staging, high-output PA system and emergency first-aid station.",
      planning_notes: "Local municipal and police noise permission confirmed until 10:00 PM.",
    },
  };

  document.querySelectorAll(".preset-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const preset = PRESETS[btn.dataset.preset];
      if (!preset) return;

      const radio = form.querySelector(`input[name="event_type"][value="${preset.type}"]`);
      if (radio) radio.checked = true;

      document.getElementById("title").value = preset.title;
      document.getElementById("guest_count").value = preset.guest_count;
      document.getElementById("budget").value = preset.budget;
      document.getElementById("event_date").value = preset.date;
      document.getElementById("city").value = preset.city;
      document.getElementById("preferences").value = preset.preferences;
      document.getElementById("style_priorities").value = preset.style_priorities;
      document.getElementById("planning_notes").value = preset.planning_notes;

      clearErrors();
      formStatus.textContent = `Loaded sample ${preset.type} preset. Ready to generate plan!`;
    });
  });

  /* ----------------- Validation & Errors ----------------- */
  const TRACKED_FIELDS = ["title", "guest_count", "budget", "event_date", "city", "preferences", "style_priorities", "planning_notes"];

  function clearErrors() {
    errorSummary.hidden = true;
    clearNode(errorList);
    TRACKED_FIELDS.forEach(f => {
      const input = document.getElementById(f);
      if (input) input.removeAttribute("aria-invalid");
      const err = document.getElementById(f + "-error");
      if (err) {
        err.hidden = true;
        err.textContent = "";
      }
    });
  }

  function displayErrors(details) {
    clearErrors();
    details.forEach(item => {
      const fieldName = item.field;
      const msg = item.message;
      const li = el("li");

      const input = document.getElementById(fieldName);
      if (input) {
        input.setAttribute("aria-invalid", "true");
        const label = document.querySelector(`label[for="${fieldName}"]`);
        const labelText = label ? label.textContent.split("(")[0].trim() : fieldName;
        const link = el("a", { href: "#" + fieldName, text: `${labelText}: ${msg}` });
        link.addEventListener("click", (e) => {
          e.preventDefault();
          input.focus();
        });
        li.appendChild(link);

        const fieldErr = document.getElementById(fieldName + "-error");
        if (fieldErr) {
          fieldErr.textContent = msg;
          fieldErr.hidden = false;
        }
      } else {
        li.textContent = msg;
      }
      errorList.appendChild(li);
    });

    errorSummary.hidden = false;
    errorSummary.focus();
  }

  /* ----------------- Plan Generation ----------------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const formData = new FormData(form);
    const payload = {
      event_type: formData.get("event_type"),
      title: (formData.get("title") || "").trim(),
      guest_count: parseInt(formData.get("guest_count"), 10) || 0,
      budget: parseInt(formData.get("budget"), 10) || 0,
      event_date: formData.get("event_date"),
      city: (formData.get("city") || "").trim(),
      preferences: (formData.get("preferences") || "").trim(),
      style_priorities: (formData.get("style_priorities") || "").trim(),
      planning_notes: (formData.get("planning_notes") || "").trim(),
    };

    // Client-side quick check
    const clientErrors = [];
    if (!payload.title) clientErrors.push({ field: "title", message: "Celebration name is required." });
    if (!payload.guest_count || payload.guest_count < 1) clientErrors.push({ field: "guest_count", message: "Guest count must be at least 1." });
    if (!payload.budget || payload.budget < 1000) clientErrors.push({ field: "budget", message: "Minimum budget is Rs 1,000." });
    if (!payload.event_date) clientErrors.push({ field: "event_date", message: "Event date is required." });
    if (!payload.city) clientErrors.push({ field: "city", message: "City or destination is required." });

    if (clientErrors.length > 0) {
      displayErrors(clientErrors);
      return;
    }

    // Submit to server
    submitBtn.disabled = true;
    submitLabel.textContent = "Orchestrating Plan & Math...";
    formStatus.textContent = "Calculating exact rupee allocations and generating milestones...";

    try {
      const resp = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (resp.status === 429) {
          const waitTime = data.retry_after || 30;
          displayErrors([{ field: "title", message: `Rate limit reached. Please wait ${waitTime} seconds before generating again.` }]);
        } else if (data.details) {
          displayErrors(data.details);
        } else {
          displayErrors([{ field: "title", message: data.error || "An error occurred while generating the plan." }]);
        }
        return;
      }

      // Success
      activePlan = data;
      actualSpendings = {};
      try {
        localStorage.setItem("planora_active_plan", JSON.stringify(data));
      } catch (err) {}

      renderPlan(data);
      formStatus.textContent = "Celebration blueprint generated successfully!";
    } catch (err) {
      displayErrors([{ field: "title", message: "Network connection error. Please verify your connection and try again." }]);
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = "Generate Complete Celebration Plan";
    }
  });

  /* ----------------- Rendering Results ----------------- */
  function renderOverview(plan) {
    document.getElementById("results-sub").textContent = `${plan.title} • ${plan.city} • ${plan.guest_count} Guests • ${dateFmt.format(parseDateIso(plan.event_date))}`;
    document.getElementById("plan-summary").textContent = plan.insights.summary;

    const statsGrid = document.getElementById("stats-grid");
    clearNode(statsGrid);

    const stats = [
      { label: "Guest Count", val: plan.guest_count, fmt: n => `${n} Guests`, num: plan.guest_count, high: false },
      { label: "Total Budget", val: plan.budget, fmt: inrFmt.format, num: plan.budget, high: true },
      { label: "Per Guest", val: plan.per_guest, fmt: inrFmt.format, num: plan.per_guest, high: false },
      { label: "Days to Celebration", val: plan.days_until, fmt: n => `${n} Days`, num: plan.days_until, high: false },
    ];

    stats.forEach(s => {
      const box = el("div", { class: s.high ? "stat-box highlight" : "stat-box" }, [
        el("div", { class: "stat-label", text: s.label }),
        el("div", { class: "stat-value", text: s.fmt(s.val) }),
      ]);
      if (s.num !== null) {
        countUp(box.querySelector(".stat-value"), s.num, s.fmt);
      }
      statsGrid.appendChild(box);
    });

    // AI Attribution
    const aiBadge = document.getElementById("ai-source-badge");
    const aiText = document.getElementById("ai-source-text");
    if (plan.ai_source === "gemini") {
      aiBadge.style.display = "inline-flex";
      aiText.textContent = "Personalized ideas crafted with Gemini GenAI";
    } else {
      aiBadge.style.display = "inline-flex";
      aiText.textContent = "Deterministic offline intelligence (AI service unavailable or offline)";
    }
  }

  function renderAdvisories(plan) {
    const box = document.getElementById("advisory-box");
    clearNode(box);
    if (!plan.warnings || plan.warnings.length === 0) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    plan.warnings.forEach(w => {
      box.appendChild(el("p", { text: `⚠️ ${w}` }));
    });
  }

  /* ----------------- Budget Table & Live Expense Ledger ----------------- */
  function renderBudgetTable(plan) {
    const tbody = document.getElementById("budget-table-body");
    const tfoot = document.getElementById("budget-table-foot");
    clearNode(tbody);
    clearNode(tfoot);

    plan.budget_lines.forEach(b => {
      const row = el("tr", { id: `budget-row-${b.category.replace(/\s+/g, "_")}` });

      // Category with description and bar
      const barFill = el("div", { class: "table-bar-fill", style: "width: 0%;" });
      const barBg = el("div", { class: "table-bar-bg", "aria-hidden": "true" }, [barFill]);
      const catCell = el("td", {}, [
        el("div", { style: "font-weight: 600;", text: b.category }),
        el("div", { class: "hint", text: b.description }),
        barBg,
      ]);

      // Percentage
      const pctCell = el("td", { class: "text-right", text: `${b.percent}%` });

      // Planned allocation
      const plannedCell = el("td", { class: "text-right", style: "font-variant-numeric: tabular-nums;" });
      countUp(plannedCell, b.amount, inrFmt.format);

      // Actual spend input
      const actualInput = el("input", {
        type: "number",
        min: "0",
        step: "100",
        placeholder: "0",
        value: actualSpendings[b.category] || "",
        "aria-label": `Actual spend for ${b.category}`,
        style: "width: 120px; text-align: right; padding: 0.4rem 0.6rem; font-size: 0.9rem;",
      });

      actualInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10) || 0;
        actualSpendings[b.category] = val;
        recalculateClientLedger();
      });

      const actualCell = el("td", { class: "text-right" }, [actualInput]);

      // Variance cell
      const varianceCell = el("td", { class: "text-right", id: `variance-${b.category.replace(/\s+/g, "_")}` }, [
        el("span", { class: "val-positive", text: inrFmt.format(b.amount) }),
      ]);

      row.appendChild(catCell);
      row.appendChild(pctCell);
      row.appendChild(plannedCell);
      row.appendChild(actualCell);
      row.appendChild(varianceCell);
      tbody.appendChild(row);

      // Animate progress bar fill
      if (!reduceMotion) {
        requestAnimationFrame(() => {
          setTimeout(() => { barFill.style.width = `${b.percent}%`; }, 100);
        });
      } else {
        barFill.style.width = `${b.percent}%`;
      }
    });

    // Total foot row
    const footRow = el("tr", { style: "font-weight: 700; background: var(--bg-card-subtle);" }, [
      el("th", { scope: "row", text: "Total Budget Allocation" }),
      el("td", { class: "text-right", text: "100%" }),
      el("td", { class: "text-right", text: inrFmt.format(plan.budget) }),
      el("td", { class: "text-right", id: "foot-total-actual", text: inrFmt.format(0) }),
      el("td", { class: "text-right", id: "foot-total-variance", text: inrFmt.format(plan.budget) }),
    ]);
    tfoot.appendChild(footRow);

    recalculateClientLedger();
  }

  function recalculateClientLedger() {
    if (!activePlan) return;

    let totalSpent = 0;
    let contingencyPlanned = 0;
    let overspentCategories = [];

    activePlan.budget_lines.forEach(b => {
      const actual = actualSpendings[b.category] || 0;
      totalSpent += actual;
      const variance = b.amount - actual;

      if (b.category.includes("Contingency")) {
        contingencyPlanned = b.amount;
      }

      const varCell = document.getElementById(`variance-${b.category.replace(/\s+/g, "_")}`);
      if (varCell) {
        clearNode(varCell);
        if (variance >= 0) {
          varCell.appendChild(el("span", { class: "val-positive", text: `+${inrFmt.format(variance)}` }));
        } else {
          varCell.appendChild(el("span", { class: "val-negative", text: `-${inrFmt.format(Math.abs(variance))}` }));
          overspentCategories.push(`${b.category} (${inrFmt.format(Math.abs(variance))})`);
        }
      }
    });

    const remaining = activePlan.budget - totalSpent;
    const isOver = remaining < 0;

    // Update Foot row
    const footActual = document.getElementById("foot-total-actual");
    if (footActual) footActual.textContent = inrFmt.format(totalSpent);
    const footVar = document.getElementById("foot-total-variance");
    if (footVar) {
      footVar.textContent = remaining >= 0 ? `+${inrFmt.format(remaining)}` : `-${inrFmt.format(Math.abs(remaining))}`;
      footVar.className = remaining >= 0 ? "text-right val-positive" : "text-right val-negative";
    }

    // Update Summary Box
    document.getElementById("ledger-total-planned").textContent = inrFmt.format(activePlan.budget);
    document.getElementById("ledger-total-spent").textContent = inrFmt.format(totalSpent);

    const remEl = document.getElementById("ledger-remaining");
    remEl.textContent = isOver ? `Over budget by ${inrFmt.format(Math.abs(remaining))}` : inrFmt.format(remaining);
    remEl.className = isOver ? "val val-negative" : "val val-positive";

    // Non-contingency overruns
    let netOverrun = 0;
    activePlan.budget_lines.forEach(b => {
      if (!b.category.includes("Contingency")) {
        const actual = actualSpendings[b.category] || 0;
        if (actual > b.amount) netOverrun += (actual - b.amount);
      }
    });

    const contingencyRem = Math.max(0, contingencyPlanned - netOverrun);
    const contEl = document.getElementById("ledger-contingency-balance");
    contEl.textContent = inrFmt.format(contingencyRem);

    const warningsContainer = document.getElementById("ledger-warnings");
    clearNode(warningsContainer);
    if (isOver) {
      warningsContainer.appendChild(el("p", {
        class: "error-text",
        style: "margin-top: 0.75rem; font-weight: 600;",
        text: `🚨 Overall budget exceeded by ${inrFmt.format(Math.abs(remaining))}! Review categories with red negative variances.`,
      }));
    } else if (overspentCategories.length > 0) {
      warningsContainer.appendChild(el("p", {
        class: "hint",
        style: "margin-top: 0.75rem; color: var(--warning);",
        text: `⚠️ Overruns absorbed by contingency in: ${overspentCategories.join(", ")}. Remaining contingency reserve is ${inrFmt.format(contingencyRem)}.`,
      }));
    }
  }

  /* ----------------- Adaptive Timeline ----------------- */
  function renderTimeline(plan) {
    const container = document.getElementById("timeline-container");
    clearNode(container);

    plan.milestones.forEach(m => {
      let badgeCls = "badge badge-normal";
      let badgeText = m.category;
      let itemCls = "timeline-item";

      if (m.category === "Event Day") {
        itemCls += " event-day";
        badgeCls = "badge badge-urgent";
        badgeText = "Celebration Day";
      } else if (m.is_urgent) {
        itemCls += " urgent";
        badgeCls = "badge badge-critical";
        badgeText = m.days_from_today === 0 ? "Due Today" : "Urgent Priority";
      } else if (m.priority === "critical") {
        badgeCls = "badge badge-critical";
      }

      let dateDesc = dateFmt.format(parseDateIso(m.due_date));
      if (m.days_from_today === 0) dateDesc += " (Today)";
      else if (m.days_from_today === 1) dateDesc += " (Tomorrow)";
      else if (m.days_from_today > 1) dateDesc += ` (in ${m.days_from_today} days)`;

      const item = el("li", { class: itemCls }, [
        el("div", { class: "timeline-date", text: dateDesc }),
        el("div", { class: "timeline-task", text: m.task }),
        el("div", { class: "timeline-meta" }, [
          el("span", { class: badgeCls, text: badgeText }),
          el("span", { class: "hint", text: `Category: ${m.category}` }),
        ]),
      ]);

      container.appendChild(item);
    });
  }

  /* ----------------- Vendor Checklist & Persistence ----------------- */
  function getTaskStorageKey(planTitle, taskId) {
    return `planora_task_${planTitle.replace(/\s+/g, "_")}_${taskId}`;
  }

  function renderVendorChecklist(plan) {
    const grid = document.getElementById("vendor-grid");
    clearNode(grid);

    let allCheckboxes = [];

    plan.vendor_checklist.forEach(group => {
      const card = el("div", { class: "vendor-card" }, [
        el("h4", { text: group.vendor }),
      ]);
      const ul = el("ul", { class: "task-list" });

      group.tasks.forEach(t => {
        const storageKey = getTaskStorageKey(plan.title, t.id);
        const isDone = localStorage.getItem(storageKey) === "done";

        const chk = el("input", {
          type: "checkbox",
          id: `task-${t.id}`,
          "aria-label": t.title,
        });
        chk.checked = isDone;

        const li = el("li", { class: isDone ? "task-item completed" : "task-item" }, [
          chk,
          el("div", { class: "task-content" }, [
            el("span", { class: "task-title", text: t.title }),
            el("span", { class: "task-desc", text: t.description }),
          ]),
        ]);

        chk.addEventListener("change", () => {
          if (chk.checked) {
            li.classList.add("completed");
            try { localStorage.setItem(storageKey, "done"); } catch (e) {}
          } else {
            li.classList.remove("completed");
            try { localStorage.removeItem(storageKey); } catch (e) {}
          }
          updateChecklistProgress(allCheckboxes);
        });

        ul.appendChild(li);
        allCheckboxes.push(chk);
      });

      card.appendChild(ul);
      grid.appendChild(card);
    });

    updateChecklistProgress(allCheckboxes);
  }

  function updateChecklistProgress(checkboxes) {
    const total = checkboxes.length;
    const completed = checkboxes.filter(c => c.checked).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const fill = document.getElementById("checklist-bar-fill");
    if (fill) fill.style.width = `${pct}%`;

    const counter = document.getElementById("checklist-counter");
    if (counter) {
      counter.textContent = `${completed} of ${total} tasks completed (${pct}%)${completed === total && total > 0 ? " — Celebration Ready! 🎉" : ""}`;
    }
  }

  /* ----------------- Ideas & Savings ----------------- */
  function renderIdeas(plan) {
    const ideasList = document.getElementById("ideas-list");
    const tipsList = document.getElementById("tips-list");
    clearNode(ideasList);
    clearNode(tipsList);

    plan.insights.ideas.forEach(idea => {
      const card = el("li", { class: "idea-card" }, [
        el("h4", { text: idea.title }),
        el("p", { text: idea.description }),
      ]);
      ideasList.appendChild(card);
    });

    plan.insights.saving_tips.forEach(tip => {
      const li = el("li", { class: "tip-item" }, [
        el("span", { "aria-hidden": "true", text: "💡" }),
        el("span", { text: tip }),
      ]);
      tipsList.appendChild(li);
    });
  }

  /* ----------------- Master Render ----------------- */
  function renderPlan(plan) {
    renderOverview(plan);
    renderAdvisories(plan);
    renderBudgetTable(plan);
    renderTimeline(plan);
    renderVendorChecklist(plan);
    renderIdeas(plan);

    resultsSection.hidden = false;
    resultsSection.focus({ preventScroll: true });
    resultsSection.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });

    setupScrollSpy();
  }

  /* ----------------- Scroll Spy Navigation ----------------- */
  function setupScrollSpy() {
    if (scrollObserver) scrollObserver.disconnect();
    const links = document.querySelectorAll(".plan-nav-link");
    const sections = Array.from(links).map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);

    scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          links.forEach(l => l.removeAttribute("aria-current"));
          const activeLink = document.querySelector(`.plan-nav-link[href="#${entry.target.id}"]`);
          if (activeLink) activeLink.setAttribute("aria-current", "true");
        }
      });
    }, { rootMargin: "-20% 0px -60% 0px" });

    sections.forEach(s => scrollObserver.observe(s));
  }

  /* ----------------- Print & Calendar Actions ----------------- */
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }

  if (exportIcsBtn) {
    exportIcsBtn.addEventListener("click", async () => {
      if (!activePlan) return;
      try {
        const resp = await fetch("/api/export/ics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(activePlan),
        });
        if (!resp.ok) throw new Error("ICS generation failed");

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = el("a", {
          href: url,
          download: `${activePlan.title.replace(/\s+/g, "_")}_milestones.ics`,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert("Failed to export calendar. Please try again.");
      }
    });
  }

  /* ----------------- Page Restore ----------------- */
  window.addEventListener("DOMContentLoaded", () => {
    try {
      const saved = localStorage.getItem("planora_active_plan");
      if (saved) {
        const plan = JSON.parse(saved);
        if (plan && plan.title && plan.budget_lines) {
          activePlan = plan;
          renderPlan(plan);
        }
      }
    } catch (e) {}
  });

})();
