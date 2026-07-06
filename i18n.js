(() => {
  "use strict";

  const STORAGE_KEY = "parkingBrainLanguage";
  const LANGS = new Set(["ru", "pt"]);

  const staticText = [
    [".eyebrow", { ru: "JET OPS / ВСЕ ГОРОДА", pt: "JET OPS / TODAS AS CIDADES" }],
    ["#uploadBtn span", { ru: "Загрузить аренды", pt: "Carregar alugueis" }],
    [".upload-meta strong", { ru: "Все города / авто город", pt: "Todas as cidades / cidade automática" }],
    [".settings-panel .section-head h2", { ru: "Настройки расчета", pt: "Configurações do cálculo" }],
    ["#exportHistoryBtn span", { ru: "Экспорт истории", pt: "Exportar histórico" }],
    ["#importHistoryBtn span", { ru: "Импорт истории", pt: "Importar histórico" }],
    ["#exportCsvBtn span", { ru: "CSV план", pt: "CSV plano" }],
    ["#clearBtn span", { ru: "Очистить", pt: "Limpar" }],
    [".history-panel h2", { ru: "Загрузки", pt: "Uploads" }],
    [".kpi-grid .kpi:nth-child(1) span", { ru: "Аренды", pt: "Alugueis" }],
    [".kpi-grid .kpi:nth-child(2) span", { ru: "Парковки", pt: "Estacionamentos" }],
    [".kpi-grid .kpi:nth-child(3) span", { ru: "Дней", pt: "Dias" }],
    [".kpi-grid .kpi:nth-child(4) span", { ru: "Уверенность", pt: "Confiança" }],
    [".plan-panel h2", { ru: "Следующие пополнения", pt: "Próximos abastecimentos" }],
    ['[data-plan-mode="now"]', { ru: "Сейчас", pt: "Agora" }],
    ['[data-plan-mode="day"]', { ru: "День", pt: "Dia" }],
    ["#capacityPanel > .panel-head h2", { ru: "Capacity Monitor", pt: "Capacity Monitor" }],
    ["#capacityExportBtn span", { ru: "CSV отчет", pt: "CSV relatório" }],
    ["#monitorUpdateExportBtn span", { ru: "Новый monitor CSV", pt: "Novo monitor CSV" }],
    [".auto-flow-copy .jet-pill", { ru: "JET SCOOTER OPS", pt: "JET SCOOTER OPS" }],
    [".auto-flow-copy h3", { ru: "Один поток: аренды -> capacity -> monitor CSV", pt: "Um fluxo: alugueis -> capacity -> monitor CSV" }],
    [".auto-flow-copy p", { ru: "Загрузи ежедневные аренды. Сайт сам разделит будни, пятницу и выходные, сравнит текущий monitor и соберет готовый файл.", pt: "Carregue os alugueis diários. O site separa dias úteis, sexta e fim de semana, compara o monitor atual e monta o arquivo pronto." }],
    ["#rentalAutoCapacityBtn span", { ru: "Собрать по арендам", pt: "Montar pelos alugueis" }],
    [".manual-panel summary > span", { ru: "Мануал / Manual", pt: "Manual / Мануал" }],
    [".manual-panel summary > strong", { ru: "Правила расчета capacity / Regras de capacity", pt: "Regras de capacity / Правила расчета capacity" }],
    ["#allParkingsBtn span", { ru: "All parkings", pt: "All parkings" }],
    ["#monitorRulesBtn span", { ru: "Monitor parkings", pt: "Monitor parkings" }],
    ["#gojetParkingsBtn span", { ru: "Importar GoJet JSON", pt: "Importar GoJet JSON" }],
    ["#appsScriptLoginBtn span", { ru: "Conectar Apps Script", pt: "Conectar Apps Script" }],
    ["#capacityKpiSource + span", { ru: "capacity 2+ / min 4", pt: "capacity 2+ / mín. 4" }],
    ["#capacityKpiMatched + span", { ru: "найдено", pt: "encontrados" }],
    ["#capacityKpiMissing + span", { ru: "нет в monitor", pt: "fora do monitor" }],
    ["#capacityKpiProblems + span", { ru: "правки capacity", pt: "ajustes capacity" }],
    ["#capacityKpiGenerated + span", { ru: "строк в новом CSV", pt: "linhas no novo CSV" }],
    [".capacity-grid > div:nth-child(1) h3", { ru: "Нужно добавить в monitor", pt: "Adicionar ao monitor" }],
    [".capacity-grid > div:nth-child(2) h3", { ru: "Нет в monitor / проверить имя", pt: "Fora do monitor / conferir nome" }],
    [".capacity-grid > div:nth-child(3) h3", { ru: "Capacity по будням", pt: "Capacity dias úteis" }],    [".capacity-table th:nth-child(2)", { ru: "Парковка", pt: "Estacionamento" }],
    [".capacity-table th:nth-child(3)", { ru: "Утро", pt: "Manhã" }],
    [".capacity-table th:nth-child(4)", { ru: "Вечер", pt: "Noite" }],
    [".top-panel h2", { ru: "Топ парковок", pt: "Top estacionamentos" }],
    [".top-panel th:nth-child(2)", { ru: "Парковка", pt: "Estacionamento" }],
    [".top-panel th:nth-child(3)", { ru: "Поставить", pt: "Colocar" }],
    [".top-panel th:nth-child(4)", { ru: "Спрос", pt: "Demanda" }],
    [".top-panel th:nth-child(5)", { ru: "Старт/финиш", pt: "Saída/chegada" }],
    [".top-panel th:nth-child(6)", { ru: "Сигнал", pt: "Sinal" }],
    [".insight-panel .panel-head h2", { ru: "Часы спроса", pt: "Horas de demanda" }],
    [".insight-panel .panel-head span", { ru: "Все парковки выбранного города", pt: "Todos os estacionamentos da cidade escolhida" }],
    [".donor-block h3", { ru: "Донорные зоны", pt: "Zonas doadoras" }],
    ["#emptyStateTemplate strong", { ru: "Загрузи ежедневный файл аренды", pt: "Carregue o arquivo diário de alugueis" }],
    ["#emptyStateTemplate span", { ru: "После импорта появятся парковки, часы и приоритеты для выбранного города.", pt: "Depois do import aparecem estacionamentos, horários e prioridades da cidade escolhida." }]
  ];

  const groupedText = [
    [".settings-panel .range-row > span", [
      { ru: "История", pt: "Histórico" },
      { ru: "Заранее", pt: "Antecedência" },
      { ru: "Мин. аренды", pt: "Mín. alugueis" },
      { ru: "Топ", pt: "Top" }
    ]],
    [".auto-flow-steps div span", [
      { ru: "Аренды XLSX", pt: "Alugueis XLSX" },
      { ru: "Будни / Пт / Выходные", pt: "Dias úteis / Sex / FDS" },
      { ru: "Monitor CSV", pt: "Monitor CSV" }
    ]],
    [".capacity-citybar label > span", [
      { ru: "Город", pt: "Cidade" },
      { ru: "city_id", pt: "city_id" },
      { ru: "Кол-во в monitor", pt: "Qtd. no monitor" }
    ]],
    [".apps-bridge label > span", [
      { ru: "Apps Script user", pt: "Usuário Apps Script" },
      { ru: "Apps Script pass", pt: "Senha Apps Script" }
    ]]
  ];

  const placeholders = [
    ["#capacityCityId", { ru: "вставь city_id сюда", pt: "cole city_id aqui" }],
    ["#searchInput", { ru: "Поиск", pt: "Buscar" }],
    ["#appsScriptUser", { ru: "usuario", pt: "usuario" }],
    ["#appsScriptPass", { ru: "senha", pt: "senha" }]
  ];

  const exact = new Map(Object.entries({
    "История не загружена": "Histórico não carregado",
    "Загрузка истории": "Carregando histórico",
    "История пустая": "Histórico vazio",
    "Мозг готов": "Brain pronto",
    "Ошибка базы": "Erro no banco local",
    "Файлы еще не добавлены": "Arquivos ainda não adicionados",
    "Пусто": "Vazio",
    "Нет ежедневных файлов": "Sem arquivos diários",
    "Нет данных для расчета": "Sem dados para cálculo",
    "Загрузи аренды XLSX": "Carregue alugueis XLSX",
    "JET Brain сам разложит будни, пятницу и выходные, потом соберет monitor CSV.": "JET Brain separa dias úteis, sexta e fim de semana, depois monta o monitor CSV.",
    "аренд в расчете": "alugueis no cálculo",
    "будних дней": "dias úteis",
    "пятниц": "sextas",
    "выходных дней": "dias de fim de semana",
    "строк CSV": "linhas CSV",
    "Пока нет новых парковок": "Ainda sem novos estacionamentos",
    "После загрузки аренды здесь появятся точки, которых нет в monitor.": "Depois de carregar alugueis, aqui aparecem pontos que não estão no monitor.",
    "Waiting for weekday Capacity CSV. Loaded parkings stay cached.": "Aguardando weekday Capacity CSV. Parkings carregados ficam no cache.",
    "Monitor CSV is optional": "Monitor CSV opcional",
    "Upload it if you want to update existing rows. Without it, the site creates a new file from all parkings + weekday/weekend capacity.": "Carregue se quiser atualizar linhas existentes. Sem ele, o site cria um novo arquivo de all parkings + weekday/weekend capacity.",
    "No monitor comparison. Export will still include weekday morning/evening, Friday morning/evening and weekend.": "Sem comparação com monitor. A exportação ainda inclui weekday morning/evening, Friday morning/evening e weekend.",
    "All top capacity rows found": "Todas as linhas top capacity foram encontradas",
    "No uncertain matches. The updated CSV can be exported.": "Sem matches duvidosos. O CSV atualizado pode ser exportado.",
    "Capacity matches weekday blocks": "Capacity bate nos blocos weekday",
    "Missing in monitor": "Fora do monitor",
    "Check name": "Conferir nome",
    "add block": "adicionar bloco",
    "current -> target": "atual -> meta",
    "No comparison yet": "Ainda sem comparação",
    "Capacity CSV is not loaded": "Capacity CSV não carregado",
    "Use the weekday file first. Weekend CSV updates only the weekend block.": "Use primeiro o arquivo de dias úteis. Weekend CSV atualiza só o bloco de fim de semana.",
    "Нет сильных доноров": "Sem doadores fortes",
    "По завершениям не видно явного избытка.": "Pelas finalizações não aparece excesso claro.",
    "GPS нет": "sem GPS",
    "срочно": "urgente",
    "высоко": "alto",
    "нормально": "normal",
    "Сначала загрузи capacity CSV": "Carregue primeiro Capacity CSV",
    "Выбери XLSX аренды": "Escolha XLSX de alugueis",
    "Выбери файл аренды XLSX": "Escolha o arquivo XLSX de alugueis",
    "Нет XLSX parser": "Sem parser XLSX",
    "Читаю файл": "Lendo arquivo",
    "Ошибка auto capacity": "Erro no auto capacity"
  }));
  const replacements = [
    [/\bдн\./g, "dias"],
    [/\bмин\./g, "min."],
    [/\bновых\b/g, "novos"],
    [/\bаренд\b/g, "alugueis"],
    [/\bпарковок\b/g, "estacionamentos"],
    [/\bсам\.\b/g, "pat."],
    [/\bспрос\b/g, "demanda"],
    [/\bсигнал\b/g, "sinal"],
    [/\bдержать\b/g, "manter"],
    [/\bстартов\b/g, "saídas"],
    [/\bфинишей\b/g, "chegadas"],
    [/\bизбыток\b/g, "excesso"],
    [/Будни/g, "Dias úteis"],
    [/Пт/g, "Sex"],
    [/Выходные/g, "Fim de semana"],
    [/Утро/g, "Manhã"],
    [/Вечер/g, "Noite"],
    [/добавить в monitor/g, "adicionar ao monitor"],
    [/проверить название/g, "conferir nome"],
    [/capacity 2\+ \/ min 4/g, "capacity 2+ / mín. 4"],
    [/starts\/day/g, "saídas/dia"],
    [/Closest/g, "Mais próximo"],
    [/source:/g, "fonte:"],
    [/no block ->/g, "sem bloco ->"],
    [/all parkings not loaded/g, "all parkings não carregado"],
    [/monitor not loaded/g, "monitor não carregado"],
    [/weekend not loaded/g, "weekend não carregado"],
    [/upload weekday Capacity CSV/g, "carregue weekday Capacity CSV"],
    [/new CSV is not ready/g, "novo CSV ainda não está pronto"],
    [/new CSV ready:/g, "novo CSV pronto:"],
    [/rows/g, "linhas"],
    [/updated/g, "atualizadas"],
    [/skipped/g, "puladas"]
  ];

  const regexTranslations = [
    [/^Сохраняю ([\d\s.,]+)\/([\d\s.,]+)$/u, "Salvando $1/$2"],
    [/^Показано ([\d\s.,]+) · считаю capacity$/u, "Mostrado $1 · calculando capacity"],
    [/^Добавлено ([\d\s.,]+)$/u, "Adicionado $1"],
    [/^Monitor CSV готов: ([\d\s.,]+) строк$/u, "Monitor CSV pronto: $1 linhas"],
    [/^JET Brain: считаю capacity по арендам$/u, "JET Brain: calculando capacity pelos alugueis"],
    [/^(.+): добавлено ([\d\s.,]+), (.+) строк ([\d\s.,]+)$/u, "$1: adicionados $2, $3 linhas $4"],
    [/^Готово: capacity собран по арендам, можно скачать (.+\.csv)$/u, "Pronto: capacity montado pelos alugueis, pode baixar $1"],
    [/^([\d\s.,]+) аренд в окне ([\d\s.,]+) дн\.$/u, "$1 alugueis na janela de $2 dias"],
    [/^План на 24 часа · (.+)$/u, "Plano de 24 horas · $1"],
    [/^Ближайшие 8 часов · (.+)$/u, "Próximas 8 horas · $1"],
    [/^Спрос ([\d.,]+), стартов ([\d\s.,]+), финишей ([\d\s.,]+), net ([+-]?[\d\s.,]+)\.$/u, "Demanda $1, saídas $2, chegadas $3, net $4."],
    [/^Финишей ([\d\s.,]+), стартов ([\d\s.,]+), избыток ([\d\s.,]+)$/u, "Chegadas $1, saídas $2, excesso $3"],
    [/^Not added to the updated CSV: (.+)\.$/u, "Não adicionado ao CSV atualizado: $1."],
    [/^(.+): monitor not loaded; file will be created from all parkings\/capacity\. (.+)$/u, "$1: monitor não carregado; arquivo será criado de all parkings/capacity. $2"],
    [/^(.+) \/ all parkings not loaded \/ monitor not loaded \/ weekend not loaded \/ upload weekday Capacity CSV$/u, "$1 / all parkings não carregado / monitor não carregado / weekend não carregado / carregue weekday Capacity CSV"]
  ];

  function currentLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return LANGS.has(stored) ? stored : "ru";
    } catch (_err) {
      return "ru";
    }
  }

  function setLanguage(next) {
    const lang = LANGS.has(next) ? next : "ru";
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_err) {}
    applyLanguage();
  }

  function valueFor(pair) {
    return pair[currentLanguage()] || pair.ru || "";
  }

  function setText(selector, pair) {
    document.querySelectorAll(selector).forEach((node) => {
      const next = valueFor(pair);
      if (node.textContent !== next) node.textContent = next;
      node.__jetOriginalText = pair.ru || next;
    });
  }

  function applyStatic() {
    const lang = currentLanguage();
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "ru";
    const siteRu = document.getElementById("siteLangRu");
    const sitePt = document.getElementById("siteLangPt");
    const manualRu = document.getElementById("manualLangRu");
    const manualPt = document.getElementById("manualLangPt");
    [siteRu, sitePt].forEach((button) => {
      if (!button) return;
      const active = button.dataset.siteLang === lang;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (manualRu) manualRu.checked = lang === "ru";
    if (manualPt) manualPt.checked = lang === "pt";

    staticText.forEach(([selector, pair]) => setText(selector, pair));
    groupedText.forEach(([selector, pairs]) => {
      document.querySelectorAll(selector).forEach((node, index) => {
        const pair = pairs[index];
        if (pair) {
          const next = valueFor(pair);
          if (node.textContent !== next) node.textContent = next;
          node.__jetOriginalText = pair.ru;
        }
      });
    });
    placeholders.forEach(([selector, pair]) => {
      document.querySelectorAll(selector).forEach((node) => { node.placeholder = valueFor(pair); });
    });
    const allOption = document.querySelector('#monitorParkingLimit option[value="all"]');
    if (allOption) allOption.textContent = lang === "pt" ? "Todas" : "Все";
    const refresh = document.getElementById("refreshBtn");
    if (refresh) refresh.title = lang === "pt" ? "Atualizar cálculo" : "Пересчитать";
    const importJson = document.getElementById("gojetParkingsBtn");
    if (importJson) importJson.title = lang === "pt" ? "Importar JSON GoJet capturado no navegador: parkings + rules + schedule_id" : "Импорт GoJet JSON из браузера: parkings + rules + schedule_id";
  }
  function translateText(original) {
    if (currentLanguage() === "ru") return original;
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    const body = original.trim();
    if (!body) return original;
    if (exact.has(body)) return leading + exact.get(body) + trailing;
    for (const [regex, replacement] of regexTranslations) {
      if (regex.test(body)) return leading + body.replace(regex, replacement) + trailing;
    }
    let translated = body;
    replacements.forEach(([regex, replacement]) => { translated = translated.replace(regex, replacement); });
    return leading + translated + trailing;
  }

  function shouldSkipTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    if (parent.closest("script, style, textarea, input, .manual-copy")) return true;
    if (parent.closest(".site-language-switch")) return true;
    return false;
  }

  function translateTextNodes(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (shouldSkipTextNode(node)) return;
      if (node.__jetOriginalText == null) node.__jetOriginalText = node.nodeValue;
      const next = translateText(node.__jetOriginalText);
      if (node.nodeValue !== next) node.nodeValue = next;
    });
  }

  let applying = false;
  function applyLanguage(root = document.body) {
    if (applying) return;
    applying = true;
    try {
      applyStatic();
      translateTextNodes(root);
    } finally {
      applying = false;
    }
  }

  function bindLanguageSwitches() {
    document.querySelectorAll("[data-site-lang]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        setLanguage(button.dataset.siteLang);
      });
    });
    const bindManualRadio = (id, lang) => {
      const input = document.getElementById(id);
      const label = document.querySelector(`label[for="${id}"]`);
      input?.addEventListener("change", () => setLanguage(lang));
      label?.addEventListener("click", (event) => {
        event.preventDefault();
        setLanguage(lang);
      });
    };
    bindManualRadio("manualLangRu", "ru");
    bindManualRadio("manualLangPt", "pt");
  }

  function init() {
    bindLanguageSwitches();
    applyLanguage();
    let observerTimer = null;
    const observerOptions = { childList: true, subtree: true };
    const observer = new MutationObserver(() => {
      if (applying || observerTimer) return;
      observerTimer = setTimeout(() => {
        observerTimer = null;
        observer.disconnect();
        applyLanguage();
        observer.observe(document.body, observerOptions);
      }, 120);
    });
    observer.observe(document.body, observerOptions);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();