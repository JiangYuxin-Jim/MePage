// Fictional showcase data. Names, institutions, projects and research records are not real credentials.
const site = {
  name: "林予安",
  nameEn: "Yuan Lin",
  initial: "L",
  title: "计算机科学硕士生 · 智能信息检索",
  titleEn: "M.Sc. Student · Intelligent Information Retrieval",
  school: "澄川大学 · 智能信息处理实验室",
  schoolEn: "Chengchuan University · Intelligent Information Lab",
  email: "linyuan@example.com",
  github: "",
  avatar: "",
  researchInterests: [
    {
      zh: "学术文献检索与证据组织",
      en: "Scholarly Search & Evidence Organization",
    },
    { zh: "检索增强生成与可靠问答", en: "Retrieval-Augmented Generation" },
    { zh: "语言模型驱动的科研工具", en: "Language Models for Research Tools" },
  ],
  metaDescription:
    "林予安的个人主页，记录智能检索、语言模型应用与科研工程实践。",
};
const about = {
  zh: "我叫林予安，目前在澄川大学攻读计算机科学硕士，关注学术文献检索、知识组织，以及语言模型在科研流程中的应用。\n\n我更感兴趣的问题是：当一段回答引用了论文，我们能否沿着引用找到真正支持这句话的证据？围绕这个问题，我在尝试把文献检索、原文定位和阅读笔记连接起来，让资料整理更容易核对与复用。\n\n工程上主要使用 Python 和 JavaScript，习惯先做小规模原型，再逐步补齐数据处理、评估和交互。我会在博客里记录实现过程，也会留下没有奏效的办法和当时的判断。\n\n研究之外，我喜欢步行、城市摄影和做手冲咖啡。欢迎从博客或科研记录开始，了解我最近在做的事。",
  en: "I am Yuan Lin, a master’s student in Computer Science at Chengchuan University. My interests include scholarly search, knowledge organization, and language-model tools for research.\n\nA question I keep returning to is whether a reader can trace an answer back to the specific evidence that supports it. I am exploring ways to connect retrieval, source passages, and reading notes so that research materials become easier to verify and reuse.\n\nI work mainly with Python and JavaScript, usually starting with small prototypes and adding data pipelines, evaluation, and interaction as the problem becomes clearer. This site records both working approaches and useful failures.\n\nOutside research, I enjoy walking, urban photography, and brewing coffee.",
};
const categories = ["研究笔记", "工程实践", "读写日常"];
const publications = [
  {
    id: "demo-evidence",
    year: "2026",
    title_zh: "面向学术文献的可追溯检索与证据组织",
    title_en:
      "Traceable Retrieval and Evidence Organization for Scholarly Literature",
    venue: "研究手稿 · 智能信息处理实验室",
    summary_zh:
      "围绕检索结果、原文证据与阅读笔记之间的对应关系，整理可核对的文献工作流。",
    order: 1,
  },
  {
    id: "demo-papertrail",
    year: "2026",
    title_zh: "PaperTrail：论文阅读与证据管理工作台",
    title_en: "PaperTrail: A Workspace for Reading and Evidence Management",
    venue: "研究工具原型",
    summary_zh:
      "将论文条目、段落笔记和主题标签放到同一工作区，支持检索结果回到原文。",
    order: 2,
  },
  {
    id: "demo-report",
    year: "2025",
    title_zh: "研究生学术交流优秀报告",
    title_en: "Outstanding Graduate Research Presentation",
    venue_zh: "澄川大学研究生学术交流会",
    venue_en: "Chengchuan Graduate Research Forum",
    summary_zh: "报告主题：从“找到论文”到“找到支持结论的证据”。",
    order: 3,
  },
];
const experience = [
  {
    id: "demo-master",
    year: "2024 — 至今",
    title_zh: "计算机科学与技术 · 硕士",
    title_en: "M.Sc. in Computer Science",
    desc_zh:
      "澄川大学智能信息处理实验室。围绕学术文献检索、知识组织与语言模型应用开展学习和研究。",
    desc_en:
      "Intelligent Information Lab, Chengchuan University. Studying scholarly search, knowledge organization, and applied language models.",
    order: 4,
  },
  {
    id: "demo-engineering",
    year: "2025",
    title_zh: "学术知识检索系统 · 工程实践",
    title_en: "Engineering a Scholarly Search Prototype",
    desc_zh:
      "参与文档清洗、索引构建和来源回溯功能的原型实现，重点处理证据定位与数据质量问题。",
    desc_en:
      "Worked on document processing, indexing, and source navigation, with a focus on evidence traceability and data quality.",
    order: 5,
  },
  {
    id: "demo-bachelor",
    year: "2020 — 2024",
    title_zh: "计算机科学与技术 · 学士",
    title_en: "B.Eng. in Computer Science",
    desc_zh:
      "澄川大学。课程学习覆盖数据结构、数据库、机器学习与软件工程；毕业设计围绕文献检索与个人知识管理。",
    desc_en:
      "Chengchuan University. Coursework in data structures, databases, machine learning, and software engineering.",
    order: 6,
  },
];
const posts = [
  {
    slug: "hello-world",
    title: "从检索到证据：我如何整理一篇论文的阅读记录",
    date: "2026-10-29",
    category: "研究笔记",
    tags: ["文献阅读", "信息检索", "知识管理"],
    status: "published",
    content: `![从问题到原文证据，再到个人判断的论文阅读流程](/images/reading-evidence.webp)

## 先留下一个问题

我以前读论文，常常从摘要一路往下划线。读的时候觉得每段都重要，过一周再打开笔记，却很难回答“这篇文章究竟解决了什么”。

现在开始阅读前，我会先写下一个具体问题。例如：这篇工作如何证明，检索到的内容确实改善了回答？有了这个问题，方法、实验和结论就有了可以对照的位置。

## 把笔记分成三层

第一层只记录论文的研究问题、方法与主要结论，用几句话说明文章的骨架。第二层摘录能够支持结论的原文，并留下页码或章节位置。第三层才写自己的理解、疑问和可以验证的想法。

这三层混在一起时，很容易把作者的结论记成自己的推断，或者反过来。

| 笔记层次 | 要留下什么 | 回看时检查什么 |
| --- | --- | --- |
| 论文主张 | 作者声称解决的问题 | 是否超出了实验范围 |
| 原文证据 | 表格、段落与定位信息 | 能否回到来源核对 |
| 个人判断 | 理解、疑问与后续想法 | 哪些仍然只是猜测 |

## 不急着把所有文章连起来

给文章加标签很方便，但标签太多也会变成另一种堆积。我通常只保留少量主题词，再写一句“它与哪一个问题有关”。

真正有价值的联系，往往来自两篇文章在同一个条件下给出了不同结果。先把条件与证据写清楚，联系才不容易流于表面。

## 让记录能够再次使用

一次阅读结束后，我会尝试回答三个问题：

- 这篇文章改变了我对哪个问题的理解？
- 如果要向别人解释，我会拿哪条证据？
- 下一次实验或检索，我准备改变什么？

我正在把这套习惯放进 PaperTrail 原型中。工具还在调整，但至少现在，一条笔记应该能够带我回到原文，而不是只留下一个模糊印象。`,
  },
  {
    slug: "building-a-bounded-ai-companion",
    title: "给个人网站接入一个有边界的 AI 助手",
    date: "2026-10-25",
    category: "工程实践",
    tags: ["JavaScript", "RAG", "产品设计"],
    status: "published",
    content: `![知识库、服务端边界检查与模型回答的流程](/images/bounded-assistant.webp)

## 先决定它应该回答什么

给个人网站加一个聊天入口并不难，难的是决定它的职责。我希望它帮助访客了解站长的研究、项目和兴趣，而不是提供一个无所不答的通用接口。

所以，第一步不是挑模型，而是整理可以公开的资料。每条知识都要能回答一个明确的问题，尚未确认的信息暂时不放进去。

## 把资料、检索与生成分开

我把问答过程拆成三个环节：查找相关条目、判断是否有足够依据、组织简短回答。知识库没有相应内容时，要求模型明确说明资料不足，不能临时拼凑细节。

每轮提问都由模型结合公开资料和最近的对话重新生成回答，知识库只存事实，不预设答案。追问“这个项目具体在做什么”时，也应沿着前一轮的话题解释；没有公开的细节就明确说明。

## 限制不能只放在按钮上

浏览器里的“剩余次数”只是提示，真正的判断必须在服务器上完成。调用前先预占额度，再发送请求，可以避免并发点击同时越过上限。

\`\`\`text
收到问题
  → 检查长度与频率
  → 查找公开知识
  → 原子检查并预占额度
  → 请求模型并记录结果
\`\`\`

如果请求已经发出但超时，也不能直接假定供应商没有处理。对这种情况保守记账，能避免反复重试带来的额外消耗。

## 小伙伴需要明确身份

把入口画成一只猫或一只狗，是希望互动更轻松。但它仍然只是助手，不能代表站长承诺合作，也不应该把不确定的资料说成事实。

我更在意的体验是：访客问了一个问题，能够得到简短、有来源、知道边界的回答。外观可以可爱，回答应当克制。`,
  },
  {
    slug: "keeping-useful-experiment-notes",
    title: "把一次失败的实验，变成可复用的排查清单",
    date: "2026-10-18",
    category: "读写日常",
    tags: ["实验记录", "科研习惯", "Python"],
    status: "published",
    content: `![实验观察与可复用排查清单](/images/experiment-notes.webp)

## 失败最容易留下模糊印象

实验没有得到预期结果时，我以前常常只在笔记里写“效果不好”，然后换一组参数。几天以后，已经很难区分到底试过什么，也很难判断两个结果是否真的可比较。

现在我会先记录失败发生在哪一步。是数据没有按预期进入系统，评估方式有偏差，还是方法本身没有带来改善？这些问题需要不同的检查。

## 一次只验证一个解释

排查时我尽量先提出一个具体解释，再做能够区分它的最小检查。例如，怀疑检索结果为空，就先看少量查询的候选与过滤过程，而不是同时改分词、索引和排序。

如果一次改变太多地方，即使结果变好，也很难知道究竟是哪一步起了作用。

## 我的记录模板

\`\`\`markdown
研究问题：
当前假设：
数据与版本：
这次唯一的改动：
观察到的结果：
仍然不能排除的解释：
下一步检查：
\`\`\`

模板的作用不是把日志写得更长，而是让下一次回看时，能够判断哪些结论有依据。

## 把问题转成检查清单

当同一类问题出现第二次，我会把排查顺序写成小清单：

1. 检查输入样本与过滤后的样本是否对应。
2. 检查划分方式、随机种子和配置是否可追溯。
3. 先运行一个足够简单的基线。
4. 保留少量可以逐条核对的案例。
5. 分开记录观察与解释。

失败不会自动变成经验。只有把当时的条件、证据和判断留下来，它才有机会帮助下一次实验。`,
  },
];
const knowledge = [
  {
    id: "demo-research",
    title: "主人在研究什么",
    body: "林予安是澄川大学计算机科学硕士生，关注学术文献检索与证据组织、检索增强生成，以及语言模型驱动的科研工具。",
    keywords: "研究 方向 主人 学术 文献 RAG",
    published: true,
    order: 1,
  },
  {
    id: "demo-projects",
    title: "主人做过哪些项目",
    body: "林予安在开发 PaperTrail 论文阅读与证据管理原型，也记录个人网站 AI 助手的工程实践。这些是展示用的虚构研究和项目。",
    keywords: "项目 PaperTrail 原型 主人 工程",
    published: true,
    order: 2,
  },
  {
    id: "demo-writing",
    title: "主人平时写什么",
    body: "博客分为研究笔记、工程实践和读写日常，内容包括文献阅读、检索系统、AI 助手边界和实验记录习惯。",
    keywords: "博客 写作 平时 主人 笔记",
    published: true,
    order: 3,
  },
];
const research=[...publications.map(item=>({...item,type:"publications"})),...experience.map(item=>({...item,type:"experience"}))];
module.exports = {
  site,
  about,
  categories,
  research,
  posts,
  knowledge,
};
