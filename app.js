const APP_VERSION = "1.22.2";
const PROJECT_CONFIG_FILE = "project-config.json";
let undoSnapshot = null;
let adminUnlocked = false;
const ADMIN_PASSWORD = "FMV2026et+";
let activeEditorProjectId = null;
const editorStepByProjectId = new Map();

const defaultConfig = {
  version: APP_VERSION,
  projectTypes: []
};

let state = structuredClone(defaultConfig);

if (state.version !== APP_VERSION) {
  state.version = APP_VERSION;
  saveConfig();
}

const els = {
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  projectSelect: document.getElementById("projectSelect"),
  questionnaireForm: document.getElementById("questionnaireForm"),
  calculateBtn: document.getElementById("calculateBtn"),
  reportOutput: document.getElementById("reportOutput"),
  exportPdfBtn: document.getElementById("exportPdfBtn"),
  adminProjectsOverview: document.getElementById("adminProjectsOverview"),
  adminProjects: document.getElementById("adminProjects"),
  addProjectBtn: document.getElementById("addProjectBtn"),
  resetBtn: document.getElementById("resetBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  importJsonInput: document.getElementById("importJsonInput"),
  projectBlockTemplate: document.getElementById("projectBlockTemplate"),
  versionBadge: document.getElementById("versionBadge"),
  projectEditorModal: document.getElementById("projectEditorModal"),
  closeProjectEditorBtn: document.getElementById("closeProjectEditorBtn")
};


function saveConfig() {
  // Local persistence intentionally disabled.
}

function ensureRanges() {
  for (const project of state.projectTypes) {
    ensureEntityValues(project);
    ensureQuestionKeys(project);
    normalizeQuestionOptions(project);
    project.ranges ||= {};
    for (const stage of project.stages) {
      project.ranges[stage.id] ||= {};
      for (const participant of project.participants) {
        project.ranges[stage.id][participant.id] ||= { min: 0, max: 0, note: "" };
      }
    }
  }
}
function ensureEntityValues(project) {
  for (const stage of project.stages || []) if (!stage.value) stage.value = stage.id;
  for (const participant of project.participants || []) if (!participant.value) participant.value = participant.id;
}
function normalizeQuestionOptions(project) {
  for (const question of project.questions || []) {
    if (question.type !== "select") continue;
    question.options = (question.options || []).map((opt) =>
      typeof opt === "string" ? { label: opt, value: opt } : { label: opt.label || "", value: opt.value || "" }
    );
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
  renderAdmin(activeEditorProjectId);
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

function switchTab(tabId) {
  const targetTab = [...els.tabs].find((t) => t.dataset.tab === tabId);
  if (!targetTab) return;
  els.tabs.forEach((t) => t.classList.remove("active"));
  targetTab.classList.add("active");
  els.panels.forEach((p) => p.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
}

function askAdminPassword() {
  const input = window.prompt("Mot de passe back-office :");
  if (input === null) return false;
  if (input === ADMIN_PASSWORD) {
    adminUnlocked = true;
    return true;
  }
  showToast("Mot de passe invalide");
  return false;
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.dataset.tab === "adminSpace" && !adminUnlocked && !askAdminPassword()) {
      switchTab("userSpace");
      return;
    }
    switchTab(tab.dataset.tab);
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
        if (q.selectionMode === "multiple") {
          const opts = (q.options || [])
            .map(
              (o) =>
                `<label class="checkbox-option"><input type="checkbox" name="${q.key}" value="${o.value}" /> ${o.label}</label>`
            )
            .join("");
          return `<fieldset class="checkbox-group"><legend>${q.label}</legend>${opts}</fieldset>`;
        }
        const opts = (q.options || []).map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
        return `<label>${q.label}<select name="${q.key}">${opts}</select></label>`;
      }
      return `<label>${q.label}<input type="number" step="0.1" name="${q.key}" value="0"/></label>`;
    })
    .join("");
}


function clearRecommendation() {
  els.reportOutput.innerHTML = '<div class="report-empty">Aucune recommandation calculée.</div>';
}

function evaluateModifier(mod, answers) {
  const actual = answers[mod.questionKey];
  if (mod.operator === ">") return Number(actual) > Number(mod.expectedValue);
  if (mod.operator === "not_in") {
    const expectedValues = Array.isArray(mod.expectedValues) ? mod.expectedValues : [mod.expectedValue];
    if (Array.isArray(actual)) return actual.every((v) => !expectedValues.map(String).includes(String(v)));
    return !expectedValues.map(String).includes(String(actual));
  }
  const expectedValues = Array.isArray(mod.expectedValues) ? mod.expectedValues : [mod.expectedValue];
  if (Array.isArray(actual)) return actual.some((v) => expectedValues.map(String).includes(String(v)));
  return expectedValues.map(String).includes(String(actual));
}

function computeRecommendation() {
  const project = getCurrentProject();
  if (!project) return;

  const data = new FormData(els.questionnaireForm);
  const answers = {};
  for (const question of project.questions || []) {
    if (question.type === "select" && question.selectionMode === "multiple") {
      answers[question.key] = data.getAll(question.key);
    } else {
      answers[question.key] = data.get(question.key);
    }
  }

  let globalMultiplier = 1;
  const globalNotes = [];
  const stageEffects = new Map(project.stages.map((s) => [s.id, { multiplier: 1, excluded: false, notes: [], hiddenParticipants: new Set() }]));

  const resolveStageId = (mod) => mod.stageId || project.stages.find((s) => s.label === mod.stageRef)?.id;
  const resolveTargetStages = (mod) => {
    if ((mod.scope || "global") === "stage") {
      const stageId = resolveStageId(mod);
      return stageId && stageEffects.has(stageId) ? [stageId] : [];
    }
    if (Array.isArray(mod.stageIds) && mod.stageIds.length) {
      return mod.stageIds.filter((id) => stageEffects.has(id));
    }
    return project.stages.map((s) => s.id);
  };

  for (const mod of project.modifiers || []) {
    if (!evaluateModifier(mod, answers)) continue;
    const effect = mod.effect || "multiply";
    const note = mod.note || "Modificateur appliqué";
    const targetStages = resolveTargetStages(mod);

    if (effect === "multiply") {
      if ((mod.scope || "global") === "stage") {
        targetStages.forEach((stageId) => {
          const stageState = stageEffects.get(stageId);
          stageState.multiplier *= Number(mod.multiplier || 1);
          stageState.notes.push(note);
        });
      } else {
        globalMultiplier *= Number(mod.multiplier || 1);
        globalNotes.push(note);
      }
      continue;
    }

    if (effect === "excludeStage") {
      targetStages.forEach((stageId) => {
        const stageState = stageEffects.get(stageId);
        stageState.excluded = true;
        stageState.notes.push(note);
      });
      continue;
    }

    if (effect === "toggleParticipant") {
      const ids = Array.isArray(mod.participantIds) ? mod.participantIds : [mod.participantId].filter(Boolean);
      targetStages.forEach((stageId) => {
        const stageState = stageEffects.get(stageId);
        ids.forEach((id) => stageState.hiddenParticipants.add(id));
        stageState.notes.push(note);
      });
      continue;
    }

    if (effect === "commentStage") {
      if ((mod.scope || "global") === "global") globalNotes.push(note);
      targetStages.forEach((stageId) => stageEffects.get(stageId).notes.push(note));
    }
  }

  const sections = [];
  let globalMin = 0;
  let globalMax = 0;
  const totalsByParticipant = new Map(project.participants.map((p) => [p.id, { label: p.label, min: 0, max: 0 }]));

  for (const stage of project.stages) {
    const stageState = stageEffects.get(stage.id) || { multiplier: 1, excluded: false, notes: [] };
    if (stageState.excluded) {
      continue;
    }

    let rows = "";
    for (const participant of project.participants) {
      if (stageState.hiddenParticipants?.has(participant.id)) continue;
      const base = project.ranges?.[stage.id]?.[participant.id] || { min: 0, max: 0, note: "" };
      const effectiveMultiplier = globalMultiplier * stageState.multiplier;
      const min = round1(Number(base.min) * effectiveMultiplier);
      const max = round1(Number(base.max) * effectiveMultiplier);
      globalMin += min;
      globalMax += max;
      const participantTotals = totalsByParticipant.get(participant.id);
      if (participantTotals) {
        participantTotals.min += min;
        participantTotals.max += max;
      }
      const justificationParts = [];
      if (base.note) justificationParts.push(base.note);
      if (stageState.notes.length) justificationParts.push(`Modificateurs: ${stageState.notes.join(" · ")}`);
      if (globalNotes.length) {
        justificationParts.push(`Modificateurs globaux: ${globalNotes.join(" · ")}`);
      }
      rows += `<tr><td>${participant.label}</td><td>${min} h</td><td>${max} h</td><td>${justificationParts.join(" | ") || "—"}</td></tr>`;
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

  const totalRows = Array.from(totalsByParticipant.values())
    .filter((totals) => totals.min > 0 || totals.max > 0)
    .map((totals) => `<tr><td>${totals.label}</td><td>${round1(totals.min)} h</td><td>${round1(totals.max)} h</td></tr>`)
    .join("");

  els.reportOutput.innerHTML = `
    <div class="report-grid">
      <p><strong>Projet:</strong> ${project.name}</p>
      ${sections.join("")}
      <table>
        <thead><tr><th>Total recommandé</th><th>Min total</th><th>Max total</th></tr></thead>
        <tbody>${totalRows || `<tr><td>—</td><td>${round1(globalMin)} h</td><td>${round1(globalMax)} h</td></tr>`}</tbody>
      </table>
    </div>`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}


function getQuestionModeLabel(question) {
  if (question.type !== "select") return "Nombre";
  return question.selectionMode === "multiple" ? "Choix multiple" : "Choix unique";
}

function renderProjectCards() {
  els.adminProjectsOverview.innerHTML = "";
  state.projectTypes.forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <h3>${project.name || "Projet sans nom"}</h3>
      <p class="muted">${project.description || "Aucune description."}</p>
      <p class="meta">${project.stages.length} étape(s) · ${project.participants.length} participant(s) · ${project.questions.length} question(s)</p>
      <div class="actions">
        <button class="btn icon-btn edit-project">✏️ Modifier</button>
        <button class="btn icon-btn duplicate-project">📄 Dupliquer</button>
        <button class="btn danger icon-btn delete-project">🗑️ Supprimer</button>
      </div>
    `;
    card.querySelector('.edit-project').addEventListener('click',()=>{
      openProjectEditor(project.id);
    });
    card.querySelector('.duplicate-project').addEventListener('click',()=>{
      const duplicated=duplicateProject(project); state.projectTypes.push(duplicated); saveConfig(); refresh();
      showToast(`Projet « ${project.name} » dupliqué.`);
    });
    card.querySelector('.delete-project').addEventListener('click',()=>{
      const name = project.name || "Projet sans nom";
      if (!confirm(`Supprimer définitivement « ${name} » ?`)) return;
      state.projectTypes = state.projectTypes.filter((p) => p.id !== project.id); saveConfig(); refresh();
    });
    els.adminProjectsOverview.appendChild(card);
  });
}

function renderAdmin(projectIdToOpen = null) {
  renderProjectCards();
  els.adminProjects.innerHTML = "";

  state.projectTypes.filter((p) => !projectIdToOpen || p.id === projectIdToOpen).forEach((project) => {
    const node = els.projectBlockTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.projectId = project.id;
    const wizardSections = Array.from(node.querySelectorAll(".wizard-section"));
    const stepBar = node.querySelector(".wizard-steps");
    node.querySelector(".project-name").value = project.name;
    node.querySelector(".project-description").value = project.description || "";

    const stagesList = node.querySelector(".stages-list");
    project.stages.forEach((s, index) => stagesList.appendChild(renderEntityChip(s.label, () => {
      project.stages = project.stages.filter((x) => x.id !== s.id);
      delete project.ranges[s.id];
      saveConfig(); refresh();
    }, (v) => {
      s.label = v; saveConfig(); renderQuestionnaire();
    }, () => { moveItem(project.stages, index, -1); saveConfig(); renderAdmin(project.id); }, () => { moveItem(project.stages, index, 1); saveConfig(); renderAdmin(project.id); })));

    const participantsList = node.querySelector(".participants-list");
    project.participants.forEach((p, index) => participantsList.appendChild(renderEntityChip(p.label, () => {
      project.participants = project.participants.filter((x) => x.id !== p.id);
      for (const stageId of Object.keys(project.ranges || {})) delete project.ranges[stageId][p.id];
      saveConfig(); refresh();
    }, (v) => {
      p.label = v; saveConfig();
    }, () => { moveItem(project.participants, index, -1); saveConfig(); renderAdmin(project.id); }, () => { moveItem(project.participants, index, 1); saveConfig(); renderAdmin(project.id); })));

    const questionsList = node.querySelector(".questions-list");
    project.questions.forEach((q, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "chip";
      wrapper.innerHTML = `
        <div class="question-fields">
          <input value="${q.label}" />
          <div class="question-type-wrap">
            <select class="question-type">
              <option value="number" ${q.type === "number" ? "selected" : ""}>Nombre</option>
              <option value="select" ${q.type === "select" ? "selected" : ""}>Choix</option>
            </select>
            <select class="selection-mode">
              <option value="single" ${(q.selectionMode || "single") === "single" ? "selected" : ""}>Choix unique</option>
              <option value="multiple" ${q.selectionMode === "multiple" ? "selected" : ""}>Choix multiple</option>
            </select>
          </div>
          <div class="choice-options-editor">
            <div class="choice-option-list"></div>
            <button type="button" class="btn small add-option">+ Ajouter un choix</button>
          </div>
        </div>
        <div class="row-actions"><button type="button" class="btn small question-up" title="Monter">↑</button><button type="button" class="btn small question-down" title="Descendre">↓</button><button class="delete-question" title="Supprimer">✕</button></div>
      `;
      const labelInput = wrapper.querySelector("input");
      const typeInput = wrapper.querySelector(".question-type");
      const modeInput = wrapper.querySelector(".selection-mode");
      const toggleOptionsInput = () => {
        const isNumber = typeInput.value === "number";
        wrapper.querySelector(".selection-mode").style.display = isNumber ? "none" : "block";
        wrapper.querySelector(".choice-options-editor").style.display = isNumber ? "none" : "grid";
      };
      const optionList = wrapper.querySelector(".choice-option-list");
      const renderOptions = () => {
        optionList.innerHTML = "";
        (q.options || []).forEach((opt, optIndex) => {
          const row = document.createElement("div");
          row.className = "choice-option-row";
          row.innerHTML = `<input value="${opt.label}" placeholder="Libellé" /><div class="row-actions"><button type="button" class="btn small move-up" title="Monter">↑</button><button type="button" class="btn small move-down" title="Descendre">↓</button><button type="button" class="btn danger small">✕</button></div>`;
          row.querySelectorAll("input")[0].addEventListener("input", (e) => { q.options[optIndex].label = e.target.value; saveConfig(); renderQuestionnaire(); renderModifiersEditor(node, project); });
          row.querySelector(".move-up").addEventListener("click", () => { moveItem(q.options, optIndex, -1); saveConfig(); renderOptions(); renderQuestionnaire(); renderModifiersEditor(node, project); });
          row.querySelector(".move-down").addEventListener("click", () => { moveItem(q.options, optIndex, 1); saveConfig(); renderOptions(); renderQuestionnaire(); renderModifiersEditor(node, project); });
          row.querySelector(".btn.danger").addEventListener("click", () => { q.options.splice(optIndex, 1); saveConfig(); renderQuestionnaire(); renderOptions(); renderModifiersEditor(node, project); });
          optionList.appendChild(row);
        });
      };
      wrapper.querySelector(".add-option").addEventListener("click", () => {
        q.options ||= [];
        q.options.push({ label: `Choix ${(q.options.length || 0) + 1}`, value: `choix_${(q.options.length || 0) + 1}` });
        saveConfig(); renderQuestionnaire(); renderOptions(); renderModifiersEditor(node, project);
      });
      renderOptions();
      labelInput.addEventListener("input", () => { q.label = labelInput.value; saveConfig(); renderQuestionnaire(); });
      modeInput.addEventListener("change", () => { q.selectionMode = modeInput.value; saveConfig(); renderQuestionnaire(); });
      typeInput.addEventListener("change", () => {
        q.type = typeInput.value;
        if (q.type === "number") q.options = [];
        toggleOptionsInput();
        saveConfig();
        renderQuestionnaire();
      });
      toggleOptionsInput();
      wrapper.querySelector(".question-up").addEventListener("click", () => { moveItem(project.questions, index, -1); saveConfig(); refresh(); });
      wrapper.querySelector(".question-down").addEventListener("click", () => { moveItem(project.questions, index, 1); saveConfig(); refresh(); });
      wrapper.querySelector(".delete-question").addEventListener("click", () => {
        project.questions = project.questions.filter((x) => x.id !== q.id);
        saveConfig(); refresh();
      });
      questionsList.appendChild(wrapper);
    });

    node.querySelector(".add-stage").addEventListener("click", () => {
      const id = crypto.randomUUID();
      project.stages.push({ id, label: "Nouvelle étape", value: id });
      saveConfig(); refresh();
    });

    node.querySelector(".add-participant").addEventListener("click", () => {
      const id = crypto.randomUUID();
      project.participants.push({ id, label: "Nouveau participant", value: id });
      saveConfig(); refresh();
    });

    node.querySelector(".add-question").addEventListener("click", () => {
      project.questions.push({ id: crypto.randomUUID(), label: "Nouvelle question", type: "number", key: `q_${Date.now()}` });
      saveConfig(); renderAdmin(project.id);
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
    initWizard(node, wizardSections, stepBar, project.id);
    els.adminProjects.appendChild(node);
  });
}

function openProjectEditor(projectId) {
  activeEditorProjectId = projectId;
  renderAdmin(projectId);
  els.projectEditorModal.classList.add("show");
  els.projectEditorModal.setAttribute("aria-hidden", "false");
}

function closeProjectEditor() {
  activeEditorProjectId = null;
  els.projectEditorModal.classList.remove("show");
  els.projectEditorModal.setAttribute("aria-hidden", "true");
  els.adminProjects.innerHTML = "";
}

function initWizard(node, sections, stepBar, projectId) {
  let currentStep = editorStepByProjectId.get(projectId) || 0;
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
    if (projectId) editorStepByProjectId.set(projectId, currentStep);
    sections.forEach((section, idx) => section.classList.toggle("active-step", idx === currentStep));
    stepBar.querySelectorAll(".wizard-step-btn").forEach((btn, idx) => btn.classList.toggle("active", idx === currentStep));
    prevBtn.disabled = currentStep === 0;
    nextBtn.textContent = currentStep === sections.length - 1 ? "Configuration terminée ✓" : "Étape suivante →";
  };

  prevBtn.addEventListener("click", () => showStep(currentStep - 1));
  nextBtn.addEventListener("click", () => {
    if (currentStep === sections.length - 1) {
      saveConfig();
      closeProjectEditor();
      showToast("Configuration terminée et enregistrée.");
      return;
    }
    showStep(currentStep + 1);
  });
  showStep(currentStep);
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
const getQuestionByKey = (key) => (project.questions || []).find((q) => q.key === key);
  const getQuestionChoices = (question) => question?.type === "select" ? (question.options || []).map((o) => o.label) : [];

  (project.modifiers || []).forEach((mod) => {
    const row = document.createElement("div");
    row.className = "modifier-row";
    row.innerHTML = `
      <label>Question
        <select data-k="questionKey">${questionOptions}</select>
      </label>
      <label>Condition
        <select data-k="operator">
          <option value="in" ${mod.operator !== ">" && mod.operator !== "not_in" ? "selected" : ""}>Contient</option>
          <option value="not_in" ${mod.operator === "not_in" ? "selected" : ""}>Ne contient pas</option>
          <option value=">" ${mod.operator === ">" ? "selected" : ""}>Supérieure à</option>
        </select>
      </label>
      <label>Valeur attendue
        <select data-k="expectedValue"></select>
        <div class="expected-values"></div>
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
          <option value="toggleParticipant" ${(mod.effect || "multiply") === "toggleParticipant" ? "selected" : ""}>Afficher / masquer participant</option>
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
      <label class="effect-participant">Participants à masquer
        <div class="participant-checkboxes">${(project.participants||[]).map(p=>`<label><input type="checkbox" value="${p.id}" ${(mod.participantIds||[]).includes(p.id) ? "checked" : ""}/> ${p.label}</label>`).join("")}</div>
      </label>
      <label class="effect-row-break">Note visible côté utilisateur
        <input data-k="note" value="${mod.note || ""}" />
      </label>
      <button class="btn danger delete-modifier">Supprimer</button>
    `;

    const controls = row.querySelectorAll("[data-k]");
    const qSelect = row.querySelector('[data-k="questionKey"]');
    const opSelect = row.querySelector('[data-k="operator"]');
    const expectedInput = row.querySelector('[data-k="expectedValue"]');
    const expectedValuesNode = row.querySelector(".expected-values");
    const scopeSelect = row.querySelector('[data-k="scope"]');
    const effectSelect = row.querySelector('[data-k="effect"]');
    const multiplierInput = row.querySelector('[data-k="multiplier"]');
    const stageSelect = row.querySelector('[data-k="stageId"]');
    const multiplierField = row.querySelector(".multiplier-field");
    const stageField = row.querySelector(".stage-field");
    const participantField = row.querySelector(".effect-participant");

    qSelect.value = mod.questionKey || project.questions?.[0]?.key || "";
    opSelect.value = mod.operator === ">" ? ">" : (mod.operator === "not_in" ? "not_in" : "in");
    scopeSelect.value = mod.scope === "stage" ? "stage" : "global";
    effectSelect.value = mod.effect || "multiply";
    stageSelect.value = mod.stageId || project.stages?.find((s) => s.label === mod.stageRef)?.id || "";

    const populateExpectedValues = () => {
      const question = getQuestionByKey(qSelect.value);
      if (question?.type === "select") {
        opSelect.innerHTML = `
          <option value="in">Contient</option>
          <option value="not_in">Ne contient pas</option>
        `;
        if (!["in", "not_in"].includes(mod.operator)) mod.operator = "in";
        opSelect.value = mod.operator;
        const choices = getQuestionChoices(question);
        expectedInput.innerHTML = choices.map((c) => `<option value="${c}">${c}</option>`).join("");
        expectedInput.value = mod.expectedValue || choices[0] || "";
        expectedInput.style.display = "block";
        expectedValuesNode.innerHTML = "";
      } else {
        opSelect.innerHTML = `<option value=">">Supérieure à</option>`;
        mod.operator = ">";
        opSelect.value = mod.operator;
        expectedValuesNode.innerHTML = `<input type="number" step="0.1" value="${mod.expectedValue ?? 0}" />`;
        expectedValuesNode.querySelector("input")?.addEventListener("input", normalizeAndSave);
        expectedInput.style.display = "none";
      }
    };

    const syncUi = () => {
      const isStageScope = scopeSelect.value === "stage";
      const isExclude = effectSelect.value === "excludeStage";
      const isCommentOnly = effectSelect.value === "commentStage";
      const isToggleParticipant = effectSelect.value === "toggleParticipant";
      stageField.style.display = isStageScope ? "grid" : "none";
      participantField.style.display = isToggleParticipant ? "grid" : "none";
      multiplierField.style.display = (isExclude || isCommentOnly || isToggleParticipant) ? "none" : "grid";
      row.querySelector(".effect-row-break").style.display = (isCommentOnly || isToggleParticipant) ? "grid" : "none";
    };

    const normalizeAndSave = () => {
      mod.questionKey = qSelect.value;
      mod.operator = opSelect.value;
      const questionType = project.questions?.find((q) => q.key === mod.questionKey)?.type;
      const numericExpected = expectedValuesNode.querySelector('input[type="number"]');
      mod.expectedValue = questionType === "number" ? Number(numericExpected?.value || 0) : expectedInput.value;
      if (["excludeStage", "commentStage", "toggleParticipant"].includes(effectSelect.value)) {
        scopeSelect.value = "stage";
      }
      mod.scope = scopeSelect.value;
      mod.effect = effectSelect.value;
      mod.multiplier = Number(multiplierInput.value || 1);
      mod.stageId = stageSelect.value || undefined;
      mod.participantIds = Array.from(row.querySelectorAll(".participant-checkboxes input:checked")).map((i) => i.value);
      mod.expectedValues = [String(mod.expectedValue)].filter(Boolean);
      mod.note = row.querySelector('[data-k="note"]').value;
      saveConfig();
    };

    controls.forEach((ctrl) => ctrl.addEventListener("input", normalizeAndSave));
    controls.forEach((ctrl) => ctrl.addEventListener("change", () => {
      populateExpectedValues();
    syncUi();
      normalizeAndSave();
    }));
    row.querySelectorAll(".participant-checkboxes input").forEach((cb) => cb.addEventListener("change", normalizeAndSave));

    row.querySelector(".delete-modifier").addEventListener("click", () => {
      project.modifiers = project.modifiers.filter((x) => x.id !== mod.id);
      saveConfig();
      renderModifiersEditor(node, project);
    });

    populateExpectedValues();
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
      operator: firstQuestion?.type === "number" ? ">" : "in",
      expectedValue: firstQuestion?.type === "number" ? 0 : (firstQuestion?.options?.[0]?.label || ""),
      scope: "global",
      effect: "multiply",
      multiplier: 1.1,
      stageId: firstStage?.id,
      note: "Ajustement personnalisé"
    });
    saveConfig();
    renderModifiersEditor(node, project);
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
        if ((mod.effect || "multiply") === "toggleParticipant") {
          const labels = (mod.participantIds || []).map((id) => project.participants.find((p) => p.id === id)?.label).filter(Boolean);
          return `<li>Si <strong>${question}</strong> ${operator} <strong>${mod.expectedValue}</strong>, masquer <strong>${labels.join(", ") || "participants sélectionnés"}</strong> ${scope}.</li>`;
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


function moveItem(list, index, direction) {
  const next = index + direction;
  if (next < 0 || next >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item);
}

function renderEntityChip(value, onDelete, onEdit, onUp, onDown) {
  const div = document.createElement("div");
  div.className = "chip";
  div.innerHTML = `
    <div class="question-fields">
      <input value="${value}" placeholder="Libellé" />
      <small class="muted">Valeur technique interne (non visible côté utilisateur).</small>
    </div>
    <div class="row-actions"><button type="button" class="btn small move-up" title="Monter">↑</button><button type="button" class="btn small move-down" title="Descendre">↓</button><button title="Supprimer">✕</button></div>
  `;
  div.querySelector("input").addEventListener("input", (e) => onEdit(e.target.value));
  div.querySelector(".move-up").addEventListener("click", onUp);
  div.querySelector(".move-down").addEventListener("click", onDown);
  div.querySelector(".row-actions button:last-child").addEventListener("click", onDelete);
  return div;
}

els.projectSelect.addEventListener("change", () => {
  renderQuestionnaire();
  clearRecommendation();
});

els.calculateBtn.addEventListener("click", async () => {
  els.calculateBtn.disabled = true;
  els.calculateBtn.classList.add("is-loading");
  els.calculateBtn.setAttribute("aria-busy", "true");
  const originalLabel = els.calculateBtn.textContent;
  els.calculateBtn.textContent = "Calcul en cours";

  try {
    await new Promise((resolve) => setTimeout(resolve, 900));
    computeRecommendation();
  } finally {
    els.calculateBtn.disabled = false;
    els.calculateBtn.classList.remove("is-loading");
    els.calculateBtn.removeAttribute("aria-busy");
    els.calculateBtn.textContent = originalLabel;
  }
});
els.exportPdfBtn.addEventListener("click", () => window.print());

els.addProjectBtn.addEventListener("click", () => {
  state.projectTypes.push({
    id: crypto.randomUUID(),
    name: "Nouveau projet",
    description: "",
    stages: (() => { const id = crypto.randomUUID(); return [{ id, label: "Étape 1", value: id }]; })(),
    participants: (() => { const id = crypto.randomUUID(); return [{ id, label: "Participant 1", value: id }]; })(),
    questions: [{ id: crypto.randomUUID(), label: "Durée (minutes)", type: "number", key: "duration" }],
    ranges: {},
    modifiers: []
  });
  saveConfig(); refresh();
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
  const exportPayload = {
    version: state.version || APP_VERSION,
    projectTypes: state.projectTypes
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = PROJECT_CONFIG_FILE;
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

async function initializeApp() {
  try {
    const response = await fetch(PROJECT_CONFIG_FILE, { cache: "no-store" });
    if (!response.ok) throw new Error(`Chargement impossible (${response.status})`);
    const fileConfig = await response.json();
    if (!Array.isArray(fileConfig.projectTypes)) throw new Error("Format de configuration invalide");
    state = {
      version: APP_VERSION,
      projectTypes: fileConfig.projectTypes
    };
    ensureRanges();
    refresh();
  } catch (error) {
    console.error(error);
    alert(`Impossible de charger ${PROJECT_CONFIG_FILE}: ${error.message}`);
  }
}

initializeApp();

els.closeProjectEditorBtn?.addEventListener("click", closeProjectEditor);
els.projectEditorModal?.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close-modal")) closeProjectEditor(); });
