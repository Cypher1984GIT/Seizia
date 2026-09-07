const PROMPT_CATEGORIES = ['Writing', 'Code', 'Analysis', 'Study', 'Work', 'Creative'];

const PROMPT_CATALOG = [
    {
        id: 'cat-rewrite',
        title: 'Rewrite for clarity',
        category: 'Writing',
        body: 'Rewrite the following text so it is clearer, more direct, and easier to read. Keep the meaning, language, and general tone. Do not invent information.\n\nText:\n'
    },
    {
        id: 'cat-tone',
        title: 'Change the tone',
        category: 'Writing',
        body: 'Adapt the following text to the requested tone without changing the facts.\n\nDesired tone: [professional / friendly / firm / brief]\nAudience: [who will read it]\n\nText:\n'
    },
    {
        id: 'cat-summary',
        title: 'Summarize the essentials',
        category: 'Writing',
        body: 'Summarize the following content. Separate:\n1. Main idea\n2. Key points (max 7)\n3. Decisions or actions, if any\n\nLength: [short / medium]\n\nContent:\n'
    },
    {
        id: 'cat-translate',
        title: 'Translate naturally',
        category: 'Writing',
        body: 'Translate the following text into [language]. Prefer a natural reading over a literal one. Keep proper nouns, numbers, and register.\n\nText:\n'
    },
    {
        id: 'cat-email',
        title: 'Professional email',
        category: 'Work',
        body: 'Write a professional email from these notes. Include subject, greeting, body, and sign-off. Be clear and brief.\n\nRecipient:\nGoal of the email:\nPoints to include:\nTone: [neutral / warm / firm]\n'
    },
    {
        id: 'cat-explain-code',
        title: 'Explain code',
        category: 'Code',
        body: 'Explain this code as if you were briefing another developer. Include:\n1. What it does\n2. How it works, step by step\n3. Risks, assumptions, or fragile parts\n\nLanguage: [language]\n\nCode:\n'
    },
    {
        id: 'cat-review',
        title: 'Code review',
        category: 'Code',
        body: 'Review this code. Rank findings by severity (critical, important, minor). For each one: the problem, why it matters, and a concrete fix. Do not rewrite the whole file unless necessary.\n\nContext:\n\nCode:\n'
    },
    {
        id: 'cat-refactor',
        title: 'Refactor',
        category: 'Code',
        body: 'Refactor this code so it is clearer and easier to maintain. Do not change behavior. Return the new code, then a short list of what you changed and why.\n\nCode:\n'
    },
    {
        id: 'cat-tests',
        title: 'Write tests',
        category: 'Code',
        body: 'Write tests for this code. Cover happy paths, edge cases, and likely failures. Use [Jest / pytest / other]. Do not invent APIs that are not in the code.\n\nCode:\n'
    },
    {
        id: 'cat-debug',
        title: 'Debug an error',
        category: 'Code',
        body: 'Help me find the cause of this error. Propose the 3 most likely hypotheses, how to test each one, and the simplest fix if it is confirmed.\n\nExpected behavior:\nWhat happens now:\nError or logs:\nRelevant code:\n'
    },
    {
        id: 'cat-regex',
        title: 'Regex with explanation',
        category: 'Code',
        body: 'Write a regular expression for this. Explain each part, give 3 examples that should match and 3 that should not, and say if a simpler approach than regex exists.\n\nWhat I want to match:\nLanguage or tool: [JS / Python / grep]\n'
    },
    {
        id: 'cat-compare',
        title: 'Compare options',
        category: 'Analysis',
        body: 'Compare these options so I can decide. Use a table with criteria, pros, cons, and risks. End with a recommendation and when I should pick each alternative.\n\nContext:\nOptions:\nImportant criteria:\n'
    },
    {
        id: 'cat-actions',
        title: 'Extract action items',
        category: 'Work',
        body: 'Extract tasks, owners, and dates from this text. If an owner or date is missing, mark it as pending. Return a list ready to use.\n\nText:\n'
    },
    {
        id: 'cat-steelman',
        title: 'Strongest counterargument',
        category: 'Analysis',
        body: 'Do not refute yet. First state the strongest, fairest version of the opposing argument. Then point out its weak spots and what evidence would change your mind.\n\nClaim:\nContext:\n'
    },
    {
        id: 'cat-eli5',
        title: 'Explain simply',
        category: 'Study',
        body: 'Explain this topic in simple words, then with a bit more detail, and finish with an analogy. Do not use jargon without defining it.\n\nTopic:\nLevel: [beginner / intermediate]\n'
    },
    {
        id: 'cat-notes',
        title: 'Study notes',
        category: 'Study',
        body: 'Turn this material into study notes. Include:\n- Bullet mind map\n- Key definitions\n- 8 questions to quiz myself\n- What people usually mix up\n\nMaterial:\n'
    },
    {
        id: 'cat-quiz',
        title: 'Quiz me',
        category: 'Study',
        body: 'Quiz me on this topic. 8 questions, easy to hard. Do not give answers until I reply. If I get one wrong, explain and give an example.\n\nTopic:\nMaterial (optional):\n'
    },
    {
        id: 'cat-plan',
        title: 'Work plan',
        category: 'Work',
        body: 'Turn this goal into a realistic plan. Include phases, tasks, order, risks, and a first step I can do today.\n\nGoal:\nDeadline:\nResources or constraints:\n'
    },
    {
        id: 'cat-meeting',
        title: 'Meeting notes',
        category: 'Work',
        body: 'Organize these meeting notes into: summary, decisions, action items (who / what / when), and open questions. Do not invent agreements that are not in the text.\n\nNotes:\n'
    },
    {
        id: 'cat-brainstorm',
        title: 'Brainstorm',
        category: 'Creative',
        body: 'Give me 12 distinct ideas for this. Mix safe options, unusual ones, and one ambitious idea. For each: a one-line pitch and why it could work.\n\nWhat I need:\nAudience:\nConstraints:\n'
    },
    {
        id: 'cat-story',
        title: 'Story outline',
        category: 'Creative',
        body: 'Propose 3 different approaches for this story or scene. For each one: premise, conflict, twist, and an opening paragraph.\n\nIdea:\nTone:\nApproximate length:\n'
    },
    {
        id: 'cat-prompt',
        title: 'Improve this prompt',
        category: 'Analysis',
        body: 'Rewrite this prompt so an AI model will follow it better. Make it specific: goal, output format, constraints, and what not to do. Return a copy-ready prompt and a short note on why it is better.\n\nOriginal prompt:\n'
    },
    {
        id: 'cat-rubberduck',
        title: 'Rubber duck',
        category: 'Code',
        body: 'Act as a rubber duck. Do not give the solution right away. Ask me questions so I find the bug, one at a time. If I get stuck, give a hint, not the full fix.\n\nWhat I am trying to do:\nWhat I already tried:\n'
    },
    {
        id: 'cat-sql',
        title: 'SQL query',
        category: 'Code',
        body: 'Write a SQL query for this. Assume [PostgreSQL / MySQL / SQLite]. Explain the result and warn if an index is needed or if the request is ambiguous.\n\nTables and fields:\nWhat I need to get:\n'
    }
];
