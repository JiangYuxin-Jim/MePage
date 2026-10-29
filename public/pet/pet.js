(async () => {
  const $ = (s) => document.querySelector(s);
  if (sessionStorage.getItem("pet-hidden")) return;
  let cfg,
    busy = false;
  try {
    const r = await fetch("/api/pet");
    if (!r.ok) return;
    cfg = await r.json();
    if (!cfg.enabled) return;
  } catch {
    return;
  }
  const cat =
    '<path class="pet-tail" d="M68 72 Q100 68 85 45" fill="none" stroke="#c99461" stroke-width="12" stroke-linecap="round"/><ellipse cx="44" cy="75" rx="25" ry="20" fill="#e6b97b"/><path d="M17 38 L14 10 36 24 M55 24 L77 10 74 41" fill="#e6b97b" stroke="#c99461" stroke-width="2"/><path d="M20 28 L19 18 29 26 M63 26 L72 18 70 30" fill="#e9a59e"/><ellipse cx="45" cy="43" rx="31" ry="26" fill="#f2cc91"/><path d="M35 20 L38 30 M45 18 L45 29 M55 20 L52 30" stroke="#c99461" stroke-width="4" stroke-linecap="round"/><g class="pet-eyes" fill="#344337"><ellipse cx="33" cy="42" rx="3" ry="4"/><ellipse cx="57" cy="42" rx="3" ry="4"/></g><path d="M42 49 L48 49 45 53 Z" fill="#b67878"/><path d="M45 53 Q38 60 35 53 M45 53 Q51 60 55 53" fill="none" stroke="#8d684e" stroke-width="1.5"/><path d="M18 48 L29 50 M17 54 L29 53 M61 50 L72 48 M61 53 L73 54" stroke="#b18b66" stroke-width="1.2"/><ellipse cx="32" cy="90" rx="10" ry="5" fill="#f2cc91"/><ellipse cx="58" cy="90" rx="10" ry="5" fill="#f2cc91"/>';
  const dog =
    '<path class="pet-tail" d="M66 74 Q90 60 81 47" fill="none" stroke="#b08260" stroke-width="11" stroke-linecap="round"/><ellipse cx="45" cy="76" rx="25" ry="20" fill="#dab492"/><ellipse cx="18" cy="40" rx="11" ry="25" fill="#9b6d51" transform="rotate(12 18 40)"/><ellipse cx="73" cy="40" rx="11" ry="25" fill="#9b6d51" transform="rotate(-12 73 40)"/><ellipse cx="45" cy="40" rx="29" ry="27" fill="#e5c7a6"/><path d="M41 15 L49 15 55 47 35 47 Z" fill="#f7ecd9"/><g class="pet-eyes" fill="#344337"><ellipse cx="32" cy="39" rx="3.2" ry="4"/><ellipse cx="58" cy="39" rx="3.2" ry="4"/></g><ellipse cx="45" cy="53" rx="15" ry="11" fill="#f7ecd9"/><path d="M40 48 Q45 45 50 48 L45 54 Z" fill="#5d4c42"/><path d="M40 57 Q45 62 50 57" fill="none" stroke="#785a49" stroke-width="1.6"/><path d="M43 60 L48 60 48 65 Q45 70 43 65Z" fill="#d58b8a"/><path d="M28 67 Q45 74 63 67" stroke="#5f886e" stroke-width="6" fill="none"/><circle cx="45" cy="74" r="4" fill="#d5ac5e"/><ellipse cx="31" cy="91" rx="10" ry="5" fill="#f7ecd9"/><ellipse cx="59" cy="91" rx="10" ry="5" fill="#f7ecd9"/>';
  $("#pet-portrait").innerHTML =
    `<svg viewBox="0 0 96 100" aria-hidden="true">${cfg.type === "dog" ? dog : cat}</svg>`;
  $("#pet-label").textContent = cfg.name;
  $("#pet-heading").textContent = cfg.name;
  $("#site-pet").hidden = false;
  $("#pet-question").maxLength = cfg.questionLength;
  const launch = $("#pet-launch"),
    panel = $("#pet-panel");
  function close() {
    panel.hidden = true;
    launch.hidden = false;
    launch.setAttribute("aria-expanded", "false");
    launch.focus();
  }
  launch.onclick = () => {
    panel.hidden = false;
    launch.hidden = true;
    launch.setAttribute("aria-expanded", "true");
    $("#pet-question").focus();
  };
  $("#pet-close").onclick = close;
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  $("#pet-hide").onclick = () => {
    sessionStorage.setItem("pet-hidden", "1");
    $("#site-pet").hidden = true;
  };
  function quota() {
    $("#pet-quota").textContent = cfg.aiEnabled
      ? `今日剩余 ${cfg.remaining} 次 AI 提问`
      : "AI 尚未开启，可先浏览主人的公开资料";
  }
  quota();
  function add(text, user = false, sources = [], ai = false) {
    const el = document.createElement("div");
    el.className = `pet-message${user ? " user" : ""}`;
    el.textContent = text;
    if (ai || sources.length) {
      const source = document.createElement("small");
      source.className = "pet-source";
      source.textContent = `${ai ? "AI 生成" : ""}${sources.length ? `${ai ? " · " : ""}参考资料：${sources.join("、")}` : ""}`;
      el.append(source);
    }
    $("#pet-messages").append(el);
    while ($("#pet-messages").childElementCount > 30)
      $("#pet-messages").firstChild.remove();
    $("#pet-messages").scrollTop = $("#pet-messages").scrollHeight;
    return el;
  }
  add(cfg.greeting);
  for (const q of cfg.suggestions.slice(0, 5)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = q;
    b.onclick = () => {
      $("#pet-question").value = q;
      $("#pet-form").requestSubmit();
    };
    $("#pet-suggestions").append(b);
  }
  $("#pet-form").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const question = $("#pet-question").value.trim();
    if (!question) return;
    busy = true;
    $("#pet-send").disabled = true;
    add(question, true);
    $("#pet-question").value = "";
    const waiting = add("小伙伴正在想一想…");
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": cfg.csrf,
        },
        body: JSON.stringify({ question }),
      });
      const data = await r.json();
      waiting.remove();
      if (!r.ok) {
        add(data.error || "暂时无法回答，请稍后再试。");
        return;
      }
      if (data.status === "answered" && typeof data.answer === "string") {
        add(data.answer, false, data.sources || [], true);
      } else {
        const notice = data.status === "disabled"
          ? "AI 尚未开启或未配置密钥，请联系站长。"
          : data.reason === "unsafe_response"
            ? "模型返回的内容未通过安全检查，请换个问题再试。本次调用计入今日次数。"
            : "暂时无法连接模型，请稍后再试。本次调用计入今日次数。";
        add(notice).classList.add("pet-notice");
        if (data.status === "disabled") cfg.aiEnabled = false;
      }
      if (typeof data.remaining === "number") {
        cfg.remaining = data.remaining;
      }
      quota();
    } catch {
      waiting.remove();
      add("连接暂时中断，请稍后再试。");
    } finally {
      busy = false;
      $("#pet-send").disabled = false;
      $("#pet-question").focus();
    }
  };
})();
