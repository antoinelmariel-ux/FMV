const STORAGE_KEY = "fmv-local-config-v1";
const APP_VERSION = "1.6.0";
let undoSnapshot = null;

const defaultConfig = {
  version: APP_VERSION,
  projectTypes: [
    {
      id: crypto.randomUUID(),
      name: "Symposium international",
      description: "Session scientifique avec orateur(s) et modération.",
      stages: [
        { id: crypto.randomUUID(), label: "Brief" },
        { id: crypto.randomUUID(), label: "Préparation des slides" },
        { id: crypto.randomUUID(), label: "Réunion de travail" },
        { id: crypto.randomUUID(), label: "Présentation finale" }
      ],
      participants: [
        { id: crypto.randomUUID(), label: "Orateur" },
        { id: crypto.randomUUID(), label: "Modérateur" }
      ],
      questions: [
        {
          id: crypto.randomUUID(),
          label: "Durée de la présentation (minutes)",
          type: "number",
          key: "duration"
        },
        {
          id: crypto.randomUUID(),
          label: "Niveau de complexité",
          type: "select",
          key: "complexity",
          options: ["Standard", "Élevé"]
        },
        {
          id: crypto.randomUUID(),
          label: "Slides déjà prêtes ?",
          type: "select",
          key: "slidesReady",
          options: ["Oui", "Non"]
        }
      ],
      ranges: {},
      modifiers: [
        {
          id: crypto.randomUUID(),
          questionKey: "complexity",
          expectedValue: "Élevé",
          multiplier: 1.25,
          note: "Complexité élevée: +25%"
        },
        {
          id: crypto.randomUUID(),
          questionKey: "duration",
          operator: ">",
          expectedValue: 30,
          multiplier: 1.2,
          note: "Durée > 30 min: +20%"
        },
        {
          id: crypto.randomUUID(),
          questionKey: "slidesReady",
          expectedValue: "Oui",
          scope: "stage",
          effect: "excludeStage",
          stageRef: "Préparation des slides",
          note: "Slides déjà prêtes: étape « Préparation des slides » retirée"
        }
      ]
    }
  ]
};

let state = loadConfig();
if (state.version !== APP_VERSION) {
  state.version = APP_VERSION;
  saveConfig();
}
ensureRanges();

const els = {
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  projectSelect: document.getElementById("projectSelect"),
  questionnaireForm: document.getElementById("questionnaireForm"),
  calculateBtn: document.getElementById("calculateBtn"),
  reportOutput: document.getElementById("reportOutput"),
  exportPdfBtn: document.getElementById("exportPdfBtn"),
  adminProjects: document.getElementById("adminProjects"),
  addProjectBtn: document.getElementById("addProjectBtn"),
  saveLocalBtn: document.getElementById("saveLocalBtn"),
  resetBtn: document.getElementById("resetBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  importJsonInput: document.getElementById("importJsonInput"),
  projectBlockTemplate: document.getElementById("projectBlockTemplate"),
  versionBadge: document.getElementById("versionBadge")
};

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : structuredClone(defaultConfig);
  } catch {
    return structuredClone(defaultConfig);
  }
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
}

function ensureRanges() {
  for (const project of state.projectTypes) {
    ensureQuestionKeys(project);
    project.ranges ||= {};
    for (const stage of project.stages) {
      project.ranges[stage.id] ||= {};
      for (const participant of project.participants) {
        project.ranges[stage.id][participant.id] ||= { min: 0, max: 0, note: "" };
      }
    }
  }
}

function ensureQuestionKeys(project) {
  for (const question of project.questions || []) {
    if (!question.key) {
      question.key = `q_${(question.id || crypto.randomUUID()).replace(/-/g, "").slice(0, 8)}`;
    }
  }
}

function refresh() {
  ensureRanges();
  renderProjectSelect();
  renderQuestionnaire();
  renderAdmin();
  els.versionBadge.textContent = `Version v${state.version || APP_VERSION}`;
}

function showToast(message, actionLabel, onAction) {
  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>${message}</span>`;
  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.className = "btn small";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      onAction();
      toast.classList.remove("show");
    });
    toast.appendChild(btn);
  }
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 4500);
}

function saveUndoState(label) {
  undoSnapshot = {
    label,
    payload: structuredClone(state)
  };
}

function restoreUndoState() {
  if (!undoSnapshot) return;
  state = undoSnapshot.payload;
  saveConfig();
  refresh();
  showToast(`Action annulée : ${undoSnapshot.label}`);
  undoSnapshot = null;
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    els.tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    els.panels.forEach((p) => p.classList.remove("active"));
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

function renderProjectSelect() {
  const previous = els.projectSelect.value;
  els.projectSelect.innerHTML = state.projectTypes
    .map((p) => `<option value="${p.id}">${p.name}</option>`)
    .join("");
  if (previous) els.projectSelect.value = previous;
}

function getCurrentProject() {
  return state.projectTypes.find((p) => p.id === els.projectSelect.value) || state.projectTypes[0];
}

function renderQuestionnaire() {
  const project = getCurrentProject();
  if (!project) {
    els.questionnaireForm.innerHTML = "<p>Aucun projet configuré.</p>";
    return;
  }

  els.questionnaireForm.innerHTML = project.questions
    .map((q) => {
      if (q.type === "select") {
        const opts = (q.options || []).map((o) => `<option value="${o}">${o}</option>`).join("");
        return `<label>${q.label}<select name="${q.key}">${opts}</select></label>`;
      }
      return `<label>${q.label}<input type="number" step="0.1" name="${q.key}" value="0"/></label>`;
    })
    .join("");
}

function evaluateModifier(mod, answers) {
  const actual = answers[mod.questionKey];
  if (mod.operator === ">") return Number(actual) > Number(mod.expectedValue);
  return String(actual) === String(mod.expectedValue);
}

function computeRecommendation() {
  const project = getCurrentProject();
  if (!project) return;

  const data = new FormData(els.questionnaireForm);
  const answers = Object.fromEntries(data.entries());

  let globalMultiplier = 1;
  const triggered = [];
  const stageEffects = new Map(project.stages.map((s) => [s.id, { multiplier: 1, excluded: false, notes: [] }]));

  const resolveStageId = (mod) =>
    mod.stageId || project.stages.find((s) => s.label === mod.stageRef)?.id;

  for (const mod of project.modifiers || []) {
    if (evaluateModifier(mod, answers)) {
      const effect = mod.effect || "multiply";
      const scope = mod.scope || "global";
      const note = mod.note || "Modificateur appliqué";

      if (scope === "stage") {
        const stageId = resolveStageId(mod);
        if (!stageId || !stageEffects.has(stageId)) continue;
        const stageState = stageEffects.get(stageId);
        if (effect === "excludeStage") {
          stageState.excluded = true;
        } else if (effect === "commentStage") {
          // commentaire uniquement, sans impact horaire
        } else {
          stageState.multiplier *= Number(mod.multiplier || 1);
        }
        stageState.notes.push(note);
      } else {
        globalMultiplier *= Number(mod.multiplier || 1);
      }

      triggered.push(note);
    }
  }

  const sections = [];
  let globalMin = 0;
  let globalMax = 0;

  for (const stage of project.stages) {
    const stageState = stageEffects.get(stage.id) || { multiplier: 1, excluded: false, notes: [] };
    if (stageState.excluded) {
      sections.push(`
        <div>
          <h3 class="stage-title">${stage.label}</h3>
          <p>Étape non requise selon vos réponses.</p>
        </div>
      `);
      continue;
    }

    let rows = "";
    for (const participant of project.participants) {
      const base = project.ranges?.[stage.id]?.[participant.id] || { min: 0, max: 0, note: "" };
      const effectiveMultiplier = globalMultiplier * stageState.multiplier;
      const min = round1(Number(base.min) * effectiveMultiplier);
      const max = round1(Number(base.max) * effectiveMultiplier);
      globalMin += min;
      globalMax += max;
      rows += `<tr><td>${participant.label}</td><td>${min} h</td><td>${max} h</td><td>${base.note || "—"}</td></tr>`;
    }
    sections.push(`
      <div>
        <h3 class="stage-title">${stage.label}</h3>
        ${stageState.notes.length ? `<p><strong>Impact spécifique:</strong> ${stageState.notes.join(" · ")}</p>` : ""}
        <table>
          <thead><tr><th>Participant</th><th>Min</th><th>Max</th><th>Justification</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);
  }

  els.reportOutput.innerHTML = `
    <div class="report-grid">
      <p><strong>Projet:</strong> ${project.name}</p>
      <p><strong>Facteur global appliqué:</strong> x${round1(globalMultiplier)}</p>
      <p><strong>Hypothèses:</strong> ${triggered.length ? triggered.join(" · ") : "Aucun modificateur"}</p>
      ${sections.join("")}
      <table>
        <thead><tr><th>Total recommandé</th><th>Min global</th><th>Max global</th></tr></thead>
        <tbody><tr><td>Temps de travail</td><td>${round1(globalMin)} h</td><td>${round1(globalMax)} h</td></tr></tbody>
      </table>
    </div>`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function renderAdmin() {
  els.adminProjects.innerHTML = "";

  state.projectTypes.forEach((project) => {
    const node = els.projectBlockTemplate.content.firstElementChild.cloneNode(true);
    const wizardSections = Array.from(node.querySelectorAll(".wizard-section"));
    const stepBar = node.querySelector(".wizard-steps");
    node.querySelector(".project-name").value = project.name;
    node.querySelector(".project-description").value = project.description || "";

    const stagesList = node.querySelector(".stages-list");
    project.stages.forEach((s, index) => stagesList.appendChild(renderChip(s.label, () => {
      project.stages = project.stages.filter((x) => x.id !== s.id);
      delete project.ranges[s.id];
      saveConfig(); refresh();
    }, (v) => {
      s.label = v; saveConfig(); renderQuestionnaire();
    }, index, "Déplacer étape")));
    attachDragAndDropReorder(stagesList, project.stages, () => {
      saveConfig(); refresh();
    });

    const participantsList = node.querySelector(".participants-list");
    project.participants.forEach((p, index) => participantsList.appendChild(renderChip(p.label, () => {
      project.participants = project.participants.filter((x) => x.id !== p.id);
      for (const stageId of Object.keys(project.ranges || {})) delete project.ranges[stageId][p.id];
      saveConfig(); refresh();
    }, (v) => {
      p.label = v; saveConfig();
    }, index, "Déplacer participant")));
    attachDragAndDropReorder(participantsList, project.participants, () => {
      saveConfig(); refresh();
    });

    const questionsList = node.querySelector(".questions-list");
    project.questions.forEach((q, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "chip";
      wrapper.dataset.draggableIndex = String(index);
      wrapper.draggable = true;
      wrapper.innerHTML = `
        <div class="question-fields">
          <input value="${q.label}" />
          <select>
            <option value="number" ${q.type === "number" ? "selected" : ""}>Nombre</option>
            <option value="select" ${q.type === "select" ? "selected" : ""}>Choix</option>
          </select>
          <input class="question-options-input" value="${(q.options || []).join("; ")}" placeholder="Options séparées par ;" />
        </div>
        <span class="drag-handle" title="Glisser-déposer pour réordonner">↕</span>
        <button title="Supprimer">✕</button>
      `;
      const [labelInput, typeInput, optionsInput] = wrapper.querySelectorAll("input,select");
      const toggleOptionsInput = () => {
        const isNumber = typeInput.value === "number";
        optionsInput.style.display = isNumber ? "none" : "block";
      };
      labelInput.addEventListener("input", () => { q.label = labelInput.value; saveConfig(); renderQuestionnaire(); });
      typeInput.addEventListener("change", () => {
        q.type = typeInput.value;
        if (q.type === "number") q.options = [];
        toggleOptionsInput();
        saveConfig();
        renderQuestionnaire();
      });
      optionsInput.addEventListener("input", () => {
        q.options = optionsInput.value.split(";").map((x) => x.trim()).filter(Boolean);
        saveConfig(); renderQuestionnaire();
      });
      toggleOptionsInput();
      wrapper.querySelector("button").addEventListener("click", () => {
        project.questions = project.questions.filter((x) => x.id !== q.id);
        saveConfig(); refresh();
      });
      questionsList.appendChild(wrapper);
    });
    attachDragAndDropReorder(questionsList, project.questions, () => {
      saveConfig(); refresh();
    });

    node.querySelector(".add-stage").addEventListener("click", () => {
      project.stages.push({ id: crypto.randomUUID(), label: "Nouvelle étape" });
      saveConfig(); refresh();
    });

    node.querySelector(".add-participant").addEventListener("click", () => {
      project.participants.push({ id: crypto.randomUUID(), label: "Nouveau participant" });
      saveConfig(); refresh();
    });

    node.querySelector(".add-question").addEventListener("click", () => {
      project.questions.push({ id: crypto.randomUUID(), label: "Nouvelle question", type: "number", key: `q_${Date.now()}` });
      saveConfig(); refresh();
    });

    node.querySelector(".delete-project").addEventListener("click", () => {
      const name = project.name || "Projet sans nom";
      if (!confirm(`Supprimer définitivement « ${name} » ?`)) return;
      saveUndoState(`suppression de ${name}`);
      state.projectTypes = state.projectTypes.filter((p) => p.id !== project.id);
      saveConfig(); refresh();
      showToast(`Projet « ${name} » supprimé.`, "Annuler", restoreUndoState);
    });

    node.querySelector(".duplicate-project").addEventListener("click", () => {
      const duplicated = duplicateProject(project);
      state.projectTypes.push(duplicated);
      saveConfig();
      refresh();
      els.projectSelect.value = duplicated.id;
      renderQuestionnaire();
      showToast(`Projet « ${project.name} » dupliqué.`);
    });

    node.querySelector(".project-name").addEventListener("input", (e) => {
      project.name = e.target.value;
      saveConfig();
      renderProjectSelect();
    });

    node.querySelector(".project-description").addEventListener("input", (e) => {
      project.description = e.target.value;
      saveConfig();
    });

    renderRulesTable(node, project);
    renderModifiersEditor(node, project);
    renderProjectSummary(node, project);
    initWizard(node, wizardSections, stepBar);
    els.adminProjects.appendChild(node);
  });
}

function initWizard(node, sections, stepBar) {
  let currentStep = 0;
  stepBar.innerHTML = "";
  sections.forEach((section, idx) => {
    const stepBtn = document.createElement("button");
    stepBtn.className = "tab wizard-step-btn";
    stepBtn.textContent = `${idx + 1}. ${section.dataset.title || "Étape"}`;
    stepBtn.addEventListener("click", () => showStep(idx));
    stepBar.appendChild(stepBtn);
  });
  const prevBtn = node.querySelector(".wizard-prev");
  const nextBtn = node.querySelector(".wizard-next");

  const showStep = (stepIdx) => {
    currentStep = Math.min(Math.max(stepIdx, 0), sections.length - 1);
    sections.forEach((section, idx) => section.classList.toggle("active-step", idx === currentStep));
    stepBar.querySelectorAll(".wizard-step-btn").forEach((btn, idx) => btn.classList.toggle("active", idx === currentStep));
    prevBtn.disabled = currentStep === 0;
    nextBtn.textContent = currentStep === sections.length - 1 ? "Configuration terminée ✓" : "Étape suivante →";
  };

  prevBtn.addEventListener("click", () => showStep(currentStep - 1));
  nextBtn.addEventListener("click", () => showStep(currentStep + 1));
  showStep(0);
}

function renderModifiersEditor(node, project) {
  const anchor = node.querySelector(".modifiers-anchor");
  const wrapper = document.createElement("div");
  wrapper.className = "modifiers-editor";
  wrapper.innerHTML = `
    <h3>Adaptation des fourchettes via les réponses</h3>
    <p class="muted">Configurez ici comment chaque réponse ajuste les heures min/max (globalement ou par étape).</p>
    <div class="modifiers-list"></div>
    <button class="btn small add-modifier">+ Règle d'adaptation</button>
    <div class="modifier-preview"></div>
  `;
  const listNode = wrapper.querySelector(".modifiers-list");

  const questionOptions = (project.questions || [])
    .map((q) => `<option value="${q.key}">${q.label}</option>`)
    .join("");
  const stageOptions = (project.stages || [])
    .map((s) => `<option value="${s.id}">${s.label}</option>`)
    .join("");

  const previewNode = wrapper.querySelector(".modifier-preview");

  (project.modifiers || []).forEach((mod) => {
    const row = document.createElement("div");
    row.className = "modifier-row";
    row.innerHTML = `
      <label>Question
        <select data-k="questionKey">${questionOptions}</select>
      </label>
      <label>Condition
        <select data-k="operator">
          <option value="=" ${mod.operator !== ">" ? "selected" : ""}>Égale à</option>
          <option value=">" ${mod.operator === ">" ? "selected" : ""}>Supérieure à</option>
        </select>
      </label>
      <label>Valeur attendue
        <input data-k="expectedValue" value="${mod.expectedValue ?? ""}" />
      </label>
      <label>Portée
        <select data-k="scope">
          <option value="global" ${mod.scope !== "stage" ? "selected" : ""}>Globale</option>
          <option value="stage" ${mod.scope === "stage" ? "selected" : ""}>Étape</option>
        </select>
      </label>
      <label>Effet
        <select data-k="effect">
          <option value="multiply" ${(mod.effect || "multiply") === "multiply" ? "selected" : ""}>Multiplier min/max</option>
          <option value="excludeStage" ${(mod.effect || "multiply") === "excludeStage" ? "selected" : ""}>Retirer l'étape</option>
          <option value="commentStage" ${(mod.effect || "multiply") === "commentStage" ? "selected" : ""}>Afficher un commentaire d'étape</option>
        </select>
      </label>
      <label class="multiplier-field">Coefficient
        <input type="number" step="0.05" min="0" data-k="multiplier" value="${mod.multiplier ?? 1}" />
      </label>
      <label class="stage-field">Étape cible
        <select data-k="stageId">
          <option value="">Choisir une étape</option>
          ${stageOptions}
        </select>
      </label>
      <label>Note visible côté utilisateur
        <input data-k="note" value="${mod.note || ""}" />
      </label>
      <button class="btn danger delete-modifier">Supprimer</button>
    `;

    const controls = row.querySelectorAll("[data-k]");
    const qSelect = row.querySelector('[data-k="questionKey"]');
    const opSelect = row.querySelector('[data-k="operator"]');
    const expectedInput = row.querySelector('[data-k="expectedValue"]');
    const scopeSelect = row.querySelector('[data-k="scope"]');
    const effectSelect = row.querySelector('[data-k="effect"]');
    const multiplierInput = row.querySelector('[data-k="multiplier"]');
    const stageSelect = row.querySelector('[data-k="stageId"]');
    const multiplierField = row.querySelector(".multiplier-field");
    const stageField = row.querySelector(".stage-field");

    qSelect.value = mod.questionKey || project.questions?.[0]?.key || "";
    opSelect.value = mod.operator === ">" ? ">" : "=";
    scopeSelect.value = mod.scope === "stage" ? "stage" : "global";
    effectSelect.value = mod.effect || "multiply";
    stageSelect.value = mod.stageId || project.stages?.find((s) => s.label === mod.stageRef)?.id || "";

    const syncUi = () => {
      const isStageScope = scopeSelect.value === "stage";
      const isExclude = effectSelect.value === "excludeStage";
      const isCommentOnly = effectSelect.value === "commentStage";
      stageField.style.display = isStageScope ? "grid" : "none";
      multiplierField.style.display = (isExclude || isCommentOnly) ? "none" : "grid";
    };

    const normalizeAndSave = () => {
      mod.questionKey = qSelect.value;
      mod.operator = opSelect.value;
      const questionType = project.questions?.find((q) => q.key === mod.questionKey)?.type;
      mod.expectedValue = questionType === "number" ? Number(expectedInput.value || 0) : expectedInput.value;
      if (effectSelect.value === "excludeStage" || effectSelect.value === "commentStage") {
        scopeSelect.value = "stage";
      }
      mod.scope = scopeSelect.value;
      mod.effect = effectSelect.value;
      mod.multiplier = Number(multiplierInput.value || 1);
      mod.stageId = stageSelect.value || undefined;
      mod.note = row.querySelector('[data-k="note"]').value;
      saveConfig();
    };

    controls.forEach((ctrl) => ctrl.addEventListener("input", normalizeAndSave));
    controls.forEach((ctrl) => ctrl.addEventListener("change", () => {
      syncUi();
      normalizeAndSave();
    }));

    row.querySelector(".delete-modifier").addEventListener("click", () => {
      project.modifiers = project.modifiers.filter((x) => x.id !== mod.id);
      saveConfig();
      refresh();
    });

    syncUi();
    listNode.appendChild(row);
  });

  wrapper.querySelector(".add-modifier").addEventListener("click", () => {
    const firstQuestion = project.questions?.[0];
    const firstStage = project.stages?.[0];
    project.modifiers ||= [];
    project.modifiers.push({
      id: crypto.randomUUID(),
      questionKey: firstQuestion?.key || "",
      operator: firstQuestion?.type === "number" ? ">" : "=",
      expectedValue: firstQuestion?.type === "number" ? 0 : (firstQuestion?.options?.[0] || ""),
      scope: "global",
      effect: "multiply",
      multiplier: 1.1,
      stageId: firstStage?.id,
      note: "Ajustement personnalisé"
    });
    saveConfig();
    refresh();
  });

  previewNode.innerHTML = buildModifierPreview(project);
  anchor.innerHTML = "";
  anchor.appendChild(wrapper);
}

function buildModifierPreview(project) {
  if (!project.modifiers?.length) return "<p class='muted'>Aucune règle d'adaptation configurée.</p>";
  return `
    <h4>Prévisualisation de l'impact des règles</h4>
    <ul class="helper-list">
      ${project.modifiers.map((mod) => {
        const question = project.questions.find((q) => q.key === mod.questionKey)?.label || mod.questionKey;
        const operator = mod.operator === ">" ? ">" : "=";
        const scope = mod.scope === "stage" ? "sur une étape" : "globalement";
        if ((mod.effect || "multiply") === "excludeStage") {
          const stageLabel = project.stages.find((s) => s.id === mod.stageId)?.label || mod.stageRef || "étape cible";
          return `<li>Si <strong>${question}</strong> ${operator} <strong>${mod.expectedValue}</strong>, alors l'étape <strong>${stageLabel}</strong> est retirée.</li>`;
        }
        if ((mod.effect || "multiply") === "commentStage") {
          const stageLabel = project.stages.find((s) => s.id === mod.stageId)?.label || mod.stageRef || "étape cible";
          return `<li>Si <strong>${question}</strong> ${operator} <strong>${mod.expectedValue}</strong>, afficher un commentaire sur l'étape <strong>${stageLabel}</strong>.</li>`;
        }
        return `<li>Si <strong>${question}</strong> ${operator} <strong>${mod.expectedValue}</strong>, appliquer x${round1(Number(mod.multiplier || 1))} ${scope}.</li>`;
      }).join("")}
    </ul>
  `;
}

function duplicateProject(project) {
  const stageIdMap = new Map();
  const participantIdMap = new Map();
  const duplicatedStages = project.stages.map((stage) => {
    const newId = crypto.randomUUID();
    stageIdMap.set(stage.id, newId);
    return { ...stage, id: newId };
  });
  const duplicatedParticipants = project.participants.map((participant) => {
    const newId = crypto.randomUUID();
    participantIdMap.set(participant.id, newId);
    return { ...participant, id: newId };
  });
  const duplicatedRanges = {};
  for (const oldStageId of Object.keys(project.ranges || {})) {
    const newStageId = stageIdMap.get(oldStageId);
    duplicatedRanges[newStageId] = {};
    for (const oldParticipantId of Object.keys(project.ranges?.[oldStageId] || {})) {
      duplicatedRanges[newStageId][participantIdMap.get(oldParticipantId)] = {
        ...project.ranges[oldStageId][oldParticipantId]
      };
    }
  }
  return {
    ...structuredClone(project),
    id: crypto.randomUUID(),
    name: `${project.name} (copie)`,
    stages: duplicatedStages,
    participants: duplicatedParticipants,
    questions: project.questions.map((q) => ({ ...q, id: crypto.randomUUID() })),
    ranges: duplicatedRanges,
    modifiers: project.modifiers.map((mod) => ({
      ...mod,
      id: crypto.randomUUID(),
      stageId: mod.stageId ? stageIdMap.get(mod.stageId) : mod.stageId
    }))
  };
}

function renderProjectSummary(node, project) {
  const target = node.querySelector(".project-summary");
  target.innerHTML = `
    <h3>Résumé avant sauvegarde/export</h3>
    <p><strong>${project.name || "Projet sans nom"}</strong></p>
    <ul class="helper-list">
      <li>${project.stages.length} étape(s)</li>
      <li>${project.participants.length} participant(s)</li>
      <li>${project.questions.length} question(s)</li>
      <li>${(project.modifiers || []).length} modificateur(s)</li>
    </ul>
  `;
}

function renderRulesTable(node, project) {
  const tableHead = node.querySelector(".rules-table thead");
  const tableBody = node.querySelector(".rules-table tbody");
  tableHead.innerHTML = `<tr><th>Étape / Participant</th>${project.participants.map((p) => `<th>${p.label}</th>`).join("")}</tr>`;
  tableBody.innerHTML = "";

  for (const stage of project.stages) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${stage.label}</strong></td>`;

    for (const participant of project.participants) {
      const range = project.ranges?.[stage.id]?.[participant.id] || { min: 0, max: 0, note: "" };
      const td = document.createElement("td");
      td.innerHTML = `
        <label>Min <input type="number" step="0.1" value="${range.min}" data-k="min" /></label>
        <label>Max <input type="number" step="0.1" value="${range.max}" data-k="max" /></label>
        <label>Justification <textarea data-k="note" rows="2">${range.note || ""}</textarea></label>
      `;
      td.querySelectorAll("input,textarea").forEach((input) => {
        input.addEventListener("input", () => {
          const key = input.dataset.k;
          project.ranges[stage.id][participant.id][key] = key === "note" ? input.value : Number(input.value || 0);
          saveConfig();
        });
      });
      tr.appendChild(td);
    }
    tableBody.appendChild(tr);
  }
}

function renderChip(value, onDelete, onEdit, index, dragLabel) {
  const div = document.createElement("div");
  div.className = "chip";
  div.dataset.draggableIndex = String(index);
  div.draggable = true;
  const input = document.createElement("input");
  input.value = value;
  input.addEventListener("input", () => onEdit(input.value));
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.title = `${dragLabel} (glisser-déposer)`;
  handle.textContent = "↕";
  const btn = document.createElement("button");
  btn.textContent = "✕";
  btn.addEventListener("click", onDelete);
  div.append(input, handle, btn);
  return div;
}

function attachDragAndDropReorder(container, list, onReorder) {
  let draggedIndex = null;
  container.querySelectorAll("[data-draggable-index]").forEach((item) => {
    const getIndex = () => Number(item.dataset.draggableIndex);
    item.addEventListener("dragstart", () => {
      draggedIndex = getIndex();
      item.classList.add("is-dragging");
    });
    item.addEventListener("dragend", () => {
      draggedIndex = null;
      item.classList.remove("is-dragging");
      container.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over");
      const targetIndex = getIndex();
      if (draggedIndex === null || targetIndex === draggedIndex) return;
      const [moved] = list.splice(draggedIndex, 1);
      list.splice(targetIndex, 0, moved);
      onReorder();
    });
  });
}

els.projectSelect.addEventListener("change", renderQuestionnaire);
els.calculateBtn.addEventListener("click", computeRecommendation);
els.exportPdfBtn.addEventListener("click", () => window.print());

els.addProjectBtn.addEventListener("click", () => {
  state.projectTypes.push({
    id: crypto.randomUUID(),
    name: "Nouveau projet",
    description: "",
    stages: [{ id: crypto.randomUUID(), label: "Étape 1" }],
    participants: [{ id: crypto.randomUUID(), label: "Participant 1" }],
    questions: [{ id: crypto.randomUUID(), label: "Durée (minutes)", type: "number", key: "duration" }],
    ranges: {},
    modifiers: []
  });
  saveConfig(); refresh();
});

els.saveLocalBtn.addEventListener("click", () => {
  saveConfig();
  showToast(`Configuration sauvegardée (${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}).`);
});

els.resetBtn.addEventListener("click", () => {
  const projectCount = state.projectTypes.length;
  if (!confirm(`Réinitialiser toute la configuration (${projectCount} projet(s)) ?`)) return;
  saveUndoState("réinitialisation complète");
  state = structuredClone(defaultConfig);
  saveConfig();
  refresh();
  showToast("Configuration réinitialisée.", "Annuler", restoreUndoState);
});

els.exportJsonBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fmv-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

els.importJsonInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.projectTypes)) throw new Error("Format invalide");
    state = imported;
    ensureRanges();
    saveConfig();
    refresh();
    alert("Configuration importée.");
  } catch (err) {
    alert(`Import impossible: ${err.message}`);
  }
});

refresh();
