// Fixed page copy taken from CK COACHING_2026.pptx. Rows an editor may change (programs, people,
// offices, stats, pressures) live in Postgres instead. Slides 3 and 4 of the logo deck are
// placeholder text and are deliberately absent.

export const BRAND = {
  name: "CK Coaching Group",
  shortName: "CCG",
  tagline: "CEO Coaching: a tailor-made coaching program", // slide 2
} as const;

export const WELCOME = {
  heading: "A welcome note", // slide 20
  signedBy: "CK Song, PhD",
  signedRole: "CCG Founder",
} as const;

export const PHILOSOPHY = {
  vision: "Our vision is to unlock the potential of every leader that impacts people's lives.", // slide 21
  mission:
    "Our mission is to grow by growing others (clients, colleagues, community) to build success and achieve their full potential.", // slide 21
  purposeHeading: "Embrace opportunities", // slide 22
  purpose:
    "We help leaders and business owners tackle their most critical challenges, develop leadership skills, turn new ideas and a growth mindset into enduring business capabilities, and achieve the best results for the future of their business.",
  values: "We lead with Respect and Integrity.", // slide 23
} as const;

export const WHY = {
  // Slides 4 and 5 open /why.
  openingLines: ["The job of a CEO is very challenging", "The pressure to perform on CEOs is higher than ever"],
  whoHelps: "Who does a CEO ask for help? A coach.", // slides 13–14
  coachDefinition: "Someone that sees beyond your limits and guides you to greatness.", // slide 15
  topPerformers: "Every top performer has a coach: athletes, entertainers, leaders and business owners.", // slide 16
} as const;

export const COACH = {
  heading: "The coach", // slide 25
  tagline: "Inspiring Executive Mastery for CEOs and C-Suite Clients",
} as const;

export const BENEFITS = [
  // slide 26
  "Achieve more growth and profitability",
  "Build stronger relationships with stakeholders (customers, employees, and management team)",
  "Become a better and great leader",
] as const;

export const LEAD_RECEIPT = "Thank you. We will reply within one business day.";

// Logo deck (CCG Power Point Logo.pptx), slide 2, verbatim. The captions name the three parts of
// the assembled emblem; the deck sets each quoted word's first letter apart, and so does the site.
// The deck labels the center "Letter G"; it is drawn as the pale disc, never as a glyph.
export const LOGO_STORY = {
  outer: { name: "Letter C Outside", line: "The first letters of Founder’s name", initial: "C", rest: "K Song" },
  inner: { name: "Letter C Inside", line: "The first letters of word", initial: "C", rest: "oaching" },
  center: { name: "Letter G", line: "The first letters of word", initial: "G", rest: "roup" },
  goal: "If the target seems difficult to achieve, don't change the target but change the way you achieve it.", // under "Goal & Target"
  group: "People who have the same background, passion, and goals.", // under "Group"
} as const;
