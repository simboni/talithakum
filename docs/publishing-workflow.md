# Publishing Workflow

How a document gets from a member congregation's draft to a live publication on
talithakumraht.org.

Read this alongside [`taxonomy.md`](./taxonomy.md), which explains how to
classify a publication and what the safeguarding rules are. This document covers
*who does what, in what order*.

---

## 1. Roles

Four roles. On a small team one person may hold two of them — but the
safeguarding approval must never be given by the same person who wrote the
document.

| Role | Who | What they do |
| --- | --- | --- |
| **Contributor** | Member congregations, project staff, field teams | Write and submit drafts, supply photos and consent forms, answer questions about content. |
| **Editor / Communications Officer** | Communications team | Edits and proofreads, classifies the publication, runs the safeguarding and accessibility checks, prepares the PDF and cover, uploads and publishes. |
| **Coordinator** | Network coordinator | Approves anything sensitive: survivor material, case studies, photographs of people, advocacy positions, press releases. Final say when the Editor is unsure. |
| **Site Admin** | Whoever maintains the website | Technical only: user accounts, plugin and theme updates, upload limits, backups, fixing things that are broken. Does not decide what gets published. |

### How these map onto WordPress

| Our role | WordPress role | Can do |
| --- | --- | --- |
| Contributor | **Author** | Create and edit their own drafts. Cannot publish. |
| Editor / Communications Officer | **Editor** | Edit anyone's content and publish. |
| Coordinator | **Editor** (with approval authority in practice, not in software) | Same technical rights as Editor. Their approval is recorded in the workflow, not enforced by WordPress. |
| Site Admin | **Administrator** | Everything, including settings, plugins and users. |

Two account rules:

- Give **Administrator** to as few people as possible — ideally one, with a
  second as backup. Everyone else is an Author or Editor.
- One account per person. No shared logins. If someone leaves the team, the Site
  Admin removes their account the same week.

---

## 2. The pipeline

Every publication goes through these eight steps in order. Do not skip step 2.

### Step 1 — Intake

The Contributor sends the draft to the Editor with:

- the document file (Word or the original design file, not only a PDF),
- any photographs, as separate image files,
- the signed consent forms for any photographs of people,
- the intended publication date and audience,
- a named contact who can answer questions about the content.

The Editor logs it in the publications tracker (`<tracker link>`) and confirms
receipt. If any of the five items above is missing, ask for it now — chasing a
consent form on publication day is how mistakes happen.

### Step 2 — Safeguarding and consent check

The Editor works through the rules in section 9 of `taxonomy.md`:
identifying details, photographs of survivors and minors, anonymised case
studies, shelter locations, document metadata, annexes.

Outcome is one of three:

- **Clear** — nothing sensitive. Continue.
- **Fixable** — remove a name, blur a face, crop a photo, delete an annex.
  Editor fixes it and continues.
- **Needs approval** — anything involving a real person's story or image, any
  advocacy position, any press release. Send to the Coordinator
  (`<coordinator email>`) and **wait for a written reply.** Do not proceed on a
  verbal "it's fine".

Record the outcome and the date in the tracker. If the Coordinator approved it,
note who and when.

### Step 3 — Edit and proofread

Editor checks language, spelling, consistent naming (`Talitha Kum RAHT Kenya`,
spelled the same way every time), dates, figures against the source, and that
every statistic in the document has a source stated. Someone other than the
writer reads it once. Two pairs of eyes, always.

### Step 4 — PDF preparation

- Export to PDF from the original file so the text stays selectable.
- Set the document Title in File > Properties; clear the Author field.
- Compress if the file is over about 8 MB — most readers are on mobile data.
- Rename the file using the convention in section 7 of `taxonomy.md`.
- Open the finished PDF and scroll through every page. Exports break things.

### Step 5 — Classify

Assign the Type (exactly one), the Themes (one to three) and the Keywords, using
sections 2, 3 and 4 of `taxonomy.md`. Write the 40-60 word summary. Prepare the
cover image at 1200 x 1600 and under 300 KB, and write its alt text.

### Step 6 — Upload as a DRAFT

Upload through the front-end admin panel on the site. Set the status to **Draft**,
not Published. Fill in every required field: title, summary, cover, PDF,
publication date, issuing body, language, and the Type, Themes and Keywords from
step 5.

Never upload straight to Published, even for something small. The draft step
costs two minutes and catches broken PDFs, wrong covers and missing summaries
before the public sees them.

### Step 7 — Review on the page

Open the draft preview and check it as a reader would:

- On a **desktop browser** and on a **phone**.
- Does the cover appear, right way up, not stretched?
- Does the PDF open in the viewer, and does the download button work?
- Is the summary readable and free of typos at phone size?
- Do the Type and Theme labels show correctly?

Run through the pre-publish checklist in section 4 below.

### Step 8 — Publish and announce

Switch the status to Published. Then:

- Check the live page once more, logged out, in a private browser window. This is
  the only way to see what the public sees.
- Send the link to the member congregations' group.
- Post to the organisation's social channels with the cover image and one or two
  sentences from the summary.
- Add it to the next newsletter's round-up.
- Update the tracker: published date, live URL, who published it.

---

## 3. Publishing cadence

A realistic rhythm for a small communications team. The aim is something new
every week without exhausting anyone.

| Frequency | What to publish | Why this rhythm |
| --- | --- | --- |
| **Weekly** | One short piece: `Awareness Material` or `Prayer & Reflection` | These are one or two pages, often reusable, and keep the site alive between bigger publications. |
| **Monthly** | One `Newsletter` | The anchor of the calendar. Everything that happened that month lands here. |
| **Quarterly** | One substantial piece: `Research & Data`, `Policy Brief`, `Training Manual` or `Conference Paper` | Big documents need time. Four a year is achievable; twelve is not. |
| **Annually** | The `Annual Report` | One per year, planned three months ahead. |
| **As needed** | `Press Release` | Reactive, and always Coordinator-approved. |

That comes to roughly 60 publications a year, of which only five or six are large.

### A sample month

| Week | Publish | Prepare in the background |
| --- | --- | --- |
| Week 1 | Awareness material (e.g. a one-page fact sheet) | Collect contributions for the newsletter |
| Week 2 | Prayer and reflection piece | Draft the newsletter |
| Week 3 | Awareness material | Newsletter editing and safeguarding check |
| Week 4 | **Monthly newsletter** | Start the next quarterly document |

### A sample year

| Period | Anchor publications |
| --- | --- |
| January - March | Q1 quarterly document; three monthly newsletters; **8 February** — International Day of Prayer and Awareness Against Human Trafficking (St Josephine Bakhita) is the single biggest date in our calendar. Plan its prayer and awareness material from November. |
| April - June | Annual Report for the previous year; Q2 quarterly document; three newsletters |
| July - September | Q3 quarterly document; three newsletters; **30 July** — World Day Against Trafficking in Persons |
| October - December | Q4 quarterly document; three newsletters; end-of-year reflection material |

Two practical notes:

- **Batch the small pieces.** Prepare four weekly items in one sitting each
  month and schedule them. Weekly publishing is only sustainable if you are not
  starting from zero every Monday.
- **Protect the big ones.** Put the Annual Report and the Bakhita Day material in
  the calendar three months ahead, with the safeguarding review booked as its own
  deadline a fortnight before publication.

---

## 4. Pre-publish checklist

Copy this into the tracker for each publication and tick it off before switching
from Draft to Published.

- [ ] Safeguarding check completed and recorded in the tracker
- [ ] Written consent on file for every recognisable person in the document or cover; guardian consent for anyone under 18
- [ ] Case studies anonymised; no shelter addresses, exact locations or GPS data
- [ ] PDF metadata cleaned — Author field cleared, document Title set in PDF properties
- [ ] Coordinator approval obtained in writing (if the material is sensitive, advocacy or a press release)
- [ ] Proofread by someone who did not write it
- [ ] Every statistic in the document has a stated source
- [ ] PDF text is selectable, not a scanned image
- [ ] PDF filename follows `raht-<type>-<short-title>-<yyyy-mm>.pdf`
- [ ] Type assigned (exactly one); Themes assigned (one to three); Keywords added
- [ ] Summary written, 40-60 words, answers what / who for / what's inside / where and when
- [ ] Cover image uploaded, 1200 x 1600 portrait, under 300 KB, correct orientation
- [ ] Alt text written for the cover image
- [ ] Publication date, issuing body, language and page count filled in
- [ ] Every link inside the document opens correctly, including email addresses and phone numbers
- [ ] Previewed on a desktop browser and on a phone; PDF viewer and download button both work

---

## 5. Corrections and versions

Once a document is public, people have downloaded it, shared it on WhatsApp, and
possibly cited it. That changes how we fix mistakes.

**Never silently swap the PDF.** Replacing the file at the same address means
some readers hold one version and some hold another, with no way to tell which
is which. That is worse than the original error.

**To publish a correction:**

1. Fix the document and export a new PDF.
2. Put a line inside the document itself, on the cover or page 2:
   `Version 2 - corrected 14 April 2026`.
3. Name the new file with a `-v2` suffix:
   `raht-newsletter-sauti-yetu-2026-03-v2.pdf`. Never reuse the v1 filename.
4. Upload the new file as the publication's PDF, and add a short note at the end
   of the summary or in a version note field:
   `Version 2, corrected 14 April 2026: figure on page 4 restated.`
5. **Keep the old file.** Do not delete it from the media library. Anyone who
   cited version 1 needs to be able to find what they cited.
6. Record in the tracker: what was wrong, what changed, who approved the change,
   and the date.

**How big does an error have to be?** If it changes a number, a name, a date, a
legal statement or a phone number, it is a version 2. If it is a typo that
changes nothing a reader would act on, fix it quietly at the next reprint and
note it in the tracker.

**If the error is a safeguarding breach** — a name, a face, an address that
should not be there — take it down first (section 6), then correct, then
republish. Tell the Coordinator immediately, before fixing anything.

---

## 6. Takedowns

Sometimes a publication has to come off the site: a safeguarding problem, a
factual error too large to correct, a partner withdrawing permission, a legal
concern.

**Set the publication to Draft. Do not delete it.**

Deleting removes the page entirely, so anyone following an existing link gets a
"404 page not found" error, and the record of what we published disappears. Draft
takes it out of public view while keeping the record, the classification and the
history intact, so the decision can be reviewed or reversed.

Steps:

1. Set the status to **Draft** immediately. Speed matters more than process here.
2. Tell the Coordinator what you took down and why, the same day.
3. Record it in the tracker: date, reason, who decided.
4. Decide within a week: correct and republish (section 5), or leave it down
   permanently.
5. If it stays down permanently and it was widely linked, ask the Site Admin to
   put a short redirect or a brief note in its place rather than leaving a dead
   link.

Only the Site Admin deletes anything, only after the Coordinator has decided, and
only after a copy of the file is saved offline.

---

## 7. If something goes wrong

### The PDF will not upload

- **"File exceeds maximum upload size"** — the file is bigger than the server
  allows. Compress the PDF first (most PDF tools have "reduce file size" or
  "optimise"); images inside the document are usually the cause. If the file is
  genuinely large and cannot shrink, ask the Site Admin to raise the upload limit.
- **"Sorry, this file type is not permitted"** — WordPress checks the file type
  (its "mime type"). Make sure the file really is a PDF and that the name ends in
  `.pdf` in lower case. Renaming a Word file to `.pdf` does not convert it —
  export it properly. If it is a genuine PDF and still refused, the Site Admin
  needs to check the allowed file types.
- **The upload starts and then stops partway** — usually a slow or dropping
  connection. Try again on a stronger connection; a large file over mobile data
  will often fail silently.

### The publication is not appearing on the page

Check in this order:

1. **Is it still a Draft?** The most common cause by far. Only Published items
   appear to the public.
2. **Is the publication date in the future?** A future date can schedule it
   instead of publishing it.
3. **Is the Type or Theme wrong or missing?** If the page lists publications by
   category, an item with no Type may not appear in any list.
4. **Are you looking while logged in?** Logged-in editors can see drafts. Always
   check in a private or incognito browser window.
5. **Caching.** If everything looks right and it still does not show, the site may
   be serving a saved copy of the page. Ask the Site Admin to clear the cache.

### The PDF viewer is blank on mobile

- Some phone browsers cannot display a PDF inside a page. There should always be a
  visible **Download PDF** button as a fallback — check it works.
- A very large PDF may simply time out on a slow connection. Anything over about
  10 MB should be compressed or split.
- If the viewer is blank on every publication rather than just one, it is a
  technical fault, not a file problem. Report it to the Site Admin with the phone
  model, browser and a screenshot.

### Nothing here fixes it

Write down what you did, what you expected, and what happened, with a screenshot,
and send it to the Site Admin (`<site admin email>`). Do not keep retrying an
upload that has failed three times — it rarely succeeds on the fourth attempt and
may leave partial files behind.
