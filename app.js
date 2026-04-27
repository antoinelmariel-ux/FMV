const STORAGE_KEY = "fmv-local-config-v1";
const APP_VERSION = "1.1.0";

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
    project.ranges ||= {};
    for (const stage of project.stages) {
      project.ranges[stage.id] ||= {};
      for (const participant of project.participants) {
        project.ranges[stage.id][participant.id] ||= { min: 0, max: 0, note: "" };
      }
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

  let multiplier = 1;
  const triggered = [];
  for (const mod of project.modifiers || []) {
    if (evaluateModifier(mod, answers)) {
      multiplier *= Number(mod.multiplier || 1);
      triggered.push(mod.note || "Modificateur appliqué");
    }
  }

  const sections = [];
  let globalMin = 0;
  let globalMax = 0;

  for (const stage of project.stages) {
    let rows = "";
    for (const participant of project.participants) {
      const base = project.ranges?.[stage.id]?.[participant.id] || { min: 0, max: 0, note: "" };
      const min = round1(Number(base.min) * multiplier);
      const max = round1(Number(base.max) * multiplier);
      globalMin += min;
      globalMax += max;
      rows += `<tr><td>${participant.label}</td><td>${min} h</td><td>${max} h</td><td>${base.note || "—"}</td></tr>`;
    }
    sections.push(`
      <div>
        <h3 class="stage-title">${stage.label}</h3>
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
      <p><strong>Facteur global appliqué:</strong> x${round1(multiplier)}</p>
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
    node.querySelector(".project-name").value = project.name;
    node.querySelector(".project-description").value = project.description || "";

    const stagesList = node.querySelector(".stages-list");
    project.stages.forEach((s) => stagesList.appendChild(renderChip(s.label, () => {
      project.stages = project.stages.filter((x) => x.id !== s.id);
      delete project.ranges[s.id];
      saveConfig(); refresh();
    }, (v) => {
      s.label = v; saveConfig(); renderQuestionnaire();
    })));

    const participantsList = node.querySelector(".participants-list");
    project.participants.forEach((p) => participantsList.appendChild(renderChip(p.label, () => {
      project.participants = project.participants.filter((x) => x.id !== p.id);
      for (const stageId of Object.keys(project.ranges || {})) delete project.ranges[stageId][p.id];
      saveConfig(); refresh();
    }, (v) => {
      p.label = v; saveConfig();
    })));

    const questionsList = node.querySelector(".questions-list");
    project.questions.forEach((q) => {
      const wrapper = document.createElement("div");
      wrapper.className = "chip";
      wrapper.innerHTML = `
        <div>
          <input value="${q.label}" />
          <select>
            <option value="number" ${q.type === "number" ? "selected" : ""}>Nombre</option>
            <option value="select" ${q.type === "select" ? "selected" : ""}>Choix</option>
          </select>
          <input value="${q.key}" placeholder="clé" />
          <input value="${(q.options || []).join("|")}" placeholder="Options séparées par |" />
        </div>
        <button title="Supprimer">✕</button>
      `;
      const [labelInput, typeInput, keyInput, optionsInput] = wrapper.querySelectorAll("input,select");
      labelInput.addEventListener("input", () => { q.label = labelInput.value; saveConfig(); renderQuestionnaire(); });
      typeInput.addEventListener("change", () => { q.type = typeInput.value; saveConfig(); renderQuestionnaire(); });
      keyInput.addEventListener("input", () => { q.key = keyInput.value; saveConfig(); renderQuestionnaire(); });
      optionsInput.addEventListener("input", () => {
        q.options = optionsInput.value.split("|").map((x) => x.trim()).filter(Boolean);
        saveConfig(); renderQuestionnaire();
      });
      wrapper.querySelector("button").addEventListener("click", () => {
        project.questions = project.questions.filter((x) => x.id !== q.id);
        saveConfig(); refresh();
      });
      questionsList.appendChild(wrapper);
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
      state.projectTypes = state.projectTypes.filter((p) => p.id !== project.id);
      saveConfig(); refresh();
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
    els.adminProjects.appendChild(node);
  });
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

function renderChip(value, onDelete, onEdit) {
  const div = document.createElement("div");
  div.className = "chip";
  const input = document.createElement("input");
  input.value = value;
  input.addEventListener("input", () => onEdit(input.value));
  const btn = document.createElement("button");
  btn.textContent = "✕";
  btn.addEventListener("click", onDelete);
  div.append(input, btn);
  return div;
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
  alert("Configuration sauvegardée localement.");
});

els.resetBtn.addEventListener("click", () => {
  if (!confirm("Réinitialiser toute la configuration ?")) return;
  state = structuredClone(defaultConfig);
  saveConfig();
  refresh();
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
