/**
 * Builds three ready-to-publish sample publications as designed PDFs, plus a
 * portrait cover image for each.
 *
 *   node build-docs.mjs
 *
 * Output: dist/publications/*.pdf  and  dist/publications/*-cover.png
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE — read before publishing any of these
 * ---------------------------------------------------------------------------
 * Every fact, figure, place, date and quotation in these documents is taken
 * from Talitha Kum Kenya's own published pages on talithakumraht.org. The
 * source article is named at the foot of each document. Nothing has been
 * invented: where a detail was needed but not published, the text carries a
 * visible <placeholder> for staff to complete.
 *
 * The practical guidance sections (how to check an offer, what to do if
 * someone is missing) are written to match the organisation's own stated
 * message, but they are drafting, not quotation. They need a read-through by
 * the coordinator before they go public — as does everything else here, per
 * the pre-publish checklist in docs/publishing-workflow.md.
 *
 * Photographs are the organisation's own, already published on its site. The
 * workshop photograph was chosen because it is shot from behind and nobody is
 * identifiable.
 * ---------------------------------------------------------------------------
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "dist", "publications");

const fonts = await readFile(join(root, "assets", "fonts", "embedded.css"), "utf8");

async function dataUri(file, mime) {
  const buf = await readFile(join(root, "assets", "images", file));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const IMG = {
  logo: await dataUri("logo.png", "image/png"),
  police: await dataUri("police-training.jpg", "image/jpeg"),
  border: await dataUri("border-session.jpg", "image/jpeg"),
  youth: await dataUri("youth-workshop.jpg", "image/jpeg"),
  pfan: await dataUri("pfan-summit.jpg", "image/jpeg"),
};

/* ========================================================================== */
/* Print design system                                                        */
/* ========================================================================== */

const CSS = `
${fonts}

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

body {
  font-family: "Nunito Sans", sans-serif;
  color: #4a4644;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Each .page is exactly one A4 sheet. Content is composed to fit; the build
   asserts that the PDF page count matches the number of sheets. */
.page {
  position: relative;
  width: 210mm;
  height: 297mm;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
}
.page:last-child { page-break-after: auto; break-after: auto; }

.pad { padding: 22mm 20mm 20mm; height: 100%; display: flex; flex-direction: column; }

h1, h2, h3, h4, .display { font-family: "Quicksand", sans-serif; font-weight: 700; color: #232323; margin: 0; }

p { margin: 0 0 3.4mm; font-size: 10.6pt; line-height: 1.62; }
strong { color: #232323; font-weight: 700; }
em { font-style: italic; }

/* --- Cover --------------------------------------------------------------- */

.cover { background: #1c1512; color: #fff; }
.cover-photo {
  position: absolute; inset: 0;
  background-size: cover; background-position: center;
}
.cover-scrim {
  position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(28,21,18,.42) 0%, rgba(28,21,18,.30) 32%, rgba(28,21,18,.88) 68%, rgba(20,14,11,.97) 100%),
    linear-gradient(115deg, rgba(247,79,34,.46) 0%, rgba(247,79,34,0) 58%);
}
.cover-inner {
  position: relative; height: 100%;
  padding: 18mm 18mm 16mm;
  display: flex; flex-direction: column;
}
.cover-top { display: flex; align-items: center; gap: 5mm; }
.cover-top img { width: 17mm; height: auto; }
.cover-org { font-family: "Quicksand", sans-serif; font-weight: 700; color: #fff; font-size: 11.5pt; line-height: 1.2; }
.cover-org span { display: block; font-family: "Nunito Sans", sans-serif; font-weight: 400; font-size: 8pt; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.62); margin-top: 1.2mm; }

.cover-body { margin-top: auto; }
.chip {
  display: inline-block;
  background: #F74F22; color: #fff;
  font-family: "Quicksand", sans-serif; font-weight: 700;
  font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase;
  padding: 2.2mm 5mm; border-radius: 20mm;
}
.cover h1 {
  color: #fff;
  font-size: 34pt; line-height: 1.08; letter-spacing: -.02em;
  margin: 7mm 0 0; max-width: 155mm;
}
.cover .standfirst {
  color: rgba(255,255,255,.86);
  font-size: 12pt; line-height: 1.5; margin: 6mm 0 0; max-width: 140mm;
}
.cover-rule { height: 1.4mm; width: 34mm; background: #FFAC00; border-radius: 1mm; margin: 8mm 0 7mm; }
.cover-meta {
  display: flex; gap: 12mm; flex-wrap: wrap;
  font-size: 9pt; color: rgba(255,255,255,.72);
}
.cover-meta b { display: block; color: #fff; font-family: "Quicksand", sans-serif; font-size: 10pt; margin-top: 1mm; }

/* --- Running header / footer -------------------------------------------- */

.runhead {
  display: flex; justify-content: space-between; align-items: baseline;
  border-bottom: .4mm solid #ece7e3;
  padding-bottom: 3mm; margin-bottom: 9mm;
  font-size: 8pt; letter-spacing: .1em; text-transform: uppercase; color: #a49a94;
  font-family: "Quicksand", sans-serif; font-weight: 700;
  flex-shrink: 0;
}
.runhead .r { color: #F74F22; }

.runfoot {
  margin-top: auto; padding-top: 6mm;
  border-top: .4mm solid #ece7e3;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 8pt; color: #a49a94;
  flex-shrink: 0;
}
.runfoot .num {
  font-family: "Quicksand", sans-serif; font-weight: 700;
  color: #232323; font-size: 10pt;
}

.flow { flex: 1; min-height: 0; }

/* --- Typography blocks --------------------------------------------------- */

.kicker {
  font-family: "Quicksand", sans-serif; font-weight: 700;
  font-size: 8.5pt; letter-spacing: .16em; text-transform: uppercase;
  color: #F74F22; margin-bottom: 2.5mm;
}
h2 { font-size: 19pt; line-height: 1.18; letter-spacing: -.01em; margin-bottom: 4mm; }
h3 { font-size: 12.5pt; line-height: 1.3; margin: 7mm 0 2.5mm; }
.lead { font-size: 12.4pt; line-height: 1.56; color: #3a3634; margin-bottom: 5mm; }
.lead strong { color: #232323; }

.gold-rule { height: 1.2mm; width: 26mm; background: #FFAC00; border-radius: 1mm; margin: 0 0 6mm; }

/* --- Components ---------------------------------------------------------- */

.callout {
  background: #fdf3ee;
  border-left: 1.6mm solid #F74F22;
  border-radius: 0 2mm 2mm 0;
  padding: 6mm 7mm;
  margin: 6mm 0;
}
.callout p:last-child { margin-bottom: 0; }
.callout .kicker { margin-bottom: 2mm; }

.quote {
  margin: 8mm 0;
  padding-left: 9mm;
  border-left: 1.2mm solid #FFAC00;
}
.quote p {
  font-family: "Quicksand", sans-serif; font-weight: 700;
  font-size: 15pt; line-height: 1.34; color: #232323; margin-bottom: 2.5mm;
}
.quote cite { font-style: normal; font-size: 8.8pt; color: #8d827c; letter-spacing: .04em; }

.flags { counter-reset: flag; margin: 5mm 0 0; padding: 0; list-style: none; }
.flags li {
  counter-increment: flag;
  position: relative;
  padding: 0 0 0 13mm;
  margin-bottom: 5.5mm;
}
.flags li::before {
  content: counter(flag);
  position: absolute; left: 0; top: -0.5mm;
  width: 9mm; height: 9mm; border-radius: 50%;
  background: #F74F22; color: #fff;
  font-family: "Quicksand", sans-serif; font-weight: 700; font-size: 11pt;
  display: flex; align-items: center; justify-content: center;
}
.flags h4 { font-size: 11.5pt; margin-bottom: 1.5mm; }
.flags p { margin-bottom: 0; font-size: 10.2pt; }

.checks { margin: 4mm 0 0; padding: 0; list-style: none; }
.checks li {
  position: relative; padding-left: 8mm; margin-bottom: 3.4mm;
  font-size: 10.4pt; line-height: 1.55;
}
.checks li::before {
  content: ""; position: absolute; left: 0; top: 1.8mm;
  width: 3.4mm; height: 3.4mm; border-radius: .8mm;
  background: #FFAC00;
}

.figure { margin: 6mm 0; }
.figure img { width: 100%; display: block; border-radius: 2mm; }
.figure figcaption {
  font-size: 8.4pt; color: #8d827c; line-height: 1.5;
  margin-top: 2.5mm; padding-left: 2mm; border-left: .6mm solid #FFAC00;
}

.stats { display: flex; gap: 4mm; margin: 6mm 0; }
.stat {
  flex: 1; background: #faf7f5; border-radius: 2mm;
  padding: 5mm 4mm; text-align: center;
}
.stat b {
  display: block; font-family: "Quicksand", sans-serif; font-weight: 700;
  font-size: 20pt; color: #F74F22; line-height: 1;
}
.stat span { display: block; font-size: 8.4pt; color: #7d736e; margin-top: 2mm; line-height: 1.35; }

table.reach { width: 100%; border-collapse: collapse; margin: 5mm 0; font-size: 10pt; }
table.reach th {
  text-align: left; font-family: "Quicksand", sans-serif; font-weight: 700;
  font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; color: #a49a94;
  padding: 0 0 2.5mm; border-bottom: .4mm solid #ece7e3;
}
table.reach td { padding: 3mm 0; border-bottom: .3mm solid #f4f0ed; color: #4a4644; }
table.reach td:last-child { text-align: right; font-variant-numeric: tabular-nums; color: #232323; font-weight: 600; }

.help {
  background: #232323; color: #fff;
  border-radius: 2.5mm; padding: 7mm;
  margin-top: 6mm;
}
.help .kicker { color: #FFAC00; }
.help h3 { color: #fff; margin: 0 0 3mm; font-size: 14pt; }
.help p { color: rgba(255,255,255,.78); font-size: 9.8pt; margin-bottom: 4mm; }
.help .line { display: flex; justify-content: space-between; align-items: baseline; gap: 6mm; padding: 2.6mm 0; border-top: .3mm solid rgba(255,255,255,.14); }
.help .line span { font-size: 9pt; color: rgba(255,255,255,.6); }
.help .line b { font-family: "Quicksand", sans-serif; font-weight: 700; color: #fff; font-size: 11.5pt; }
.help .toll { background: #F74F22; border-radius: 2mm; padding: 4mm 5mm; margin-bottom: 4mm; }
.help .toll span { display: block; font-size: 8.5pt; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.85); }
.help .toll b { display: block; font-family: "Quicksand", sans-serif; font-weight: 700; font-size: 21pt; color: #fff; line-height: 1.1; margin-top: 1mm; }

.note {
  font-size: 8.6pt; line-height: 1.5; color: #8d827c;
  background: #faf7f5; border-radius: 2mm; padding: 5mm; margin-top: 5mm;
}
.note b { color: #5c5450; }
.ph { background: #fff3d6; border-bottom: .4mm solid #FFAC00; padding: 0 1mm; color: #7a5a00; font-weight: 600; }

/* --- Back page ----------------------------------------------------------- */

.back { background: #faf7f5; }
.back .pad { padding-top: 20mm; }
.back-logo { width: 22mm; margin-bottom: 7mm; }
.back h2 { font-size: 22pt; margin-bottom: 5mm; }
.vmv { display: flex; gap: 5mm; margin: 6mm 0; }
.vmv div { flex: 1; background: #fff; border-radius: 2mm; padding: 5mm; }
.vmv h4 { font-size: 8.5pt; letter-spacing: .14em; text-transform: uppercase; color: #F74F22; margin-bottom: 2.5mm; }
.vmv p { font-size: 9.4pt; line-height: 1.5; margin: 0; }
.values { font-size: 9.6pt; color: #5c5450; }
.contactgrid { display: flex; gap: 5mm; margin-top: 6mm; }
.contactgrid div { flex: 1; }
.contactgrid h4 { font-size: 8.5pt; letter-spacing: .14em; text-transform: uppercase; color: #a49a94; margin-bottom: 2.5mm; }
.contactgrid p { font-size: 9.6pt; margin-bottom: 1.5mm; }
.partners { font-size: 8.8pt; color: #7d736e; line-height: 1.7; margin-top: 3mm; }
.src { margin-top: auto; font-size: 8.2pt; color: #a49a94; line-height: 1.55; border-top: .4mm solid #e8e2de; padding-top: 5mm; }
`;

/* ========================================================================== */
/* Shared blocks                                                              */
/* ========================================================================== */

const ORG = "Talitha Kum Kenya";

function cover({ photo, chip, title, standfirst, date, issuer }) {
  return `
<section class="page cover">
  <div class="cover-photo" style="background-image:url('${photo}')"></div>
  <div class="cover-scrim"></div>
  <div class="cover-inner">
    <div class="cover-top">
      <img src="${IMG.logo}" alt="">
      <div class="cover-org">Talitha Kum Kenya</div>
    </div>
    <div class="cover-body">
      <span class="chip">${chip}</span>
      <h1>${title}</h1>
      <p class="standfirst">${standfirst}</p>
      <div class="cover-rule"></div>
      <div class="cover-meta">
        <div>Published<b>${date}</b></div>
        <div>Issued by<b>${issuer}</b></div>
        <div>Series<b>${chip}</b></div>
      </div>
    </div>
  </div>
</section>`;
}

function page(shortTitle, n, inner) {
  return `
<section class="page">
  <div class="pad">
    <div class="runhead"><span>${ORG}</span><span class="r">${shortTitle}</span></div>
    <div class="flow">${inner}</div>
    <div class="runfoot"><span>Toll free 0800 724 690</span><span class="num">${n}</span></div>
  </div>
</section>`;
}

const HELP = `
<div class="help">
  <div class="kicker">If you are worried about someone</div>
  <h3>Talk to us. It is free, and it is confidential.</h3>
  <p>You do not need proof, and you do not need to be certain. If something feels wrong,
     tell us and we will help you work out what to do next.</p>
  <div class="toll"><span>Toll free, from any network</span><b>0800 724 690</b></div>
  <div class="line"><span>Also reachable on</span><b>+254 703 331 507</b></div>
  <div class="line"><span>Email</span><b>info@talithakumraht.org</b></div>
  <div class="line"><span>Office</span><b>Marsabit Plaza, Ngong Road, 1st Floor, Office 104</b></div>
</div>`;

function backPage(source) {
  return `
<section class="page back">
  <div class="pad">
    <img class="back-logo" src="${IMG.logo}" alt="">
    <div class="kicker">About us</div>
    <h2>More than just a cause, a calling</h2>
    <p class="lead">In 2016, Talitha Kum Kenya began during the Jubilee Year of Mercy, initiated by a
      collective effort of consecrated religious, lay women and men. Inspired by Pope Francis' call to
      embody acts of mercy, particularly the corporal works of mercy, the organisation focuses on
      reaching out to and assisting those who reside on the margins of society.</p>

    <div class="vmv">
      <div>
        <h4>Vision</h4>
        <p>Inspired by the mercy of God, we envision a world free from human trafficking.</p>
      </div>
      <div>
        <h4>Mission</h4>
        <p>To uphold human dignity at all costs &mdash; from modern-day slavery to freedom &mdash;
           collaborating to eradicate human trafficking.</p>
      </div>
    </div>

    <p class="values"><strong>Our values.</strong> Unity in Diversity &middot; Mutual Support &middot;
      Integrity &middot; Honesty &middot; Confidentiality &middot; Prayer</p>

    <p class="values" style="margin-top:4mm"><strong>Our approach: the four Ps.</strong>
      <strong>Prayer</strong> &mdash; rooted in faith, uplifting both survivors and perpetrators.
      <strong>Protection</strong> &mdash; psychosocial support, medical aid and shelter for the holistic
      well-being of survivors. <strong>Prevention</strong> &mdash; community workshops, training and media
      advocacy. <strong>Partnerships</strong> &mdash; collaborating with a diverse network of stakeholders.</p>

    <div class="contactgrid">
      <div>
        <h4>Contact</h4>
        <p>Marsabit Plaza, Ngong Road<br>1st Floor, Office 104, Nairobi</p>
        <p>info@talithakumraht.org</p>
        <p>Toll free 0800 724 690<br>+254 703 331 507</p>
        <p>talithakumraht.org</p>
      </div>
      <div>
        <h4>We work with</h4>
        <p class="partners">Candle of Hope &middot; Free the Slaves &middot; Sema Nami &middot; HAART &middot;
          Kituo Cha Sheria &middot; Counter Human Trafficking Trust &ndash; East Africa &middot;
          Rebirth of a Queen &middot; State Department of Protection Services &ndash; CTiP &middot;
          Center for Domestic Training and Development &middot; Footprint to Freedom</p>
      </div>
    </div>

    <div class="src">
      <strong>Sources.</strong> ${source}<br>
      Photographs &copy; Talitha Kum Kenya. This document was prepared for the Talitha Kum Kenya
      publications library. Any item marked <span class="ph">like this</span> is a placeholder for staff
      to complete before publication.
    </div>
  </div>
</section>`;
}

function doc(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head>
<body>${body}</body></html>`;
}

/* ========================================================================== */
/* Document 1 — Awareness Material                                            */
/* ========================================================================== */

const doc1 = doc(
  "Know the Signs — Talitha Kum Kenya",
  cover({
    photo: IMG.youth,
    chip: "Awareness Material",
    title: "Know the Signs",
    standfirst:
      "How traffickers are targeting educated, ambitious young people &mdash; and the checks " +
      "that make an offer safe to accept.",
    date: "16 July 2026",
    issuer: "Talitha Kum Kenya",
  }) +

  page("Know the Signs", 2, `
    <div class="kicker">Start here</div>
    <h2>Being educated is not protection. It is increasingly the reason.</h2>
    <div class="gold-rule"></div>
    <p class="lead">Contrary to popular belief, trafficking victims are not only the poor or the
      uneducated. Traffickers are increasingly targeting educated, ambitious youth, precisely
      <strong>because they are more employable, more mobile, and more readily trusted by employers
      and immigration officials</strong>.</p>
    <p>That trust is the asset being exploited. A graduate with a clean record, a valid passport and a
      convincing CV moves through checkpoints that would stop someone else. The qualification that
      should open doors is used to open a different one.</p>
    <p>This guide sets out the recruitment patterns our facilitators are seeing, and the practical
      checks that expose them. It is written for students, colleges, parish youth groups and anyone
      advising a young person about an offer abroad.</p>

    <div class="callout">
      <div class="kicker">The one idea worth remembering</div>
      <p>Awareness remains the strongest shield against exploitation. Students who understand how
        traffickers operate are far harder to deceive. Everything in this guide is aimed at that
        single outcome.</p>
    </div>

    <div class="quote">
      <p>Traffickers are increasingly targeting educated, ambitious youth because they are more
        employable, mobile and trusted by employers and immigration officials.</p>
      <cite>Facilitator, Taita Taveta National Polytechnic training</cite>
    </div>
  `) +

  page("Know the Signs", 3, `
    <div class="kicker">Emerging trends</div>
    <h2>Five patterns our facilitators are seeing</h2>
    <div class="gold-rule"></div>
    <p>These were set out at an awareness training held with administration, teaching faculty and
      students at Taita Taveta National Polytechnic. They are not hypothetical.</p>

    <ol class="flags">
      <li>
        <h4>Fake job and internship offers abroad</h4>
        <p>Roles advertised in tech, healthcare or hospitality that turn out to be fronts for forced
          labour or exploitation. The advertised job does not exist; the ticket does.</p>
      </li>
      <li>
        <h4>Cyber-scam compound trafficking</h4>
        <p>Graduates lured by "digital marketing" or IT jobs abroad are trafficked into scam centres
          and forced to run online fraud against others. Documents are taken on arrival.</p>
      </li>
      <li>
        <h4>Social media recruitment</h4>
        <p>Approaches through Facebook, WhatsApp, Telegram and LinkedIn, using fake profiles and
          fabricated testimonials from people who appear to have taken the same opportunity.</p>
      </li>
      <li>
        <h4>Fraudulent scholarships and study-abroad placements</h4>
        <p>Placements that require an upfront payment, or that ask for original personal documents
          to be handed over before anything has been confirmed.</p>
      </li>
      <li>
        <h4>Exploitation of career ambition</h4>
        <p>"Too good to be true" offers that bypass verifiable recruitment channels altogether. The
          urgency is the tactic: decide now, or lose it.</p>
      </li>
    </ol>
  `) +

  page("Know the Signs", 4, `
    <div class="kicker">Before you go</div>
    <h2>Four checks before anyone travels</h2>
    <div class="gold-rule"></div>
    <ul class="checks">
      <li><strong>Verify the recruiter, not the offer.</strong> A genuine agency can be checked against
        the register held by the relevant authority. An offer that cannot survive that check is not an
        offer.</li>
      <li><strong>Never pay to be given a job.</strong> Placement fees, "processing" fees and visa fees
        demanded up front are the most reliable warning sign there is.</li>
      <li><strong>Keep your own documents.</strong> Your passport stays with you. Anyone who needs to
        hold it for you is telling you what the arrangement really is.</li>
      <li><strong>Leave the details with someone.</strong> The employer's name and address, the
        recruiter's number, your flight, and a photograph of your passport, in the hands of a family
        member or your parish.</li>
    </ul>

    <div class="callout">
      <div class="kicker">If you are advising someone</div>
      <p>Legitimate labour migration exists and is lawful. The purpose of these checks is not to stop
        a young person from travelling, but to make sure that what they are travelling into is real.</p>
    </div>

    <h3>If someone has already travelled</h3>
    <p>Do not wait for certainty before asking for help. The earlier a case is raised, the more
      options remain open.</p>
    <ul class="checks">
      <li><strong>Write down what you know</strong> &mdash; names, numbers, the agency, the last
        message, the date contact changed. Memory fades quickly and details matter later.</li>
      <li><strong>Keep the messages.</strong> Screenshots of the original offer and of the recruiter's
        profile are often the only record left once an account is deleted.</li>
      <li><strong>Call us.</strong> We will help you understand what you are looking at and connect
        you to the right authority. The line is free and the conversation is confidential.</li>
    </ul>
  `) +

  page("Know the Signs", 5, `
    <div class="kicker">Taking it further</div>
    <h2>Run this session in your own community</h2>
    <div class="gold-rule"></div>
    <p>Students who attended asked to pass this on to their peers. That is the point of it. If you
      would like a facilitator to visit your school, college, parish or youth group, contact us using
      the details below and we will arrange a session.</p>

    <div class="quote">
      <p>Talitha Kum Kenya: where shattered lives find hope, and resilience blossoms into freedom.</p>
      <cite>Talitha Kum Kenya</cite>
    </div>

    <p>We remain committed to expanding this training across more institutions, building a generation
      of students who are informed, alert and empowered against exploitation.</p>

    ${HELP}

    <div class="note">
      <b>A note on sharing.</b> Please copy and circulate this document freely within schools,
      parishes and community groups. If you are reprinting it, keep the toll free number and the
      Talitha Kum Kenya attribution intact so that anyone who needs help can find us.
    </div>
  `) +

  backPage(
    'Emerging trends and the framing of this guide are drawn from "Talitha Kum Kenya Holds ' +
    'Anti-Trafficking Awareness Training at Taita Taveta National Polytechnic" (16 July 2026) and ' +
    '"Empowering Young Refugees: Talitha Kum Kenya Conducts Human Trafficking Awareness Workshop" ' +
    '(17 July 2026), both published on talithakumraht.org. Vision, mission, values and the four Ps ' +
    'are quoted from the organisation\'s About Us and Vision, Mission and Values pages.'
  )
);

/* ========================================================================== */
/* Document 2 — Policy Brief                                                  */
/* ========================================================================== */

const doc2 = doc(
  "Border Policing and Trafficking in Persons — Talitha Kum Kenya",
  cover({
    photo: IMG.police,
    chip: "Policy Brief",
    title: "Border Policing and Trafficking in Persons",
    standfirst:
      "What 83 frontline officers at Lungalunga and Taveta told us they did not know &mdash; " +
      "and what closing that gap would take.",
    date: "26 February 2025",
    issuer: "Talitha Kum Kenya",
  }) +

  page("Border Policing and Trafficking in Persons", 2, `
    <div class="kicker">In brief</div>
    <h2>The gap is not willingness. It is definition.</h2>
    <div class="gold-rule"></div>
    <p class="lead">In February 2025, Talitha Kum Kenya ran awareness sessions for border police at
      two of Kenya's busiest crossings. Officers were engaged and willing. What they lacked was a
      working definition of trafficking wide enough to recognise most of it.</p>

    <div class="stats">
      <div class="stat"><b>33</b><span>officers trained at Lungalunga, Kwale County</span></div>
      <div class="stat"><b>50</b><span>officers trained at the Taveta border</span></div>
      <div class="stat"><b>2</b><span>sessions, 13 and 15 February 2025</span></div>
    </div>

    <div class="callout">
      <div class="kicker">Key finding</div>
      <p>Officers' knowledge was largely confined to the most visible forms of trafficking &mdash;
        forced labour and sexual exploitation. Organ trafficking, domestic servitude and child
        exploitation in forced begging were largely unknown. An officer who cannot name a form of
        trafficking cannot identify a victim of it.</p>
    </div>

    <h3>What we are asking for</h3>
    <ul class="checks">
      <li>A Training of Trainers programme, so that capability stays at the border after we leave.</li>
      <li>Specialised follow-on training covering the hidden forms of exploitation.</li>
      <li>A standing channel between border commands and anti-trafficking organisations.</li>
    </ul>
  `) +

  page("Border Policing and Trafficking in Persons", 3, `
    <div class="kicker">Background</div>
    <h2>Why border posts, and why now</h2>
    <div class="gold-rule"></div>
    <p>Human trafficking is a serious ethical issue that demands the collaborative efforts of
      multiple stakeholders to combat effectively. Recognising this urgency, Talitha Kum Kenya
      initiated a border police awareness programme to strengthen law enforcement's understanding of
      trafficking in persons.</p>
    <p>Sessions were held on 13 February 2025 in Lungalunga, Kwale County, and on 15 February 2025 in
      Taita Taveta County. They were organised in collaboration with Officers Commanding Police
      Divisions, Officers Commanding Stations and border commanders, ensuring that the personnel who
      set local practice were in the room.</p>
    <p>The programme addresses the protection and prosecution pillars of the Palermo Protocol, which
      aims to prevent trafficking, protect victims and prosecute traffickers. Border posts are where
      those three obligations meet a moving population and a few minutes of decision time.</p>

    <figure class="figure">
      <img src="${IMG.border}" alt="A Talitha Kum Kenya sister facilitating a training session for uniformed officers">
      <figcaption>A Talitha Kum Kenya facilitator leads a session with border officers, February 2025.</figcaption>
    </figure>
  `) +

  page("Border Policing and Trafficking in Persons", 4, `
    <div class="kicker">Findings</div>
    <h2>Four things the sessions surfaced</h2>
    <div class="gold-rule"></div>

    <ol class="flags">
      <li>
        <h4>Understanding was surface level</h4>
        <p>Most participating officers held only a general awareness of trafficking, built from the
          most publicised cases rather than from the legal definition.</p>
      </li>
      <li>
        <h4>Hidden forms were largely unknown</h4>
        <p>Organ trafficking, domestic servitude and child exploitation in forced begging were new to
          many officers. These are precisely the forms least likely to present as a complaint.</p>
      </li>
      <li>
        <h4>The scale of networks was a surprise</h4>
        <p>Many officers expressed surprise at the depth and reach of trafficking networks, and said
          so openly. Recognising an organised operation changes how a single case is handled.</p>
      </li>
      <li>
        <h4>Officers asked for more, unanimously</h4>
        <p>There was a unanimous request for continued sensitisation and for Training of Trainers
          initiatives. Officers themselves identified the knowledge gap as a barrier to effective
          intervention.</p>
      </li>
    </ol>

    <div class="quote">
      <p>The officers recognised that their current knowledge gaps could hinder effective
        interventions &mdash; and said so themselves.</p>
      <cite>Session report, February 2025</cite>
    </div>

    <p>That last point matters more than the other three. A training need identified by the trainer is
      a proposal. A training need identified unanimously by the officers who work the border is a
      finding, and it is the basis of the recommendations in this brief.</p>
  `) +

  page("Border Policing and Trafficking in Persons", 5, `
    <div class="kicker">Public awareness</div>
    <h2>The same gap exists in the community</h2>
    <div class="gold-rule"></div>
    <p>Alongside the border sessions, we took the message to coastal media. Media coverage plays a
      crucial role in community sensitisation, providing a platform to educate the public on
      trafficking and on the steps communities can take to protect themselves.</p>

    <table class="reach">
      <thead><tr><th>Outlet</th><th>Reach</th></tr></thead>
      <tbody>
        <tr><td>TV47</td><td>6,885,000 viewers</td></tr>
        <tr><td>Radio Msenangu</td><td>1,500,000 listeners</td></tr>
        <tr><td>Radio Tumaini &ndash; Voi</td><td>500,000 listeners</td></tr>
        <tr><td>Baraka FM</td><td>200,000 listeners</td></tr>
      </tbody>
    </table>

    <p>Listener feedback indicated a strong appetite for more. Audiences wanted to understand the
      different forms of trafficking, how traffickers operate, and how to identify and report cases.</p>
    <p>One consistent complaint: the interactive call-in segments were too short. Listeners asked for
      longer live interaction to allow deeper discussion and personal testimony. Several also pressed
      for outdoor sensitisation in grassroots areas where media access is limited.</p>

    <div class="callout">
      <div class="kicker">What this tells us</div>
      <p>Demand is not the constraint. In both the police sessions and the broadcasts, the people
        closest to the problem asked for more time and more depth than the format allowed.</p>
    </div>
  `) +

  page("Border Policing and Trafficking in Persons", 6, `
    <div class="kicker">Recommendations</div>
    <h2>What we propose</h2>
    <div class="gold-rule"></div>

    <h3>1. Establish a Training of Trainers cohort at each border command</h3>
    <p>Officers asked for this directly. A resident trainer at each post converts a one-off session
      into a standing capability, and survives the transfer of any individual officer.</p>

    <h3>2. Extend training beyond the visible forms</h3>
    <p>Curriculum should cover organ trafficking, domestic servitude and forced begging explicitly,
      with indicators an officer can apply during a routine check.</p>

    <h3>3. Formalise the channel between border commands and anti-trafficking organisations</h3>
    <p>Continuous engagement was emphasised throughout. A named contact on each side improves
      coordination, victim identification and case handling.</p>

    <h3>4. Pair broadcast awareness with grassroots outreach</h3>
    <p>Listeners themselves identified the limits of radio and television in reaching the most
      vulnerable. On-the-ground campaigns should follow each media cycle.</p>

    <div class="note">
      <b>Next steps.</b> Talitha Kum Kenya is ready to deliver the Training of Trainers component in
      partnership with border commands. Discussions on timing and funding are at
      <span class="ph">stage to be confirmed by the coordinator</span>. For enquiries about this
      brief, contact <span class="ph">named contact</span> at info@talithakumraht.org.
    </div>
  `) +

  backPage(
    'Figures, dates, locations and findings are drawn from "Border police sensitization program" by ' +
    'Sr Mercy, published on talithakumraht.org on 26 February 2025, which reports the Lungalunga and ' +
    'Taveta sessions and the accompanying media programme. The recommendations restate conclusions ' +
    'set out in that article. Vision, mission, values and the four Ps are quoted from the ' +
    "organisation's About Us and Vision, Mission and Values pages."
  )
);

/* ========================================================================== */
/* Document 3 — Newsletter                                                    */
/* ========================================================================== */

const doc3 = doc(
  "Bulletin July 2026 — Talitha Kum Kenya",
  cover({
    photo: IMG.pfan,
    chip: "Newsletter",
    title: "Bulletin",
    standfirst:
      "July 2026 &mdash; Refugee youth in South B, leadership training in Bangkok, and the first " +
      "Pan-African Freedom Network Summit in Abuja.",
    date: "31 July 2026",
    issuer: "Talitha Kum Kenya",
  }) +

  page("Bulletin &middot; July 2026", 2, `
    <div class="kicker">From the network</div>
    <h2>A month of going further out</h2>
    <div class="gold-rule"></div>
    <p class="lead">Three things this month, and a thread running through all of them: the work moved
      towards the people hardest to reach. A parish hall in South B. A summit in Abuja convened around
      the most marginalised. A leadership course that put a Kenyan sister in a room with 23 countries.</p>

    <div class="kicker" style="margin-top:8mm">Prevention</div>
    <h3 style="font-size:16pt;margin-top:0">Over 150 young refugees, one parish hall</h3>
    <p>Talitha Kum Kenya held a workshop at Our Lady Queen of Peace Catholic Church, South B, creating
      awareness on human trafficking among youth refugees from the Democratic Republic of Congo,
      Rwanda and Burundi. More than 150 young people took part.</p>
    <p>The initiative was made possible through our partnership with Tushirikiane Africa Trust (TUSA)
      and the Missionary Sisters of Our Lady of Africa.</p>

    <figure class="figure">
      <img src="${IMG.youth}" alt="A full parish hall of young people at the South B awareness workshop">
      <figcaption>Our Lady Queen of Peace Catholic Church, South B, July 2026.</figcaption>
    </figure>
  `) +

  page("Bulletin &middot; July 2026", 3, `
    <p>Young refugees are among the most vulnerable to trafficking and exploitation, often facing
      language barriers and limited access to information &mdash; gaps that traffickers actively seek
      out. Creating spaces for open dialogue and education helps young people recognise risk, protect
      themselves and look out for one another.</p>

    <div class="quote">
      <p>As these young people return to their communities armed with knowledge and a renewed sense of
        purpose, they carry the potential to become powerful advocates for change.</p>
      <cite>Talitha Kum Kenya, July 2026</cite>
    </div>

    <div class="kicker" style="margin-top:9mm">Partnership</div>
    <h3 style="font-size:16pt;margin-top:0">Leadership training in Bangkok</h3>
    <p>In June 2026, Sr. Mercy Mwayi, Director of Talitha Kum Kenya, took part in the in-person phase
      of the 6th Talitha Kum Leadership Training Course in Bangkok, Thailand, joining 28 Talitha Kum
      members from 23 countries after six months of online preparation.</p>
    <p>The course focused on leadership, public speaking, advocacy for systemic transformation and
      networking. Participants were also guided in developing anti-trafficking projects that can be
      implemented in their own contexts.</p>

    <div class="stats">
      <div class="stat"><b>28</b><span>Talitha Kum members on the course</span></div>
      <div class="stat"><b>23</b><span>countries represented</span></div>
      <div class="stat"><b>6</b><span>months of online preparation</span></div>
    </div>

    <p>This global learning experience strengthens our commitment to building capacity, deepening
      partnerships and advancing efforts to prevent trafficking, protect survivors and uphold the
      dignity of every person &mdash; and it comes home with us, into the trainings we run here.</p>
  `) +

  page("Bulletin &middot; July 2026", 4, `
    <div class="kicker">Partnership</div>
    <h2>The first PFAN Summit, Abuja</h2>
    <div class="gold-rule"></div>
    <p>In May 2026, Talitha Kum Kenya was honoured to participate in the inaugural Pan-African Freedom
      Network Summit, held in Abuja, Nigeria. The summit convened anti-trafficking practitioners,
      organisations, faith-based institutions and government representatives from across Africa.</p>

    <div class="callout">
      <div class="kicker">Summit theme</div>
      <p>"Inclusive Strategies for Ending Human Trafficking: Reaching the Most Marginalized"</p>
    </div>

    <p>Through interactive discussions and learning sessions, participants explored practical and
      inclusive strategies for preventing trafficking, protecting vulnerable communities and upholding
      the dignity, freedom and human rights of every person.</p>

    <figure class="figure">
      <img src="${IMG.pfan}" alt="Delegates including religious sisters and clergy at the PFAN Summit in Abuja">
      <figcaption>Delegates at the inaugural Pan-African Freedom Network Summit, Abuja, Nigeria,
        May 2026.</figcaption>
    </figure>

    <p>Our participation reflects an ongoing commitment to building regional and continental
      partnerships &mdash; sharing knowledge and contributing to coordinated efforts to prevent
      trafficking, protect survivors and advocate for human dignity.</p>
  `) +

  page("Bulletin &middot; July 2026", 5, `
    <div class="kicker">Also this quarter</div>
    <h2>In the colleges</h2>
    <div class="gold-rule"></div>
    <p>In November 2025 we ran an awareness training at Taita Taveta National Polytechnic with the
      institution's administration, teaching faculty and students, focused on the recruitment patterns
      now targeting educated young people. That material is published separately as
      <strong>Know the Signs</strong>, available in this library.</p>

    <h3>Coming up</h3>
    <ul class="checks">
      <li><span class="ph">Add the next scheduled training or event here</span></li>
      <li><span class="ph">Add the next network meeting date here</span></li>
      <li>8 February &mdash; International Day of Prayer and Awareness against Human Trafficking,
        the feast of St Josephine Bakhita. Parish materials will be circulated in advance.</li>
    </ul>

    <div class="quote">
      <p>Human trafficking is a crime against humanity. We must unite our efforts to free victims and
        stop this crime.</p>
      <cite>Pope Francis</cite>
    </div>

    ${HELP}
  `) +

  backPage(
    'Reports in this bulletin are drawn from articles published on talithakumraht.org: "Talitha Kum ' +
    'Kenya Participates in the PFAN Inaugural Summit 2026 in Abuja, Nigeria" (13 July 2026), ' +
    '"Strengthening Leadership, Advancing the Fight Against Human Trafficking" (10 July 2026), ' +
    '"Empowering Young Refugees" (17 July 2026) and "Talitha Kum Kenya Holds Anti-Trafficking ' +
    'Awareness Training at Taita Taveta National Polytechnic" (16 July 2026). The Pope Francis ' +
    "quotation appears on the organisation's About Us page."
  )
);

/* ========================================================================== */
/* Render                                                                     */
/* ========================================================================== */

const DOCS = [
  { slug: "raht-awareness-know-the-signs-2026-07", html: doc1, sheets: 6 },
  { slug: "raht-policy-brief-border-policing-2025-02", html: doc2, sheets: 7 },
  { slug: "raht-newsletter-bulletin-2026-07", html: doc3, sheets: 6 },
];

await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

let failures = 0;

for (const d of DOCS) {
  const page = await browser.newPage();
  await page.setContent(d.html, { waitUntil: "networkidle" });

  const sheets = await page.locator(".page").count();
  if (sheets !== d.sheets) {
    console.log(`  ! ${d.slug}: expected ${d.sheets} sheets, found ${sheets}`);
    failures++;
  }

  /* Guard against a sheet quietly overflowing its A4 box, which would clip
     content instead of failing loudly. */
  const overflow = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".page")).map((p, i) => {
      const inner = p.querySelector(".pad") || p.querySelector(".cover-inner");
      return inner && inner.scrollHeight > inner.clientHeight + 2 ? i + 1 : 0;
    }).filter(Boolean));
  if (overflow.length) {
    console.log(`  ! ${d.slug}: content overflows on sheet(s) ${overflow.join(", ")}`);
    failures++;
  }

  /* How full each sheet is. A half-empty interior page reads as unfinished,
     so this is reported and rebalanced by hand rather than left to chance. */
  const fill = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".page")).map((p) => {
      const flow = p.querySelector(".flow");
      if (!flow) return null;
      const last = flow.lastElementChild;
      if (!last) return 0;
      const used = last.getBoundingClientRect().bottom - flow.getBoundingClientRect().top;
      return Math.round((used / flow.clientHeight) * 100);
    }));
  const thin = fill.map((f, i) => (f !== null && f < 72 ? `${i + 1}:${f}%` : null)).filter(Boolean);
  if (thin.length) console.log(`  · ${d.slug}: sparse sheet(s) ${thin.join("  ")}`);

  await page.pdf({
    path: join(out, `${d.slug}.pdf`),
    width: "210mm",
    height: "297mm",
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    preferCSSPageSize: false,
  });

  /* Cover image for the publications card: the first sheet, at print scale. */
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.locator(".page").first().screenshot({
    path: join(out, `${d.slug}-cover.png`),
    scale: "css",
  });

  /* SHOTS=1 also writes every interior sheet as a PNG, for eyeballing the
     layout without opening the PDF. */
  if (process.env.SHOTS) {
    const n = await page.locator(".page").count();
    for (let i = 1; i < n; i++) {
      await page.locator(".page").nth(i).screenshot({
        path: join(out, "shots", `${d.slug}-p${i + 1}.png`),
        scale: "css",
      });
    }
  }

  await page.close();

  const { size } = await readFile(join(out, `${d.slug}.pdf`)).then((b) => ({ size: b.length }));
  console.log(`${d.slug}.pdf  ${(size / 1024 / 1024).toFixed(2)} MB  ${d.sheets} pages`);
}

await browser.close();

/* The metadata to type into the publishing panel, kept next to the files so
   nobody has to reverse-engineer it from the PDF. */
const meta = [
  {
    file: "raht-awareness-know-the-signs-2026-07.pdf",
    title: "Know the Signs: How Traffickers Target Educated Young People",
    type: "Awareness Material",
    themes: ["Prevention", "Youth & Schools", "Digital Safety"],
    keywords: ["students", "colleges", "online recruitment", "fake job offers", "Taita Taveta"],
    date: "2026-07-16",
    language: "English",
    issuer: "Talitha Kum Kenya",
    pages: 6,
    featured: false,
    summary:
      "Traffickers increasingly target educated, ambitious young people because they are employable, " +
      "mobile and trusted at borders. This guide sets out the five recruitment patterns our facilitators " +
      "are seeing, and four checks that expose a false offer before anyone travels.",
  },
  {
    file: "raht-policy-brief-border-policing-2025-02.pdf",
    title: "Border Policing and Trafficking in Persons: Findings from Lungalunga and Taveta",
    type: "Policy Brief",
    themes: ["Protection", "Partnership", "Advocacy"],
    keywords: ["border police", "Kwale", "Taita Taveta", "Palermo Protocol", "training of trainers"],
    date: "2025-02-26",
    language: "English",
    issuer: "Talitha Kum Kenya",
    pages: 7,
    featured: true,
    summary:
      "Eighty-three border officers were trained at Lungalunga and Taveta in February 2025. They were " +
      "willing but working from too narrow a definition: hidden forms of trafficking were largely " +
      "unknown. This brief sets out what the sessions surfaced and four recommendations for closing the gap.",
  },
  {
    file: "raht-newsletter-bulletin-2026-07.pdf",
    title: "Talitha Kum Kenya Bulletin: July 2026",
    type: "Newsletter",
    themes: ["Partnership", "Prevention"],
    keywords: ["PFAN", "Abuja", "Bangkok", "refugee youth", "South B", "TUSA"],
    date: "2026-07-31",
    language: "English",
    issuer: "Talitha Kum Kenya",
    pages: 6,
    featured: false,
    summary:
      "News from across the network this month: an awareness workshop for over 150 young refugees in " +
      "South B, the Director's participation in the 6th Talitha Kum Leadership Training in Bangkok, and " +
      "Talitha Kum Kenya's part in the inaugural Pan-African Freedom Network Summit in Abuja.",
  },
];

await writeFile(join(out, "metadata.json"), JSON.stringify(meta, null, 2), "utf8");
console.log(`\nmetadata.json written`);
console.log(failures ? `\n${failures} layout problem(s) — fix before publishing` : "\nlayout OK");
process.exit(failures ? 1 : 0);
